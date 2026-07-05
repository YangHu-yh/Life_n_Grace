"use client";

import { useEffect } from "react";

// Last-resort boundary: catches errors thrown in the root layout itself, so
// it must render its own <html>/<body> and cannot rely on globals.css.
export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error boundary]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "grid",
          placeItems: "center",
          minHeight: "100vh",
          margin: 0,
          padding: 24,
          background: "#f6f7fb",
          color: "#0b1f3a"
        }}
      >
        <div
          style={{
            maxWidth: 440,
            textAlign: "center",
            background: "#fff",
            padding: 32,
            borderRadius: 16,
            boxShadow: "0 10px 40px rgba(11, 31, 58, 0.12)"
          }}
        >
          <h2 style={{ marginTop: 0 }}>We hit an unexpected error</h2>
          <p style={{ color: "#5b6b82" }}>
            Please try again. If it keeps happening, refresh the page.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              border: "none",
              borderRadius: 999,
              padding: "12px 24px",
              background: "#0b1f3a",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
