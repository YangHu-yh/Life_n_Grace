import { NextRequest, NextResponse } from "next/server";
import { prismaMain } from "@/lib/db/main";
import { prismaJournal } from "@/lib/db/journal";
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

    const { id: prayerId } = await context.params;
    const deleted = await prismaMain.prayerRequest.deleteMany({
      where: { id: prayerId, userId }
    });
    if (deleted.count === 0) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    // Journal entries live in a separate database with no cross-DB foreign
    // key — detach any entries that referenced this prayer.
    await prismaJournal.journalEntry.updateMany({
      where: { relatedPrayerId: prayerId, userId },
      data: { relatedPrayerId: null }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/prayers/[id]]", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
