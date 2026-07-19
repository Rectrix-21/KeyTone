import type { Metadata } from "next";
import { ToolMarketingPage } from "@/components/marketing/ToolMarketingPage";

export const metadata: Metadata = {
  title: "BPM Finder and Tap Tempo Tool: Free Online Metronome | KeyTone",
  description:
    "Tap tempo, drag to set BPM, or use the built-in metronome to lock in your track's tempo fast. Free online tap tempo and BPM tool on every plan, sign in free to try it.",
  alternates: { canonical: "/bpm" },
};

export default function BpmMarketingPage() {
  return (
    <ToolMarketingPage
      eyebrow="Tempo Tools"
      title="BPM Finder and Tap Tempo Tool"
      subtitle="Tap along to a beat, drag the BPM scroller, or type a number directly. KeyTone's metronome and tap-tempo tool locks in your track's tempo in seconds."
      ctaHref="/dashboard/bpm"
      ctaLabel="Try BPM Finder"
      highlights={[
        {
          title: "Tap tempo detection",
          description:
            "Tap along with the spacebar or a click, and KeyTone averages your taps into an accurate BPM read.",
        },
        {
          title: "Built-in metronome",
          description:
            "Audition the detected tempo instantly with a metronome that accents the downbeat of every bar.",
        },
        {
          title: "Drag-to-set BPM scroller",
          description:
            "Fine-tune tempo by dragging or typing a precise BPM value directly.",
        },
        {
          title: "Multiple metronome sounds",
          description:
            "Choose between different click sounds to match your preference or working environment.",
        },
        {
          title: "No installation needed",
          description:
            "Runs entirely in your browser, no plugin and no app download required.",
        },
        {
          title: "Always free to use",
          description:
            "BPM Finder is a Discover tool, free on every plan with no credits required.",
        },
      ]}
      faq={[
        {
          question: "How accurate is tap tempo detection?",
          answer:
            "It averages the intervals between your last several taps, so accuracy improves the more consistently you tap along.",
        },
        {
          question: "Can I use this as a regular metronome?",
          answer:
            "Yes, set a BPM manually or via tap tempo, then start the metronome to practice or record along to it.",
        },
        {
          question: "Do I need an account to use it?",
          answer:
            "Yes, sign in to use it, but it's completely free on every plan since it's a Discover tool, no credits or Pro plan required.",
        },
      ]}
    />
  );
}
