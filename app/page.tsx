"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChatTeardropText, HandsPraying, LockKey } from "@phosphor-icons/react";

export default function HomePage() {
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        setIsAuthed(response.ok);
      } catch {
        setIsAuthed(false);
      }
    }
    checkAuth();
  }, []);

  return (
    <section className="grid">
      <div className="hero">
        <div className="hero-panel">
          <span className="pill">Prayer journal &amp; companion</span>
          <h1>Every prayer, one wall.</h1>
          <p className="muted" style={{ maxWidth: "46ch", fontSize: 17 }}>
            Track requests as they move toward answers, journal privately with
            encryption, and build a daily prayer habit.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {isAuthed ? (
              <>
                <Link className="button" href="/prayers">
                  Open Prayers
                </Link>
                <Link className="button button-outline" href="/companion">
                  Open Companion
                </Link>
              </>
            ) : (
              <>
                <Link className="button" href="/login">
                  Sign in
                </Link>
                <Link className="button button-outline" href="/signup">
                  Create account
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="grid grid-2">
          <div className="card feature-card">
            <span className="feature-icon">
              <HandsPraying size={26} weight="duotone" />
            </span>
            <h3>Prayer wall</h3>
            <p className="muted">
              Move each request through its journey: active, accomplished,
              re-routed, or praise.
            </p>
          </div>
          <div className="card feature-card">
            <span className="feature-icon">
              <ChatTeardropText size={26} weight="duotone" />
            </span>
            <h3>Companion chat</h3>
            <p className="muted">
              Share what is on your heart and receive Scripture with a short
              guided prayer.
            </p>
          </div>
          <div className="card feature-card">
            <span className="feature-icon">
              <LockKey size={26} weight="duotone" />
            </span>
            <h3>Private by design</h3>
            <p className="muted">
              Journal entries are encrypted before they ever reach the database,
              stored apart from your account.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
