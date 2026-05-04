import { NextRequest, NextResponse } from "next/server";
import { prismaJournal } from "@/lib/db/journal";
import { getUserIdFromRequest } from "@/lib/auth";
import { decryptText, encryptText } from "@/lib/security/encryption";
import type { Prisma } from "@/generated/journal";

type RouteContext = {
  params: { id: string };
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const journalId = context.params.id;
  const existing = await prismaJournal.journalEntry.findUnique({
    where: { id: journalId }
  });
  if (!existing || existing.userId !== userId) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { title, content, status, relatedPrayerId, sourceLinks } =
    await request.json();

  if (status && !["ACTIVE", "HISTORY"].includes(status)) {
    return NextResponse.json({ error: "Invalid journal status." }, { status: 400 });
  }
  if (sourceLinks !== undefined && !Array.isArray(sourceLinks)) {
    return NextResponse.json({ error: "sourceLinks must be an array." }, { status: 400 });
  }

  const data: {
    title?: string;
    status?: "ACTIVE" | "HISTORY";
    relatedPrayerId?: string | null;
    sourceLinks?: Prisma.InputJsonValue;
    ciphertext?: string;
    iv?: string;
  } = {};

  if (title !== undefined) data.title = String(title);
  if (status !== undefined) data.status = status;
  if (relatedPrayerId !== undefined) {
    data.relatedPrayerId = relatedPrayerId ? String(relatedPrayerId) : null;
  }
  if (sourceLinks !== undefined) data.sourceLinks = sourceLinks as Prisma.InputJsonValue;
  if (content !== undefined) {
    const encrypted = encryptText(String(content));
    data.ciphertext = encrypted.ciphertext;
    data.iv = encrypted.iv;
  }

  const updated = await prismaJournal.journalEntry.update({
    where: { id: journalId },
    data
  });

  return NextResponse.json({
    entry: {
      id: updated.id,
      title: updated.title,
      content: decryptText(updated.ciphertext, updated.iv),
      status: updated.status,
      relatedPrayerId: updated.relatedPrayerId,
      sourceLinks: updated.sourceLinks,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt
    }
  });
}
