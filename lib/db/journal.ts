import { PrismaClient } from "@/generated/journal";
import { ensureEnv } from "@/lib/env";

ensureEnv();

const globalForJournal = globalThis as unknown as { prismaJournal?: PrismaClient };

export const prismaJournal =
  globalForJournal.prismaJournal ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForJournal.prismaJournal = prismaJournal;
}
