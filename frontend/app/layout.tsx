import type { Metadata } from "next";
import { Suspense } from "react";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./design-tokens.css";
import "./theme.css";
import "./globals.css";
import { SkipToContent } from "@/components/layout/SkipToContent";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { LiveTelemetryProvider } from "@/components/providers/LiveTelemetryProvider";
import { ErrorBoundary } from "@/components/hvac/ErrorBoundary";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  fallback: ["Segoe UI", "system-ui", "sans-serif"],
  adjustFontFallback: true,
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  fallback: ["Consolas", "ui-monospace", "monospace"],
  adjustFontFallback: true,
});

export const metadata: Metadata = {
  title: "HVAC AI Control Center",
  description: "Premium HVAC engineering control and optimization platform (O1–O20).",
};

import "../public/hvac-shell.css";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${jakarta.variable} ${jetbrains.variable}`} style={{ colorScheme: "light" }}>
      <body className="hvac-shell text-slate-700 min-h-screen flex flex-col font-sans selection:bg-violet-200 selection:text-violet-950 antialiased">
        <SkipToContent />
        <QueryProvider>
          <LiveTelemetryProvider>
            <Header />
            <div className="hvac-body flex flex-1 min-h-0">
            <Suspense
              fallback={
                <aside className="hvac-sidebar w-[17rem] bg-[#1a1a1d] h-[calc(100vh-4.25rem)] sticky top-[4.25rem]" />
              }
            >
              <Sidebar />
            </Suspense>
            <main id="main-content" className="hvac-main flex-1 overflow-y-auto w-full" tabIndex={-1}>
              <div className="max-w-[1600px] mx-auto w-full">
                <ErrorBoundary>{children}</ErrorBoundary>
              </div>
            </main>
            </div>
          </LiveTelemetryProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
