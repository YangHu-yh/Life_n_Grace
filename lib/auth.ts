import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

export const TOKEN_COOKIE = "auth_token";
// 30 days (was 7): decided for mobile (Sprint 9 / G6) — the apps persist the
// token in the device secure store and a weekly forced re-login is hostile
// mobile UX. One lifetime for both transports keeps a single code path; a
// refresh endpoint is deliberately deferred until real usage demands it
// (documented in docs/mobile-app-plan.md Phase 0).
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

// Shared cookie options for handlers that set the cookie on a custom
// response (e.g. OAuth redirects) instead of via cookies().
export function authCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TOKEN_TTL_SECONDS
  };
}

function getJwtSecret() {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret) {
    throw new Error("AUTH_JWT_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function signAuthToken(userId: string) {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(getJwtSecret());
}

export async function getUserIdFromRequest(request: NextRequest) {
  // Cookie for web; Authorization: Bearer for mobile clients (Sprint 9 / G6).
  // Same JWT, same verification — transport is the only difference.
  const bearer = request.headers.get("authorization");
  const token =
    request.cookies.get(TOKEN_COOKIE)?.value ??
    (bearer?.startsWith("Bearer ") ? bearer.slice(7) : undefined);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function setAuthCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TOKEN_TTL_SECONDS
  });
}

export async function clearAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.set(TOKEN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}
