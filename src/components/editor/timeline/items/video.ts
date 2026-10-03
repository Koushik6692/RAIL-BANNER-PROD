import {
  Control,
  Pattern,
  Trimmable,
  TrimmableProps,
  timeUsToUnits,
  unitsToTimeUs,
} from "@openvideo/timeline";
import { Filmstrip, FilmstripBacklogOptions } from "../types";
import ThumbnailCache from "../../utils/thumbnail-cache";
import { IDisplay, IMetadata, ITrim } from "@openvideo/timeline";
import { calculateOffscreenSegments, calculateThumbnailSegmentLayout } from "../../utils/filmstrip";
import { createMediaControls } from "../controls";
import {
  SECONDARY_FONT,
  TIMELINE_SELECTED_BORDER_COLOR,
  TIMELINE_UNSELECTED_BORDER_COLOR,
  TIMELINE_BORDER_WIDTH,
  TIMELINE_ITEM_BORDER_RADIUS,
} from "../../constants/constants";
import { extractFrames } from "../../utils/mediabunny";
import { resolveMediaUrl, timelineThumbAspect } from "@/lib/media-url";
import { findAssetThumbnailSrc } from "@/lib/resolve-clip-preview";
import { useAssetsStore } from "@/stores/assets-store";
import { isPersistedThumbnailSrc, thumbnailBlobToPersistedSrc } from "@/lib/asset-thumbnail";
import { registerAssetThumbnail } from "@/lib/thumbnail-registry";
import { getLocalMediaFile } from "@/lib/local-media-registry";
import { generateThumbnail } from "@/lib/thumbnail-generator";

const EMPTY_FILMSTRIP: Filmstrip = {
  offset: 0,
  startTime: 0,
  thumbnailsCount: 0,
  widthOnScreen: 0,
};

interface VideoProps extends TrimmableProps {
  aspectRatio: number;
  trim: ITrim;
  duration: number;
  src: string;
  metadata?: Partial<IMetadata> & {
    previewUrl?: string;
  };
  preview?: string;
}
class Video extends Trimmable {
  static type = "Video";
  public extractFramesController: AbortController | null = null;
  declare id: string;
  public resourceId = "";
  declare tScale: number;
  public isSelected = false;
  declare display: IDisplay;
  declare trim: ITrim;
  declare playbackRate: number;
  public hasSrc = true;
  declare duration: number;
  public prevDuration: number;
  public itemType = "video";
  public metadata?: Partial<IMetadata>;
  declare src: string;
  public name = "";

  public aspectRatio = 1;
  public scrollLeft = 0;
  public filmstripBacklogOptions?: FilmstripBacklogOptions;
  public thumbnailsPerSegment = 0;
  public segmentSize = 0;

  public offscreenSegments = 0;
  public thumbnailWidth = 0;
  public thumbnailHeight = 48;
  public thumbnailsList: { url: string; ts: number }[] = [];
  public isFetchingThumbnails = false;
  public thumbnailCache = new ThumbnailCache();

  public currentFilmstrip: Filmstrip = EMPTY_FILMSTRIP;
  public nextFilmstrip: Filmstrip = { ...EMPTY_FILMSTRIP, segmentIndex: 0 };
  public loadingFilmstrip: Filmstrip = EMPTY_FILMSTRIP;

  private offscreenCanvas: OffscreenCanvas | null = null;
  private offscreenCtx: OffscreenCanvasRenderingContext2D | null = null;

  private isDirty = true;

  private fallbackSegmentIndex = 0;
  private fallbackSegmentsCount = 0;
  private previewUrl = "";
  private assetsUnsub: (() => void) | null = null;

  static createControls(): { controls: Record<string, Control> } {
    return { controls: createMediaControls() };
  }

