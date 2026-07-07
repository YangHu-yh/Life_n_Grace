import { NextRequest, NextResponse } from "next/server";
import { streamPrayerChat, ApologistMessage } from "@/lib/llm/apologist";
import { getUserIdFromRequest } from "@/lib/auth";
import { checkRateLimit } from "@/lib/security/rate-limit";

// Per-user cap on Apologist calls — the topics pages and the slide-out panel
// add several new call sites, and there was previously no limiting at all
// beyond auth. Full usage-tier gating (P3-3) stays out of scope.
const CHAT_LIMIT = 20;
const CHAT_WINDOW_MS = 5 * 60 * 1000;

function buildFallbackReply(topic: string) {
  return [
    "I am unable to reach the assistant right now, but here is a quick guided prayer you can use:",
    "",
    `Father, I bring this to You: ${topic || "the burden on my heart"}. Give me peace, wisdom, and trust in Your timing. In Jesus' name, amen.`,
    "",
    "Scripture: Philippians 4:6-7 (ESV)",
    "\"Do not be anxious about anything... and the peace of God... will guard your hearts and your minds in Christ Jesus.\"",
    "",
    "Ask the Holy Spirit what He is highlighting for you to pray right now."
  ].join("\n");
}

function textStream(text: string, headers?: Record<string, string>): Response {
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8", ...headers },
  });
}

export async function POST(request: NextRequest) {
  if (!process.env.APOLOGIST_API_KEY || !process.env.APOLOGIST_API_URL) {
    return NextResponse.json(
      { error: "The prayer companion is not yet available. Check back soon!" },
      { status: 503 }
    );
  }

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

    const { messages, prayerContext } = await request.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Messages are required." },
        { status: 400 }
      );
    }

    const safeMessages: ApologistMessage[] = messages.map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: String(message.content ?? "")
    }));

    const safePrayerContext =
      prayerContext &&
      typeof prayerContext.topic === "string" &&
      prayerContext.topic.trim()
        ? {
            topic: String(prayerContext.topic).slice(0, 500),
            notes: prayerContext.notes
              ? String(prayerContext.notes).slice(0, 2000)
              : undefined
          }
        : undefined;

    const lastUserTopic =
      safeMessages.slice().reverse().find((m) => m.role === "user")?.content ?? "";

    try {
      // Awaiting here means upstream connection failures reject before any
      // response bytes are sent — the catch below serves the fallback prayer.
      const apologistStream = await streamPrayerChat(safeMessages, safePrayerContext);
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          const reader = apologistStream.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(encoder.encode(value));
            }
          } finally {
            reader.releaseLock();
            controller.close();
          }
        },
      });
      return new Response(readable, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    } catch (error) {
      console.error("[POST /api/companion/chat] LLM stream failed:", error);
      return textStream(buildFallbackReply(lastUserTopic), { "X-Fallback": "true" });
    }
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
