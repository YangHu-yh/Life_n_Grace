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

    const { messages } = await request.json();
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

    try {
      const reply = await generatePrayerChat(safeMessages);
      return NextResponse.json({ reply, fallback: false });
    } catch {
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
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Prayer failed." },
      { status: 500 }
    );
  }
}
