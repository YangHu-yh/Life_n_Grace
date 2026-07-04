const TIMEOUT_MS = 30_000;

export type ApologistMessage = {
  role: "user" | "assistant";
  content: string;
};

function getConfig() {
  const apiKey = process.env.APOLOGIST_API_KEY;
  const apiUrl = process.env.APOLOGIST_API_URL;
  const modelId = process.env.APOLOGIST_MODEL_ID ?? "gpt-4o";

  if (!apiKey || !apiUrl) {
    throw new Error("APOLOGIST_API_KEY or APOLOGIST_API_URL is not configured");
  }

  const base = apiUrl.replace(/\/$/, "");
  return { apiKey, base, modelId };
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

export async function generatePrayerChat(
  messages: ApologistMessage[],
  prayerContext?: { topic: string; notes?: string }
): Promise<string> {
  const { apiKey, base, modelId } = getConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: "system", content: buildSystemPrompt(prayerContext) },
          ...messages,
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Apologist API returned status ${response.status}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("Apologist API response contained no content");
    }
    return content;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Apologist API request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// The upstream fetch is awaited BEFORE the stream is constructed so that
// connection failures and non-2xx responses reject this promise — callers
// can catch and serve a fallback instead of returning a broken stream.
export async function streamPrayerChat(
  messages: ApologistMessage[],
  prayerContext?: { topic: string; notes?: string }
): Promise<ReadableStream<string>> {
  const { apiKey, base, modelId } = getConfig();

  const controller = new AbortController();
  const connectTimeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        stream: true,
        messages: [
          { role: "system", content: buildSystemPrompt(prayerContext) },
          ...messages,
        ],
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Apologist API request timed out");
    }
    throw error;
  } finally {
    clearTimeout(connectTimeout);
  }

  if (!response.ok || !response.body) {
    throw new Error(`Apologist API returned status ${response.status}`);
  }

  const body = response.body;

  return new ReadableStream({
    async start(controller) {
      const reader = body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") {
              controller.close();
              return;
            }
            try {
              const parsed = JSON.parse(data);
              const text = parsed?.choices?.[0]?.delta?.content;
              if (typeof text === "string" && text) {
                controller.enqueue(text);
              }
            } catch {
              // skip malformed SSE lines
            }
          }
        }
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });
}
