import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/siteConfig";

const PUBLIC_TOOL_PAGES = [
  "generator",
  "chords",
  "extract",
  "analyzer",
  "similar",
  "bpm",
  "keychanger",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/pricing`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    ...PUBLIC_TOOL_PAGES.map((slug) => ({
      url: `${SITE_URL}/${slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
