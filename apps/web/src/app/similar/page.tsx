import type { Metadata } from "next";
import { ToolMarketingPage } from "@/components/marketing/ToolMarketingPage";

export const metadata: Metadata = {
  title: "Find Similar Songs by Sound and Vibe | KeyTone",
  description:
    "Search any track and discover closely matching songs ranked by how similar they actually sound: genre, mood, and tempo included. Free music discovery tool.",
  alternates: { canonical: "/similar" },
};

export default function SimilarMarketingPage() {
  return (
    <ToolMarketingPage
      eyebrow="Music Discovery"
      title="Find Similar Songs by Sound and Vibe"
      subtitle="Search for a song and get a ranked list of tracks that actually sound like it, matched by genre, mood, and tempo, not just shared playlists."
      ctaHref="/dashboard/similar"
      ctaLabel="Try Similar Songs"
      highlights={[
        {
          title: "Relevance-ranked matches",
          description:
            "Every result comes with a similarity score so you can see how close a match actually is, not just a flat list.",
        },
        {
          title: "Genre and mood tags",
          description:
            "Each match shows genre and mood tags, making it easy to understand why it was suggested.",
        },
        {
          title: "Search by song or artist",
          description:
            "Start from any track on Spotify and build a reference list of closely related songs.",
        },
        {
          title: "Built-in preview player",
          description:
            "Preview matches without leaving the page, so you can quickly audition a full list of candidates.",
        },
        {
          title: "Good for reference-finding",
          description:
            "Useful for producers building a reference playlist or writers looking for stylistically similar material.",
        },
        {
          title: "Always free to use",
          description:
            "Similar Songs is a Discover tool, free on every plan with no credits required.",
        },
      ]}
      faq={[
        {
          question: "How does similarity get ranked?",
          answer:
            "Matches are scored on genre, mood, and tempo overlap with the source track, with the closest matches surfaced first.",
        },
        {
          question: "Can I search by artist instead of a specific song?",
          answer:
            "You search by track, but results often surface other work by similar or related artists as part of the match set.",
        },
        {
          question: "Is this tool free?",
          answer:
            "Yes, Similar Songs is a Discover tool and is free on every plan, no credits needed.",
        },
      ]}
    />
  );
}
