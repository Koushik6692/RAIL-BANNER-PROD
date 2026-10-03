import { NextRequest, NextResponse } from "next/server";
import {
  APP_AUTH_COOKIE,
  isAppAuthEnabled,
  isPublicPath,
  verifyAuthToken,
} from "@/lib/app-auth";

export async function middleware(request: NextRequest) {
  if (!isAppAuthEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  const token = request.cookies.get(APP_AUTH_COOKIE)?.value;
  const session = await verifyAuthToken(token);
  const authed = Boolean(session);

  if (pathname === "/login") {
    if (authed) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (authed) {
    const res = NextResponse.next();
    // Expose display identity to server components via header
    res.headers.set("x-app-user", session!.username);
    res.headers.set("x-app-display-name", encodeURIComponent(session!.displayName));
    return res;
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
