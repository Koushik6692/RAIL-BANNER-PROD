import { clipToJSON, type IClip as StudioClip, Studio } from "@openvideo/engine-pixi";
import CanvasTimeline, { TIMELINE_SEEK } from "@openvideo/timeline";
import { IClip } from "@/types/timeline";
import { core, projectStore } from "@/lib/project";
import { useStudioStore } from "@/stores/studio-store";
import {
  applyHornbrookerTemplate,
  isHornbrookerDropPayload,
} from "@/lib/apply-hornbrooker";
import {
  isVideoPayload,
  prepareRailVideoPayload,
  RAIL_VIDEO_FIT,
} from "@/lib/rail-video-clip";
import { ensureLocalPlayableSrc } from "@/lib/prefer-local-playable-src";
import { enrichClipPreview } from "@/lib/resolve-clip-preview";

/**
 * Timeline drag guide expects `duration` in SECONDS (it multiplies by 1e6).
 * Core / loadClip expect MICROSECONDS. Convert before clip.add.
 */
function normalizeDropPayloadForCore(payload: any) {
  if (!payload || typeof payload !== "object") return payload;

  let next = { ...payload };
  const topDuration = next.duration;

  // Heuristic: values under 10_000 are almost certainly seconds (not µs)
  if (typeof topDuration === "number" && topDuration > 0 && topDuration < 10_000) {
    const durUs = Math.round(topDuration * 1_000_000);
    const fromUs = Number(next.timing?.display?.from ?? 0) || 0;
    next = {
      ...next,
      duration: durUs,
      timing: {
        ...(next.timing || {}),
        duration: durUs,
        display: {
          ...(next.timing?.display || {}),
          from: fromUs,
          to: fromUs + durUs,
        },
        trim: next.timing?.trim ?? { from: 0, to: durUs },
      },
    };
  }

  return next;
}

/** Timeline left-edge drops often land ~0.5–1s — snap those to 0 without breaking duration. */
function snapPayloadToZeroIfNearStart(payload: any) {
  const fromUs = Number(payload?.timing?.display?.from ?? 0);
  if (!Number.isFinite(fromUs) || fromUs <= 0 || fromUs >= 1.05 * 1_000_000) {
    return payload;
  }

  const toUs = payload?.timing?.display?.to;
  const durationUs =
    toUs != null && Number.isFinite(Number(toUs))
      ? Number(toUs) - fromUs
      : payload?.timing?.duration ?? payload?.duration;

  const display: Record<string, number> = {
    ...(payload.timing?.display || {}),
    from: 0,
  };
  if (durationUs != null && Number.isFinite(Number(durationUs)) && Number(durationUs) > 1000) {
    display.to = Number(durationUs);
  }

  return {
    ...payload,
    timing: {
      ...(payload.timing || {}),
      display,
    },
  };
}

/**
 * Connects the Studio instance to the Store and Timeline.
 */
export const addStudioSync = (studio: Studio, timeline: CanvasTimeline): (() => void) => {
  console.log("Adding studio sync with Core-First flow");

  const handleClipTransforming = ({ clip }: { clip: IClip }) => {
    const serialized = clipToJSON(clip as unknown as StudioClip) as any;
    core.emit("clip:transforming", { id: clip.id, updates: serialized });
  };

  studio.on("clip:transforming", handleClipTransforming as any);

  const handleTimelineSeek = ({ payload }: any) => {
    projectStore.getState().seek(payload.time);
  };

  timeline.emitter.on(TIMELINE_SEEK, handleTimelineSeek);

  const handleAddClip = async ({ payload, options }: any) => {
    console.log("timeline add event: ", { payload, options });

    try {
      const normalized = normalizeDropPayloadForCore(payload);
      const snapped = snapPayloadToZeroIfNearStart(normalized);

      if (isHornbrookerDropPayload(snapped)) {
        const startSeconds = Number(snapped?.timing?.display?.from ?? 0) / 1_000_000;
        await applyHornbrookerTemplate({
          startSeconds,
          replacePrevious: false,
        });
        return;
      }

      const localized = enrichClipPreview(await ensureLocalPlayableSrc(snapped));
      const addPayload = isVideoPayload(localized)
        ? prepareRailVideoPayload(localized)
        : localized;
      const addOptions = isVideoPayload(localized) ? { ...options, ...RAIL_VIDEO_FIT } : options;

      await core.clip.add(addPayload, addOptions);
    } catch (error) {
      console.error("Failed to add dropped clip:", error);
    }
  };

  timeline.emitter.on("add:video", handleAddClip);
  timeline.emitter.on("add:image", handleAddClip);
  timeline.emitter.on("add:audio", handleAddClip);
  timeline.emitter.on("add:text", handleAddClip);
  timeline.emitter.on("add:transition", handleAddClip);
  timeline.emitter.on("add:effect", handleAddClip);
  timeline.emitter.on("add:shape", handleAddClip);

  let prevState = projectStore.getState();

  const unsubCore = projectStore.subscribe(async (state) => {
    const currentPrevState = prevState;
    prevState = state;

    try {
      if (state.scale !== currentPrevState.scale) {
        timeline.syncScale({ scale: state.scale });
      }

      if (state.selectedIds !== currentPrevState.selectedIds) {
        const { setSelectedClips } = useStudioStore.getState();
        const engineClips = state.selectedIds
          .map((id) => studio.timeline.getClipById(id))
          .filter(Boolean);
        setSelectedClips(engineClips as any[]);
      }
    } catch (e) {
      console.warn("Core subscription error:", e);
    }
  });

  return () => {
    studio.off("clip:transforming", handleClipTransforming as any);
    timeline.emitter.off(TIMELINE_SEEK, handleTimelineSeek);
    timeline.emitter.off("add:video", handleAddClip);
    timeline.emitter.off("add:image", handleAddClip);
    timeline.emitter.off("add:audio", handleAddClip);
    timeline.emitter.off("add:text", handleAddClip);
    timeline.emitter.off("add:transition", handleAddClip);
    timeline.emitter.off("add:effect", handleAddClip);
    timeline.emitter.off("add:shape", handleAddClip);
    unsubCore();
  };
};
