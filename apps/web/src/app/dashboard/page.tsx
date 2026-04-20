"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getMe, listProjects } from "@/lib/api/client";
import { Project, UserSummary } from "@/types/api";
import { ToolPageShell } from "@/components/layout/ToolPageShell";

const ANALYZER_HISTORY_STORAGE_KEY = "dashboard.discoverHistory.v1";

type HubFeatureCard = {
  href: string;
  title: string;
  description: string;
  group: "discover" | "create";
};

const FEATURE_CARDS: HubFeatureCard[] = [
  {
    href: "/analyzer",
    title: "Track Analyzer",
    description: "BPM, key, sections, and chord movement from uploaded audio.",
    group: "discover",
  },
  {
    href: "/similar",
    title: "Similar Songs",
    description:
      "Spotify plus Last.fm references with tags and ranked matches.",
    group: "discover",
  },
  {
    href: "/bpm",
    title: "BPM Finder",
    description: "Tap tempo, metronome, and precision BPM control workflow.",
    group: "discover",
  },
  {
    href: "/extract",
    title: "MIDI Tools",
    description: "Stem extraction and MIDI generation pipelines in one page.",
    group: "create",
  },
  {
    href: "/chords",
    title: "Chord Improver",
    description: "Safe, pro, and bold harmonic upgrades with intent controls.",
    group: "create",
  },
  {
    href: "/generator",
    title: "Track Generator",
    description: "Generate safe, fresh, and experimental starter progressions.",
    group: "create",
  },
];

function formatWhen(value: string | null): string {
  if (!value) {
    return "No activity yet";
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return "Recently";
  }

  return new Date(parsed).toLocaleString();
}

