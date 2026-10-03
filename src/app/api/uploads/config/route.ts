import { NextResponse } from "next/server";
import { getServerUploadMode, isR2Configured } from "@/lib/r2-config";

export async function GET() {
  const mode = getServerUploadMode();
  return NextResponse.json({
    mode,
    r2Configured: isR2Configured(),
    publicDomain: mode === "r2" ? process.env.R2_PUBLIC_DOMAIN : undefined,
  });
}
