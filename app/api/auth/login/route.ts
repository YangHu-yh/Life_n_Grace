import { NextRequest, NextResponse } from "next/server";
import { prismaMain } from "@/lib/db/main";
import { setAuthCookie, signAuthToken, verifyPassword } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";

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
    if (!user) {
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
    const token = await signAuthToken(user.id);
    setAuthCookie(token);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[POST /api/auth/login]", error);
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }
}
