import type { Metadata } from "next";
import { ToolMarketingPage } from "@/components/marketing/ToolMarketingPage";

export const metadata: Metadata = {
  title: "Key and BPM Changer: Live Pitch and Tempo Control | KeyTone",
  description:
    "Change a song's key and tempo live while it plays, CDJ-style. Drag the tempo fader and key stepper and hear the shift instantly. Free to preview once you sign in, no credit card required.",
  alternates: { canonical: "/keychanger" },
};

export default function KeyChangerMarketingPage() {
  return (
    <ToolMarketingPage
      eyebrow="Live Pitch and Tempo"
      title="Key and BPM Changer"
      subtitle="Drop in a track and drag a tempo fader and key stepper while it's playing, just like a CDJ. KeyTone shifts pitch and tempo live in your browser, independently or together."
      ctaHref="/dashboard/keychanger"
      ctaLabel="Try Key & BPM Changer"
      highlights={[
        {
          title: "Live tempo fader",
          description:
            "Drag the tempo fader while a track plays and hear the speed change in real time, no waiting for a render.",
        },
        {
          title: "Independent key control",
          description:
            "Shift the key up or down in semitones without touching tempo, or combine both for a full remix pass.",
        },
        {
          title: "Auto-detected baseline",
          description:
            "KeyTone detects the track's original BPM and key on load, so you always know what you're adjusting from.",
        },
        {
          title: "Runs entirely in your browser",
          description:
            "Live preview uses real-time audio processing on your device, no upload wait and no server round trip.",
        },
        {
          title: "Free to preview",
          description:
            "Sign in free and load a track, play it, and drag the faders live at no cost, no credit card required.",
        },
        {
          title: "Pro export",
          description:
            "Download the processed track as a WAV file with a Pro plan once you've dialed in the sound you want.",
        },
      ]}
      faq={[
        {
          question: "Is the key and BPM change really live?",
          answer:
            "Yes, dragging the tempo fader or key stepper while the track is playing shifts the sound immediately, the same way a CDJ pitch fader works.",
        },
        {
          question: "Do I need an account to try it?",
          answer:
            "Yes, sign in free to load a track and preview live tempo and key changes, no credit card required. A Pro plan is only needed to export the processed file.",
        },
        {
          question: "Can I change tempo without changing the key?",
          answer:
            "Yes, the tempo fader and key stepper are independent, so you can speed up or slow down a track while keeping its original key, or the reverse.",
        },
      ]}
    />
  );
}
