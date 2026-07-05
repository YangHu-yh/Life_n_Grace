import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  GOOGLE_STATE_COOKIE,
  googleAuthUrl,
  isGoogleConfigured
} from "@/lib/security/google-oauth";

// Step 1 of the Google sign-in flow: set a CSRF state cookie and hand the
// user to Google's consent screen. Inert until GOOGLE_CLIENT_ID/SECRET exist.
export async function GET(request: NextRequest) {
  if (!isGoogleConfigured()) {
    return NextResponse.redirect(new URL("/login?error=google_unavailable", request.url));
  }

  const state = crypto.randomBytes(16).toString("hex");
  const response = NextResponse.redirect(googleAuthUrl(request.nextUrl.origin, state));
  response.cookies.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600
  });
  return response;
}
