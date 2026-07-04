const PLACEHOLDERS = new Set([
  "replace-with-strong-random-string",
  "32-byte-hex-key",
  "",
]);

function assertEnv(key: string): string {
  const val = process.env[key];
  if (!val || PLACEHOLDERS.has(val)) {
    throw new Error(
      `Environment variable ${key} is missing or still set to a placeholder value.`
    );
  }
  return val;
}

export function validateEnv() {
  assertEnv("MAIN_DATABASE_URL");
  assertEnv("JOURNAL_DATABASE_URL");

  const jwtSecret = assertEnv("AUTH_JWT_SECRET");
  if (jwtSecret.length < 32) {
    throw new Error("AUTH_JWT_SECRET must be at least 32 characters.");
  }

  const encKey = assertEnv("JOURNAL_ENCRYPTION_KEY");
  const encBuffer = Buffer.from(encKey, "hex");
  if (encBuffer.length !== 32) {
    throw new Error(
      "JOURNAL_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)."
    );
  }
}

let validated = false;
export function ensureEnv() {
  if (!validated) {
    validateEnv();
    validated = true;
  }
}
