import { NextRequest, NextResponse } from "next/server";
import { prismaMain } from "@/lib/db/main";
import { getUserIdFromRequest } from "@/lib/auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id: reminderId } = await context.params;
    const deleted = await prismaMain.reminderSetting.deleteMany({
      where: { id: reminderId, userId }
    });
    if (deleted.count === 0) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/profile/reminders/[id]]", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
