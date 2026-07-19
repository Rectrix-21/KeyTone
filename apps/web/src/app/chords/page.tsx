import type { Metadata } from "next";
import { ToolMarketingPage } from "@/components/marketing/ToolMarketingPage";

export const metadata: Metadata = {
  title: "AI Chord Improver: Upgrade Any MIDI Progression | KeyTone",
  description:
    "Upload a MIDI chord progression and get smarter voicings, richer harmony, and safe-to-bold variations instantly. Improve chord progressions online without a music theory background.",
  alternates: { canonical: "/chords" },
};

export default function ChordsMarketingPage() {
  return (
    <ToolMarketingPage
      eyebrow="Chord Enhancement"
      title="AI Chord Progression Improver"
      subtitle="Upload an existing MIDI chord progression and KeyTone rebuilds it with smarter voice leading, richer voicings, and intent-driven variations, from subtle polish to a bold reharmonization."
      ctaHref="/dashboard/chords"
      ctaLabel="Try Chord Improver"
      highlights={[
        {
          title: "Smarter voice leading",
          description:
            "Chords are re-voiced so notes move smoothly between changes instead of jumping around awkwardly.",
        },
        {
          title: "Safe, Pro, and Bold intents",
          description:
            "Choose how far to push the reharmonization, from a light touch-up to an intentionally unexpected take.",
        },
        {
          title: "Works from any MIDI sketch",
          description:
            "Start from a rough MIDI chord sketch, even a simple block-chord draft, and KeyTone builds it out.",
        },
        {
          title: "Key-aware transposition",
          description:
            "Change the key of a progression with real chromatic transposition, not naive note-shifting.",
        },
        {
          title: "Target any instrument lane",
          description:
            "Improve melody, bass, or full-chord lanes independently depending on what you're working on.",
        },
        {
          title: "Fast turnaround",
          description:
            "Get results back in well under a minute so you can stay in a creative flow instead of waiting around.",
        },
      ]}
      faq={[
        {
          question: "Do I need to know music theory to use this?",
          answer:
            "No, you pick an intent (Safe, Pro, or Bold) and KeyTone handles the harmonic decisions for you.",
        },
        {
          question: "Can it fix a progression that sounds \"off\"?",
          answer:
            "Yes, that's exactly what it's built for: cleaning up voice leading and chord choices that don't quite sit right.",
        },
        {
          question: "What file types can I upload?",
          answer:
            "MIDI files (.mid or .midi) up to 25MB. Need MIDI from an audio recording first? Use Audio to MIDI, then bring the result here.",
        },
      ]}
    />
  );
}
