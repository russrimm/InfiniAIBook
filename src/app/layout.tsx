import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "InfiniAIBook — grounded research studio",
  description:
    "Upload sources, chat with them, and generate reports, quizzes, mind maps and infographics grounded in your own documents.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // Browser extensions commonly inject attributes onto <html> and <body>
    // before React hydrates, which otherwise reports a mismatch. This only
    // suppresses warnings for these two elements' own attributes, not for
    // anything rendered inside them.
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
