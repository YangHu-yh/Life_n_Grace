/**
 * Seed a partner demo account with a lived-in prayer wall.
 *
 * Usage (env must contain MAIN_DATABASE_URL, JOURNAL_DATABASE_URL,
 * JOURNAL_ENCRYPTION_KEY, AUTH_JWT_SECRET):
 *
 *   DEMO_EMAIL=partner@example.com DEMO_PASSWORD=changeme123 npm run seed:demo
 *
 * Idempotent per email: re-running resets that account's demo data.
 */
import bcrypt from "bcryptjs";
import { prismaMain } from "../lib/db/main";
import { prismaJournal } from "../lib/db/journal";
import { encryptText } from "../lib/security/encryption";
import { LANE_TO_LEGACY_STAGE, type PrayerLane } from "../lib/prayers/constants";

const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "demo@lifengrace.app";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "grace-demo-2026";

const DEMO_PRAYERS: Array<{
  topic: string;
  notes: string;
  lane: PrayerLane;
  prayerCount: number;
  daysAgoCreated: number;
}> = [
  { topic: "Peace about the job decision", notes: "Interviewing at two places — asking for clarity and open doors.", lane: "ACTIVE", prayerCount: 6, daysAgoCreated: 12 },
  { topic: "Mom's health checkup", notes: "Results due next week. Praying for good news and calm while we wait.", lane: "ACTIVE", prayerCount: 9, daysAgoCreated: 18 },
  { topic: "Patience with the kids this season", notes: "Mornings have been chaotic. Asking for gentleness and humor.", lane: "ACTIVE", prayerCount: 4, daysAgoCreated: 6 },
  { topic: "Sister's move went smoothly", notes: "She settled into the new city and found a church community.", lane: "ACCOMPLISHED", prayerCount: 14, daysAgoCreated: 60 },
  { topic: "Finances for the school year", notes: "Prayed for provision — answered differently than expected: a side project covered it.", lane: "REROUTED", prayerCount: 11, daysAgoCreated: 45 },
  { topic: "Grateful for the small group", notes: "Six months in and it feels like family. Just thankful.", lane: "PRAISE", prayerCount: 3, daysAgoCreated: 30 }
];

const DEMO_JOURNALS: Array<{
  title: string;
  content: string;
  status: "ACTIVE" | "HISTORY";
  linkToPrayerIndex: number | null;
  daysAgoCreated: number;
}> = [
  {
    title: "Waiting well",
    content:
      "Read Psalm 27 this morning — \"Wait for the LORD; be strong, and let your heart take courage.\"\n\nI keep wanting the job answer NOW. But today I noticed the waiting itself is doing something in me. Writing down three things I can be faithful in while I wait.",
    status: "ACTIVE",
    linkToPrayerIndex: 0,
    daysAgoCreated: 3
  },
  {
    title: "Mom's appointment",
    content:
      "Drove Mom to her checkup. In the waiting room we prayed together for the first time in years. Whatever the results say, that moment already felt like an answer.",
    status: "ACTIVE",
    linkToPrayerIndex: 1,
    daysAgoCreated: 5
  },
  {
    title: "How the school money actually came through",
    content:
      "Looking back: I prayed for months for a raise that never came. Instead the weekend design work showed up out of nowhere and covered everything. Re-routed, not unanswered. Keeping this entry as a reminder.",
    status: "HISTORY",
    linkToPrayerIndex: 4,
    daysAgoCreated: 40
  }
];

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function startOfDayUtc(daysBack: number): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysBack)
  );
}

async function main() {
  console.log(`Seeding demo account for ${DEMO_EMAIL}...`);

  // Reset any previous demo data for this email
  const existing = await prismaMain.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) {
    await prismaJournal.journalEntry.deleteMany({ where: { userId: existing.id } });
    await prismaMain.user.delete({ where: { id: existing.id } }); // cascades
    console.log("  reset existing demo account");
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const user = await prismaMain.user.create({
    data: {
      email: DEMO_EMAIL,
      passwordHash,
      displayName: "Demo Partner",
      emailVerified: new Date()
    }
  });

  const prayerIds: string[] = [];
  for (const prayer of DEMO_PRAYERS) {
    const created = await prismaMain.prayerRequest.create({
      data: {
        userId: user.id,
        topic: prayer.topic,
        notes: prayer.notes,
        lane: prayer.lane,
        stage: LANE_TO_LEGACY_STAGE[prayer.lane],
        prayerCount: prayer.prayerCount,
        lastPrayedAt: daysAgo(1),
        createdAt: daysAgo(prayer.daysAgoCreated)
      }
    });
    prayerIds.push(created.id);
  }
  console.log(`  created ${prayerIds.length} prayer cards`);

  for (const entry of DEMO_JOURNALS) {
    const encrypted = encryptText(entry.content);
    await prismaJournal.journalEntry.create({
      data: {
        userId: user.id,
        title: entry.title,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        status: entry.status,
        relatedPrayerId:
          entry.linkToPrayerIndex !== null ? prayerIds[entry.linkToPrayerIndex] : null,
        sourceLinks: [],
        createdAt: daysAgo(entry.daysAgoCreated)
      }
    });
  }
  console.log(`  created ${DEMO_JOURNALS.length} journal entries`);

  // A believable streak: prayed 5 of the last 5 days plus scattered history
  const checkinDays = [0, 1, 2, 3, 4, 6, 7, 9, 12, 15, 20, 27];
  for (const back of checkinDays) {
    await prismaMain.habitCheckin.create({
      data: { userId: user.id, date: startOfDayUtc(back), completed: true }
    });
  }
  console.log(`  created ${checkinDays.length} habit check-ins (5-day current streak)`);

  console.log("Done. Sign in with:");
  console.log(`  email:    ${DEMO_EMAIL}`);
  console.log(`  password: ${DEMO_PASSWORD}`);
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
