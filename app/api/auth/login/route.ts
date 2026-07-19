import { NextRequest, NextResponse } from "next/server";
import { prismaMain } from "@/lib/db/main";
import { setAuthCookie, signAuthToken, verifyPassword } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";
import { isEmailConfigured } from "@/lib/email";

const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 60_000;

export async function POST(request: NextRequest) {
  try {
    const rate = checkRateLimit(
      `login:${getClientIp(request)}`,
      LOGIN_LIMIT,
      LOGIN_WINDOW_MS
    );
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again shortly." },
        {
          status: 429,
          headers: { "Retry-After": String(rate.retryAfterSeconds) }
        }
      );
    }

    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }
    const user = await prismaMain.user.findUnique({ where: { email } });
    // passwordHash is null for OAuth-only accounts — treat as no credential
    if (!user?.passwordHash) {
      return NextResponse.json(
        { error: "Invalid credentials." },
        { status: 401 }
      );
    }
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid credentials." },
        { status: 401 }
      );
    }
    if (!user.emailVerified && isEmailConfigured()) {
      return NextResponse.json(
        { error: "Please verify your email first. Check your inbox for the link." },
        { status: 403 }
      );
    }
    const token = await signAuthToken(user.id);
    await setAuthCookie(token);
    // Token in the body is for mobile clients (secure-store + Bearer header);
    // web keeps using the httpOnly cookie and ignores it.
    return NextResponse.json({ ok: true, token });
  } catch (error) {
    console.error("[POST /api/auth/login]", error);
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }
}
