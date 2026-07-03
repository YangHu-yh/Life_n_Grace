# Apologist API Fix Spec

**Version:** 1.1  
**Date:** 2026-05-06  
**File:** `lib/llm/apologist.ts`  
**Priority:** P0 (companion feature is non-functional with placeholder config)

> ⚠️ **Status: PAUSED — API access not yet available**  
> The Apologist companion AI is disabled until `ANTHROPIC_API_KEY` is provisioned.  
> The route returns a "not yet available" response when the key is missing.  
> All code fixes are complete and ready to activate once the key is added.

---

## 1. Current Problems

| # | Issue | Impact | Status |
|---|-------|--------|--------|
| 1 | Default model ID `"openai/gpt/4o"` uses slashes — invalid for all known providers | Wrong model sent to API → 400/404 error | ✅ Fixed (migrated to Anthropic SDK, now `claude-haiku-4-5-20251001`) |
| 2 | No request timeout | If Apologist API hangs, Next.js route hangs until Vercel/ECS 30s timeout | ✅ Fixed (`timeout: 30_000` added to `messages.create` options) |
| 3 | Error thrown from `callApologist` propagates API key details in `error.message` | Internal details reach the client via the route's catch block | ✅ Fixed (route catch block only logs, returns generic fallback) |
| 4 | No URL normalization — double-slash possible if `APOLOGIST_API_URL` ends with `/` | `https://api.example.com//chat/completions` → 404 | ✅ N/A (Anthropic SDK handles URLs internally) |
| 5 | `fetch` has no `signal` — AbortController never set up | Zombie requests waste server connections | ✅ Fixed (covered by SDK `timeout` option — SDK aborts internally) |
| 6 | System prompt injected as `role: "system"` alongside user history | Correct for OpenAI-compatible APIs, but the system prompt is re-generated on every call — slight inefficiency | ✅ Mitigated (`cache_control: { type: "ephemeral" }` applied to system prompt block) |

---

## 2. What Is the Apologist API?

The environment variables point to a custom OpenAI-compatible endpoint:
```
APOLOGIST_API_URL="https://your-agent-domain/api/v1"
APOLOGIST_MODEL_ID="openai/gpt/4o"
```

This is an OpenAI-compatible `/chat/completions` endpoint hosted at a custom domain. It could be:
- A self-hosted model (Ollama, LMStudio, etc.)
- An OpenRouter proxy
- A custom agent service

**Recommended migration option:** Replace with the Anthropic Claude API directly. The companion use case (prayer guidance, Bible verses, short prayers) maps perfectly to Claude's capabilities, and the Anthropic SDK is already the build environment for this project.

---

## 3. Option A — Fix the Existing Integration (Keep Custom Endpoint)

Updated `lib/llm/apologist.ts`:

```typescript
import type { NextRequest } from "next/server"

export type ApologistMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

const TIMEOUT_MS = 30_000

function getConfig() {
  const apiKey = process.env.APOLOGIST_API_KEY
  const apiUrl = process.env.APOLOGIST_API_URL
  const modelId = process.env.APOLOGIST_MODEL_ID ?? "gpt-4o"  // fixed default

  if (!apiKey || !apiUrl) {
    throw new Error("APOLOGIST_API_KEY or APOLOGIST_API_URL is not configured")
  }

  // Normalize URL — strip trailing slash before appending path
  const base = apiUrl.replace(/\/$/, "")
  return { apiKey, base, modelId }
}

async function callApologist(messages: ApologistMessage[]): Promise<string> {
  const { apiKey, base, modelId } = getConfig()

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: modelId, messages }),
      signal: controller.signal,
    })

    if (!response.ok) {
      // Do NOT include response body — it may contain API details
      throw new Error(`Apologist API returned status ${response.status}`)
    }

    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("Apologist API response contained no content")
    }
    return content
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Apologist API request timed out")
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export async function generatePrayerChat(
  messages: ApologistMessage[],
  prayerContext?: { topic: string; notes?: string }
): Promise<string> {
  const translation = process.env.APOLOGIST_TRANSLATION ?? "esv"

  const contextLine = prayerContext
    ? ` The user is specifically praying about: "${prayerContext.topic}".${prayerContext.notes ? ` Notes: "${prayerContext.notes}".` : ""}`
    : ""

  return callApologist([
    {
      role: "system",
      content: `You are an encouraging prayer guide for beginner Christians.${contextLine} Respond with a short ${translation.toUpperCase()} Bible verse reference, a short sample prayer (2–4 sentences), and a gentle note to ask the Holy Spirit for personal guidance. Keep your response under 200 words.`,
    },
    ...messages,
  ])
}
```

