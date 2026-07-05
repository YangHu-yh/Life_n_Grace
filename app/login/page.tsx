"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

const URL_MESSAGES: Record<string, string> = {
  verified: "Email verified! You can now sign in.",
  invalid_token: "That verification link is invalid. Please sign up again or request a new link.",
  expired_token: "That verification link has expired. Please sign up again to receive a new one.",
  verify_failed: "We could not verify your email just now. Please try the link again."
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Read once on mount; avoids useSearchParams' Suspense requirement.
    const params = new URLSearchParams(window.location.search);
    if (params.get("verified") === "1") setMessage(URL_MESSAGES.verified);
    else if (params.get("error")) {
      setMessage(URL_MESSAGES[params.get("error") ?? ""] ?? null);
    }
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();
      if (response.ok) {
        setMessage("Signed in. Redirecting...");
        router.push("/prayers");
        router.refresh();
        return;
      }
      setMessage(data.error);
    } catch {
      setMessage("Could not reach the server. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="grid">
      <div className="card">
        <span className="pill">Welcome back</span>
        <h2>Sign in to Life-n-Grace</h2>
        <p className="muted">
          Keep your Prayers workspace, Companion chat, and journal history together across
          devices.
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
              required
            />
          </div>
          <button className="button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
          {message && <p>{message}</p>}
        </form>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/forgot-password">Forgot password?</Link>
          <Link href="/signup">Create an account</Link>
        </div>
      </div>
    </section>
  );
}
