import { PrismaClient } from "@/generated/main";
import { ensureEnv } from "@/lib/env";

ensureEnv();

const globalForMain = globalThis as unknown as { prismaMain?: PrismaClient };

export const prismaMain =
  globalForMain.prismaMain ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForMain.prismaMain = prismaMain;
}