  constructor(props: VideoProps) {
    super(props);
    this.id = props.id;
    this.tScale = props.tScale;
    this.objectCaching = false;
    this.rx = TIMELINE_ITEM_BORDER_RADIUS;
    this.ry = TIMELINE_ITEM_BORDER_RADIUS;
    this.display = props.display;
    this.trim = props.trim;
    this.duration = props.duration;
    this.prevDuration = props.duration;
    this.fill = "#27272a";
    this.borderOpacityWhenMoving = 1;
    this.metadata = props.metadata;

    this.aspectRatio = props.aspectRatio;

    this.src = props.src;
    this.name = (props as { name?: string }).name || "";
    this.strokeWidth = 0;

    this.transparentCorners = false;
    this.hasBorders = false;

    this.previewUrl = props.preview || props.metadata?.previewUrl || "";
    this.initOffscreenCanvas();
    void this.initialize();

    // If the library thumb registers after the clip is created, pick it up
    this.assetsUnsub = useAssetsStore.subscribe((state) => {
      if (this.thumbnailCache.getThumbnail("fallback")) return;
      for (const f of state.files) {
        if (f.thumbnailSrc && isPersistedThumbnailSrc(f.thumbnailSrc)) {
          registerAssetThumbnail([f.src, f.name, f.id], f.thumbnailSrc);
        }
      }
      void this.loadFallbackThumbnail().then(() => {
        if (!this.thumbnailCache.getThumbnail("fallback")) return;
        this.initDimensions();
        this.isDirty = true;
        this.renderToOffscreen(true);
        this.canvas?.requestRenderAll();
      });
    });
  }

  private initOffscreenCanvas() {
    if (!this.offscreenCanvas) {
      this.offscreenCanvas = new OffscreenCanvas(this.width, this.height);
      this.offscreenCtx = this.offscreenCanvas.getContext("2d");
    }

    // Resize if dimensions changed
    if (this.offscreenCanvas.width !== this.width || this.offscreenCanvas.height !== this.height) {
      this.offscreenCanvas.width = this.width;
      this.offscreenCanvas.height = this.height;
      this.isDirty = true;
    }
  }

  public initDimensions() {
    this.aspectRatio = timelineThumbAspect(this.aspectRatio);
    this.thumbnailWidth = this.thumbnailHeight * this.aspectRatio;

    const segmentOptions = calculateThumbnailSegmentLayout(this.thumbnailWidth);
    this.thumbnailsPerSegment = segmentOptions.thumbnailsPerSegment;
    this.segmentSize = segmentOptions.segmentSize;
  }

  public async initialize() {
    await this.loadFallbackThumbnail();

    this.initDimensions();
    this.createFallbackPattern();
    this.isDirty = true;
    this.renderToOffscreen(true);
    this.canvas?.requestRenderAll();

    this.onScrollChange({ scrollLeft: 0 });
    // After async filmstrip attempt, paint again (fallback tiles if extract fails)
    this.isDirty = true;
    this.renderToOffscreen(true);
    this.canvas?.requestRenderAll();
  }

  public async prepareAssets() {
    // With mediabunny, we don't need to pre-initialize the clip.
    // The extractFrames function handles source loading dynamically.
  }

  private calculateFilmstripDimensions({
    segmentIndex,
    widthOnScreen,
  }: {
    segmentIndex: number;
    widthOnScreen: number;
  }) {
    const filmstripOffset = segmentIndex * this.segmentSize;
    const shouldUseLeftBacklog = segmentIndex > 0;
    const leftBacklogSize = shouldUseLeftBacklog ? this.segmentSize : 0;

    const totalWidth = timeUsToUnits(this.duration, this.tScale, this.playbackRate);

    const rightRemainingSize = totalWidth - widthOnScreen - leftBacklogSize - filmstripOffset;
    const rightBacklogSize = Math.min(this.segmentSize, rightRemainingSize);

    const filmstripStartTime = unitsToTimeUs(filmstripOffset, this.tScale);
    const filmstrimpThumbnailsCount =
      1 + Math.round((widthOnScreen + leftBacklogSize + rightBacklogSize) / this.thumbnailWidth);

    return {
      filmstripOffset,
      leftBacklogSize,
      rightBacklogSize,
      filmstripStartTime,
      filmstrimpThumbnailsCount,
    };
  }

