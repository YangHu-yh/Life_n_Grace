import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { prismaMain } from "@/lib/db/main";

export async function GET(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const user = await prismaMain.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, displayName: true, createdAt: true }
  });

  return NextResponse.json({ user });
}

export async function PUT(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { displayName } = await request.json();
  const updated = await prismaMain.user.update({
    where: { id: userId },
    data: {
      displayName:
        displayName === null || displayName === undefined || displayName === ""
          ? null
          : String(displayName)
    },
    select: { id: true, email: true, displayName: true, createdAt: true }
  });

  return NextResponse.json({ user: updated });
}
