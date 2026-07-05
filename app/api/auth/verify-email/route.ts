import { NextRequest, NextResponse } from "next/server";
import { prismaMain } from "@/lib/db/main";

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.redirect(new URL("/login?error=invalid_token", request.url));
    }

    const record = await prismaMain.verificationToken.findUnique({
      where: { token }
    });
    if (!record || record.expires < new Date()) {
      return NextResponse.redirect(new URL("/login?error=expired_token", request.url));
    }

    await prismaMain.user.update({
      where: { email: record.identifier },
      data: { emailVerified: new Date() }
    });
    await prismaMain.verificationToken.delete({ where: { token } });

    return NextResponse.redirect(new URL("/login?verified=1", request.url));
  } catch (error) {
    console.error("[GET /api/auth/verify-email]", error);
    return NextResponse.redirect(new URL("/login?error=verify_failed", request.url));
  }
}
