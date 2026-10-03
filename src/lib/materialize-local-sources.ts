import { getLocalMediaFile, registerLocalMediaFile } from "@/lib/local-media-registry";
import { idbGetMedia } from "@/lib/local-media-idb";
import { useAssetsStore } from "@/stores/assets-store";
import {
  isHornbrookerClip,
  normalizeInstanceData,
  type HornbrookerInstanceData,
} from "@/lib/hornbrooker-template";
import { renderHornbrookerBannerDataUrl } from "@/lib/render-hornbrooker-banner";
import { useLocalDiskUpload, isRemoteMediaUrl } from "@/lib/upload-strategy";

function blobToObjectUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

function uploadsPathFromSrc(src: string): string | null {
  if (src.startsWith("/uploads/")) return src;
  try {
    const u = new URL(src, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    if (u.pathname.startsWith("/uploads/")) return u.pathname;
  } catch {
    /* ignore */
  }
  return null;
}

function shouldUseAssetSrc(assetSrc: string): boolean {
  if (assetSrc.startsWith("blob:")) return false;
  if (isRemoteMediaUrl(assetSrc)) return true;
  const uploadsPath = uploadsPathFromSrc(assetSrc);
  if (uploadsPath) return useLocalDiskUpload();
  return true;
}

function findAssetByName(name?: string) {
  if (!name) return undefined;
  return useAssetsStore.getState().files.find(
    (f) => f.name === name && typeof f.src === "string" && f.src.length > 0,
  );
}

async function tryRebuildHornbrookerSrc(clip: any): Promise<string | null> {
  if (!isHornbrookerClip(clip)) return null;
  const data = clip?.metadata?.hornbrooker as HornbrookerInstanceData | undefined;
  if (!data?.priceTags?.length && !data?.bgColor) return null;
  try {
    return await renderHornbrookerBannerDataUrl(normalizeInstanceData(data));
  } catch {
    return null;
  }
}

async function resolveFileForClip(clip: any, src: string): Promise<File | undefined> {
  const name = typeof clip.name === "string" ? clip.name : undefined;
  const uploadsPath = uploadsPathFromSrc(src);

  const fromMemory =
    getLocalMediaFile(src) ||
    (uploadsPath ? getLocalMediaFile(uploadsPath) : undefined) ||
    (name ? getLocalMediaFile(name) : undefined);
  if (fromMemory) return fromMemory;

  const fromIdb =
    (await idbGetMedia(src)) ||
    (uploadsPath ? await idbGetMedia(uploadsPath) : undefined) ||
    (name ? await idbGetMedia(name) : undefined);
  if (fromIdb) {
    registerLocalMediaFile(src, fromIdb);
    if (uploadsPath) registerLocalMediaFile(uploadsPath, fromIdb);
    if (name) registerLocalMediaFile(name, fromIdb);
    return fromIdb;
  }

  // Last resort: download from /uploads on disk
  if (uploadsPath) {
    try {
      const res = await fetch(uploadsPath);
      if (!res.ok) return undefined;
      const blob = await res.blob();
      const file = new File([blob], name || uploadsPath.split("/").pop() || "video.mp4", {
        type: blob.type || "video/mp4",
      });
      registerLocalMediaFile(uploadsPath, file);
      if (name) registerLocalMediaFile(name, file);
      return file;
    } catch {
      return undefined;
    }
  }

  if (src.startsWith("blob:")) {
    try {
      const res = await fetch(src);
      if (!res.ok) return undefined;
      const blob = await res.blob();
      return new File([blob], name || "media.bin", { type: blob.type || "application/octet-stream" });
    } catch {
      return undefined;
    }
  }

  return undefined;
}

/**
 * Rewrite every clip.src so Compositor can fetch it reliably.
 * Video/audio → fresh blob: URL backed by File (memory / IndexedDB / /uploads).
 * Hornbrooker banners → data: PNG rebuilt from metadata.
 */
export async function materializeLocalSources(json: any) {
  const clips = json?.clips;
  if (!clips || typeof clips !== "object") return json;

  const entries = Object.values(clips) as any[];
  const fetchMap = new Map<string, Blob>();

  await Promise.all(
    entries.map(async (clip) => {
      let src = clip?.src;
      if (typeof src !== "string" || !src) return;

      // Always rebuild rail banners from fields (never trust blob image URLs)
      const rebuilt = await tryRebuildHornbrookerSrc(clip);
      if (rebuilt) {
        clip.src = rebuilt;
        return;
      }

      if (src.startsWith("data:")) return;

      const name = typeof clip.name === "string" ? clip.name : undefined;
      const asset = findAssetByName(name);
      if (asset?.src && shouldUseAssetSrc(asset.src)) {
        src = asset.src;
        clip.src = asset.src;
      }

      const file = await resolveFileForClip(clip, src);
      if (file) {
        const remote =
          typeof clip?.metadata?.remoteSrc === "string" &&
          (clip.metadata.remoteSrc.startsWith("http://") ||
            clip.metadata.remoteSrc.startsWith("https://"))
            ? clip.metadata.remoteSrc
            : null;
        // Prefer stable R2 URL for export; still attach File so fetch patch can serve it
        const objectUrl = remote ?? blobToObjectUrl(file);
        clip.src = objectUrl;
        fetchMap.set(objectUrl, file);
        if (remote) fetchMap.set(remote, file);
        const uploadsPath = uploadsPathFromSrc(src);
        if (uploadsPath) fetchMap.set(uploadsPath, file);
        if (uploadsPath && typeof window !== "undefined") {
          fetchMap.set(`${window.location.origin}${uploadsPath}`, file);
        }
        if (name) fetchMap.set(name, file);
        return;
      }

      if (src.startsWith("blob:") || (!useLocalDiskUpload() && uploadsPathFromSrc(src))) {
        throw new Error(
          `Could not read "${name || src}" for export. Re-upload in Assets (wait until upload finishes), drag the asset onto the timeline, then export. For large files on production, configure Cloudflare R2 (see DEPLOY.md).`,
        );
      }

      // HTTPS (e.g. R2 CDN) — clip.src already points at remote URL; compositor fetches directly
      if (isRemoteMediaUrl(src)) {
        return;
      }
    }),
  );

  // Attach map for export fetch patch (same tick)
  (json as any).__localFetchMap = fetchMap;
  return json;
}

/** Serve local Files when the compositor fetches clip URLs (avoids dead blob:/CORS issues). */
export async function withLocalMediaFetchPatch<T>(
  fetchMap: Map<string, Blob> | undefined,
  run: () => Promise<T>,
): Promise<T> {
  if (!fetchMap?.size || typeof window === "undefined") return run();

  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    for (const [key, blob] of fetchMap) {
      if (!key) continue;
      if (url === key || (key.startsWith("/uploads/") && url.includes(key))) {
        return new Response(blob, {
          status: 200,
          headers: {
            "Content-Type": blob.type || "application/octet-stream",
            "Content-Length": String(blob.size),
          },
        });
      }
    }
    return original(input, init);
  };

  try {
    return await run();
  } finally {
    window.fetch = original;
  }
}

export function summarizeClipSources(json: any): string {
  const clips = json?.clips ? Object.values(json.clips) : [];
  return (clips as any[])
    .map((c, i) => {
      const src = typeof c?.src === "string" ? c.src : "";
      const kind = src.startsWith("data:")
        ? "data"
        : src.startsWith("blob:")
          ? "blob"
          : src.includes("/uploads/")
            ? "uploads"
            : src.slice(0, 24);
      return `${i + 1}:${c?.type || "?"}/${kind}`;
    })
    .join(", ");
}
