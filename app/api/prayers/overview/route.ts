import { NextRequest, NextResponse } from "next/server";
import { prismaMain } from "@/lib/db/main";
import { prismaJournal } from "@/lib/db/journal";
import { getUserIdFromRequest } from "@/lib/auth";
import { decryptText } from "@/lib/security/encryption";

function startOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function dateKeyUtc(value: Date) {
  return value.toISOString().slice(0, 10);
}

function computePrayerStreak(prayedDateKeys: Set<string>, today: Date) {
  let streak = 0;
  const cursor = new Date(today);
  while (prayedDateKeys.has(dateKeyUtc(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export async function GET(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const today = startOfTodayUtc();
  const weekStart = new Date(today);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  const last30Start = new Date(today);
  last30Start.setUTCDate(last30Start.getUTCDate() - 29);

  const [prayers, journals, prayedCheckins] = await Promise.all([
    prismaMain.prayerRequest.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" }
    }),
    prismaJournal.journalEntry.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" }
    }),
    prismaMain.habitCheckin.findMany({
      where: { userId, completed: true },
      orderBy: { date: "desc" },
      select: { date: true }
    })
  ]);

  const mappedJournals = journals.map((entry) => ({
    id: entry.id,
    title: entry.title,
    content: decryptText(entry.ciphertext, entry.iv),
    status: entry.status,
    relatedPrayerId: entry.relatedPrayerId,
    sourceLinks: entry.sourceLinks,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt
  }));

  const prayersWithResolvedLane = prayers.map((prayer) => {
    // Keep older BLOOM records in the accomplished column during transition.
    const lane =
      prayer.lane === "ACTIVE" && prayer.stage === "BLOOM"
        ? "ACCOMPLISHED"
        : prayer.lane;
    return { ...prayer, lane };
  });

  const prayerBoard = {
    active: prayersWithResolvedLane.filter((prayer) => prayer.lane === "ACTIVE"),
    accomplished: prayersWithResolvedLane.filter(
      (prayer) => prayer.lane === "ACCOMPLISHED"
    ),
    rerouted: prayersWithResolvedLane.filter((prayer) => prayer.lane === "REROUTED"),
    praise: prayersWithResolvedLane.filter((prayer) => prayer.lane === "PRAISE")
  };
  const pastPrayers = prayerBoard.accomplished;
  const activePrayers = prayerBoard.active;
  const historyJournals = mappedJournals.filter((entry) => entry.status === "HISTORY");
  const activeJournals = mappedJournals.filter((entry) => entry.status === "ACTIVE");
  const prayedDateKeys = new Set(prayedCheckins.map((item) => dateKeyUtc(item.date)));
  const prayerStreakDays = computePrayerStreak(prayedDateKeys, today);
  const daysPrayedLast30 = prayedCheckins.filter((item) => item.date >= last30Start).length;
  const last7DaysCompleted = prayedCheckins.filter((item) => item.date >= weekStart).length;

  return NextResponse.json({
    prayerBoard,
    pastPrayers,
    activePrayers,
    historyJournals,
    activeJournals,
    habitSummary: {
      prayerStreakDays,
      daysPrayedLast30,
      totalPrayerDays: prayedDateKeys.size,
      // Kept temporarily for backwards compatibility with older clients.
      last7DaysCompleted,
      last7DaysTracked: 7
    }
  });
}
