import { NextRequest, NextResponse } from "next/server";
import { prismaJournal } from "@/lib/db/journal";
import { prismaMain } from "@/lib/db/main";
import { getUserIdFromRequest } from "@/lib/auth";
import { decryptText, encryptText } from "@/lib/security/encryption";

const VALID_LANES = ["ACTIVE", "ACCOMPLISHED", "REROUTED", "PRAISE"] as const;
const LANE_TO_LEGACY_STAGE: Record<(typeof VALID_LANES)[number], "SEED" | "BLOOM"> = {
  ACTIVE: "SEED",
  ACCOMPLISHED: "BLOOM",
  REROUTED: "SEED",
  PRAISE: "SEED"
};

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
    orderBy: { createdAt: "desc" }
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
  if (status && !["ACTIVE", "HISTORY"].includes(status)) {
    return NextResponse.json({ error: "Invalid journal status." }, { status: 400 });
  }
  const safeSourceLinks =
    Array.isArray(sourceLinks) || sourceLinks === undefined ? sourceLinks : null;
  const journalStatus = status ?? "ACTIVE";
  const prayerLane =
    lane && VALID_LANES.includes(lane as (typeof VALID_LANES)[number])
      ? (lane as (typeof VALID_LANES)[number])
      : journalStatus === "HISTORY"
        ? "ACCOMPLISHED"
        : "ACTIVE";

  let finalRelatedPrayerId: string | null = relatedPrayerId
    ? String(relatedPrayerId)
    : null;

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
      sourceLinks: safeSourceLinks ?? undefined
    }
  });

  return NextResponse.json({ entryId: entry.id, status: entry.status });
}
