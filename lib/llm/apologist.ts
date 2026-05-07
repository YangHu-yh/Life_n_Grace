import Anthropic from "@anthropic-ai/sdk";

export type ApologistMessage = {
  role: "user" | "assistant";
  content: string;
};

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

export async function generatePrayerChat(
  messages: ApologistMessage[],
  prayerContext?: { topic: string; notes?: string }
): Promise<string> {
  const translation = (process.env.APOLOGIST_TRANSLATION ?? "esv").toUpperCase();
  const model = process.env.APOLOGIST_MODEL_ID ?? "claude-haiku-4-5-20251001";

  const contextLine = prayerContext
    ? ` The user is praying about: "${prayerContext.topic}".${prayerContext.notes ? ` Notes: "${prayerContext.notes}".` : ""}`
    : "";

  const systemPrompt =
    `You are an encouraging prayer guide for beginner Christians.${contextLine} ` +
    `Respond with a short ${translation} Bible verse reference, a short sample prayer (2–4 sentences), ` +
    `and a gentle note to ask the Holy Spirit for personal guidance. Keep your response under 200 words.`;

  const response = await getClient().messages.create({
    model,
    max_tokens: 512,
    system: [
      {
        type: "text",
        text: systemPrompt,
        // Cache the system prompt — it's identical across most requests
        cache_control: { type: "ephemeral" },
      },
    ],
    messages,
  });

  const block = response.content[0];
  if (!block || block.type !== "text") {
    throw new Error("Unexpected response format from Claude");
  }
  return block.text;
}
