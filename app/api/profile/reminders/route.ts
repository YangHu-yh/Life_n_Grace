import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { prismaMain } from "@/lib/db/main";

export async function GET(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const reminders = await prismaMain.reminderSetting.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json({ reminders });
}

export async function PUT(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id, channel, time, timezone, enabled } = await request.json();
  if (!channel || !time || !timezone) {
    return NextResponse.json(
      { error: "Channel, time, and timezone are required." },
      { status: 400 }
    );
  }

  if (id) {
    const updated = await prismaMain.reminderSetting.updateMany({
      where: { id: String(id), userId },
      data: {
        channel: String(channel),
        time: String(time),
        timezone: String(timezone),
        enabled: enabled !== false
      }
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "Reminder not found." }, { status: 404 });
    }
  } else {
    await prismaMain.reminderSetting.create({
      data: {
        userId,
        channel: String(channel),
        time: String(time),
        timezone: String(timezone),
        enabled: enabled !== false
      }
    });
  }

  const reminders = await prismaMain.reminderSetting.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" }
  });
  return NextResponse.json({ reminders });
}
