import type { Metadata } from "next";
import { ToolMarketingPage } from "@/components/marketing/ToolMarketingPage";

export const metadata: Metadata = {
  title: "Track Analyzer: Find the BPM and Key of Any Song | KeyTone",
  description:
    "Drop in an audio file or paste a Spotify link to instantly detect BPM, musical key, song sections, and the underlying chord progression. Free to use on every plan once you sign in.",
  alternates: { canonical: "/analyzer" },
};

export default function AnalyzerMarketingPage() {
  return (
    <ToolMarketingPage
      eyebrow="Track Analysis"
      title="Find the BPM and Key of Any Song"
      subtitle="Upload an audio file or search a track on Spotify and get BPM, musical key, song sections, and chord movement back in seconds, with confidence scores you can actually trust."
      ctaHref="/dashboard/analyzer"
      ctaLabel="Try Track Analyzer"
      highlights={[
        {
          title: "BPM detection with confidence",
          description:
            "Multi-segment tempo analysis gives you a reliable BPM read, including double-time alternatives.",
        },
        {
          title: "Musical key and relative key",
          description:
            "Get the detected key plus its relative major/minor, so you always know your options for matching material.",
        },
        {
          title: "Song section breakdown",
          description:
            "See intro, verse, chorus, and outro boundaries mapped across the track's energy curve.",
        },
        {
          title: "Chord progression estimate",
          description:
            "A best-effort chord progression readout gives you a harmonic starting point for sampling or covering.",
        },
        {
          title: "Analyze from Spotify directly",
          description:
            "Search a track by name or paste a Spotify link, no need to have the audio file on hand.",
        },
        {
          title: "Always free to use",
          description:
            "Track Analyzer is a Discover tool, which means it's free on every plan, no credits required.",
        },
      ]}
      faq={[
        {
          question: "Can I analyze a song without uploading a file?",
          answer:
            "Yes, search for it on Spotify directly from the analyzer and KeyTone will pull a preview to analyze.",
        },
        {
          question: "How accurate is the key detection?",
          answer:
            "It uses multi-segment chroma analysis and reports a confidence score alongside the result, so you know how certain the read is.",
        },
        {
          question: "Is Track Analyzer really free?",
          answer:
            "Yes, all Discover tools, including Track Analyzer, are free on every plan without spending credits.",
        },
      ]}
    />
  );
}
