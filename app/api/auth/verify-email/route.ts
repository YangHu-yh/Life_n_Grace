import { NextRequest, NextResponse } from "next/server";
import { appUrl } from "@/lib/app-origin";
import { prismaMain } from "@/lib/db/main";

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.redirect(appUrl(request, "/login?error=invalid_token"));
    }

    const record = await prismaMain.verificationToken.findUnique({
      where: { token }
    });
    if (!record || record.expires < new Date()) {
      return NextResponse.redirect(appUrl(request, "/login?error=expired_token"));
    }

    await prismaMain.user.update({
      where: { email: record.identifier },
      data: { emailVerified: new Date() }
    });
    await prismaMain.verificationToken.delete({ where: { token } });

    return NextResponse.redirect(appUrl(request, "/login?verified=1"));
  } catch (error) {
    console.error("[GET /api/auth/verify-email]", error);
    return NextResponse.redirect(appUrl(request, "/login?error=verify_failed"));
  }
}
