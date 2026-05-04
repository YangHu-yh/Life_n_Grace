import { NextRequest, NextResponse } from "next/server";
import { prismaMain } from "@/lib/db/main";
import { getUserIdFromRequest } from "@/lib/auth";

function startOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function GET(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const today = startOfTodayUtc();
  const past = new Date(today);
  past.setUTCDate(past.getUTCDate() - 6);

  const checkins = await prismaMain.habitCheckin.findMany({
    where: {
      userId,
      date: { gte: past, lte: today }
    },
    orderBy: { date: "asc" }
  });

  return NextResponse.json({ checkins });
}

export async function POST(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const today = startOfTodayUtc();
  const existing = await prismaMain.habitCheckin.findUnique({
    where: { userId_date: { userId, date: today } }
  });
  const completed = !existing?.completed;
  const checkin = await prismaMain.habitCheckin.upsert({
    where: { userId_date: { userId, date: today } },
    create: { userId, date: today, completed },
    update: { completed }
  });
  return NextResponse.json({ checkin });
}
