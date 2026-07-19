import { prismaMain } from "@/lib/db/main";
import { sendReminderEmail } from "@/lib/email";

// Sprint 9 / G5 — reminder delivery. Called by the cron route on a short
// interval (every 15 min). A reminder is due when, in its OWN timezone, the
// local clock has passed its configured HH:MM and it hasn't been sent yet
// that local day (lastSentAt idempotency guard — safe to run the cron as
// often as we like).

const BATCH_LIMIT = 500;

type LocalClock = { dateKey: string; hhmm: string };

// "2026-07-17" + "07:30" in the given IANA timezone; null if the timezone is
// invalid (user-supplied free text — never let one bad row kill the run).
export function localClock(at: Date, timeZone: string): LocalClock | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(at);
    const get = (type: string) =>
      parts.find((part) => part.type === type)?.value ?? "";
    // Intl yields "24" for midnight with hour12:false in some engines.
    const hour = get("hour") === "24" ? "00" : get("hour");
    return {
      dateKey: `${get("year")}-${get("month")}-${get("day")}`,
      hhmm: `${hour}:${get("minute")}`
    };
  } catch {
    return null;
  }
}

export type ReminderRunSummary = {
  checked: number;
  due: number;
  sent: number;
  skippedUnverified: number;
  skippedChannel: number;
  skippedBadTimezone: number;
  errors: number;
};

export async function runReminderDelivery(now = new Date()): Promise<ReminderRunSummary> {
  const summary: ReminderRunSummary = {
    checked: 0,
    due: 0,
    sent: 0,
    skippedUnverified: 0,
    skippedChannel: 0,
    skippedBadTimezone: 0,
    errors: 0
  };

  const reminders = await prismaMain.reminderSetting.findMany({
    where: { enabled: true },
    include: { user: { select: { email: true, emailVerified: true } } },
    take: BATCH_LIMIT
  });
  summary.checked = reminders.length;

  for (const reminder of reminders) {
    // Only the email channel delivers today; push arrives with the mobile
    // apps (mobile-app-plan Phase 3) as device-local notifications.
    if (reminder.channel !== "email") {
      summary.skippedChannel += 1;
      continue;
    }

    const clock = localClock(now, reminder.timezone);
    if (!clock) {
      summary.skippedBadTimezone += 1;
      continue;
    }

    // Not yet reached today's configured time (HH:MM strings compare
    // lexicographically because both are zero-padded).
    if (clock.hhmm < reminder.time) continue;

    // Already sent this local day.
    if (reminder.lastSentAt) {
      const sentClock = localClock(reminder.lastSentAt, reminder.timezone);
      if (sentClock && sentClock.dateKey === clock.dateKey) continue;
    }

    summary.due += 1;

    // Never email an unverified address (spam risk); with no email provider
    // configured signups auto-verify, so this only bites half-finished
    // signups once real email is on.
    if (!reminder.user.emailVerified) {
      summary.skippedUnverified += 1;
      continue;
    }

    try {
      await sendReminderEmail(reminder.user.email);
      await prismaMain.reminderSetting.update({
        where: { id: reminder.id },
        data: { lastSentAt: now }
      });
      summary.sent += 1;
    } catch (error) {
      // Log without the address (GDPR Art. 5(1)(f)); lastSentAt stays unset
      // so the next cron tick retries.
      console.error(`[reminders] send failed for reminder ${reminder.id}`, error);
      summary.errors += 1;
    }
  }

  return summary;
}
