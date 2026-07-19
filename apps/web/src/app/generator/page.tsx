import type { Metadata } from "next";
import { ToolMarketingPage } from "@/components/marketing/ToolMarketingPage";

export const metadata: Metadata = {
  title: "Free MIDI Chord Progression Generator | KeyTone",
  description:
    "Generate original MIDI chord progressions in seconds. Pick a genre, mood, and complexity and KeyTone builds safe, fresh, and experimental starter ideas you can drop into any DAW.",
  alternates: { canonical: "/generator" },
};

export default function GeneratorMarketingPage() {
  return (
    <ToolMarketingPage
      eyebrow="MIDI Generation"
      title="MIDI Chord Progression Generator"
      subtitle="Pick a genre, mood, BPM, and complexity, and KeyTone generates original chord progressions as ready-to-use MIDI, perfect for breaking writer's block or kickstarting a new idea."
      ctaHref="/dashboard/generator"
      ctaLabel="Try Track Generator"
      highlights={[
        {
          title: "Genre and mood aware",
          description:
            "Choose from R&B, indie, EDM, trap, and more, then dial in the mood so every progression fits the vibe you're going for.",
        },
        {
          title: "Safe, fresh, and experimental takes",
          description:
            "Every generation includes multiple variants, from radio-safe progressions to bolder, more unexpected voicings.",
        },
        {
          title: "Chords-only MIDI, ready for your DAW",
          description:
            "Export clean chord MIDI and build the melody, bass, and drums your way in whatever DAW you already use.",
        },
        {
          title: "Reference description input",
          description:
            "Describe the reference sound you're chasing and the generator leans its output toward that texture and energy.",
        },
        {
          title: "Key and BPM control",
          description:
            "Lock in a specific key and tempo, or let KeyTone pick one automatically based on genre and mood.",
        },
        {
          title: "No music theory required",
          description:
            "Get usable, musically coherent progressions without needing to know a single chord symbol yourself.",
        },
      ]}
      faq={[
        {
          question: "Is the MIDI generator free to use?",
          answer:
            "Yes. Every free account gets weekly credits to generate starter ideas, with Pro unlocking fresh and experimental variants on top of the safe default.",
        },
        {
          question: "What genres does it support?",
          answer:
            "R&B, indie, EDM, and trap out of the box, each with genre-specific chord and rhythm patterns rather than generic presets.",
        },
        {
          question: "Can I edit the generated MIDI afterward?",
          answer:
            "Yes, the output is standard chords-only MIDI, so you can drag it straight into any DAW and edit, transpose, or rearrange it freely.",
        },
      ]}
    />
  );
}
