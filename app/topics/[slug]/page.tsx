"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getTopicBySlug } from "@/lib/prayer-topics/topics";
import { useCompanionPanel } from "@/components/CompanionPanelProvider";

export default function TopicDetailPage() {
  const params = useParams<{ slug: string }>();
  const topic = getTopicBySlug(params.slug);
  const { setPageContext } = useCompanionPanel();

  const [verseIndex, setVerseIndex] = useState(0);
  const [prayer, setPrayer] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const verse = topic?.verses[verseIndex % (topic?.verses.length || 1)];

  // Keep the slide-out companion panel aware of what the user is reading.
  useEffect(() => {
    if (topic && verse) {
      setPageContext({
        topic: topic.title,
        notes: `${verse.reference} — ${verse.text}`
      });
    }
  }, [topic, verse, setPageContext]);

  if (!topic) {
    return (
      <section className="grid">
        <div className="card">
          <h2>Topic not found</h2>
          <p className="muted">That prayer topic does not exist.</p>
          <Link className="button" href="/topics">
            Back to topics
          </Link>
        </div>
      </section>
    );
  }

  // Both buttons reuse the existing companion chat plumbing end-to-end —
  // a synthetic single-turn message with the verse as prayerContext.
  async function generatePrayer() {
    if (!verse) return;
    setIsGenerating(true);
    setNotice(null);
    setPrayer("");
    try {
      const response = await fetch("/api/companion/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: `Write a short prayer (under 100 words) on the theme of "${topic!.title}", drawing on this verse: ${verse.reference} — "${verse.text}". Respond with only the prayer itself.`
            }
          ],
          prayerContext: {
            topic: topic!.title,
            notes: `${verse.reference} — ${verse.text}`
          }
        })
      });
      if (response.status === 429) {
        setNotice("Companion needs a short rest — please try again in a moment.");
        return;
      }
      if (!response.ok || !response.body) {
        setNotice("Could not reach Companion right now. Please try again.");
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setPrayer(accumulated);
      }
      accumulated += decoder.decode();
      if (accumulated) setPrayer(accumulated);
    } catch {
      setNotice("Could not reach the server. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <section className="grid">
      <div className="hero-panel">
        <Link href="/topics" className="muted">
          ← All topics
        </Link>
        <h1>{topic.title}</h1>
        <p className="muted">{topic.description}</p>
      </div>

      <div className="card">
        <span className="pill">
          {verse?.reference} · verse {(verseIndex % topic.verses.length) + 1} of{" "}
          {topic.verses.length}
        </span>
        <blockquote style={{ margin: "16px 0" }}>
          <p style={{ whiteSpace: "pre-wrap" }}>{verse?.text}</p>
        </blockquote>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            className="button"
            type="button"
            disabled={isGenerating}
            onClick={() => {
              void generatePrayer();
            }}
          >
            {isGenerating ? "Praying..." : "Generate a short prayer"}
          </button>
          <button
            className="button button-outline"
            type="button"
            disabled={isGenerating}
            onClick={() => {
              setVerseIndex((index) => index + 1);
              setPrayer("");
              setNotice(null);
            }}
          >
            See another verse
          </button>
        </div>
        {notice && <p className="muted">{notice}</p>}
        {prayer && (
          <div className="card-soft" style={{ marginTop: 16 }}>
            <strong>A prayer for {topic.title.toLowerCase()}</strong>
            <p style={{ whiteSpace: "pre-wrap" }}>{prayer}</p>
          </div>
        )}
      </div>
    </section>
  );
}
