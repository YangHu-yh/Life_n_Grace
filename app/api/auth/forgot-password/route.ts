import { NextRequest, NextResponse } from "next/server";
import { prismaMain } from "@/lib/db/main";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    if (!email) {
      return NextResponse.json(
        { error: "Email is required." },
        { status: 400 }
      );
    }
    const user = await prismaMain.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json(
        { message: "If the email exists, a reset link will be sent." },
        { status: 200 }
      );
    }
    return NextResponse.json({
      message:
        "Password reset is not configured yet. Connect an email provider in production."
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Password reset failed."
      },
      { status: 500 }
    );
  }
}
