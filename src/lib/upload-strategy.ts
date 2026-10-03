import type { UploadMode } from "@/lib/r2-config";

/**
 * Local disk upload (/api/local-upload) only works on localhost dev.
 * Vercel has no persistent disk and a ~4.5 MB request body limit.
 */
export function useLocalDiskUpload(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (typeof window === "undefined") return true;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

let cachedUploadMode: UploadMode | null = null;
let uploadModePromise: Promise<UploadMode> | null = null;

function parseUploadMode(value: unknown): UploadMode | null {
  return value === "local" || value === "r2" || value === "browser" ? value : null;
}

/** Client-side upload target — always ask the server (/api/uploads/config). */
export async function resolveUploadMode(): Promise<UploadMode> {
  if (cachedUploadMode) return cachedUploadMode;
  if (!uploadModePromise) {
    uploadModePromise = fetch("/api/uploads/config")
      .then(async (res) => {
        if (!res.ok) {
          return (useLocalDiskUpload() ? "local" : "browser") as UploadMode;
        }
        const data = (await res.json()) as { mode?: unknown };
        const mode =
          parseUploadMode(data.mode) ??
          ((useLocalDiskUpload() ? "local" : "browser") as UploadMode);
        cachedUploadMode = mode;
        return mode;
      })
      .catch(
        () => (useLocalDiskUpload() ? "local" : "browser") as UploadMode,
      )
      .finally(() => {
        uploadModePromise = null;
      });
  }
  return uploadModePromise;
}

export function isRemoteMediaUrl(src: string): boolean {
  return src.startsWith("http://") || src.startsWith("https://");
}

/** Clear cached mode (e.g. after env change during dev). */
export function resetUploadModeCache() {
  cachedUploadMode = null;
  uploadModePromise = null;
}
