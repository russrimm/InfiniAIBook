import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { UndoProvider } from "@/components/UndoToast";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "InfiniAIBook — grounded research studio",
    template: "%s — InfiniAIBook",
  },
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
      <head>
        {/* Sets data-theme before first paint so there is no flash of the wrong theme. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <UndoProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </UndoProvider>
      </body>
    </html>
  );
}
