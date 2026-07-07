import { NextRequest, NextResponse } from "next/server";
import { prismaMain } from "@/lib/db/main";
import { prismaJournal } from "@/lib/db/journal";
import { getUserIdFromRequest } from "@/lib/auth";
import { LIMITS, lengthError } from "@/lib/validation";
import {
  isPrayerLane,
  LANE_TO_JOURNAL_STATUS,
  LANE_TO_LEGACY_STAGE,
  LEGACY_STAGE_TO_LANE,
  type PrayerLane
} from "@/lib/prayers/constants";

function startOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function GET(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const prayers = await prismaMain.prayerRequest.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 200
  });
  return NextResponse.json({ prayers });
}

export async function POST(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { topic, notes, lane } = await request.json();
  if (!topic) {
    return NextResponse.json(
      { error: "Prayer topic is required." },
      { status: 400 }
    );
  }
  const lengthProblem =
    lengthError("Prayer topic", topic, LIMITS.prayerTopic) ??
    lengthError("Notes", notes, LIMITS.prayerNotes);
  if (lengthProblem) {
    return NextResponse.json({ error: lengthProblem }, { status: 400 });
  }
  if (lane && !isPrayerLane(lane)) {
    return NextResponse.json({ error: "Invalid lane." }, { status: 400 });
  }
  const laneToPersist: PrayerLane = isPrayerLane(lane) ? lane : "ACTIVE";
  const prayer = await prismaMain.prayerRequest.create({
    data: {
      userId,
      topic,
      notes: notes ? String(notes) : null,
      lane: laneToPersist,
      stage: LANE_TO_LEGACY_STAGE[laneToPersist]
    }
  });
  return NextResponse.json({ prayer });
}

export async function PATCH(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { id, lane, stage, markPrayed } = await request.json();
  if (!id) {
    return NextResponse.json(
      { error: "Prayer id is required." },
      { status: 400 }
    );
  }

  if (markPrayed === true) {
    const today = startOfTodayUtc();
    const now = new Date();
    const updated = await prismaMain.prayerRequest.updateMany({
      where: { id, userId },
      data: {
        prayerCount: { increment: 1 },
        lastPrayedAt: now
      }
    });
    if (updated.count === 0) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    await prismaMain.habitCheckin.upsert({
      where: { userId_date: { userId, date: today } },
      create: { userId, date: today, completed: true },
      update: { completed: true }
    });
    const prayer = await prismaMain.prayerRequest.findUnique({ where: { id } });
    return NextResponse.json({ prayer });
  }

  let laneToPersist: PrayerLane | null = null;

  if (lane) {
    if (!isPrayerLane(lane)) {
      return NextResponse.json({ error: "Invalid lane." }, { status: 400 });
    }
    laneToPersist = lane;
  } else if (stage) {
    if (!["SEED", "SPROUT", "BLOOM"].includes(stage)) {
      return NextResponse.json({ error: "Invalid stage." }, { status: 400 });
    }
    laneToPersist = LEGACY_STAGE_TO_LANE[stage];
  }

  if (!laneToPersist) {
    return NextResponse.json(
      { error: "Prayer lane is required." },
      { status: 400 }
    );
  }

  const updated = await prismaMain.prayerRequest.updateMany({
    where: { id, userId },
    data: {
      lane: laneToPersist,
      stage: LANE_TO_LEGACY_STAGE[laneToPersist]
    }
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Lane is canonical for linked journal entries — cascade the derived
  // status into the journal database. The primary write above already
  // committed, so a cascade failure downgrades to a warning; the overview
  // route's read-time reconciliation repairs the drift on next load.
  let syncWarning: string | undefined;
  try {
    await prismaJournal.journalEntry.updateMany({
      where: { relatedPrayerId: String(id), userId },
      data: { status: LANE_TO_JOURNAL_STATUS[laneToPersist] }
    });
  } catch (error) {
    console.error("[PATCH /api/prayers] journal status cascade failed", error);
    syncWarning =
      "Prayer moved, but its journal entry could not be updated yet. It will self-correct on the next reload.";
  }

  const prayer = await prismaMain.prayerRequest.findUnique({ where: { id } });
  return NextResponse.json(syncWarning ? { prayer, syncWarning } : { prayer });
}
