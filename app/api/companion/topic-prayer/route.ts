import { NextRequest, NextResponse } from "next/server";
import { generateTopicPrayer } from "@/lib/llm/apologist";
import { getUserIdFromRequest } from "@/lib/auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getTopicBySlug } from "@/lib/prayer-topics/topics";

// Shares the companion chat's per-user bucket so all Apologist call sites
// draw from one credit budget (same limits as app/api/companion/chat).
const CHAT_LIMIT = 20;
const CHAT_WINDOW_MS = 5 * 60 * 1000;

// Static fallback in the spirit of the Django prototype's graceful
// degradation — the button always yields a usable prayer.
function fallbackPrayer(topicTitle: string) {
  return (
    `Heavenly Father, we seek Your presence in this time. Grant us ` +
    `${topicTitle.toLowerCase()} and help us to trust in Your unfailing love. ` +
    `Guide our hearts and minds, and fill us with peace and courage today. ` +
    `In Jesus' name, amen.`
  );
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const rate = checkRateLimit(`companion:${userId}`, CHAT_LIMIT, CHAT_WINDOW_MS);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many companion requests. Please try again shortly." },
        {
          status: 429,
          headers: { "Retry-After": String(rate.retryAfterSeconds) }
        }
      );
    }

    const { slug, verseIndex } = await request.json();
    const topic = typeof slug === "string" ? getTopicBySlug(slug) : undefined;
    if (!topic) {
      return NextResponse.json({ error: "Topic not found." }, { status: 404 });
    }
    const index =
      Number.isInteger(verseIndex) && verseIndex >= 0
        ? verseIndex % topic.verses.length
        : 0;
    const verse = topic.verses[index];

    if (!process.env.APOLOGIST_API_KEY || !process.env.APOLOGIST_API_URL) {
      return NextResponse.json({
        prayer: fallbackPrayer(topic.title),
        notice: "AI is unavailable right now. Showing a default prayer."
      });
    }

    try {
      const prayer = await generateTopicPrayer(
        topic.title,
        `${verse.reference} — ${verse.text}`
      );
      return NextResponse.json({ prayer });
    } catch (error) {
      console.error("[POST /api/companion/topic-prayer] generation failed:", error);
      return NextResponse.json({
        prayer: fallbackPrayer(topic.title),
        notice: "Could not reach the AI just now. Showing a default prayer."
      });
    }
  } catch (error) {
    console.error("[POST /api/companion/topic-prayer]", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
