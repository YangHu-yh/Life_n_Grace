"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ChatMessage = { role: "user" | "assistant"; content: string };

function buildLocalFallbackReply(topic: string) {
  return [
    "I could not reach your companion just now. Here is a quick prayer you can use:",
    "",
    `Lord Jesus, I bring ${topic || "this request"} to You. Please give me peace, guidance, and strength today. Amen.`,
    "",
    "Scripture: Psalm 55:22 (ESV)",
    "\"Cast your burden on the LORD, and he will sustain you.\"",
    "",
    "Ask the Holy Spirit what He is highlighting for you to pray next."
  ].join("\n");
}

export default function CompanionPage() {
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  async function checkAuth() {
    const response = await fetch("/api/auth/me");
    setIsAuthed(response.ok);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAuthed) return;
    const trimmedInput = input.trim();
    if (!trimmedInput) return;

    setIsLoading(true);
    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: trimmedInput }
    ];
    setMessages(nextMessages);
    setInput("");

    try {
      const response = await fetch("/api/companion/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages })
      });
      if (response.status === 401) {
        setIsLoading(false);
        setIsAuthed(false);
        return;
      }

      const data = await response.json();
      const assistantMessage =
        response.ok && data.reply
          ? String(data.reply)
          : buildLocalFallbackReply(trimmedInput);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: assistantMessage
        }
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: buildLocalFallbackReply(trimmedInput)
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    checkAuth();
  }, []);

  if (isAuthed === null) {
    return (
      <section className="grid">
        <div className="card">
          <h2>Loading companion chat...</h2>
        </div>
      </section>
    );
  }

  if (!isAuthed) {
    return (
      <section className="grid">
        <div className="card">
          <h2>Please sign in</h2>
          <p className="muted">
            Create an account or sign in to use Companion chat.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link className="button" href="/login">
              Sign in
            </Link>
            <Link className="button button-outline" href="/signup">
              Create account
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="grid">
      <div className="card">
        <span className="pill">Companion</span>
        <h2>Seek prayer help and Scripture</h2>
        <p className="muted">
          Share your topic or request. Companion responds with Bible verses, a
          short guided prayer, and a gentle Holy Spirit prompt.
        </p>
        <div className="grid">
          <div className="card-soft" style={{ minHeight: 220 }}>
            {messages.length === 0 && (
              <p className="muted">
                Start with: &quot;I feel anxious about my family and work.&quot;
              </p>
            )}
            {messages.map((message, index) => (
              <div key={index} style={{ marginBottom: 12 }}>
                <strong>{message.role === "user" ? "You" : "Companion"}</strong>
                <p style={{ whiteSpace: "pre-wrap" }}>{message.content}</p>
              </div>
            ))}
          </div>
          <form className="grid" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="prompt">Prayer topic or request</label>
              <textarea
                id="prompt"
                rows={4}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                required
              />
            </div>
            <button className="button" type="submit" disabled={isLoading}>
              {isLoading ? "Listening..." : "Send"}
            </button>
          </form>
          <div className="card-soft">
            <strong>Gentle reminder</strong>
            <p className="muted">
              Ask the Holy Spirit what He is highlighting for you to pray today.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
