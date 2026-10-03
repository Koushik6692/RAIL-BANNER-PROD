import { useAssetsStore } from "@/stores/assets-store";
import { isPersistedThumbnailSrc } from "@/lib/asset-thumbnail";
import { getRegisteredThumbnail } from "@/lib/thumbnail-registry";

function basename(src: string): string {
  try {
    const path = src.includes("://") ? new URL(src).pathname : src;
    return decodeURIComponent(path.split("/").pop() || "");
  } catch {
    return src.split("/").pop() || "";
  }
}

/**
 * Find a persisted asset thumbnail for a clip (by src / remoteSrc / name).
 * Used so timeline filmstrips can show the library pic without embedding
 * huge data: URLs into HTML5 drag MIME types (browsers truncate those).
 */
export function findAssetThumbnailSrc(opts: {
  src?: string;
  name?: string;
  remoteSrc?: string;
}): string | undefined {
  const src = opts.src || "";
  const remote = opts.remoteSrc || "";
  const name = opts.name || "";

  const fromRegistry = getRegisteredThumbnail(src, remote, name, basename(src), basename(remote));
  if (fromRegistry) return fromRegistry;

  const files = useAssetsStore.getState().files.filter((f) =>
    isPersistedThumbnailSrc(f.thumbnailSrc),
  );
  if (!files.length) return undefined;

  const nameLower = name.toLowerCase();
  const srcBase = src ? basename(src).toLowerCase() : "";
  const remoteBase = remote ? basename(remote).toLowerCase() : "";

  const match =
    files.find((f) => {
      if (src && (f.src === src || f.name === src)) return true;
      if (remote && f.src === remote) return true;
      if (nameLower && f.name.toLowerCase() === nameLower) return true;
      return false;
    }) ||
    files.find((f) => {
      const fName = f.name.toLowerCase();
      const fBase = basename(f.src).toLowerCase();
      if (nameLower && (fName.includes(nameLower) || nameLower.includes(fName))) return true;
      if (srcBase && (fName === srcBase || fBase === srcBase)) return true;
      if (remoteBase && (fName === remoteBase || fBase === remoteBase)) return true;
      return false;
    }) ||
    (files.length === 1 ? files[0] : files.find((f) => f.type === "video"));

  return match?.thumbnailSrc || undefined;
}

/**
 * Ensure clip has a short preview hint. Prefer NOT stuffing huge data: URLs into
 * project state — Video resolves the real thumbnail via findAssetThumbnailSrc.
 * Only attach preview when it's already a compact http(s) URL.
 */
export function enrichClipPreview<T extends Record<string, any>>(payload: T): T {
  if (!payload || typeof payload !== "object") return payload;

  const existing =
    (typeof payload.preview === "string" && payload.preview) ||
    (typeof payload.metadata?.previewUrl === "string" && payload.metadata.previewUrl) ||
    "";

  // Keep compact http(s) previews; drop oversized data: URLs from clip state
  if (existing.startsWith("http://") || existing.startsWith("https://")) {
    return {
      ...payload,
      preview: existing,
      metadata: {
        ...(payload.metadata || {}),
        previewUrl: existing,
      },
    };
  }

  // data: thumbs stay in thumbnail-registry / assets store; Video looks them up by name
  const next = { ...payload } as T & { preview?: string; metadata?: Record<string, unknown> };
  const nextMeta = { ...(next.metadata || {}) };
  if (typeof nextMeta.previewUrl === "string" && nextMeta.previewUrl.startsWith("data:")) {
    delete nextMeta.previewUrl;
  }
  delete next.preview;
  next.metadata = nextMeta;
  return next;
}
