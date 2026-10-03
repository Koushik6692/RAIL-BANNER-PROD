import { getLocalMediaFile, registerLocalMediaFile } from "@/lib/local-media-registry";
import { idbGetMedia } from "@/lib/local-media-idb";

const blobUrlByRemote = new Map<string, string>();

function lookupFile(src: string, name?: string): File | undefined {
  return (
    getLocalMediaFile(src) ||
    (name ? getLocalMediaFile(name) : undefined)
  );
}

/**
 * When the original File is still in memory (same session after R2 upload),
 * prefer a blob: URL so Pixi / timeline don't have to fetch the remote file.
 * Keeps remoteSrc in metadata for export / persistence.
 */
export function preferLocalPlayableSrc<T extends Record<string, any>>(payload: T): T {
  if (!payload || typeof payload !== "object") return payload;
  const src = typeof payload.src === "string" ? payload.src : "";
  if (!src || src.startsWith("blob:") || src.startsWith("data:")) return payload;

  const name = typeof payload.name === "string" ? payload.name : undefined;
  const file = lookupFile(src, name);
  if (!file) return payload;

  let blobUrl = blobUrlByRemote.get(src);
  if (!blobUrl) {
    blobUrl = URL.createObjectURL(file);
    blobUrlByRemote.set(src, blobUrl);
    registerLocalMediaFile(blobUrl, file);
    registerLocalMediaFile(src, file);
    if (name) registerLocalMediaFile(name, file);
  }

  return {
    ...payload,
    src: blobUrl,
    metadata: {
      ...(payload.metadata || {}),
      remoteSrc: src,
      previewUrl: payload.metadata?.previewUrl,
    },
  };
}

/** Like preferLocalPlayableSrc, but recovers the File from IndexedDB when memory was cleared. */
export async function ensureLocalPlayableSrc<T extends Record<string, any>>(
  payload: T,
): Promise<T> {
  if (!payload || typeof payload !== "object") return payload;
  const src = typeof payload.src === "string" ? payload.src : "";
  if (!src || src.startsWith("blob:") || src.startsWith("data:")) return payload;

  const name = typeof payload.name === "string" ? payload.name : undefined;
  if (lookupFile(src, name)) {
    return preferLocalPlayableSrc(payload);
  }

  const fromIdb =
    (await idbGetMedia(src).catch(() => undefined)) ||
    (name ? await idbGetMedia(name).catch(() => undefined) : undefined);

  if (fromIdb) {
    registerLocalMediaFile(src, fromIdb);
    if (name) registerLocalMediaFile(name, fromIdb);
    return preferLocalPlayableSrc(payload);
  }

  return payload;
}
