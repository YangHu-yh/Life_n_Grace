const TIMEOUT_MS = 30_000;

export type ApologistMessage = {
  role: "user" | "assistant";
  content: string;
};

function getConfig() {
  const apiKey = process.env.APOLOGIST_API_KEY;
  const apiUrl = process.env.APOLOGIST_API_URL;

  if (!apiKey || !apiUrl) {
    throw new Error("APOLOGIST_API_KEY or APOLOGIST_API_URL is not configured");
  }

  const base = apiUrl.replace(/\/$/, "");
  return { apiKey, base };
}

function buildSystemPrompt(prayerContext?: { topic: string; notes?: string }): string {
  const translation = (process.env.APOLOGIST_TRANSLATION ?? "esv").toUpperCase();
  const contextLine = prayerContext
    ? ` The user is praying about: "${prayerContext.topic}".${prayerContext.notes ? ` Context: "${prayerContext.notes}".` : ""}`
    : "";
  // The context often already contains a specific Bible verse (topic pages,
  // companion panel) — instructing the model not to re-cite one prevents the
  // duplicated/mismatched verse citations the original prompt produced.
  const verseInstruction = prayerContext?.notes
    ? `The context above already includes a Bible verse — do NOT quote or cite another verse; build on the one given. `
    : `Include one short ${translation} Bible verse reference with its text. `;
  return (
    `You are a warm, encouraging prayer guide for beginner Christians.${contextLine} ` +
    verseInstruction +
    `Then offer a short sample prayer (2–4 sentences, ending "In Jesus' name, amen.") ` +
    `and one gentle sentence inviting the person to ask the Holy Spirit what to pray next. ` +
    `Speak directly and personally. Never begin with disclaimers, preambles like "Certainly", ` +
    `or any mention of being an AI. Keep the whole response under 150 words.`
  );
}

// Ported from the Django prototype's _sanitize_prayer_text/_extract_prayer_body
// (prayers/views.py, prayers/apologist_client.py on `main`): a defensive
// cleanup pass for model output that ignores formatting instructions.
export function sanitizePrayerText(text: string): string {
  if (!text) return text;
  let cleaned = text.trim();
  // Strip code-fence markers (keep the content inside) and horizontal rules
  cleaned = cleaned.replace(/^```\w*\s*$/gm, "");
  cleaned = cleaned.replace(/```/g, "");
  cleaned = cleaned.replace(/^\s*[-_]{3,}\s*$/gm, "");
  // Drop leading disclaimers and preambles
  cleaned = cleaned.replace(/^\s*As an AI[^\n]*\n?/i, "");
  cleaned = cleaned.replace(/^\s*As a language model[^\n]*\n?/i, "");
  cleaned = cleaned.replace(/^\s*(Certainly|Sure|Of course)[.,:!]?\s*/i, "");
  cleaned = cleaned.replace(/^\s*I (?:can|cannot|can't)[^\n]*\n?/i, "");
  cleaned = cleaned.replace(/^\s*Prayer Prompt:.*$\n?/im, "");
  // Remove inline verse-citation phrasing like "based on Proverbs 3:5-6"
  cleaned = cleaned.replace(
    /\b(based on|reflect(?:s|ing) the truth of)\s+[A-Za-z]+\s*\d+[:–-]\d+(?:[–-]\d+)?/gi,
    ""
  );
  // Strip surrounding quotes, collapse doubled spaces and blank lines
  cleaned = cleaned.replace(/^["“”‘’]+|["“”‘’]+$/g, "").trim();
  cleaned = cleaned.replace(/ {2,}/g, " ");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

// Extract just the prayer body when the model wraps it in prose — capture
// from a common opening ("Heavenly Father", "Lord", ...) to the closing Amen.
function extractPrayerBody(rawText: string): string {
  if (!rawText?.trim()) return rawText;
  const text = sanitizePrayerText(rawText);
  const startMatch = text.match(
    /^(Heavenly Father|Dear God|Lord|Gracious Father|Almighty God|Father God)[,\s]/im
  );
  const startIdx = startMatch?.index ?? 0;
  const endMatch =
    text.match(/^\s*In Jesus.? name[,\s]*amen\.?\s*$/im) ??
    text.match(/^\s*amen\.?\s*$/im) ??
    text.match(/amen\.?\s*$/i);
  const endIdx = endMatch ? (endMatch.index ?? 0) + endMatch[0].length : text.length;
  let body = text.slice(startIdx, endIdx).trim();
  // Trim anything trailing after the final Amen
  body = body.replace(/(amen\.?)([\s\S]*)$/i, "$1");
  return body.trim();
}

// Purpose-built one-shot generation for the topics page — mirrors the Django
// prototype's proven topic prompt (strict JSON schema, 50-70 words, no verse
// citations since the page already displays the verse). Non-streaming: one
// small bounded call, parsed and sanitized before it reaches the client.
export async function generateTopicPrayer(
  topic: string,
  verseText: string
): Promise<string> {
  const { apiKey, base } = getConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const prompt =
    `Return ONLY valid JSON (no markdown, no code fences, no preface). ` +
    `Schema example: {"prayer": "string 50-70 words; end with 'In Jesus' name, amen.'"}. ` +
    `Do not mention verse names or numbers. Do not include headings or disclaimers.\n` +
    `Topic: "${topic}". Incorporate the essence of this verse text: ${verseText.slice(0, 300)}.`;

  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      // No `model` field: see generatePrayerChat below.
      body: JSON.stringify({
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Apologist API returned status ${response.status}`);
    }

    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content;
    if (typeof raw !== "string" || !raw.trim()) {
      throw new Error("Apologist API response contained no content");
    }

    // Prefer the JSON contract; fall back to regex extraction when the model
    // wraps the JSON in prose or ignores the schema (same strategy as Django).
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (typeof parsed?.prayer === "string" && parsed.prayer.trim()) {
          return sanitizePrayerText(parsed.prayer);
        }
      }
    } catch {
      // fall through to extraction
    }
    const extracted = extractPrayerBody(raw);
    if (extracted) return extracted;
    throw new Error("Could not parse a prayer from the model response");
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Apologist API request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function generatePrayerChat(
  messages: ApologistMessage[],
  prayerContext?: { topic: string; notes?: string }
): Promise<string> {
  const { apiKey, base } = getConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      // No `model` field: this Agent's model is fixed server-side on the
      // Apologist dashboard, and an explicit model string is rejected.
      body: JSON.stringify({
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
  const { apiKey, base } = getConfig();

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
      // No `model` field: see generatePrayerChat above.
      body: JSON.stringify({
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
