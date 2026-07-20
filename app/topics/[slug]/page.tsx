"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getTopicBySlug } from "@/lib/prayer-topics/topics";
import { useCompanionPanel } from "@/components/CompanionPanelProvider";

type Verse = { reference: string; text: string; aiSuggested?: boolean };

export default function TopicDetailPage() {
  const params = useParams<{ slug: string }>();
  const topic = getTopicBySlug(params.slug);
  const { setPageContext } = useCompanionPanel();

  const [verseIndex, setVerseIndex] = useState(0);
  // AI-suggested verses beyond the static catalog, appended by
  // "Find more verses" (served from the shared library first, the LLM last).
  const [extraVerses, setExtraVerses] = useState<Verse[]>([]);
  const [prayer, setPrayer] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFetchingVerses, setIsFetchingVerses] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const allVerses: Verse[] = topic ? [...topic.verses, ...extraVerses] : [];
  const verse = allVerses.length
    ? allVerses[verseIndex % allVerses.length]
    : undefined;

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

  // One bounded JSON call to the purpose-built topic-prayer endpoint (the
  // server owns the prompt and resolves the verse — the client only names it).
  async function generatePrayer() {
    if (!topic || !verse) return;
    setIsGenerating(true);
    setNotice(null);
    setPrayer("");
    try {
      const response = await fetch("/api/companion/topic-prayer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: topic.slug,
          reference: verse.reference
        })
      });
      if (response.status === 429) {
        const data = await response.json().catch(() => ({}));
        setNotice(data.error ?? "Companion needs a short rest — please try again in a moment.");
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.prayer) {
        setNotice(data.error ?? "Could not reach Companion right now. Please try again.");
        return;
      }
      setPrayer(data.prayer);
      if (data.notice) setNotice(data.notice);
    } catch {
      setNotice("Could not reach the server. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function findMoreVerses() {
    if (!topic) return;
    setIsFetchingVerses(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/topics/${topic.slug}/more-verses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          known: allVerses.map((item) => item.reference)
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(data.error ?? "Could not fetch more verses right now.");
        return;
      }
      const incoming: Verse[] = Array.isArray(data.verses)
        ? data.verses.map((item: Verse) => ({ ...item, aiSuggested: true }))
        : [];
      if (incoming.length === 0) {
        setNotice(data.notice ?? "No new verses found this time — please try again.");
        return;
      }
      // Jump to the first newly added verse so the button visibly did something.
      const jumpTo = allVerses.length;
      setExtraVerses((prev) => [...prev, ...incoming]);
      setVerseIndex(jumpTo);
      setPrayer("");
    } catch {
      setNotice("Could not reach the server. Please try again.");
    } finally {
      setIsFetchingVerses(false);
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
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className="pill">
            {verse?.reference} · verse {(verseIndex % allVerses.length) + 1} of{" "}
            {allVerses.length}
          </span>
          {verse?.aiSuggested && (
            <span className="pill" title="Suggested by Companion — verify wording against your Bible">
              ✦ Companion-suggested
            </span>
          )}
        </div>
        <blockquote style={{ margin: "16px 0" }}>
          <p style={{ whiteSpace: "pre-wrap" }}>{verse?.text}</p>
        </blockquote>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            className="button"
            type="button"
            disabled={isGenerating || isFetchingVerses}
            onClick={() => {
              void generatePrayer();
            }}
          >
            {isGenerating ? "Praying..." : "Generate a short prayer"}
          </button>
          <button
            className="button button-outline"
            type="button"
            disabled={isGenerating || isFetchingVerses}
            onClick={() => {
              setVerseIndex((index) => index + 1);
              setPrayer("");
              setNotice(null);
            }}
          >
            See another verse
          </button>
          <button
            className="button button-outline"
            type="button"
            disabled={isGenerating || isFetchingVerses}
            onClick={() => {
              void findMoreVerses();
            }}
          >
            {isFetchingVerses ? "Searching..." : "Find more verses"}
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
