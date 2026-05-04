import crypto from "crypto";

const ALGO = "aes-256-gcm";

function getKey() {
  const key = process.env.JOURNAL_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("JOURNAL_ENCRYPTION_KEY is not set");
  }
  const buffer = Buffer.from(key, "hex");
  if (buffer.length !== 32) {
    throw new Error("JOURNAL_ENCRYPTION_KEY must be 32 bytes hex");
  }
  return buffer;
}

export function encryptText(plainText: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([encrypted, authTag]).toString("base64");
  return { ciphertext: payload, iv: iv.toString("base64") };
}

export function decryptText(ciphertext: string, iv: string) {
  const ivBuffer = Buffer.from(iv, "base64");
  const data = Buffer.from(ciphertext, "base64");
  const authTag = data.subarray(data.length - 16);
  const encrypted = data.subarray(0, data.length - 16);
  const decipher = crypto.createDecipheriv(ALGO, getKey(), ivBuffer);
  decipher.setAuthTag(authTag);
  const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return plain.toString("utf8");
}
