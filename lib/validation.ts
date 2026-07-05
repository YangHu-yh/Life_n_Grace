// Shared input length limits enforced server-side across write routes.
export const LIMITS = {
  prayerTopic: 500,
  prayerNotes: 2000,
  journalTitle: 200,
  journalContent: 50_000
} as const;

// Returns an error message if `value` is a string longer than `max`, else null.
export function lengthError(
  label: string,
  value: unknown,
  max: number
): string | null {
  if (typeof value === "string" && value.length > max) {
    return `${label} must be ${max} characters or fewer.`;
  }
  return null;
}
