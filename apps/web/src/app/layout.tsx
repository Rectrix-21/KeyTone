import "./globals.css";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AuthNav } from "@/components/layout/AuthNav";
import { CyberBackground } from "@/components/layout/CyberBackground";
import { Footer } from "@/components/layout/Footer";
import { WorkspaceWarmup } from "@/components/layout/WorkspaceWarmup";
import { SITE_URL } from "@/lib/siteConfig";

const DEFAULT_TITLE = "KeyTone: Audio to MIDI Converter and AI Music Tools";
const DEFAULT_DESCRIPTION =
  "Turn any song into MIDI in your browser. KeyTone transcribes melody and chords, generates chord progressions, and detects BPM and key. Free to try, no install required.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: "/logo.png",
  },
  openGraph: {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    url: SITE_URL,
    siteName: "KeyTone",
    images: [
      {
        url: "/textlogo.png",
        width: 1000,
        height: 330,
        alt: "KeyTone",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: ["/textlogo.png"],
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
        <div className="relative z-10 flex min-h-screen flex-col">
          <header className="relative z-40 border-b border-cyan-500/20 bg-black/45 backdrop-blur-sm">
            <div className="mx-auto flex h-14 max-w-[2100px] items-center justify-between px-4 sm:h-16 sm:px-6 xl:px-10">
              <Link href="/" className="flex items-center">
                <Image
                  src="/textlogo.png"
                  alt="KeyTone"
                  width={1100}
                  height={330}
                  priority
                  className="h-11 w-auto object-contain sm:h-12"
                />
              </Link>
              <AuthNav />
            </div>
          </header>
          <div className="flex-1">{children}</div>
          <Footer />
        </div>
      </body>
    </html>
  );
}
