import { NextRequest, NextResponse } from "next/server";
import { runReminderDelivery } from "@/lib/reminders/delivery";
import { timingSafeEqual } from "crypto";

// Sprint 9 / G5 — cron entry point for reminder delivery, invoked by the
// EventBridge rule (infra/lib/app-stack.ts) every 15 minutes. Guarded by a
// shared secret rather than user auth: the caller is a scheduler, not a
// person. 503 (not 401) when the secret is unconfigured so a misdeployed
// environment is distinguishable from a bad caller in the logs.

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  try {
    const expected = process.env.REMINDER_CRON_SECRET;
    if (!expected) {
      return NextResponse.json(
        { error: "Reminder delivery is not configured." },
        { status: 503 }
      );
    }

    const header = request.headers.get("authorization") ?? "";
    const provided = header.startsWith("Bearer ") ? header.slice(7) : header;
    if (!provided || !secretsMatch(provided, expected)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const summary = await runReminderDelivery();
    console.log("[reminders] run summary", summary);
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    console.error("[POST /api/internal/reminders/run]", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