export default function DashboardHubPage() {
  const router = useRouter();
  const [me, setMe] = useState<UserSummary | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastAnalyzedName, setLastAnalyzedName] = useState<string | null>(null);
  const [lastAnalyzedAt, setLastAnalyzedAt] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(ANALYZER_HISTORY_STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as Array<
        Partial<{ fileName: string; analyzedAt: string }>
      >;
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return;
      }

      const latest = parsed[0] ?? {};
      setLastAnalyzedName(
        typeof latest.fileName === "string" ? latest.fileName : null,
      );
      setLastAnalyzedAt(
        typeof latest.analyzedAt === "string" ? latest.analyzedAt : null,
      );
    } catch {
      setLastAnalyzedName(null);
      setLastAnalyzedAt(null);
    }
  }, []);

  useEffect(() => {
    const run = async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;

      if (!accessToken) {
        router.push("/login");
        return;
      }

      try {
        const [projectsData, meData] = await Promise.all([
          listProjects(accessToken),
          getMe(accessToken),
        ]);
        setProjects(projectsData);
        setMe(meData);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [router]);

  const latestMidiProject = useMemo(() => {
    return [...projects]
      .filter((project) => project.status === "completed")
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .find((project) => {
        const assets = project.assets;
        return Boolean(
          assets?.midi_base_url ||
          assets?.altered_midi_url ||
          (assets?.midi_variation_urls?.length ?? 0) > 0,
        );
      });
  }, [projects]);

  const latestMidiLabel =
    latestMidiProject?.file_name ?? "No generated MIDI yet";
  const latestMidiAt = latestMidiProject?.created_at ?? null;
  const discoverCards = FEATURE_CARDS.filter(
    (card) => card.group === "discover",
  );
  const createCards = FEATURE_CARDS.filter((card) => card.group === "create");

  const renderCardGrid = (cards: HubFeatureCard[]) => (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <Link
          key={card.href}
          href={card.href}
          className="hub-feature-card group relative overflow-hidden rounded-xl border border-cyan-700/35 bg-black/40 p-4 transition hover:border-cyan-300/45"
        >
          <h2 className="text-lg font-semibold text-cyan-100">{card.title}</h2>
          <p className="mt-1 text-base text-foreground/70">
            {card.description}
          </p>
          <p className="mt-3 text-sm uppercase tracking-[0.12em] text-cyan-200/80 transition group-hover:text-cyan-100">
            Open workspace
          </p>
        </Link>
      ))}
    </div>
  );

  return (
    <ToolPageShell active="dashboard">
      <section className="relative overflow-hidden rounded-2xl border border-cyan-500/28 bg-black/45 p-5 sm:p-6">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
        >
          <div className="absolute -left-14 top-0 h-36 w-36 rounded-full bg-cyan-400/22 blur-3xl" />
          <div className="absolute right-[-3rem] top-8 h-44 w-44 rounded-full bg-fuchsia-500/24 blur-3xl" />
        </div>

        <div className="relative">
          <p className="text-sm uppercase tracking-[0.14em] text-cyan-200/80">
            Dashboard Hub
          </p>
          <h1 className="cyber-heading mt-1 text-3xl font-semibold text-cyan-100 sm:text-4xl">
            Central Command
          </h1>
          <p className="mt-2 max-w-3xl text-base text-foreground/70">
            Pick a focused workspace per feature. Each tool now has its own page
            while this dashboard stays lightweight.
          </p>

          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-black/35 px-3 py-1.5 text-sm text-cyan-100/90">
            <span className="uppercase tracking-wide text-cyan-200/80">
              Credits
            </span>
            <span className="font-semibold">
              {loading
                ? "..."
                : me?.unlimited_credits
                  ? "Unlimited"
                  : (me?.remaining_credits ?? 0)}
            </span>
          </div>
        </div>
      </section>

      <section className="mt-6 space-y-5">
        <article className="rounded-2xl border border-cyan-500/22 bg-black/35 p-4 sm:p-5">
          <p className="text-sm uppercase tracking-[0.13em] text-cyan-200/80">
            Discover
          </p>
          <h2 className="mt-1 text-xl font-semibold text-cyan-100">
            Analyze and explore references
          </h2>
          <p className="mt-1 text-base text-foreground/70">
            Open a focused discover tool for analysis, match-finding, or tempo
            discovery.
          </p>
          <div className="mt-4">{renderCardGrid(discoverCards)}</div>
        </article>

        <article className="rounded-2xl border border-fuchsia-500/22 bg-black/35 p-4 sm:p-5">
          <p className="text-sm uppercase tracking-[0.13em] text-fuchsia-200/80">
            Create
          </p>
          <h2 className="mt-1 text-xl font-semibold text-fuchsia-100">
            Build and generate MIDI assets
          </h2>
          <p className="mt-1 text-base text-foreground/70">
            Jump into extraction, chord improvement, or starter generation
            workflows.
          </p>
          <div className="mt-4">{renderCardGrid(createCards)}</div>
        </article>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <article className="glass rounded-xl p-4">
          <p className="text-sm uppercase tracking-[0.13em] text-cyan-200/80">
            Recent Activity
          </p>
          <h3 className="mt-1 text-base font-medium text-cyan-100">
            Last analyzed track
          </h3>
          <p className="mt-2 text-base text-foreground/75">
            {lastAnalyzedName ?? "No analyzed tracks yet"}
          </p>
          <p className="mt-1 text-sm text-foreground/55">
            {formatWhen(lastAnalyzedAt)}
          </p>
        </article>

        <article className="glass rounded-xl p-4">
          <p className="text-sm uppercase tracking-[0.13em] text-cyan-200/80">
            Recent Activity
          </p>
          <h3 className="mt-1 text-base font-medium text-cyan-100">
            Last generated MIDI
          </h3>
          <p className="mt-2 text-base text-foreground/75">{latestMidiLabel}</p>
          <p className="mt-1 text-sm text-foreground/55">
            {formatWhen(latestMidiAt)}
          </p>
        </article>
      </section>
    </ToolPageShell>
  );
}