  private resolveAnyLibraryThumb(): string | undefined {
    const remoteSrc =
      typeof (this.metadata as { remoteSrc?: string } | undefined)?.remoteSrc === "string"
        ? (this.metadata as { remoteSrc: string }).remoteSrc
        : undefined;

    const matched = findAssetThumbnailSrc({
      src: this.src,
      name: this.name,
      remoteSrc,
    });
    if (matched) return matched;

    // Last resort: newest video in the library that has a thumbnail
    const files = useAssetsStore.getState().files;
    for (let i = files.length - 1; i >= 0; i--) {
      const f = files[i];
      if (f.type === "video" && isPersistedThumbnailSrc(f.thumbnailSrc)) {
        registerAssetThumbnail([f.src, f.name, f.id], f.thumbnailSrc!);
        return f.thumbnailSrc!;
      }
    }
    return undefined;
  }

  /** Build a data: thumb from the in-memory File (same session upload). */
  private async thumbnailFromLocalFile(): Promise<string | undefined> {
    const remoteSrc =
      typeof (this.metadata as { remoteSrc?: string } | undefined)?.remoteSrc === "string"
        ? (this.metadata as { remoteSrc: string }).remoteSrc
        : undefined;
    const file =
      getLocalMediaFile(this.src) ||
      (remoteSrc ? getLocalMediaFile(remoteSrc) : undefined) ||
      (this.name ? getLocalMediaFile(this.name) : undefined);
    if (!file) return undefined;
    try {
      const blob = await generateThumbnail(file);
      if (!blob) return undefined;
      const dataUrl = await thumbnailBlobToPersistedSrc(blob);
      registerAssetThumbnail([this.src, remoteSrc, this.name, file.name], dataUrl);
      return dataUrl;
    } catch {
      return undefined;
    }
  }

  // load fallback thumbnail, resize it and cache it
  private async loadFallbackThumbnail() {
    if (this.thumbnailCache.getThumbnail("fallback")) return;

    let fromAsset = this.resolveAnyLibraryThumb();
    if (!fromAsset) {
      for (let i = 0; i < 10 && !fromAsset; i++) {
        await new Promise((r) => setTimeout(r, 40));
        fromAsset = this.resolveAnyLibraryThumb();
      }
    }

    const fromFile = fromAsset ? undefined : await this.thumbnailFromLocalFile();

    const fallbackThumbnail =
      fromAsset ||
      fromFile ||
      (isPersistedThumbnailSrc(this.previewUrl) ? this.previewUrl : "") ||
      "";

    if (fallbackThumbnail) {
      this.previewUrl = fallbackThumbnail;
      await this.loadPreviewImageFallback(fallbackThumbnail);
      return;
    }
    if (!this.src) return;
    await this.loadFirstFrameFallback();
  }

  private cacheFallbackImage(img: HTMLImageElement, nativeAspect: number) {
    this.aspectRatio = timelineThumbAspect(nativeAspect);
    this.thumbnailWidth = Math.round(this.thumbnailHeight * this.aspectRatio);
    this.thumbnailCache.setThumbnail("fallback", img);
  }

