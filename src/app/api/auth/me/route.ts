import { NextRequest, NextResponse } from "next/server";
import { APP_AUTH_COOKIE, isAppAuthEnabled, verifyAuthToken } from "@/lib/app-auth";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(APP_AUTH_COOKIE)?.value;
  const session = await verifyAuthToken(token);
  return NextResponse.json({
    authRequired: isAppAuthEnabled(),
    user: session,
  });
}
