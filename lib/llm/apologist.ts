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

function buildSystemPrompt(prayerContext?: { topic: string; notes?: string }): string {
  const translation = (process.env.APOLOGIST_TRANSLATION ?? "esv").toUpperCase();
  const contextLine = prayerContext
    ? ` The user is praying about: "${prayerContext.topic}".${prayerContext.notes ? ` Notes: "${prayerContext.notes}".` : ""}`
    : "";
  return (
    `You are an encouraging prayer guide for beginner Christians.${contextLine} ` +
    `Respond with a short ${translation} Bible verse reference, a short sample prayer (2–4 sentences), ` +
    `and a gentle note to ask the Holy Spirit for personal guidance. Keep your response under 200 words.`
  );
}

function getModel(): string {
  return process.env.APOLOGIST_MODEL_ID ?? "claude-haiku-4-5-20251001";
}

export async function generatePrayerChat(
  messages: ApologistMessage[],
  prayerContext?: { topic: string; notes?: string }
): Promise<string> {
  const response = await getClient().messages.create(
    {
      model: getModel(),
      max_tokens: 512,
      system: [
        {
          type: "text",
          text: buildSystemPrompt(prayerContext),
          cache_control: { type: "ephemeral" },
        },
      ],
      messages,
    },
    { timeout: 30_000 }
  );

  const block = response.content[0];
  if (!block || block.type !== "text") {
    throw new Error("Unexpected response format from Claude");
  }
  return block.text;
}

export function streamPrayerChat(
  messages: ApologistMessage[],
  prayerContext?: { topic: string; notes?: string }
) {
  return getClient().messages.stream({
    model: getModel(),
    max_tokens: 512,
    system: [
      {
        type: "text",
        text: buildSystemPrompt(prayerContext),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages,
  });
}
