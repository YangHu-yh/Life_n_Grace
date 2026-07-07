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

  const links = isAuthed
    ? [
        { href: "/prayers", label: "Prayers" },
        { href: "/topics", label: "Topics" },
        { href: "/companion", label: "Companion" },
        { href: "/profile", label: "Profile" }
      ]
    : [
        { href: "/policy", label: "Policy" },
        { href: "/login", label: "Sign in" },
        { href: "/signup", label: "Create account" }
      ];

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="site-brand">
          Life-n-Grace
        </Link>
        <nav className="site-nav">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={pathname === link.href ? "is-active" : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        {isAuthed && (
          <button
            className="button button-outline logout-button"
            type="button"
            onClick={handleLogout}
          >
            Log out
          </button>
        )}
      </div>
    </header>
  );
}
