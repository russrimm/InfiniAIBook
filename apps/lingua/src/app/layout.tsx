import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lingua: practice speaking with a real-feeling partner",
  description:
    "Realtime voice conversations in 11 languages with a partner who switches to your language when you need it.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-full antialiased" suppressHydrationWarning>
        <header className="border-b border-line bg-surface/80 backdrop-blur">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
            <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full bg-accent text-white">
                ◐
              </span>
              Lingua
            </Link>
            <div className="flex items-center gap-5 text-sm text-muted">
              <Link href="/" className="hover:text-ink">
                New conversation
              </Link>
              <Link href="/history" className="hover:text-ink">
                History
              </Link>
            </div>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
