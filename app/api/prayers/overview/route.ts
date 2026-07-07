import { NextRequest, NextResponse } from "next/server";
import { prismaMain } from "@/lib/db/main";
import { prismaJournal } from "@/lib/db/journal";
import { getUserIdFromRequest } from "@/lib/auth";
import { decryptText } from "@/lib/security/encryption";
import { LANE_TO_JOURNAL_STATUS, type PrayerLane } from "@/lib/prayers/constants";

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

  // Cap unbounded queries (P2-7) — protects response time as data grows;
  // cursor pagination (P1-5) will replace the caps later.
  const [prayers, journals, prayedCheckins] = await Promise.all([
    prismaMain.prayerRequest.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 200
    }),
    prismaJournal.journalEntry.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 200
    }),
    prismaMain.habitCheckin.findMany({
      where: { userId, completed: true },
      orderBy: { date: "desc" },
      select: { date: true },
      take: 400
    })
  ]);

  const prayersWithResolvedLane = prayers.map((prayer) => {
    // Keep older BLOOM records in the accomplished column during transition.
    const lane =
      prayer.lane === "ACTIVE" && prayer.stage === "BLOOM"
        ? "ACCOMPLISHED"
        : prayer.lane;
    return { ...prayer, lane };
  });

  // Read-time reconciliation: for linked entries the wall lane is canonical,
  // so the derived status always wins over the stored one. Any drift found
  // (missed cascade, pre-fix data) is repaired in the database so the two
  // views converge without a manual migration.
  const prayerById = new Map(prayersWithResolvedLane.map((p) => [p.id, p]));
  const orphanedEntryIds: string[] = [];
  const driftedIdsByStatus: Record<"ACTIVE" | "HISTORY", string[]> = {
    ACTIVE: [],
    HISTORY: []
  };

  const mappedJournals = journals.map((entry) => {
    let status = entry.status as "ACTIVE" | "HISTORY";
    let relatedPrayerId = entry.relatedPrayerId;
    let orphaned = false;

    if (relatedPrayerId) {
      const linkedPrayer = prayerById.get(relatedPrayerId);
      if (linkedPrayer) {
        const effectiveStatus = LANE_TO_JOURNAL_STATUS[linkedPrayer.lane as PrayerLane];
        if (effectiveStatus && effectiveStatus !== status) {
          driftedIdsByStatus[effectiveStatus].push(entry.id);
          status = effectiveStatus;
        }
      } else {
        // The wall card is gone (deleted pre-fix, or a failed cascade) —
        // detach so the entry stops claiming a link that no longer resolves.
        orphaned = true;
        orphanedEntryIds.push(entry.id);
        relatedPrayerId = null;
      }
    }

    return {
      id: entry.id,
      title: entry.title,
      content: decryptText(entry.ciphertext, entry.iv),
      status,
      relatedPrayerId,
      ownsLinkedPrayer: relatedPrayerId ? entry.ownsLinkedPrayer : false,
      orphaned,
      sourceLinks: entry.sourceLinks,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt
    };
  });

  // Persist the repairs (best-effort — the response above is already
  // consistent either way, and the next load retries).
  try {
    const repairs: Array<Promise<unknown>> = [];
    for (const targetStatus of ["ACTIVE", "HISTORY"] as const) {
      if (driftedIdsByStatus[targetStatus].length) {
        repairs.push(
          prismaJournal.journalEntry.updateMany({
            where: { id: { in: driftedIdsByStatus[targetStatus] }, userId },
            data: { status: targetStatus }
          })
        );
      }
    }
    if (orphanedEntryIds.length) {
      repairs.push(
        prismaJournal.journalEntry.updateMany({
          where: { id: { in: orphanedEntryIds }, userId },
          data: { relatedPrayerId: null, ownsLinkedPrayer: false }
        })
      );
    }
    if (repairs.length) await Promise.all(repairs);
  } catch (error) {
    console.error("[GET /api/prayers/overview] drift repair failed", error);
  }

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
