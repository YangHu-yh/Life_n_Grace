import { beforeAll, describe, expect, it } from "vitest";
import crypto from "crypto";

beforeAll(() => {
  process.env.JOURNAL_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
});

describe("encryption", () => {
  it("round-trips plaintext", async () => {
    const { encryptText, decryptText } = await import("./encryption");
    const { ciphertext, iv } = encryptText("Lord, give me peace today. 🙏");
    expect(decryptText(ciphertext, iv)).toBe("Lord, give me peace today. 🙏");
  });

  it("produces a different ciphertext per call (random IV)", async () => {
    const { encryptText } = await import("./encryption");
    const a = encryptText("same input");
    const b = encryptText("same input");
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
  });

  it("rejects tampered ciphertext (GCM auth tag)", async () => {
    const { encryptText, decryptText } = await import("./encryption");
    const { ciphertext, iv } = encryptText("original");
    const tampered = Buffer.from(ciphertext, "base64");
    tampered[0] ^= 0xff;
    expect(() => decryptText(tampered.toString("base64"), iv)).toThrow();
  });

  it("rejects a key that is not 32 bytes of hex", async () => {
    const { encryptText } = await import("./encryption");
    const original = process.env.JOURNAL_ENCRYPTION_KEY;
    process.env.JOURNAL_ENCRYPTION_KEY = "deadbeef";
    expect(() => encryptText("x")).toThrow(/32 bytes/);
    process.env.JOURNAL_ENCRYPTION_KEY = original;
  });
});
