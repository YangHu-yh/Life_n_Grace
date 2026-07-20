import { NextRequest, NextResponse } from "next/server";
import { prismaMain } from "@/lib/db/main";
import { getUserIdFromRequest } from "@/lib/auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { generateTopicVerses } from "@/lib/llm/apologist";
import { getTopicBySlug, normalizeReference } from "@/lib/prayer-topics/topics";
import {
  dailyAiLimit,
  getDailyAiUsage,
  recordAiGeneration,
  secondsUntilUtcMidnight
} from "@/lib/llm/quota";

// "Find more verses" for a topic. Library-first: verses another user already
// pulled from the LLM live in TopicVerse and are served at zero AI cost; the
// LLM is only asked when the caller has seen everything stored, and its
// suggestions are validated, deduped against every known reference, and
// stored for the next reader. AI calls share the companion rate limit and
// daily quota; library pulls consume neither.

const CHAT_LIMIT = 20;
const CHAT_WINDOW_MS = 5 * 60 * 1000;
const BATCH_SIZE = 5;
const MAX_KNOWN_REFS = 200;

type RouteContext = { params: Promise<{ slug: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { slug } = await context.params;
    const topic = getTopicBySlug(slug);
    if (!topic) {
      return NextResponse.json({ error: "Topic not found." }, { status: 404 });
    }

    // The client says which references it is already showing so we can serve
    // the ones it hasn't seen. Untrusted input: strings only, hard cap.
    const body = await request.json().catch(() => ({}));
    const knownRefs = new Set<string>(
      (Array.isArray(body?.known) ? body.known : [])
        .filter((item: unknown): item is string => typeof item === "string")
        .slice(0, MAX_KNOWN_REFS)
        .map((item: string) => normalizeReference(item))
    );
    for (const verse of topic.verses) knownRefs.add(normalizeReference(verse.reference));

    const stored = await prismaMain.topicVerse.findMany({
      where: { topicSlug: slug },
      orderBy: { createdAt: "asc" },
      take: 200
    });
    const unseenStored = stored.filter(
      (verse) => !knownRefs.has(normalizeReference(verse.reference))
    );
    if (unseenStored.length > 0) {
      return NextResponse.json({
        source: "library",
        verses: unseenStored
          .slice(0, BATCH_SIZE)
          .map((verse) => ({ reference: verse.reference, text: verse.text }))
      });
    }

    // Library exhausted — ask the LLM. From here on the request costs money,
    // so the burst limiter and daily quota both apply.
    if (!process.env.APOLOGIST_API_KEY || !process.env.APOLOGIST_API_URL) {
      return NextResponse.json(
        { error: "No further verses available right now. Please check back later." },
        { status: 503 }
      );
    }
    const rate = checkRateLimit(`companion:${userId}`, CHAT_LIMIT, CHAT_WINDOW_MS);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many companion requests. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
      );
    }
    const limit = dailyAiLimit();
    if ((await getDailyAiUsage(userId)) >= limit) {
      return NextResponse.json(
        {
          error: `You've reached today's limit of ${limit} companion prayers. Companion will be ready for you again tomorrow.`
        },
        {
          status: 429,
          headers: { "Retry-After": String(secondsUntilUtcMidnight()) }
        }
      );
    }

    const allKnownReferences = [
      ...topic.verses.map((verse) => verse.reference),
      ...stored.map((verse) => verse.reference)
    ];
    const suggested = await generateTopicVerses(
      topic.title,
      topic.description,
      allKnownReferences,
      BATCH_SIZE
    );
    await recordAiGeneration(userId, "more-verses");

    // The model doesn't always honor exclusions — dedupe again before
    // storing, and never trust it to avoid duplicates within its own list.
    const allKnownNormalized = new Set(allKnownReferences.map(normalizeReference));
    const fresh: typeof suggested = [];
    for (const verse of suggested) {
      const normalized = normalizeReference(verse.reference);
      if (allKnownNormalized.has(normalized)) continue;
      allKnownNormalized.add(normalized);
      fresh.push(verse);
    }
    if (fresh.length === 0) {
      return NextResponse.json({
        source: "ai",
        verses: [],
        notice: "Companion could not find new verses this time. Please try again."
      });
    }

    await prismaMain.topicVerse.createMany({
      data: fresh.map((verse) => ({
        topicSlug: slug,
        reference: verse.reference,
        text: verse.text
      })),
      skipDuplicates: true
    });

    return NextResponse.json({ source: "ai", verses: fresh });
  } catch (error) {
    console.error("[POST /api/topics/[slug]/more-verses]", error);
    return NextResponse.json(
      { error: "Could not fetch more verses right now. Please try again." },
      { status: 500 }
    );
  }
}
