import { NextRequest, NextResponse } from "next/server";
import { prismaJournal } from "@/lib/db/journal";
import { prismaMain } from "@/lib/db/main";
import { getUserIdFromRequest } from "@/lib/auth";
import { decryptText, encryptText } from "@/lib/security/encryption";
import { LIMITS, lengthError } from "@/lib/validation";
import type { Prisma } from "@/generated/journal";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id: journalId } = await context.params;
  const existing = await prismaJournal.journalEntry.findUnique({
    where: { id: journalId }
  });
  if (!existing || existing.userId !== userId) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { title, content, status, relatedPrayerId, sourceLinks } =
    await request.json();

  if (status && !["ACTIVE", "HISTORY"].includes(status)) {
    return NextResponse.json({ error: "Invalid journal status." }, { status: 400 });
  }
  if (sourceLinks !== undefined && !Array.isArray(sourceLinks)) {
    return NextResponse.json({ error: "sourceLinks must be an array." }, { status: 400 });
  }
  const lengthProblem =
    lengthError("Title", title, LIMITS.journalTitle) ??
    lengthError("Entry", content, LIMITS.journalContent);
  if (lengthProblem) {
    return NextResponse.json({ error: lengthProblem }, { status: 400 });
  }

  const data: {
    title?: string;
    status?: "ACTIVE" | "HISTORY";
    relatedPrayerId?: string | null;
    sourceLinks?: Prisma.InputJsonValue;
    ciphertext?: string;
    iv?: string;
  } = {};

  if (title !== undefined) data.title = String(title);
  if (status !== undefined) data.status = status;
  if (relatedPrayerId !== undefined) {
    data.relatedPrayerId = relatedPrayerId ? String(relatedPrayerId) : null;
  }
  if (sourceLinks !== undefined) data.sourceLinks = sourceLinks as Prisma.InputJsonValue;
  if (content !== undefined) {
    const encrypted = encryptText(String(content));
    data.ciphertext = encrypted.ciphertext;
    data.iv = encrypted.iv;
  }

  const updated = await prismaJournal.journalEntry.update({
    where: { id: journalId },
    data
  });

  return NextResponse.json({
    entry: {
      id: updated.id,
      title: updated.title,
      content: decryptText(updated.ciphertext, updated.iv),
      status: updated.status,
      relatedPrayerId: updated.relatedPrayerId,
      sourceLinks: updated.sourceLinks,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt
    }
  });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id: journalId } = await context.params;
    // Fetch first: relatedPrayerId / ownsLinkedPrayer decide whether the
    // delete cascades to the wall card in the main database.
    const existing = await prismaJournal.journalEntry.findFirst({
      where: { id: journalId, userId },
      select: { relatedPrayerId: true, ownsLinkedPrayer: true }
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const deleted = await prismaJournal.journalEntry.deleteMany({
      where: { id: journalId, userId }
    });
    if (deleted.count === 0) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    // The entry's own delete committed; cascade failures downgrade to a
    // warning and are repaired by the overview route's reconciliation.
    let syncWarning: string | undefined;
    if (existing.ownsLinkedPrayer && existing.relatedPrayerId) {
      try {
        await prismaMain.prayerRequest.deleteMany({
          where: { id: existing.relatedPrayerId, userId }
        });
        // Any other entries that pointed at the now-deleted card become
        // orphans — detach them.
        await prismaJournal.journalEntry.updateMany({
          where: { relatedPrayerId: existing.relatedPrayerId, userId },
          data: { relatedPrayerId: null, ownsLinkedPrayer: false }
        });
      } catch (error) {
        console.error("[DELETE /api/journal/[id]] prayer cascade failed", error);
        syncWarning =
          "Journal entry deleted, but its wall card could not be removed yet. It will self-correct on the next reload.";
      }
    }

    return NextResponse.json(syncWarning ? { ok: true, syncWarning } : { ok: true });
  } catch (error) {
    console.error("[DELETE /api/journal/[id]]", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
