import { NextRequest, NextResponse } from "next/server";
import { prismaMain } from "@/lib/db/main";
import { prismaJournal } from "@/lib/db/journal";
import { clearAuthCookie, getUserIdFromRequest } from "@/lib/auth";

// GDPR Art. 17 — right to erasure. Deletes the user's journal entries
// (separate database, no cross-DB cascade) and then the user record; the
// main-DB cascade removes prayers, reminders, habit check-ins, and any
// Auth.js accounts/sessions.
export async function DELETE(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const user = await prismaMain.user.findUnique({
      where: { id: userId },
      select: { email: true }
    });
    if (!user) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    await prismaJournal.journalEntry.deleteMany({ where: { userId } });
    await prismaMain.verificationToken.deleteMany({
      where: { identifier: user.email }
    });
    await prismaMain.user.delete({ where: { id: userId } });

    await clearAuthCookie();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/auth/account]", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
