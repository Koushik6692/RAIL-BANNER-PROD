/** Absolute URL for mediabunny / timeline fetches (relative /uploads/ fails silently). */
export function resolveMediaUrl(src: string): string {
  if (!src) return src;
  if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("blob:") || src.startsWith("data:")) {
    return src;
  }
  if (typeof window !== "undefined" && src.startsWith("/")) {
    return `${window.location.origin}${src}`;
  }
  return src;
}

/** Ultra-wide shelf rails (2880×158) need a capped aspect for timeline filmstrip tiles. */
export const TIMELINE_THUMB_MAX_ASPECT = 6;

export function timelineThumbAspect(nativeAspect: number): number {
  if (!Number.isFinite(nativeAspect) || nativeAspect <= 0) return 16 / 9;
  return Math.min(nativeAspect, TIMELINE_THUMB_MAX_ASPECT);
}
