import { NextRequest, NextResponse } from "next/server";
import { prismaMain } from "@/lib/db/main";
import { hashPassword } from "@/lib/auth";
import { RESET_IDENTIFIER_PREFIX } from "@/lib/security/reset-tokens";

export async function POST(request: NextRequest) {
  try {
    const { token, newPassword } = await request.json();
    if (!token || !newPassword) {
      return NextResponse.json(
        { error: "Token and new password are required." },
        { status: 400 }
      );
    }
    if (String(newPassword).length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    const record = await prismaMain.verificationToken.findUnique({
      where: { token: String(token) }
    });
    if (
      !record ||
      !record.identifier.startsWith(RESET_IDENTIFIER_PREFIX) ||
      record.expires < new Date()
    ) {
      return NextResponse.json(
        { error: "This reset link is invalid or has expired. Please request a new one." },
        { status: 400 }
      );
    }

    const email = record.identifier.slice(RESET_IDENTIFIER_PREFIX.length);
    const passwordHash = await hashPassword(String(newPassword));
    await prismaMain.user.update({
      where: { email },
      // Resetting via an emailed link also proves ownership of the address
      data: { passwordHash, emailVerified: new Date() }
    });
    await prismaMain.verificationToken.delete({ where: { token: String(token) } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[POST /api/auth/reset-password]", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
