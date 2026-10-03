export const APP_AUTH_COOKIE = "app-auth";
export const APP_USER_COOKIE = "app-user";

export type AppUser = {
  username: string;
  password: string;
  displayName: string;
};

export type SessionUser = {
  username: string;
  displayName: string;
};

function parseUsers(): AppUser[] {
  const raw = process.env.APP_USERS?.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((u: any) => ({
        username: String(u?.username ?? "").trim(),
        password: String(u?.password ?? ""),
        displayName: String(u?.displayName ?? u?.username ?? "").trim() || "User",
      }))
      .filter((u) => u.username && u.password);
  } catch {
    return [];
  }
}

/** Auth is active when APP_USERS has at least one account. */
export function isAppAuthEnabled(): boolean {
  return parseUsers().length > 0;
}

export function listAppUsers(): Omit<AppUser, "password">[] {
  return parseUsers().map(({ username, displayName }) => ({ username, displayName }));
}

function getAuthSecret(): string {
  return (
    process.env.APP_AUTH_SECRET?.trim() ||
    process.env.APP_USERS?.slice(0, 32) ||
    "change-me-in-production"
  );
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function encodePayload(session: SessionUser): string {
  const json = JSON.stringify(session);
  // Edge-safe base64url
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodePayload(payload: string): SessionUser | null {
  try {
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const binary = atob(b64 + pad);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json);
    if (!parsed?.username || !parsed?.displayName) return null;
    return { username: String(parsed.username), displayName: String(parsed.displayName) };
  } catch {
    return null;
  }
}

/** Signed session token: base64url(session).hmac */
export async function createAuthToken(session: SessionUser): Promise<string> {
  const payload = encodePayload(session);
  const sig = await hmacSha256Hex(getAuthSecret(), `app-auth:${payload}`);
  return `${payload}.${sig}`;
}

export async function verifyAuthToken(token: string | undefined | null): Promise<SessionUser | null> {
  if (!isAppAuthEnabled()) {
    return { username: "local", displayName: "Local" };
  }
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = await hmacSha256Hex(getAuthSecret(), `app-auth:${payload}`);
  if (!constantTimeEqual(sig, expected)) return null;
  const session = decodePayload(payload);
  if (!session) return null;
  // Ensure user still exists
  const user = parseUsers().find((u) => u.username === session.username);
  if (!user) return null;
  return { username: user.username, displayName: user.displayName };
}

export function validateCredentials(
  username: string,
  password: string,
): SessionUser | null {
  if (!isAppAuthEnabled()) {
    return { username: "local", displayName: "Local" };
  }
  const user = parseUsers().find((u) => constantTimeEqual(u.username, username.trim()));
  if (!user) return null;
  if (!constantTimeEqual(user.password, password)) return null;
  return { username: user.username, displayName: user.displayName };
}

export function isPublicPath(pathname: string): boolean {
  if (pathname === "/login") return true;
  if (pathname.startsWith("/api/auth/login")) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname === "/favicon.ico" || pathname === "/og.png") return true;
  if (/\.(svg|png|jpg|jpeg|gif|webp|ico)$/i.test(pathname)) return true;
  return false;
}
