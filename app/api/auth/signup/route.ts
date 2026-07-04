import { NextRequest, NextResponse } from "next/server";
import { prismaMain } from "@/lib/db/main";
import { hashPassword } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";

const SIGNUP_LIMIT = 5;
const SIGNUP_WINDOW_MS = 60_000;

export async function POST(request: NextRequest) {
  try {
    const rate = checkRateLimit(
      `signup:${getClientIp(request)}`,
      SIGNUP_LIMIT,
      SIGNUP_WINDOW_MS
    );
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many signup attempts. Please try again shortly." },
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
    const existing = await prismaMain.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "User already exists." },
        { status: 409 }
      );
    }
    const passwordHash = await hashPassword(password);
    await prismaMain.user.create({
      data: { email, passwordHash }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[POST /api/auth/signup]", error);
    return NextResponse.json({ error: "Signup failed." }, { status: 500 });
  }
}
