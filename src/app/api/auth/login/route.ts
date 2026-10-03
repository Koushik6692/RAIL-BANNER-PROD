import { NextResponse } from "next/server";
import {
  APP_AUTH_COOKIE,
  createAuthToken,
  isAppAuthEnabled,
  validateCredentials,
} from "@/lib/app-auth";

export async function POST(request: Request) {
  if (!isAppAuthEnabled()) {
    return NextResponse.json({
      ok: true,
      authRequired: false,
      user: { username: "local", displayName: "Local" },
    });
  }

  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const session = validateCredentials(body.username ?? "", body.password ?? "");
  if (!session) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  const token = await createAuthToken(session);
  const response = NextResponse.json({
    ok: true,
    authRequired: true,
    user: session,
  });
  response.cookies.set(APP_AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
