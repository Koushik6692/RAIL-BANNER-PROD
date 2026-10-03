/** Session map of asset src/name → persisted thumbnail (data: / https). */
const thumbsByKey = new Map<string, string>();

export function registerAssetThumbnail(keys: Array<string | null | undefined>, thumb: string) {
  if (!thumb) return;
  for (const key of keys) {
    if (!key) continue;
    thumbsByKey.set(key, thumb);
    thumbsByKey.set(key.toLowerCase(), thumb);
  }
}

export function getRegisteredThumbnail(
  ...keys: Array<string | null | undefined>
): string | undefined {
  for (const key of keys) {
    if (!key) continue;
    const hit = thumbsByKey.get(key) || thumbsByKey.get(key.toLowerCase());
    if (hit) return hit;
  }
  return undefined;
}
