import { NextRequest, NextResponse } from "next/server";
import { prismaMain } from "@/lib/db/main";
import { getUserIdFromRequest } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  const user = await prismaMain.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, displayName: true }
  });
  return NextResponse.json({ user });
}
