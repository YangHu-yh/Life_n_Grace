// Hand-copied from the web app's shapes (see docs/api-compatibility-policy.md
// — these fields are contract). Extract a shared package only when drift
// actually hurts.

export type PrayerLane = "ACTIVE" | "ACCOMPLISHED" | "REROUTED" | "PRAISE";

export const LANE_LABELS: Record<PrayerLane, string> = {
  ACTIVE: "Active",
  ACCOMPLISHED: "Accomplished",
  REROUTED: "Re-routed",
  PRAISE: "Praise"
};

export const ALL_LANES: PrayerLane[] = [
  "ACTIVE",
  "ACCOMPLISHED",
  "REROUTED",
  "PRAISE"
];

export type Prayer = {
  id: string;
  topic: string;
  notes?: string | null;
  lane: PrayerLane;
  prayerCount?: number;
  lastPrayedAt?: string | null;
  createdAt: string;
};

export type JournalEntry = {
  id: string;
  title: string;
  content: string;
  status: "ACTIVE" | "HISTORY";
  relatedPrayerId: string | null;
  ownsLinkedPrayer?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type HabitSummary = {
  prayerStreakDays: number;
  daysPrayedLast30: number;
  totalPrayerDays: number;
};

export type Overview = {
  prayers: Prayer[];
  journals: JournalEntry[];
  habitSummary: HabitSummary;
};

export type Profile = {
  id: string;
  email: string;
  displayName: string | null;
};

export type ReminderSetting = {
  id: string;
  channel: string;
  time: string;
  timezone: string;
  enabled: boolean;
};
