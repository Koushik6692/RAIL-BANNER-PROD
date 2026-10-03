/**
 * Keeps File objects for the current browser session so export / filmstrip
 * can use BlobSource instead of fetching remote URLs (R2 CORS).
 */
const filesBySrc = new Map<string, File>();
const filesByName = new Map<string, File>();

function normalizeKey(key: string): string {
  return key.trim();
}

function basenameFromSrc(src: string): string | undefined {
  if (!src) return undefined;
  try {
    const path = src.includes("://") ? new URL(src).pathname : src;
    const raw = path.split("/").pop();
    if (!raw) return undefined;
    return decodeURIComponent(raw);
  } catch {
    const raw = src.split("/").pop();
    return raw ? decodeURIComponent(raw) : undefined;
  }
}

export function registerLocalMediaFile(src: string, file: File) {
  if (src) filesBySrc.set(normalizeKey(src), file);
  if (file.name) {
    filesByName.set(file.name, file);
    filesByName.set(file.name.toLowerCase(), file);
  }
  const base = basenameFromSrc(src);
  if (base) {
    filesByName.set(base, file);
    filesByName.set(base.toLowerCase(), file);
  }
}

export function getLocalMediaFile(srcOrName: string): File | undefined {
  if (!srcOrName) return undefined;
  const key = normalizeKey(srcOrName);
  const direct = filesBySrc.get(key) || filesByName.get(key) || filesByName.get(key.toLowerCase());
  if (direct) return direct;

  const base = basenameFromSrc(key);
  if (base) {
    return filesByName.get(base) || filesByName.get(base.toLowerCase());
  }
  return undefined;
}
