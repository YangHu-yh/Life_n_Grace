"use client";

import { useState } from "react";
import Link from "next/link";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json();
    setMessage(response.ok ? "Account created. You can sign in." : data.error);
  }

  return (
    <section className="grid">
      <div className="card">
        <span className="pill">Get started</span>
        <h2>Create your Life-n-Grace account</h2>
        <p className="muted">
          Save prayer journeys, Companion insights, and your private journal in
          one unified space.
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
          <div>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              required
            />
          </div>
          <button className="button" type="submit">
            Create account
          </button>
          {message && <p>{message}</p>}
        </form>
        <p>
          Already have an account? <Link href="/login">Sign in</Link>.
        </p>
      </div>
    </section>
  );
}
