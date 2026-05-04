"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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
          <span className="pill">Expressive Minimalist Prayer Space</span>
          <h1>Life-n-Grace</h1>
          <p className="muted">
            A peaceful place for beginner and everyday believers to record
            prayers, build habits, and stay grounded in Scripture with AI prayer
            guidance.
          </p>
          {!isAuthed && (
            <p className="muted">
              Sign in to unlock your personal Prayers workspace, Companion chat,
              and private journal history.
            </p>
          )}
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
          <div className="card">
            <h3>Prayer Stickers</h3>
            <p className="muted">
              Record prayers and watch them move from seed to bloom across your
              wall of stickers.
            </p>
          </div>
          <div className="card">
            <h3>Companion Chat</h3>
            <p className="muted">
              Ask Companion for prayer support and receive Bible verses plus a short
              guided prayer.
            </p>
          </div>
          <div className="card">
            <h3>Secure by Design</h3>
            <p className="muted">
              Journal content is encrypted and stored in a separate database.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
