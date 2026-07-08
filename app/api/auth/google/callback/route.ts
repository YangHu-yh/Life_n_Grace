import { NextRequest, NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { prismaMain } from "@/lib/db/main";
import { authCookieOptions, signAuthToken, TOKEN_COOKIE } from "@/lib/auth";
import { appOrigin, appUrl } from "@/lib/app-origin";
import {
  GOOGLE_STATE_COOKIE,
  isGoogleConfigured
} from "@/lib/security/google-oauth";

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs")
);

function loginError(request: NextRequest, code: string) {
  const response = NextResponse.redirect(appUrl(request, `/login?error=${code}`));
  response.cookies.set(GOOGLE_STATE_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}

// Step 2: Google redirects back with ?code&state. Verify state, exchange the
// code server-side, verify the id_token signature against Google's JWKS,
// then create/link the user and issue our own session cookie.
export async function GET(request: NextRequest) {
  try {
    if (!isGoogleConfigured()) {
      return loginError(request, "google_unavailable");
    }

    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const stateCookie = request.cookies.get(GOOGLE_STATE_COOKIE)?.value;
    if (!code || !state || !stateCookie || state !== stateCookie) {
      return loginError(request, "google_failed");
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${appOrigin(request)}/api/auth/google/callback`,
        grant_type: "authorization_code"
      })
    });
    if (!tokenResponse.ok) {
      console.error("[google callback] token exchange failed:", tokenResponse.status);
      return loginError(request, "google_failed");
    }
    const { id_token: idToken } = await tokenResponse.json();
    if (typeof idToken !== "string") {
      return loginError(request, "google_failed");
    }

    const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: process.env.GOOGLE_CLIENT_ID!
    });

    const email = typeof payload.email === "string" ? payload.email : null;
    const googleSub = typeof payload.sub === "string" ? payload.sub : null;
    if (!email || !googleSub || payload.email_verified !== true) {
      return loginError(request, "google_email_unverified");
    }

    const displayName = typeof payload.name === "string" ? payload.name : null;
    const image = typeof payload.picture === "string" ? payload.picture : null;

    // Link by verified email (matches auth-spec's account-linking decision):
    // existing password accounts gain Google as a sign-in method.
    const user = await prismaMain.user.upsert({
      where: { email },
      create: {
        email,
        emailVerified: new Date(),
        displayName,
        image,
        passwordHash: null
      },
      update: {
        emailVerified: new Date(),
        ...(displayName ? { displayName } : {}),
        ...(image ? { image } : {})
      }
    });

    await prismaMain.account.upsert({
      where: {
        provider_providerAccountId: { provider: "google", providerAccountId: googleSub }
      },
      create: {
        userId: user.id,
        type: "oidc",
        provider: "google",
        providerAccountId: googleSub
      },
      update: { userId: user.id }
    });

    const token = await signAuthToken(user.id);

    const response = NextResponse.redirect(appUrl(request, "/prayers"));
    response.cookies.set(TOKEN_COOKIE, token, authCookieOptions());
    response.cookies.set(GOOGLE_STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    console.error("[GET /api/auth/google/callback]", error);
    return loginError(request, "google_failed");
  }
}
