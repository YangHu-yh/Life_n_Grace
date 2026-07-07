"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useCompanionPanel } from "@/components/CompanionPanelProvider";

type ChatMessage = { role: "user" | "assistant"; content: string };

// Slide-out companion drawer, mounted once in the root layout. Reuses the
// modal precedent from the prayers page (fixed overlay, role="dialog", .card
// surface) anchored to the right edge, and the streaming-fetch-reader logic
// from the full-page /companion route — which remains the focused-session
// experience; this panel is additive.
export default function CompanionPanel() {
  const { isOpen, open, close, pageContext } = useCompanionPanel();
  const pathname = usePathname();
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => setIsAuthed(response.ok))
      .catch(() => setIsAuthed(false));
  }, [isOpen]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

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
        body: JSON.stringify({
          messages: nextMessages,
          ...(pageContext ? { prayerContext: pageContext } : {})
        })
      });

      if (response.status === 401) {
        setIsAuthed(false);
        return;
      }
      if (response.status === 429) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "I need a short rest — please try again in a moment."
          }
        ]);
        return;
      }
      if (!response.ok || !response.body) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "I could not respond just now. Please try again."
          }
        ]);
        return;
      }

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: accumulated };
          return next;
        });
      }
      accumulated += decoder.decode();
      if (accumulated) {
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: accumulated };
          return next;
        });
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I could not reach the server. Please try again."
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  // The full-page /companion route already is the companion — no trigger or
  // drawer there. Public pages don't get the floating button either.
  const showTrigger =
    !pathname.startsWith("/companion") &&
    (pathname.startsWith("/prayers") ||
      pathname.startsWith("/topics") ||
      pathname.startsWith("/profile"));

  return (
    <>
      {showTrigger && !isOpen && (
        <button
          className="button"
          type="button"
          style={{
            position: "fixed",
            right: 20,
            bottom: 20,
            zIndex: 900,
            boxShadow: "0 2px 12px rgba(35, 33, 27, 0.25)"
          }}
          onClick={open}
        >
          ✦ Companion
        </button>
      )}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Companion panel"
          className="card"
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            width: "min(420px, 100vw)",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            overflow: "auto",
            borderRadius: 0
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12
            }}
          >
            <strong>✦ Companion</strong>
            <button
              className="button button-outline"
              type="button"
              style={{ padding: "6px 12px" }}
              onClick={close}
            >
              Close
            </button>
          </div>
          {pageContext && (
            <p className="muted" style={{ margin: "8px 0 0" }}>
              Praying with you about: {pageContext.topic}
            </p>
          )}

          {isAuthed === false ? (
            <div className="card-soft" style={{ marginTop: 16 }}>
              <p className="muted">Sign in to talk with Companion.</p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Link className="button" href="/login" onClick={close}>
                  Sign in
                </Link>
                <Link
                  className="button button-outline"
                  href="/signup"
                  onClick={close}
                >
                  Create account
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div
                className="card-soft"
                style={{ marginTop: 16, flex: 1, minHeight: 160, overflow: "auto" }}
              >
                {messages.length === 0 && (
                  <p className="muted">
                    Ask for a verse, a short prayer, or help putting words to
                    what you are carrying.
                  </p>
                )}
                {messages.map((message, index) => (
                  <div key={index} style={{ marginBottom: 12 }}>
                    <strong>
                      {message.role === "user" ? "You" : "Companion"}
                    </strong>
                    <p style={{ whiteSpace: "pre-wrap" }}>{message.content}</p>
                  </div>
                ))}
              </div>
              <form
                className="grid"
                style={{ marginTop: 12 }}
                onSubmit={handleSubmit}
              >
                <textarea
                  aria-label="Message Companion"
                  rows={3}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  required
                />
                <button className="button" type="submit" disabled={isLoading}>
                  {isLoading ? "Listening..." : "Send"}
                </button>
              </form>
              <p className="muted" style={{ marginBottom: 0 }}>
                Prefer a full page?{" "}
                <Link href="/companion" onClick={close}>
                  Open Companion
                </Link>
              </p>
            </>
          )}
        </div>
      )}
    </>
  );
}
