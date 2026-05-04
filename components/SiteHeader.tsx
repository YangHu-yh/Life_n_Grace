"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function SiteHeader() {
  const [isAuthed, setIsAuthed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

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
  }, [pathname]);

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setIsAuthed(false);
      router.push("/");
      router.refresh();
    }
  }

  return (
    <header style={{ padding: "28px 20px" }}>
      <div
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap"
        }}
      >
        <Link href="/" style={{ fontWeight: 700 }}>
          Life-n-Grace
        </Link>
        <nav style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Link href="/">Home</Link>
          {isAuthed && <Link href="/prayers">Prayers</Link>}
          {isAuthed && <Link href="/companion">Companion</Link>}
          {isAuthed && <Link href="/profile">Profile</Link>}
          <Link href="/policy">Policy</Link>
          {!isAuthed && <Link href="/login">Sign in</Link>}
          {!isAuthed && <Link href="/signup">Create account</Link>}
        </nav>
        {isAuthed && (
          <button className="button button-outline" type="button" onClick={handleLogout}>
            Log out
          </button>
        )}
      </div>
    </header>
  );
}
