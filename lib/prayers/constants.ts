export const VALID_LANES = ["ACTIVE", "ACCOMPLISHED", "REROUTED", "PRAISE"] as const;

export type PrayerLane = (typeof VALID_LANES)[number];

export function isPrayerLane(value: unknown): value is PrayerLane {
  return typeof value === "string" && VALID_LANES.includes(value as PrayerLane);
}

// The legacy PrayerStage enum is still persisted alongside lanes until it is
// retired via schema migration (plan item P1-7).
export const LANE_TO_LEGACY_STAGE: Record<PrayerLane, "SEED" | "BLOOM"> = {
  ACTIVE: "SEED",
  ACCOMPLISHED: "BLOOM",
  REROUTED: "SEED",
  PRAISE: "SEED"
};

export const LEGACY_STAGE_TO_LANE: Record<string, PrayerLane> = {
  SEED: "ACTIVE",
  SPROUT: "ACTIVE",
  BLOOM: "ACCOMPLISHED"
};
