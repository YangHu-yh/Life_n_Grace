import { describe, expect, it } from "vitest";
import { LIMITS, lengthError } from "./validation";

describe("lengthError", () => {
  it("returns null for values within the limit", () => {
    expect(lengthError("Topic", "a".repeat(LIMITS.prayerTopic), LIMITS.prayerTopic)).toBeNull();
    expect(lengthError("Topic", "short", LIMITS.prayerTopic)).toBeNull();
  });

  it("returns a message for values over the limit", () => {
    const error = lengthError("Topic", "a".repeat(LIMITS.prayerTopic + 1), LIMITS.prayerTopic);
    expect(error).toContain("Topic");
    expect(error).toContain(String(LIMITS.prayerTopic));
  });

  it("ignores non-string values (validated elsewhere)", () => {
    expect(lengthError("Notes", undefined, 10)).toBeNull();
    expect(lengthError("Notes", null, 10)).toBeNull();
    expect(lengthError("Notes", 12345678901234, 10)).toBeNull();
  });
});
