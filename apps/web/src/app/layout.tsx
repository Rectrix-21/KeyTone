import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthNav } from "@/components/layout/AuthNav";
import { CyberBackground } from "@/components/layout/CyberBackground";

export const metadata: Metadata = {
  title: "KeyTone",
  description: "Audio to MIDI with BPM, key detection, and smart variations",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="relative min-h-screen overflow-x-hidden bg-black">
        <CyberBackground />
        <div className="relative z-10">
          <header className="border-b border-cyan-500/20 bg-black/45 backdrop-blur-sm">
            <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-3 sm:h-16 sm:px-4">
              <Link
                href="/"
                className="cyber-heading text-lg font-semibold tracking-tight text-cyan-100"
              >
                KeyTone
              </Link>
              <AuthNav />
            </div>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
