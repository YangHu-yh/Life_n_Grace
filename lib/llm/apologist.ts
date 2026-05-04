export type ApologistMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

async function callApologist(messages: ApologistMessage[]) {
  const apiKey = process.env.APOLOGIST_API_KEY;
  const apiUrl = process.env.APOLOGIST_API_URL;
  const modelId = process.env.APOLOGIST_MODEL_ID ?? "openai/gpt/4o";

  if (!apiKey || !apiUrl) {
    throw new Error("APOLOGIST_API_KEY or APOLOGIST_API_URL is not set");
  }

  const response = await fetch(`${apiUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: modelId,
      messages
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Apologist API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Apologist API response missing content");
  }
  return content as string;
}

export async function generatePrayerChat(messages: ApologistMessage[]) {
  const translation = process.env.APOLOGIST_TRANSLATION ?? "esv";
  return callApologist([
    {
      role: "system",
      content:
        `You are an encouraging prayer guide for beginner Christians. Respond with a short ${translation} Bible verse reference, a short sample prayer, and a gentle note to ask the Holy Spirit for guidance.`
    },
    ...messages
  ]);
}
