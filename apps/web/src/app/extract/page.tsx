import type { Metadata } from "next";
import { ToolMarketingPage } from "@/components/marketing/ToolMarketingPage";

export const metadata: Metadata = {
  title: "Audio to MIDI Converter: Extract Melody & Chords Free | KeyTone",
  description:
    "Turn any song into MIDI right in your browser. KeyTone transcribes melody and chords directly from the full mix, no downloads, no stem-separation wait.",
  alternates: { canonical: "/extract" },
};

export default function ExtractMarketingPage() {
  return (
    <ToolMarketingPage
      eyebrow="Audio to MIDI"
      title="Audio to MIDI Converter"
      subtitle="Drop in any song and KeyTone transcribes melody and chord MIDI directly from the mix, in your browser, in about as long as it takes to make coffee."
      ctaHref="/dashboard/extract"
      ctaLabel="Try Extraction"
      highlights={[
        {
          title: "Melody and chord transcription",
          description:
            "Get both a melody line and a chord progression transcribed from the same source audio.",
        },
        {
          title: "No stem separation wait",
          description:
            "KeyTone transcribes directly from the full mix, which is faster and often more accurate than isolating stems first.",
        },
        {
          title: "Works from a file or a trimmed clip",
          description:
            "Upload a full track or trim it down to the exact section you want transcribed before processing.",
        },
        {
          title: "Runs in your browser",
          description:
            "No desktop install required for MIDI extraction. It happens right on the extraction page.",
        },
        {
          title: "Desktop app for full stem separation",
          description:
            "Need isolated vocal, drum, bass, and instrument stems too? The free KeyTone Studio desktop app handles that separately.",
        },
        {
          title: "Confidence-scored output",
          description:
            "Each transcription comes with a confidence read so you know how much cleanup, if any, it needs.",
        },
      ]}
      faq={[
        {
          question: "How accurate is audio-to-MIDI conversion?",
          answer:
            "Accuracy depends on the source material. Clean, melodically clear recordings transcribe best, while dense, heavily produced mixes may need manual touch-ups afterward.",
        },
        {
          question: "Do I need to separate stems first?",
          answer:
            "No. KeyTone transcribes melody and chords directly from the full mix, which skips the slowest part of the old stem-separation-first workflow.",
        },
        {
          question: "What if I need actual audio stems, not just MIDI?",
          answer:
            "That's what the free KeyTone Studio desktop app is for: full stem separation for vocals, drums, bass, and more.",
        },
      ]}
    />
  );
}
