import { afterEach, beforeEach, describe, expect, it } from "vitest";
import crypto from "crypto";
import { validateEnv } from "./env";

const VALID = {
  MAIN_DATABASE_URL: "postgresql://u:p@localhost:5432/main",
  JOURNAL_DATABASE_URL: "postgresql://u:p@localhost:5432/journal",
  AUTH_JWT_SECRET: "a".repeat(48),
  JOURNAL_ENCRYPTION_KEY: crypto.randomBytes(32).toString("hex")
};

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of Object.keys(VALID)) {
    saved[key] = process.env[key];
    process.env[key] = VALID[key as keyof typeof VALID];
  }
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("validateEnv", () => {
  it("passes with a complete, valid environment", () => {
    expect(() => validateEnv()).not.toThrow();
  });

  it("rejects missing variables", () => {
    delete process.env.MAIN_DATABASE_URL;
    expect(() => validateEnv()).toThrow(/MAIN_DATABASE_URL/);
  });

  it("rejects known placeholder values", () => {
    process.env.AUTH_JWT_SECRET = "replace-with-strong-random-string";
    expect(() => validateEnv()).toThrow(/AUTH_JWT_SECRET/);
  });

  it("rejects a short JWT secret", () => {
    process.env.AUTH_JWT_SECRET = "too-short";
    expect(() => validateEnv()).toThrow(/32 characters/);
  });

  it("rejects an encryption key that is not 32 bytes of hex", () => {
    process.env.JOURNAL_ENCRYPTION_KEY = "abc123";
    expect(() => validateEnv()).toThrow(/64 hex characters/);
  });
});
