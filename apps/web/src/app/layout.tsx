import "./globals.css";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AuthNav } from "@/components/layout/AuthNav";
import { CyberBackground } from "@/components/layout/CyberBackground";
import { WorkspaceWarmup } from "@/components/layout/WorkspaceWarmup";

export const metadata: Metadata = {
  title: "KeyTone",
  description: "Audio to MIDI with BPM, key detection, and smart variations",
  icons: {
    icon: "/logo.png",
  },
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
        <WorkspaceWarmup />
        <div className="relative z-10">
          <header className="relative z-40 border-b border-cyan-500/20 bg-black/45 backdrop-blur-sm">
            <div className="mx-auto flex h-14 max-w-[2100px] items-center justify-between px-4 sm:h-16 sm:px-6 xl:px-10">
              <Link href="/" className="flex items-center gap-2.5">
                <Image
                  src="/logo.png"
                  alt="KeyTone"
                  width={40}
                  height={40}
                  priority
                  className="h-10 w-10 rounded-md object-contain"
                />
                <span className="cyber-heading text-xl font-semibold tracking-tight text-cyan-100">
                  KeyTone
                </span>
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
