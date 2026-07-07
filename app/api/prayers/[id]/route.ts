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
    // key — detach any entries that referenced this prayer. The prayer's own
    // delete already committed, so a detach failure downgrades to a warning
    // and is repaired by the overview route's reconciliation.
    let syncWarning: string | undefined;
    try {
      await prismaJournal.journalEntry.updateMany({
        where: { relatedPrayerId: prayerId, userId },
        data: { relatedPrayerId: null, ownsLinkedPrayer: false }
      });
    } catch (error) {
      console.error("[DELETE /api/prayers/[id]] journal detach failed", error);
      syncWarning =
        "Prayer card deleted, but its journal entry could not be unlinked yet. It will self-correct on the next reload.";
    }

    return NextResponse.json(syncWarning ? { ok: true, syncWarning } : { ok: true });
  } catch (error) {
    console.error("[DELETE /api/prayers/[id]]", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
