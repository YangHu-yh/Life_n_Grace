import "./globals.css";
import Link from "next/link";
import { Outfit } from "next/font/google";
import SiteHeader from "@/components/SiteHeader";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-outfit",
  display: "swap"
});

export const metadata = {
  title: "Life 'n' Grace",
  description: "AI prayer generation and secure journaling."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={outfit.variable}>
      <body>
        <SiteHeader />
        <main>{children}</main>
        <footer>
          <div style={{ maxWidth: 1120, margin: "0 auto" }}>
            <p>Life-n-Grace is a prayer companion for daily reflection.</p>
            <div className="footer-links">
              <Link href="/policy">Policy</Link>
              <Link href="/about">About</Link>
              <Link href="/faq">FAQ</Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
