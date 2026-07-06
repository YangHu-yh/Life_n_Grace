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
          background: "#edeae1",
          color: "#23211b"
        }}
      >
        <div
          style={{
            maxWidth: 440,
            textAlign: "center",
            background: "#f6f4ec",
            padding: 32,
            borderRadius: 12,
            border: "1px solid #ddd8ca",
            boxShadow: "0 1px 3px rgba(35, 33, 27, 0.07)"
          }}
        >
          <h2 style={{ marginTop: 0 }}>We hit an unexpected error</h2>
          <p style={{ color: "#57534a" }}>
            Please try again. If it keeps happening, refresh the page.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              border: "none",
              borderRadius: 6,
              padding: "12px 24px",
              background: "#33564a",
              color: "#f3f1e8",
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
