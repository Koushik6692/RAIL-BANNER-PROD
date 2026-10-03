import { NextRequest } from "next/server";
import { APP_AUTH_COOKIE, SessionUser, verifyAuthToken } from "@/lib/app-auth";

export async function getSessionFromRequest(request: NextRequest): Promise<SessionUser | null> {
  const token = request.cookies.get(APP_AUTH_COOKIE)?.value;
  return verifyAuthToken(token);
}

export async function requireSession(request: NextRequest): Promise<SessionUser> {
  const session = await getSessionFromRequest(request);
  if (!session) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return session;
}
