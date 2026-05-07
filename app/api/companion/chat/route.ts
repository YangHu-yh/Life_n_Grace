import { NextRequest, NextResponse } from "next/server";
import { generatePrayerChat, ApologistMessage } from "@/lib/llm/apologist";
import { getUserIdFromRequest } from "@/lib/auth";

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

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
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

    try {
      const reply = await generatePrayerChat(safeMessages, safePrayerContext);
      return NextResponse.json({ reply, fallback: false });
    } catch {
      console.error("[POST /api/companion/chat] LLM call failed");
      const lastUserMessage =
        safeMessages
          .slice()
          .reverse()
          .find((message) => message.role === "user")?.content ?? "";
      return NextResponse.json({
        reply: buildFallbackReply(lastUserMessage),
        fallback: true
      });
    }
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
