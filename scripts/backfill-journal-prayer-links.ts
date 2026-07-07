/**
 * One-time backfill for journal entries created before the prayer/journal
 * consistency fix (post-demo plan v2.3, section 3d).
 *
 * For every JournalEntry with a relatedPrayerId:
 *   - missing PrayerRequest  -> null the link (self-heal orphans)
 *   - found                  -> infer ownsLinkedPrayer via signature match
 *                               against the auto-create path (topic === title,
 *                               notes === content preview, created within 10s)
 *                               and overwrite status from the prayer's lane
 *                               (lane is canonical).
 *
 * Run manually ONCE against the deployed RDS instance (not wired into
 * CI/deploy), after `prisma db push` has added ownsLinkedPrayer:
 *
 *   npx tsx scripts/backfill-journal-prayer-links.ts           # dry run
 *   APPLY=1 npx tsx scripts/backfill-journal-prayer-links.ts   # write changes
 *
 * Env must contain MAIN_DATABASE_URL, JOURNAL_DATABASE_URL,
 * JOURNAL_ENCRYPTION_KEY. Review the printed summary before relying on it.
 */
import { prismaMain } from "../lib/db/main";
import { prismaJournal } from "../lib/db/journal";
import { decryptText } from "../lib/security/encryption";
import { LANE_TO_JOURNAL_STATUS, type PrayerLane } from "../lib/prayers/constants";

const APPLY = process.env.APPLY === "1";
const AUTO_CREATE_WINDOW_MS = 10_000;

async function main() {
  const linkedEntries = await prismaJournal.journalEntry.findMany({
    where: { relatedPrayerId: { not: null } }
  });
  console.log(
    `${APPLY ? "APPLY" : "DRY RUN"} — ${linkedEntries.length} linked journal entries to check`
  );

  let orphansDetached = 0;
  let statusRepaired = 0;
  let ownershipSet = 0;
  let untouched = 0;

  for (const entry of linkedEntries) {
    const prayer = await prismaMain.prayerRequest.findUnique({
      where: { id: entry.relatedPrayerId! }
    });

    if (!prayer || prayer.userId !== entry.userId) {
      orphansDetached += 1;
      console.log(
        `  orphan  entry=${entry.id} "${entry.title}" -> detach (prayer ${entry.relatedPrayerId} ${prayer ? "belongs to another user" : "missing"})`
      );
      if (APPLY) {
        await prismaJournal.journalEntry.update({
          where: { id: entry.id },
          data: { relatedPrayerId: null, ownsLinkedPrayer: false }
        });
      }
      continue;
    }

    // Signature match against what POST /api/journal's auto-create path sets.
    const content = decryptText(entry.ciphertext, entry.iv);
    const looksAutoCreated =
      prayer.topic === entry.title &&
      (prayer.notes ?? "") === content.slice(0, 500) &&
      Math.abs(prayer.createdAt.getTime() - entry.createdAt.getTime()) <=
        AUTO_CREATE_WINDOW_MS;

    const laneStatus = LANE_TO_JOURNAL_STATUS[prayer.lane as PrayerLane] ?? entry.status;
    const wantsOwnership = looksAutoCreated && !entry.ownsLinkedPrayer;
    const wantsStatus = laneStatus !== entry.status;

    if (!wantsOwnership && !wantsStatus) {
      untouched += 1;
      continue;
    }

    if (wantsOwnership) ownershipSet += 1;
    if (wantsStatus) statusRepaired += 1;
    console.log(
      `  update  entry=${entry.id} "${entry.title}"` +
        (wantsOwnership ? " ownsLinkedPrayer:false->true" : "") +
        (wantsStatus ? ` status:${entry.status}->${laneStatus} (lane=${prayer.lane})` : "")
    );
    if (APPLY) {
      await prismaJournal.journalEntry.update({
        where: { id: entry.id },
        data: {
          ...(wantsOwnership ? { ownsLinkedPrayer: true } : {}),
          ...(wantsStatus ? { status: laneStatus } : {})
        }
      });
    }
  }

  console.log("\nSummary:");
  console.log(`  orphans detached:   ${orphansDetached}`);
  console.log(`  status repaired:    ${statusRepaired}`);
  console.log(`  ownership set:      ${ownershipSet}`);
  console.log(`  untouched:          ${untouched}`);
  if (!APPLY) console.log("\nDry run only — re-run with APPLY=1 to write changes.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prismaMain.$disconnect();
    await prismaJournal.$disconnect();
  });
