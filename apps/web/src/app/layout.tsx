import "./globals.css";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AuthNav } from "@/components/layout/AuthNav";
import { CyberBackground } from "@/components/layout/CyberBackground";
import { WorkspaceWarmup } from "@/components/layout/WorkspaceWarmup";
import { SITE_URL } from "@/lib/siteConfig";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
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
              <Link href="/" className="flex items-center">
                <Image
                  src="/textlogo.png"
                  alt="KeyTone"
                  width={1000}
                  height={330}
                  priority
                  className="h-11 w-auto object-contain sm:h-14"
                />
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
