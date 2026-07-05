import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prismaMain } from "@/lib/db/main";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";
import { isEmailConfigured, sendPasswordResetEmail } from "@/lib/email";
import { RESET_IDENTIFIER_PREFIX } from "@/lib/security/reset-tokens";

const RESET_LIMIT = 3;
const RESET_WINDOW_MS = 60_000;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// Same response whether or not the account exists — no enumeration.
const GENERIC = {
  ok: true,
  message: "If an account exists for that email, a reset link has been sent."
};

export async function POST(request: NextRequest) {
  try {
    const rate = checkRateLimit(
      `forgot:${getClientIp(request)}`,
      RESET_LIMIT,
      RESET_WINDOW_MS
    );
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many reset requests. Please try again shortly." },
        {
          status: 429,
          headers: { "Retry-After": String(rate.retryAfterSeconds) }
        }
      );
    }

    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    if (!isEmailConfigured()) {
      return NextResponse.json({
        ok: true,
        message:
          "Password reset emails are not enabled yet in this preview. Please contact us to reset your access."
      });
    }

    const user = await prismaMain.user.findUnique({ where: { email: String(email) } });
    // Only issue tokens for real password-based accounts, but always answer
    // with the same message.
    if (user?.passwordHash) {
      const token = crypto.randomBytes(32).toString("hex");
      await prismaMain.verificationToken.create({
        data: {
          identifier: `${RESET_IDENTIFIER_PREFIX}${user.email}`,
          token,
          expires: new Date(Date.now() + RESET_TOKEN_TTL_MS)
        }
      });
      const resetLink = `${request.nextUrl.origin}/reset-password?token=${token}`;
      await sendPasswordResetEmail(user.email, resetLink);
    }

    return NextResponse.json(GENERIC);
  } catch (error) {
    console.error("[POST /api/auth/forgot-password]", error);
    return NextResponse.json({ error: "Password reset failed." }, { status: 500 });
  }
}
