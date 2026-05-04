import { NextRequest, NextResponse } from "next/server";
import { prismaMain } from "@/lib/db/main";
import { hashPassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Signup failed." },
      { status: 500 }
    );
  }
}
