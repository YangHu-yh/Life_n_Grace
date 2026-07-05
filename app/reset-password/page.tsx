"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Read once on mount; avoids useSearchParams' Suspense requirement.
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token"));
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (newPassword !== confirmPassword) {
      setMessage("New password and confirmation do not match.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword })
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error ?? "Could not reset your password.");
        return;
      }
      router.push("/login?reset=1");
    } catch {
      setMessage("Could not reach the server. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (token === null) {
    return (
      <section className="grid">
        <div className="card">
          <span className="pill">Reset access</span>
          <h2>Choose a new password</h2>
          <p className="muted">
            This page needs a valid reset link. Request one from the{" "}
            <Link href="/forgot-password">forgot password</Link> page.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="grid">
      <div className="card">
        <span className="pill">Reset access</span>
        <h2>Choose a new password</h2>
        <form className="grid" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="newPassword">New password</label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={8}
              required
            />
          </div>
          <div>
            <label htmlFor="confirmPassword">Confirm new password</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              minLength={8}
              required
            />
          </div>
          <button className="button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Set new password"}
          </button>
          {message && <p className="muted">{message}</p>}
        </form>
        <Link href="/login">Back to sign in</Link>
      </div>
    </section>
  );
}