  private loadPreviewImageFallback(fallbackThumbnail: string): Promise<void> {
    return new Promise<void>((resolve) => {
      const img = new Image();
      // data:/blob: must not get cache-buster query params (breaks the URI)
      const isInline =
        fallbackThumbnail.startsWith("blob:") || fallbackThumbnail.startsWith("data:");
      if (!isInline) {
        img.crossOrigin = "anonymous";
      }
      img.src = isInline
        ? fallbackThumbnail
        : `${fallbackThumbnail}${fallbackThumbnail.includes("?") ? "&" : "?"}t=${Date.now()}`;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve();
          return;
        }
        const nativeAspect = img.width / img.height;
        const targetHeight = 40;
        const targetWidth = Math.round(targetHeight * timelineThumbAspect(nativeAspect));
        canvas.height = targetHeight;
        canvas.width = targetWidth;
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        const resizedImg = new Image();
        resizedImg.onload = () => {
          this.cacheFallbackImage(resizedImg, nativeAspect);
          // Retile after dimensions settle so the gray bar fills with the pic
          this.createFallbackPattern();
          this.isDirty = true;
          this.canvas?.requestRenderAll();
          resolve();
        };
        resizedImg.onerror = () => resolve();
        resizedImg.src = canvas.toDataURL();
      };
      img.onerror = () => {
        void this.loadFirstFrameFallback().then(resolve);
      };
    });
  }

  private loadFirstFrameFallback(): Promise<void> {
    const src = resolveMediaUrl(this.src);
    return new Promise((resolve) => {
      extractFrames({
        src,
        timestampsInSeconds: [0.5],
        onVideoSample: (sample) => {
          using _dispose = sample;
          const canvas = document.createElement("canvas");
          const nativeAspect = sample.displayWidth / sample.displayHeight;
          const targetHeight = 40;
          const targetWidth = Math.round(targetHeight * timelineThumbAspect(nativeAspect));
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve();
            return;
          }
          ctx.save();
          const scaleX = targetWidth / sample.displayWidth;
          const scaleY = targetHeight / sample.displayHeight;
          ctx.scale(scaleX, scaleY);
          sample.draw(ctx, 0, 0);
          ctx.restore();
          const img = new Image();
          img.onload = () => {
            this.cacheFallbackImage(img, nativeAspect);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = canvas.toDataURL();
        },
      }).catch((err) => {
        console.warn("[Timeline] Could not load video filmstrip fallback:", err);
        resolve();
      });
    });
  }

  private generateTimestamps(startTime: number, count: number): number[] {
    const timePerThumbnail = unitsToTimeUs(this.thumbnailWidth, this.tScale, this.playbackRate);

    return Array.from({ length: count }, (_, i) => {
      const timeInFilmstripe = startTime + i * timePerThumbnail;
      return Math.ceil(timeInFilmstripe / 1000);
    });
  }

  private createFallbackPattern() {
    const canvas = this.canvas;
    if (!canvas) return;

    const canvasWidth = canvas.width;
    const maxPatternSize = 12000;
    const fallbackSource = this.thumbnailCache.getThumbnail("fallback");

    if (!fallbackSource) return;

    // Compute the total width and number of segments needed
    const totalWidthNeeded = Math.min(canvasWidth * 20, maxPatternSize);
    const segmentsRequired = Math.ceil(totalWidthNeeded / this.segmentSize);
    this.fallbackSegmentsCount = segmentsRequired;
    const patternWidth = segmentsRequired * this.segmentSize;

    // Setup canvas dimensions
    const offCanvas = document.createElement("canvas");
    offCanvas.height = this.thumbnailHeight;
    offCanvas.width = patternWidth;

    const context = offCanvas.getContext("2d");
    if (!context) return;
    const thumbnailsTotal = segmentsRequired * this.thumbnailsPerSegment;

    // Draw the fallback image across the entirety of the canvas horizontally
    for (let i = 0; i < thumbnailsTotal; i++) {
      const x = i * this.thumbnailWidth;
      context.drawImage(fallbackSource, x, 0, this.thumbnailWidth, this.thumbnailHeight);
    }

    // Create the pattern and apply it
    const fillPattern = new Pattern({
      source: offCanvas,
      repeat: "no-repeat",
      offsetX: 0,
    });

    this.set("fill", fillPattern);
    this.canvas?.requestRenderAll();
  }
  public async loadAndRenderThumbnails() {
    if (this.isFetchingThumbnails) return;
    this.isFetchingThumbnails = true;

    // Abort previous extraction if any
    if (this.extractFramesController) {
      this.extractFramesController.abort();
    }
    this.extractFramesController = new AbortController();
    const { signal } = this.extractFramesController;

    this.loadingFilmstrip = { ...this.nextFilmstrip };
    const { startTime, thumbnailsCount } = this.loadingFilmstrip;
    const timestampsInMs = this.generateTimestamps(startTime, thumbnailsCount);

    // extractFrames expects seconds
    const timestampsInSeconds = timestampsInMs.map((ts) => ts / 1000);

    try {
      await extractFrames({
        src: resolveMediaUrl(this.src),
        timestampsInSeconds,
        signal,
        onVideoSample: (sample) => {
          using frame = sample;
          const timestampMs = Math.round(frame.timestamp * 1000);
          if (this.thumbnailCache.getThumbnail(timestampMs)) return;

          const canvas = document.createElement("canvas");
          canvas.width = this.thumbnailWidth;
          canvas.height = this.thumbnailHeight;
          const ctx = canvas.getContext("2d");

          if (!ctx) return;

          // Draw and scale to fit the thumbnail dimensions
          ctx.save();
          const scaleX = this.thumbnailWidth / frame.displayWidth;
          const scaleY = this.thumbnailHeight / frame.displayHeight;
          ctx.scale(scaleX, scaleY);
          frame.draw(ctx, 0, 0);
          ctx.restore();

          const img = new Image();
          img.src = canvas.toDataURL();
          this.thumbnailCache.setThumbnail(timestampMs, img);

          this.isDirty = true;
          this.canvas?.requestRenderAll();
        },
      });

      this.currentFilmstrip = { ...this.loadingFilmstrip };
    } catch (error: any) {
      if (error.name === "AbortError" || error.message === "Aborted") {
        // Normal cancellation
      } else {
        // warn — Next.js treats console.error as a blocking overlay in dev
        console.warn("Failed to extract frames:", error);
        // Still commit filmstrip layout so render tiles the fallback preview
        this.currentFilmstrip = { ...this.loadingFilmstrip };
      }
    } finally {
      this.isFetchingThumbnails = false;
      this.isDirty = true;
      this.canvas?.requestRenderAll();
    }
  }

  /** Tile the library preview across the clip (works even when filmstrip fetch fails). */
  private paintFallbackTiles(ctx: CanvasRenderingContext2D) {
    const fallback = this.thumbnailCache.getThumbnail("fallback");
    if (!fallback || this.width <= 0) return;

    const thumbnailHeight = this.height || this.thumbnailHeight || 48;
    let thumbnailWidth = this.thumbnailWidth;
    if ((!thumbnailWidth || thumbnailWidth <= 0) && fallback.width && fallback.height) {
      thumbnailWidth = Math.round(
        thumbnailHeight * timelineThumbAspect(fallback.width / fallback.height),
      );
    }
    if (!thumbnailWidth || thumbnailWidth <= 0) {
      thumbnailWidth = Math.round(thumbnailHeight * (16 / 9));
    }

    const trimFromSize = timeUsToUnits(this.trim?.from || 0, this.tScale, this.playbackRate || 1);
    const tileCount = Math.ceil(this.width / thumbnailWidth) + 2;
    for (let i = 0; i < tileCount; i++) {
      const x = i * thumbnailWidth - trimFromSize;
      ctx.drawImage(fallback, x, 0, thumbnailWidth, thumbnailHeight);
    }
  }

  public _render(ctx: CanvasRenderingContext2D) {
    super._render(ctx);

    ctx.save();
    ctx.translate(-this.width / 2, -this.height / 2);

    // Clip the area to prevent drawing outside
    ctx.beginPath();
    ctx.roundRect(0, 0, this.width, this.height, this.rx);
    ctx.clip();

    // Solid base
    ctx.fillStyle = "#3f3f46";
    ctx.fillRect(0, 0, this.width, this.height);

    // Paint library preview tiles directly onto the timeline context.
    // (Previously offscreen filmstrip stayed empty after R2 CORS failures.)
    this.paintFallbackTiles(ctx);

    // Overlay per-timestamp filmstrip frames when extractFrames succeeded
    const { startTime, offset, thumbnailsCount } = this.currentFilmstrip;
    if (thumbnailsCount > 0 && this.thumbnailWidth > 0) {
      const trimFromSize = timeUsToUnits(this.trim?.from || 0, this.tScale, this.playbackRate || 1);
      const timePerThumbnail = unitsToTimeUs(
        this.thumbnailWidth,
        this.tScale,
        this.playbackRate || 1,
      );
      let timeInFilmstripe = startTime;
      for (let i = 0; i < thumbnailsCount; i++) {
        const img = this.thumbnailCache.getThumbnail(Math.ceil(timeInFilmstripe / 1000));
        if (img) {
          const xPosition = i * this.thumbnailWidth + offset - trimFromSize;
          ctx.drawImage(img, xPosition, 0, this.thumbnailWidth, this.height || this.thumbnailHeight);
        }
        timeInFilmstripe += timePerThumbnail;
      }
    }

    ctx.restore();
    this.updateSelected(ctx);
  }

  public setDuration(duration: number) {
    this.duration = duration;
    this.prevDuration = duration;
  }

  public async setSrc(src: string) {
    super.setSrc(src);
    await this.initialize();
    await this.prepareAssets();
    this.thumbnailCache.clearCacheButFallback();
    this.onScale();
  }
  public onResizeSnap() {
    this.renderToOffscreen(true);
  }
  public onResize() {
    this.renderToOffscreen(true);
  }

  public renderToOffscreen(force?: boolean) {
    if (!this.offscreenCtx) return;
    if (!this.isDirty && !force) return;

    if (!this.offscreenCanvas) return;
    this.offscreenCanvas.width = this.width;
    const ctx = this.offscreenCtx;
    const { startTime, offset, thumbnailsCount } = this.currentFilmstrip;
    const fallback = this.thumbnailCache.getThumbnail("fallback");
    const thumbnailHeight = this.thumbnailHeight;
    let thumbnailWidth = this.thumbnailWidth;
    if ((!thumbnailWidth || thumbnailWidth <= 0) && fallback?.width && fallback?.height) {
      thumbnailWidth = Math.round(
        thumbnailHeight * timelineThumbAspect(fallback.width / fallback.height),
      );
    }
    // Calculate the offset caused by the trimming
    const trimFromSize = timeUsToUnits(this.trim.from, this.tScale, this.playbackRate);

    let timeInFilmstripe = startTime;
    const timePerThumbnail = unitsToTimeUs(
      thumbnailWidth || 1,
      this.tScale,
      this.playbackRate || 1,
    );

    // Clear the offscreen canvas
    ctx.clearRect(0, 0, this.width, this.height);

    // Clip with rounded corners
    ctx.beginPath();
    ctx.roundRect(0, 0, this.width, this.height, this.rx);
    ctx.clip();

    // Base fill (visible even before preview loads)
    ctx.fillStyle = "#3f3f46";
    ctx.fillRect(0, 0, this.width, this.height);

    // When filmstrip extraction fails (R2 CORS), currentFilmstrip stays empty.
    // Still tile the library preview so the clip is not a blank gray bar.
    if (fallback && thumbnailWidth > 0) {
      const tileCount =
        thumbnailsCount > 0
          ? thumbnailsCount
          : Math.ceil(this.width / thumbnailWidth) + 2;
      for (let i = 0; i < tileCount; i++) {
        const img =
          (thumbnailsCount > 0
            ? this.thumbnailCache.getThumbnail(Math.ceil(timeInFilmstripe / 1000))
            : undefined) || fallback;
        const xPosition =
          thumbnailsCount > 0
            ? i * thumbnailWidth + offset - trimFromSize
            : i * thumbnailWidth - trimFromSize;
        ctx.drawImage(img, xPosition, 0, thumbnailWidth, thumbnailHeight);
        if (thumbnailsCount > 0) {
          timeInFilmstripe += timePerThumbnail;
        }
      }
    }

    this.isDirty = false;
  }

  public drawTextIdentity(ctx: CanvasRenderingContext2D) {
    const iconPath = new Path2D(
      "M16.5625 0.925L12.5 3.275V0.625L11.875 0H0.625L0 0.625V9.375L0.625 10H11.875L12.5 9.375V6.875L16.5625 9.2125L17.5 8.625V1.475L16.5625 0.925ZM11.25 8.75H1.25V1.25H11.25V8.75ZM16.25 7.5L12.5 5.375V4.725L16.25 2.5V7.5Z",
    );
    ctx.save();
    ctx.translate(-this.width / 2, -this.height / 2);
    ctx.translate(0, 14);
    ctx.font = `400 12px ${SECONDARY_FONT}`;
    ctx.fillStyle = "#f4f4f5";
    ctx.textAlign = "left";
    ctx.clip();
    ctx.fillText("Video", 36, 10);

    ctx.translate(8, 1);

    ctx.fillStyle = "#f4f4f5";
    ctx.fill(iconPath);
    ctx.restore();
  }

  public setSelected(selected: boolean) {
    this.isSelected = selected;
    this.set({ dirty: true });
  }

  public updateSelected(ctx: CanvasRenderingContext2D) {
    const borderColor = this.isSelected
      ? TIMELINE_SELECTED_BORDER_COLOR
      : TIMELINE_UNSELECTED_BORDER_COLOR;
    const borderWidth = TIMELINE_BORDER_WIDTH;
    const borderRadius = TIMELINE_ITEM_BORDER_RADIUS;

    ctx.save();
    ctx.fillStyle = borderColor;

    // Create a path for the outer rectangle with rounded corners
    ctx.beginPath();
    ctx.roundRect(-this.width / 2, -this.height / 2, this.width, this.height, borderRadius);

    // Create a path for the inner rectangle with rounded corners (the hole)
    ctx.roundRect(
      -this.width / 2 + borderWidth,
      -this.height / 2 + borderWidth,
      this.width - borderWidth * 2,
      this.height - borderWidth * 2,
      Math.max(0, borderRadius - borderWidth),
    );

    // Use even-odd fill rule to create the border effect
    ctx.fill("evenodd");
    ctx.restore();
  }

  public calulateWidthOnScreen() {
    const canvasEl = document.getElementById("designcombo-timeline-canvas");
    const canvasWidth = canvasEl?.clientWidth;
    const scrollLeft = this.scrollLeft;
    if (!canvasWidth) return 0;
    const timelineWidth = canvasWidth;
    const cutFromBottomEdge = Math.max(timelineWidth - (this.width + this.left + scrollLeft), 0);
    const visibleHeight = Math.min(timelineWidth - this.left - scrollLeft, timelineWidth);

    return Math.max(visibleHeight - cutFromBottomEdge, 0);
  }

  // Calculate the width that is not visible on the screen measured from the left
  public calculateOffscreenWidth({ scrollLeft }: { scrollLeft: number }) {
    const offscreenWidth = Math.min(this.left + scrollLeft, 0);

    return Math.abs(offscreenWidth);
  }

  public onScrollChange({ scrollLeft, force }: { scrollLeft: number; force?: boolean }) {
    const offscreenWidth = this.calculateOffscreenWidth({ scrollLeft });
    const trimFromSize = timeUsToUnits(this.trim.from, this.tScale, this.playbackRate);

    const offscreenSegments = calculateOffscreenSegments(
      offscreenWidth,
      trimFromSize,
      this.segmentSize,
    );

    this.offscreenSegments = offscreenSegments;

    // calculate start segment to draw
    const segmentToDraw = offscreenSegments;

    if (this.currentFilmstrip.segmentIndex === segmentToDraw) {
      return false;
    }

    if (segmentToDraw !== this.fallbackSegmentIndex) {
      const fillPattern = this.fill as Pattern;
      if (fillPattern instanceof Pattern) {
        fillPattern.offsetX =
          this.segmentSize * (segmentToDraw - Math.floor(this.fallbackSegmentsCount / 2));
      }

      this.fallbackSegmentIndex = segmentToDraw;
    }
    if (!this.isFetchingThumbnails || force) {
      this.scrollLeft = scrollLeft;
      const widthOnScreen = this.calulateWidthOnScreen();
      // With these lines:
      const { filmstripOffset, filmstripStartTime, filmstrimpThumbnailsCount } =
        this.calculateFilmstripDimensions({
          widthOnScreen: this.calulateWidthOnScreen(),
          segmentIndex: segmentToDraw,
        });

      this.nextFilmstrip = {
        segmentIndex: segmentToDraw,
        offset: filmstripOffset,
        startTime: filmstripStartTime,
        thumbnailsCount: filmstrimpThumbnailsCount,
        widthOnScreen,
      };

      this.loadAndRenderThumbnails();
    }
  }
  public onScale() {
    this.currentFilmstrip = { ...EMPTY_FILMSTRIP };
    this.nextFilmstrip = { ...EMPTY_FILMSTRIP, segmentIndex: 0 };
    this.loadingFilmstrip = { ...EMPTY_FILMSTRIP };
    this.onScrollChange({ scrollLeft: this.scrollLeft, force: true });
  }
}

export default Video;
