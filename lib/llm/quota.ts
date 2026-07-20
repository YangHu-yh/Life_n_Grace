import { prismaMain } from "@/lib/db/main";

// Per-user daily cap on Apologist generations (Sprint 11 / G12) — the cost
// floor before store launch, ported from the Django prototype's
// DailyGenerationQuota (10/day). Semantics match Django's: the check runs
// BEFORE the AI call; the counter increments only AFTER a successful
// generation, so fallback prayers (which cost nothing) never consume quota.
// This is spend metering on top of the burst rate limiter, not a paywall —
// P3-3 stays deferred.

const DEFAULT_DAILY_LIMIT = 10;

export function dailyAiLimit(): number {
  const parsed = Number(process.env.AI_DAILY_LIMIT || DEFAULT_DAILY_LIMIT);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_DAILY_LIMIT;
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// For the 429's Retry-After: quota days roll over at UTC midnight.
export function secondsUntilUtcMidnight(): number {
  const now = Date.now();
  const midnight = todayUtc().getTime() + 24 * 60 * 60 * 1000;
  return Math.max(1, Math.ceil((midnight - now) / 1000));
}

export async function getDailyAiUsage(userId: string): Promise<number> {
  const row = await prismaMain.dailyAiUsage.findUnique({
    where: { userId_date: { userId, date: todayUtc() } },
    select: { count: true }
  });
  return row?.count ?? 0;
}

// Non-throwing by design: metering must never break a generation that
// already succeeded. Also emits a CloudWatch metric via EMF — a structured
// log line CloudWatch Logs turns into a real metric (namespace LifeNGrace,
// metric AiGenerations by Route), no SDK calls or IAM changes needed.
export async function recordAiGeneration(userId: string, route: string): Promise<void> {
  try {
    await prismaMain.dailyAiUsage.upsert({
      where: { userId_date: { userId, date: todayUtc() } },
      create: { userId, date: todayUtc(), count: 1 },
      update: { count: { increment: 1 } }
    });
    console.log(
      JSON.stringify({
        _aws: {
          Timestamp: Date.now(),
          CloudWatchMetrics: [
            {
              Namespace: "LifeNGrace",
              Dimensions: [["Route"]],
              Metrics: [{ Name: "AiGenerations", Unit: "Count" }]
            }
          ]
        },
        Route: route,
        AiGenerations: 1
      })
    );
  } catch (error) {
    console.error("[ai-quota] failed to record generation", error);
  }
}
