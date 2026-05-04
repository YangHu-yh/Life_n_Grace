import { PrismaClient } from "@/generated/main";

const globalForMain = globalThis as unknown as { prismaMain?: PrismaClient };

export const prismaMain =
  globalForMain.prismaMain ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForMain.prismaMain = prismaMain;
}
