/** Blob URLs die on refresh — persist thumbnails as data: URLs in localStorage. */
export async function thumbnailBlobToPersistedSrc(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read thumbnail"));
    reader.readAsDataURL(blob);
  });
}

export function isPersistedThumbnailSrc(src?: string | null): boolean {
  if (!src) return false;
  return src.startsWith("data:") || src.startsWith("http://") || src.startsWith("https://");
}

/** Drop stale blob: thumbnails when reloading from localStorage. */
export function sanitizeStoredAssetThumbnail<T extends { thumbnailSrc?: string | null }>(
  asset: T,
): T {
  if (asset.thumbnailSrc?.startsWith("blob:")) {
    return { ...asset, thumbnailSrc: null };
  }
  return asset;
}
