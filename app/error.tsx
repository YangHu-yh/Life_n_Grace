"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaced in CloudWatch via the standalone server's stdout.
    console.error("[app error boundary]", error);
  }, [error]);

  return (
    <section className="grid">
      <div className="card">
        <span className="pill">Something went wrong</span>
        <h2>We hit an unexpected error</h2>
        <p className="muted">
          Your prayers and journal are safe. Try again, or head back to your
          workspace.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button className="button" type="button" onClick={() => reset()}>
            Try again
          </button>
          <Link className="button button-outline" href="/prayers">
            Back to Prayers
          </Link>
        </div>
      </div>
    </section>
  );
}
