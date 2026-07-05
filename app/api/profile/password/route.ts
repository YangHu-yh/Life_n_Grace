import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest, hashPassword, verifyPassword } from "@/lib/auth";
import { prismaMain } from "@/lib/db/main";

export async function POST(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { currentPassword, newPassword } = await request.json();
  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: "Current password and new password are required." },
      { status: 400 }
    );
  }

  if (String(newPassword).length < 8) {
    return NextResponse.json(
      { error: "New password must be at least 8 characters." },
      { status: 400 }
    );
  }

  if (String(currentPassword) === String(newPassword)) {
    return NextResponse.json(
      { error: "New password must be different from current password." },
      { status: 400 }
    );
  }

  const user = await prismaMain.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordHash: true }
  });

  if (!user?.passwordHash) {
    // OAuth-only accounts have no password to change
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const matches = await verifyPassword(String(currentPassword), user.passwordHash);
  if (!matches) {
    return NextResponse.json(
      { error: "Current password is incorrect." },
      { status: 400 }
    );
  }

  const nextHash = await hashPassword(String(newPassword));
  await prismaMain.user.update({
    where: { id: userId },
    data: { passwordHash: nextHash }
  });

  return NextResponse.json({ ok: true });
}