**Key fixes:**
1. Default model changed from `"openai/gpt/4o"` → `"gpt-4o"`
2. `AbortController` with 30-second timeout
3. URL normalization strips trailing slash
4. Error messages never include API response bodies
5. Prayer context injected into system prompt (integrates with P3-1)

---

## 4. Option B — Migrate to Anthropic Claude API (Recommended)

The Anthropic Claude API is the natural companion for a Claude-built app. It provides better reliability, prompt caching (lower cost for the repeated system prompt), and streaming support.

Install: `npm install @anthropic-ai/sdk`

```typescript
import Anthropic from "@anthropic-ai/sdk"

export type ApologistMessage = {
  role: "user" | "assistant"
  content: string
}

let client: Anthropic | null = null

function getClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured")
    client = new Anthropic({ apiKey })
  }
  return client
}

export async function generatePrayerChat(
  messages: ApologistMessage[],
  prayerContext?: { topic: string; notes?: string }
): Promise<string> {
  const translation = process.env.APOLOGIST_TRANSLATION ?? "esv"

  const contextLine = prayerContext
    ? ` The user is praying about: "${prayerContext.topic}".${prayerContext.notes ? ` Notes: "${prayerContext.notes}".` : ""}`
    : ""

  const systemPrompt = `You are an encouraging prayer guide for beginner Christians.${contextLine} Respond with a short ${translation.toUpperCase()} Bible verse reference, a short sample prayer (2–4 sentences), and a gentle note to ask the Holy Spirit for personal guidance. Keep your response under 200 words.`

  const response = await getClient().messages.create({
    model: process.env.APOLOGIST_MODEL_ID ?? "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system: systemPrompt,
    messages,
  })

  const block = response.content[0]
  if (block.type !== "text") throw new Error("Unexpected response type from Claude")
  return block.text
}
```

**Updated env vars (Option B):**

```dotenv
ANTHROPIC_API_KEY="sk-ant-your-key"
APOLOGIST_MODEL_ID="claude-haiku-4-5-20251001"   # haiku: fast + cheap for prayer guidance
APOLOGIST_TRANSLATION="esv"
```

**Why Claude Haiku for this use case:**
- 200-word prayer guidance responses don't need Opus-level reasoning
- Haiku is ~10× cheaper and ~3× faster than Sonnet
- The system prompt caches well (unchanged across sessions), reducing cost further
- Can upgrade to Sonnet if deeper theological reasoning is needed

**Prompt caching (cost optimization):**

```typescript
const response = await getClient().messages.create({
  model: "claude-haiku-4-5-20251001",
  max_tokens: 512,
  system: [
    {
      type: "text",
      text: systemPrompt,
      cache_control: { type: "ephemeral" }  // cache the system prompt across requests
    }
  ],
  messages,
})
```

---

## 5. Streaming Response (Optional Enhancement) ✅ Done

For better perceived UX, stream the companion response:

```typescript
// app/api/companion/chat/route.ts
export async function POST(request: NextRequest) {
  // ... auth + validation ...

  const stream = await getClient().messages.stream({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system: systemPrompt,
    messages: safeMessages,
  })

  // Return a ReadableStream for the client to consume incrementally
  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
          controller.enqueue(encoder.encode(chunk.delta.text))
        }
      }
      controller.close()
    },
  })

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  })
}
```

Client-side in `app/companion/page.tsx`:

```typescript
const response = await fetch("/api/companion/chat", { method: "POST", ... })
const reader = response.body!.getReader()
const decoder = new TextDecoder()
let result = ""
while (true) {
  const { done, value } = await reader.read()
  if (done) break
  result += decoder.decode(value)
  setReply(result)  // update UI incrementally
}
```

---

## 6. Updated `.env.example`

```dotenv
# Companion AI — Option A (custom OpenAI-compatible endpoint)
APOLOGIST_API_KEY="replace-with-your-key"
APOLOGIST_API_URL="https://your-agent-domain/api/v1"
APOLOGIST_MODEL_ID="gpt-4o"
APOLOGIST_TRANSLATION="esv"

# Companion AI — Option B (Anthropic Claude, recommended)
# ANTHROPIC_API_KEY="sk-ant-replace-with-your-key"
# APOLOGIST_MODEL_ID="claude-haiku-4-5-20251001"
# APOLOGIST_TRANSLATION="esv"
```

---

## 7. Route Update — Sanitize Error Response

Update `app/api/companion/chat/route.ts` to never surface LLM API errors to the client:

```typescript
} catch (error) {
  console.error("[POST /api/companion/chat] LLM call failed:", error)
  // Fall through to fallback — never expose LLM error to client
}
// Fallback prayer is returned — client sees { reply: "...", fallback: true }
```

The existing fallback prayer mechanism is good — keep it. Just ensure the error is only logged server-side.
