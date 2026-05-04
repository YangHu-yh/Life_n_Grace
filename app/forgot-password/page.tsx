"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const data = await response.json();
    setMessage(response.ok ? data.message : data.error);
  }

  return (
    <section className="grid">
      <div className="card">
        <span className="pill">Reset access</span>
        <h2>Forgot your password?</h2>
        <p className="muted">
          We will send a reset link once email delivery is configured.
        </p>
        <form className="grid" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <button className="button" type="submit">
            Send reset link
          </button>
          {message && <p>{message}</p>}
        </form>
        <Link href="/login">Back to sign in</Link>
      </div>
    </section>
  );
}
