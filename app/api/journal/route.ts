import { NextRequest, NextResponse } from "next/server";
import { prismaJournal } from "@/lib/db/journal";
import { prismaMain } from "@/lib/db/main";
import { getUserIdFromRequest } from "@/lib/auth";
import { decryptText, encryptText } from "@/lib/security/encryption";
import { LIMITS, lengthError } from "@/lib/validation";
import {
  isPrayerLane,
  LANE_TO_JOURNAL_STATUS,
  LANE_TO_LEGACY_STAGE,
  type PrayerLane
} from "@/lib/prayers/constants";

export async function GET(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const statusParam = (searchParams.get("status") ?? "all").toLowerCase();
  const statusFilter =
    statusParam === "active"
      ? "ACTIVE"
      : statusParam === "history"
        ? "HISTORY"
        : null;

  const entries = await prismaJournal.journalEntry.findMany({
    where: {
      userId,
      ...(statusFilter ? { status: statusFilter } : {})
    },
    orderBy: { createdAt: "desc" },
    take: 200
  });

  const decrypted = entries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    content: decryptText(entry.ciphertext, entry.iv),
    status: entry.status,
    relatedPrayerId: entry.relatedPrayerId,
    sourceLinks: entry.sourceLinks,
    createdAt: entry.createdAt
  }));

  return NextResponse.json({ entries: decrypted });
}

export async function POST(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { title, content, status, relatedPrayerId, sourceLinks, lane } =
    await request.json();
  if (!title || !content) {
    return NextResponse.json(
      { error: "Title and content are required." },
      { status: 400 }
    );
  }
  const lengthProblem =
    lengthError("Title", title, LIMITS.journalTitle) ??
    lengthError("Entry", content, LIMITS.journalContent);
  if (lengthProblem) {
    return NextResponse.json({ error: lengthProblem }, { status: 400 });
  }
  if (status && !["ACTIVE", "HISTORY"].includes(status)) {
    return NextResponse.json({ error: "Invalid journal status." }, { status: 400 });
  }
  const safeSourceLinks =
    Array.isArray(sourceLinks) || sourceLinks === undefined ? sourceLinks : null;
  let journalStatus: "ACTIVE" | "HISTORY" = status ?? "ACTIVE";
  const prayerLane: PrayerLane = isPrayerLane(lane)
    ? lane
    : journalStatus === "HISTORY"
      ? "ACCOMPLISHED"
      : "ACTIVE";

  let finalRelatedPrayerId: string | null = relatedPrayerId
    ? String(relatedPrayerId)
    : null;
  let ownsLinkedPrayer = false;

  // Linking to an existing wall card: the card must exist and belong to this
  // user, and the entry's status derives from the card's lane (lane is
  // canonical for linked entries).
  if (finalRelatedPrayerId) {
    const linkedPrayer = await prismaMain.prayerRequest.findFirst({
      where: { id: finalRelatedPrayerId, userId }
    });
    if (!linkedPrayer) {
      return NextResponse.json(
        { error: "Linked prayer card not found." },
        { status: 400 }
      );
    }
    journalStatus = LANE_TO_JOURNAL_STATUS[linkedPrayer.lane as PrayerLane] ?? "ACTIVE";
  }

  // When no linked prayer: create both PrayerRequest and JournalEntry so the
  // prayer journal appears on both the Prayer wall and the Journal workspace.
  if (!finalRelatedPrayerId) {
    const notesPreview = String(content).slice(0, 500);
    const prayer = await prismaMain.prayerRequest.create({
      data: {
        userId,
        topic: title,
        notes: notesPreview,
        lane: prayerLane,
        stage: LANE_TO_LEGACY_STAGE[prayerLane]
      }
    });
    finalRelatedPrayerId = prayer.id;
    ownsLinkedPrayer = true;
  }

  const encrypted = encryptText(content);
  const entry = await prismaJournal.journalEntry.create({
    data: {
      userId,
      title,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      status: journalStatus,
      relatedPrayerId: finalRelatedPrayerId,
      ownsLinkedPrayer,
      sourceLinks: safeSourceLinks ?? undefined
    }
  });

  return NextResponse.json({ entryId: entry.id, status: entry.status });
}
