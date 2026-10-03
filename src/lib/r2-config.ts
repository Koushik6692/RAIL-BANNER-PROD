/** True when all R2 env vars are set (server-side only). */
export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_BUCKET_NAME &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_ACCOUNT_ID &&
      process.env.R2_PUBLIC_DOMAIN,
  );
}

export type UploadMode = "local" | "r2" | "browser";

/** Set R2_UPLOAD_IN_DEV=true in .env to test Cloudflare uploads on localhost. */
export function useR2UploadInDev(): boolean {
  return process.env.R2_UPLOAD_IN_DEV === "true" && isR2Configured();
}

/** Resolve upload target for the current deployment (API route / server). */
export function getServerUploadMode(): UploadMode {
  if (process.env.NODE_ENV !== "production") {
    return useR2UploadInDev() ? "r2" : "local";
  }
  return isR2Configured() ? "r2" : "browser";
}
