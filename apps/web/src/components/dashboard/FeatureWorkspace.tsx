"use client";

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { createClient } from "@/lib/supabase/client";
import {
  alterVariationMidi,
  analyzeDiscoverSpotifyTrack,
  cancelProject,
  clearProjectHistory,
  fetchDiscoverSpotifyTrackContext,
  deleteProject,
  findSimilarDiscoverTracks,
  generateTrackStarterIdeas,
  generateStemMidi,
  getMe,
  getProject,
  listProjects,
  searchDiscoverSpotifyTracks,
  uploadProject,
} from "@/lib/api/client";
import {
  ExtractionStem,
  Project,
  ProjectFeature,
  SimilarSongFinderResponse,
  DiscoverSpotifyTrackContextResponse,
  SpotifyTrackSummary,
  StarterComplexity,
  TrackAnalyzerResult,
  UserSummary,
  VariationAlterTarget,
  VariationIntent,
  VariationProducerMove,
  VariationStyle,
  VariationTarget,
} from "@/types/api";
import { UploadDropzone } from "@/components/dashboard/UploadDropzone";
import { ProjectCard } from "@/components/dashboard/ProjectCard";

const POLL_MS = 2500;
const MAX_HISTORY_ITEMS = 10;
const ANALYZER_HISTORY_STORAGE_KEY = "dashboard.discoverHistory.v1";
const FEATURE_CLEAR_CUTOFF_STORAGE_KEY = "dashboard.featureClearCutoffs.v1";
const SPOTIFY_SEARCH_DEBOUNCE_MS = 120;
const SPOTIFY_SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const BPM_FINDER_MIN = 40;
const BPM_FINDER_MAX = 240;
const TAP_TEMPO_RESET_MS = 2200;
type DashboardTab = "extraction" | "variation" | "starter" | "discover";
type CreateSubTab = Exclude<DashboardTab, "discover">;
type DiscoverSubTab = "analyzer" | "similar" | "bpm";
export type FeatureRoute =
  | "analyzer"
  | "similar"
  | "bpm"
  | "extract"
  | "chords"
  | "generator";
type MetronomeSound = "tick" | "hats" | "kick";
type FeatureClearCutoffs = Partial<Record<ProjectFeature, string>>;
type SpotifySearchCacheEntry = {
  tracks: SpotifyTrackSummary[];
  cachedAt: number;
};

type AnalyzedHistoryEntry = {
  id: string;
  fileName: string;
  analyzedAt: string;
  result: TrackAnalyzerResult;
};

const STARTER_GENRES = ["rnb", "indie", "edm", "trap"] as const;
const STARTER_MOODS = ["dark", "happy", "emotional", "energetic"] as const;
const STARTER_KEYS = [
  "C major",
  "C minor",
  "C# major",
  "C# minor",
  "D major",
  "D minor",
  "D# major",
  "D# minor",
  "E major",
  "E minor",
  "F major",
  "F minor",
  "F# major",
  "F# minor",
  "G major",
  "G minor",
  "G# major",
  "G# minor",
  "A major",
  "A minor",
  "A# major",
  "A# minor",
  "B major",
  "B minor",
] as const;
const ANALYZING_STEPS = [
  "Decoding audio",
  "Estimating tempo across sections",
  "Resolving key consensus",
  "Extracting harmonic movement",
] as const;
const SIMILAR_LOADING_STEPS = [
  "Resolving source metadata",
  "Scanning Last.fm neighbor graph",
  "Enriching tracks with tags",
  "Ranking by relevance and vibe",
] as const;
const STARTER_LOADING_STEPS = [
  "Shaping harmonic bed",
  "Drafting groove and rhythm",
  "Rendering starter variations",
] as const;
const EMPTY_GENERATING_TARGETS: string[] = [];

const CREATE_SUBSECTIONS: Array<{ tab: CreateSubTab; label: string }> = [
  { tab: "extraction", label: "Stem and Midi Extraction" },
  { tab: "variation", label: "Chord Improver" },
  { tab: "starter", label: "Track Starter Generator" },
];

const DISCOVER_SUBSECTIONS: Array<{ tab: DiscoverSubTab; label: string }> = [
  { tab: "analyzer", label: "Track Analyzer" },
  { tab: "similar", label: "Similar Songs" },
  { tab: "bpm", label: "BPM Finder and Tapper" },
];

const CREATE_TOOL_ICONS: Record<CreateSubTab, string> = {
  extraction: "◉",
  variation: "◈",
  starter: "◆",
};

const DISCOVER_TOOL_ICONS: Record<DiscoverSubTab, string> = {
  analyzer: "ANL",
  similar: "SIM",
  bpm: "BPM",
};

const FEATURE_ROUTE_LABELS: Record<FeatureRoute, string> = {
  analyzer: "Track Analyzer",
  similar: "Similar Songs",
  bpm: "BPM Finder and Tapper",
  extract: "MIDI Tools",
  chords: "Chord Improver",
  generator: "Track Generator",
};

function featureRouteToTabState(featureRoute?: FeatureRoute): {
  tab: DashboardTab;
  discoverSubTab: DiscoverSubTab;
} {
  if (featureRoute === "analyzer") {
    return { tab: "discover", discoverSubTab: "analyzer" };
  }
  if (featureRoute === "similar") {
    return { tab: "discover", discoverSubTab: "similar" };
  }
  if (featureRoute === "bpm") {
    return { tab: "discover", discoverSubTab: "bpm" };
  }
  if (featureRoute === "extract") {
    return { tab: "extraction", discoverSubTab: "analyzer" };
  }
  if (featureRoute === "chords") {
    return { tab: "variation", discoverSubTab: "analyzer" };
  }
  if (featureRoute === "generator") {
    return { tab: "starter", discoverSubTab: "analyzer" };
  }

  return { tab: "extraction", discoverSubTab: "analyzer" };
}

function clampBpm(value: number): number {
  if (!Number.isFinite(value)) {
    return 120;
  }
  return Math.max(BPM_FINDER_MIN, Math.min(BPM_FINDER_MAX, Math.round(value)));
}

function limitProjectHistory(projects: Project[]): Project[] {
  const perFeatureCount = new Map<string, number>();
  const limited: Project[] = [];

  for (const project of projects) {
    const feature = String(project.feature ?? "unknown");
    const count = perFeatureCount.get(feature) ?? 0;
    if (count >= MAX_HISTORY_ITEMS) {
      continue;
    }

    perFeatureCount.set(feature, count + 1);
    limited.push(project);
  }

  return limited;
}

function omitProjectIds<T>(
  input: Record<string, T>,
  projectIds: Set<string>,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(input).filter(([projectId]) => !projectIds.has(projectId)),
  );
}

function extractSpotifyTrackIdFromUrl(
  url: string | null | undefined,
): string | null {
  if (!url) {
    return null;
  }

  const marker = "/track/";
  if (!url.includes(marker)) {
    return null;
  }

  const fragment = url.split(marker, 2)[1] ?? "";
  const trackId = fragment.split("?", 1)[0]?.split("/", 1)[0]?.trim();
  return trackId ? trackId : null;
}

function dedupeTags(
  tags: Array<string | null | undefined>,
  limit = 5,
): string[] {
  const output: string[] = [];
  const seen = new Set<string>();

  for (const raw of tags) {
    const cleaned = String(raw ?? "").trim();
    if (!cleaned) {
      continue;
    }
    const normalized = cleaned.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(cleaned);
    if (output.length >= limit) {
      break;
    }
  }

  return output;
}

function readFeatureClearCutoffs(): FeatureClearCutoffs {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(FEATURE_CLEAR_CUTOFF_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const output: FeatureClearCutoffs = {};
    for (const feature of ["extraction", "variation", "starter"] as const) {
      const value = (parsed as Record<string, unknown>)[feature];
      if (typeof value === "string" && value.trim().length > 0) {
        output[feature] = value;
      }
    }

    return output;
  } catch {
    return {};
  }
}

function applyProjectHistoryPolicy(
  projects: Project[],
  cutoffs: FeatureClearCutoffs,
): Project[] {
  const filtered = projects.filter((project) => {
    const cutoffRaw = cutoffs[project.feature];
    if (!cutoffRaw) {
      return true;
    }

    const cutoffMs = Date.parse(cutoffRaw);
    const createdMs = Date.parse(project.created_at);
    if (!Number.isFinite(cutoffMs) || !Number.isFinite(createdMs)) {
      return true;
    }

    return createdMs > cutoffMs;
  });

  return limitProjectHistory(filtered);
}

interface FeatureWorkspaceProps {
  featureRoute?: FeatureRoute;
}

export function FeatureWorkspace({ featureRoute }: FeatureWorkspaceProps) {
  const initialTabState = featureRouteToTabState(featureRoute);
  const showWorkspaceSwitcher = !featureRoute;
  const [projects, setProjects] = useState<Project[]>([]);
  const [me, setMe] = useState<UserSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [generatingByProject, setGeneratingByProject] = useState<
    Record<string, string[]>
  >({});
  const [alteringByProject, setAlteringByProject] = useState<
    Record<string, boolean>
  >({});
  const [cancellingByProject, setCancellingByProject] = useState<
    Record<string, boolean>
  >({});
  const [deletingByProject, setDeletingByProject] = useState<
    Record<string, boolean>
  >({});
  const [clearingHistory, setClearingHistory] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [featureClearCutoffs, setFeatureClearCutoffs] =
    useState<FeatureClearCutoffs>(() => readFeatureClearCutoffs());
  const [tab, setTab] = useState<DashboardTab>(initialTabState.tab);
  const [lastCreateSubTab, setLastCreateSubTab] = useState<CreateSubTab>(
    initialTabState.tab === "discover" ? "extraction" : initialTabState.tab,
  );
  const [discoverSubTab, setDiscoverSubTab] = useState<DiscoverSubTab>(
    initialTabState.discoverSubTab,
  );
  const [extractStems, setExtractStems] = useState<ExtractionStem[]>([]);
  const [starterGenerating, setStarterGenerating] = useState(false);
  const [starterLoadingStepIndex, setStarterLoadingStepIndex] = useState(0);
  const [starterGenre, setStarterGenre] = useState("rnb");
  const [starterMood, setStarterMood] = useState("emotional");
  const [starterBpm, setStarterBpm] = useState("118");
  const [starterKey, setStarterKey] = useState("");
  const [starterComplexity, setStarterComplexity] =
    useState<StarterComplexity>("medium");
  const [starterBars, setStarterBars] = useState<8 | 16>(8);
  const [starterReference, setStarterReference] = useState("");
  const [analyzerResult, setAnalyzerResult] =
    useState<TrackAnalyzerResult | null>(null);
  const [analyzedFileName, setAnalyzedFileName] = useState<string>("");
  const [analyzerHistory, setAnalyzerHistory] = useState<
    AnalyzedHistoryEntry[]
  >([]);
  const [activeAnalysisId, setActiveAnalysisId] = useState<string | null>(null);
  const [analyzerSearchQuery, setAnalyzerSearchQuery] = useState("");
  const [analyzerSearchLoading, setAnalyzerSearchLoading] = useState(false);
  const [analyzerSearchError, setAnalyzerSearchError] = useState<string | null>(
    null,
  );
  const [analyzerSpotifyResults, setAnalyzerSpotifyResults] = useState<
    SpotifyTrackSummary[]
  >([]);
  const [spotifyUrlInput, setSpotifyUrlInput] = useState("");
  const [spotifyQuery, setSpotifyQuery] = useState("");
  const [spotifySelectedLabel, setSpotifySelectedLabel] = useState("");
  const [spotifySelectedTrack, setSpotifySelectedTrack] =
    useState<SpotifyTrackSummary | null>(null);
  const [spotifySearchLocked, setSpotifySearchLocked] = useState(false);
  const [spotifySearching, setSpotifySearching] = useState(false);
  const [spotifySearchError, setSpotifySearchError] = useState<string | null>(
    null,
  );
  const [spotifySearchResults, setSpotifySearchResults] = useState<
    SpotifyTrackSummary[]
  >([]);
  const [similarFinderLoading, setSimilarFinderLoading] = useState(false);
  const [similarLoadingStepIndex, setSimilarLoadingStepIndex] = useState(0);
  const [similarFinderResult, setSimilarFinderResult] =
    useState<SimilarSongFinderResponse | null>(null);
  const [selectedTrackContext, setSelectedTrackContext] =
    useState<DiscoverSpotifyTrackContextResponse | null>(null);
  const [selectedTrackContextLoading, setSelectedTrackContextLoading] =
    useState(false);
  const [selectedTrackContextError, setSelectedTrackContextError] = useState<
    string | null
  >(null);
  const [similarVisibleCount, setSimilarVisibleCount] = useState(20);
  const [analyzingStatusIndex, setAnalyzingStatusIndex] = useState(0);
  const [analyzingStartedAt, setAnalyzingStartedAt] = useState<number | null>(
    null,
  );
  const [bpmFinderBpm, setBpmFinderBpm] = useState(120);
  const [bpmFinderInput, setBpmFinderInput] = useState("120");
  const [metronomeSound, setMetronomeSound] = useState<MetronomeSound>("tick");
  const [metronomeVolume, setMetronomeVolume] = useState(0.7);
  const [metronomePlaying, setMetronomePlaying] = useState(false);
  const [metronomePulse, setMetronomePulse] = useState(0);
  const [tapTempoBpm, setTapTempoBpm] = useState<number | null>(null);
  const [tapTempoCount, setTapTempoCount] = useState(0);
  const [tapPulseTick, setTapPulseTick] = useState(0);
  const [animatedBpmValue, setAnimatedBpmValue] = useState(0);
  const [activeChordIndex, setActiveChordIndex] = useState(0);
  const spotifySearchCacheRef = useRef<Map<string, SpotifySearchCacheEntry>>(
    new Map(),
  );
  const metronomeAudioContextRef = useRef<AudioContext | null>(null);
  const metronomeNoiseBufferRef = useRef<AudioBuffer | null>(null);
  const metronomeTimerRef = useRef<number | null>(null);
  const tapTempoTimestampsRef = useRef<number[]>([]);
  const bpmAnimationFrameRef = useRef<number | null>(null);
  const variationTarget: VariationTarget = "full";
  const activeMainSection: "create" | "discover" =
    tab === "discover" ? "discover" : "create";
  const activeCreateSubTab: CreateSubTab =
    tab === "discover" ? lastCreateSubTab : tab;
  const selectedTrackTagContext = useMemo(() => {
    const track = spotifySelectedTrack;
    if (!track) {
      return {
        genreTags: [] as string[],
        moodTags: [] as string[],
        lastfmUrl: null as string | null,
        loading: false,
      };
    }

    const selectedSource = selectedTrackContext?.source;
    const selectedSourceId = selectedSource?.track?.id;
    const similarSource = similarFinderResult?.source;
    const similarSourceId = similarSource?.track?.id;

    const source =
      similarSourceId && track.id && similarSourceId === track.id
        ? similarSource
        : selectedSourceId && track.id && selectedSourceId === track.id
          ? selectedSource
          : null;

    if (!source) {
      return {
        genreTags: [] as string[],
        moodTags: [] as string[],
        lastfmUrl: null as string | null,
        loading: selectedTrackContextLoading,
      };
    }

    const genreTags = dedupeTags(source.genreTags ?? [], 5);
    const moodTags = dedupeTags(source.moodTags ?? [], 5);

    return {
      genreTags,
      moodTags,
      lastfmUrl: source?.lastfmUrl ?? null,
      loading: selectedTrackContextLoading,
    };
  }, [
    selectedTrackContext?.source,
    selectedTrackContextLoading,
    similarFinderResult?.source,
    spotifySelectedTrack,
  ]);
  const selectedSpotifyEmbedId = useMemo(() => {
    if (!spotifySelectedTrack) {
      return null;
    }
    return (
      spotifySelectedTrack.id ||
      extractSpotifyTrackIdFromUrl(spotifySelectedTrack.externalUrl)
    );
  }, [spotifySelectedTrack]);
  const selectedPreviewMode = useMemo<"audio" | "embed" | "none">(() => {
    if (!spotifySelectedTrack) {
      return "none";
    }
    if (spotifySelectedTrack.previewUrl) {
      return "audio";
    }
    if (selectedSpotifyEmbedId) {
      return "embed";
    }
    return "none";
  }, [selectedSpotifyEmbedId, spotifySelectedTrack]);
  const tapVisualBpm = tapTempoBpm ?? bpmFinderBpm;
  const tapBeatDurationSeconds = useMemo(() => {
    const beatMs = Math.max(240, Math.round(60000 / Math.max(1, tapVisualBpm)));
    return `${(beatMs / 1000).toFixed(3)}s`;
  }, [tapVisualBpm]);
  const tapFeedbackStyle = useMemo(
    () =>
      ({
        "--tap-beat-duration": tapBeatDurationSeconds,
      }) as CSSProperties,
    [tapBeatDurationSeconds],
  );

  useEffect(() => {
    if (!featureRoute) {
      return;
    }

    const nextState = featureRouteToTabState(featureRoute);
    setTab(nextState.tab);
    setDiscoverSubTab(nextState.discoverSubTab);
    if (nextState.tab !== "discover") {
      setLastCreateSubTab(nextState.tab);
    }
  }, [featureRoute]);

  useEffect(() => {
    if (tab !== "discover") {
      setLastCreateSubTab(tab);
    }
  }, [tab]);

  useEffect(() => {
    if (!(tab === "discover" && uploading)) {
      setAnalyzingStatusIndex(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      setAnalyzingStatusIndex(
        (previous) => (previous + 1) % ANALYZING_STEPS.length,
      );
    }, 1200);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [tab, uploading]);

  useEffect(() => {
    if (
      !(
        tab === "discover" &&
        discoverSubTab === "similar" &&
        similarFinderLoading
      )
    ) {
      setSimilarLoadingStepIndex(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      setSimilarLoadingStepIndex(
        (previous) => (previous + 1) % SIMILAR_LOADING_STEPS.length,
      );
    }, 1500);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [discoverSubTab, similarFinderLoading, tab]);

  useEffect(() => {
    if (!(tab === "starter" && starterGenerating)) {
      setStarterLoadingStepIndex(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      setStarterLoadingStepIndex(
        (previous) => (previous + 1) % STARTER_LOADING_STEPS.length,
      );
    }, 1200);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [starterGenerating, tab]);

  useEffect(() => {
    if (tab !== "discover" || discoverSubTab !== "analyzer" || !token) {
      setAnalyzerSearchLoading(false);
      setAnalyzerSearchError(null);
      setAnalyzerSpotifyResults([]);
      return;
    }

    const query = analyzerSearchQuery.trim();
    if (query.length < 2) {
      setAnalyzerSearchLoading(false);
      setAnalyzerSearchError(null);
      setAnalyzerSpotifyResults([]);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setAnalyzerSearchLoading(true);
      setAnalyzerSearchError(null);
      try {
        const tracks = await searchDiscoverSpotifyTracks(
          token,
          query,
          8,
          controller.signal,
        );
        if (!cancelled) {
          setAnalyzerSpotifyResults(tracks);
        }
      } catch (searchError) {
        if (
          searchError instanceof DOMException &&
          searchError.name === "AbortError"
        ) {
          return;
        }
        if (!cancelled) {
          setAnalyzerSpotifyResults([]);
          setAnalyzerSearchError(
            searchError instanceof Error
              ? searchError.message
              : "Analyzer search failed",
          );
        }
      } finally {
        if (!cancelled) {
          setAnalyzerSearchLoading(false);
        }
      }
    }, SPOTIFY_SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [analyzerSearchQuery, discoverSubTab, tab, token]);

  useEffect(() => {
    if (
      tab !== "discover" ||
      discoverSubTab !== "similar" ||
      spotifySearchLocked ||
      !token
    ) {
      setSpotifySearchResults([]);
      setSpotifySearching(false);
      setSpotifySearchError(null);
      return;
    }

    const query = spotifyQuery.trim();
    const cacheKey = query.toLowerCase();
    if (query.length < 2) {
      setSpotifySearchResults([]);
      setSpotifySearchError(null);
      return;
    }

    const cached = spotifySearchCacheRef.current.get(cacheKey);
    const now = Date.now();
    if (cached && now - cached.cachedAt <= SPOTIFY_SEARCH_CACHE_TTL_MS) {
      setSpotifySearchResults(cached.tracks);
      setSpotifySearching(false);
      setSpotifySearchError(null);
      return;
    }

    let prefixSeeded = false;
    for (const [cachedKey, entry] of spotifySearchCacheRef.current) {
      if (now - entry.cachedAt > SPOTIFY_SEARCH_CACHE_TTL_MS) {
        continue;
      }
      if (!cacheKey.startsWith(cachedKey) || entry.tracks.length === 0) {
        continue;
      }

      const filtered = entry.tracks.filter((track) => {
        const haystack =
          `${track.name} ${track.artists.join(" ")}`.toLowerCase();
        return haystack.includes(cacheKey);
      });
      if (filtered.length > 0) {
        setSpotifySearchResults(filtered);
        prefixSeeded = true;
        break;
      }
    }

    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setSpotifySearching(true);
      setSpotifySearchError(null);
      try {
        const tracks = await searchDiscoverSpotifyTracks(
          token,
          query,
          6,
          controller.signal,
        );
        if (!cancelled) {
          setSpotifySearchResults(tracks);
          spotifySearchCacheRef.current.set(cacheKey, {
            tracks,
            cachedAt: Date.now(),
          });

          if (spotifySearchCacheRef.current.size > 40) {
            const oldestKey = spotifySearchCacheRef.current.keys().next().value;
            if (oldestKey) {
              spotifySearchCacheRef.current.delete(oldestKey);
            }
          }
        }
      } catch (searchError) {
        if (
          searchError instanceof DOMException &&
          searchError.name === "AbortError"
        ) {
          return;
        }

        if (!cancelled) {
          if (!prefixSeeded) {
            setSpotifySearchResults([]);
          }
          setSpotifySearchError(
            searchError instanceof Error
              ? searchError.message
              : "Spotify search failed",
          );
        }
      } finally {
        if (!cancelled) {
          setSpotifySearching(false);
        }
      }
    }, SPOTIFY_SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [discoverSubTab, spotifyQuery, spotifySearchLocked, tab, token]);

  const clearMetronomeTimer = useCallback(() => {
    if (metronomeTimerRef.current !== null) {
      window.clearInterval(metronomeTimerRef.current);
      metronomeTimerRef.current = null;
    }
  }, []);

  const ensureMetronomeContext = useCallback(async () => {
    if (typeof window === "undefined") {
      return null;
    }

    const AudioContextClass = (window.AudioContext ||
      (window as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext) as typeof AudioContext | undefined;

    if (!AudioContextClass) {
      return null;
    }

    if (!metronomeAudioContextRef.current) {
      metronomeAudioContextRef.current = new AudioContextClass();
    }

    const context = metronomeAudioContextRef.current;
    if (context.state === "suspended") {
      await context.resume();
    }

    if (!metronomeNoiseBufferRef.current) {
      const length = Math.max(1, Math.floor(context.sampleRate * 0.06));
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const channel = buffer.getChannelData(0);
      for (let index = 0; index < length; index += 1) {
        const decay = 1 - index / length;
        channel[index] = (Math.random() * 2 - 1) * decay * decay;
      }
      metronomeNoiseBufferRef.current = buffer;
    }

    return context;
  }, []);

  const playMetronomeHit = useCallback(
    (context: AudioContext, sound: MetronomeSound) => {
      const now = context.currentTime;

      if (sound === "kick") {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(165, now);
        oscillator.frequency.exponentialRampToValueAtTime(52, now + 0.14);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(
          0.9 * metronomeVolume,
          now + 0.006,
        );
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
        oscillator.start(now);
        oscillator.stop(now + 0.17);
        return;
      }

      if (sound === "hats") {
        const noiseBuffer = metronomeNoiseBufferRef.current;
        if (!noiseBuffer) {
          return;
        }

        const source = context.createBufferSource();
        source.buffer = noiseBuffer;

        const highPass = context.createBiquadFilter();
        highPass.type = "highpass";
        highPass.frequency.setValueAtTime(6800, now);

        const bandPass = context.createBiquadFilter();
        bandPass.type = "bandpass";
        bandPass.frequency.setValueAtTime(9800, now);
        bandPass.Q.setValueAtTime(0.9, now);

        const gain = context.createGain();
        source.connect(highPass);
        highPass.connect(bandPass);
        bandPass.connect(gain);
        gain.connect(context.destination);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(
          0.42 * metronomeVolume,
          now + 0.0015,
        );
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);

        source.start(now);
        source.stop(now + 0.06);
        return;
      }

      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(1500, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(
        0.34 * metronomeVolume,
        now + 0.003,
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
      oscillator.start(now);
      oscillator.stop(now + 0.07);
    },
    [metronomeVolume],
  );

  const commitBpmFinderInput = useCallback(
    (rawInput: string) => {
      const parsed = Number.parseFloat(rawInput);
      if (!Number.isFinite(parsed)) {
        setBpmFinderInput(String(bpmFinderBpm));
        return;
      }
      const normalized = clampBpm(parsed);
      setBpmFinderBpm(normalized);
      setBpmFinderInput(String(normalized));
    },
    [bpmFinderBpm],
  );

  const handleTapTempo = useCallback(() => {
    setTapPulseTick((previous) => previous + 1);

    const now = performance.now();
    const previous = tapTempoTimestampsRef.current;

    const next =
      previous.length === 0 ||
      now - previous[previous.length - 1] > TAP_TEMPO_RESET_MS
        ? [now]
        : [...previous, now].slice(-8);

    tapTempoTimestampsRef.current = next;
    setTapTempoCount(next.length);

    if (next.length < 2) {
      return;
    }

    const intervals = next.slice(1).map((value, index) => value - next[index]);
    const averageInterval =
      intervals.reduce((accumulator, value) => accumulator + value, 0) /
      intervals.length;

    if (!Number.isFinite(averageInterval) || averageInterval <= 0) {
      return;
    }

    const detectedBpm = clampBpm(60000 / averageInterval);
    setTapTempoBpm(detectedBpm);
    setBpmFinderBpm(detectedBpm);
    setBpmFinderInput(String(detectedBpm));
  }, []);

  const handleResetTapTempo = useCallback(() => {
    tapTempoTimestampsRef.current = [];
    setTapTempoCount(0);
    setTapTempoBpm(null);
  }, []);

  const handleToggleMetronome = useCallback(async () => {
    if (metronomePlaying) {
      setMetronomePlaying(false);
      return;
    }

    const context = await ensureMetronomeContext();
    if (!context) {
      setError("Metronome is not supported in this browser.");
      return;
    }

    setError(null);
    setMetronomePlaying(true);
  }, [ensureMetronomeContext, metronomePlaying]);

  useEffect(() => {
    if (tab !== "discover" || discoverSubTab !== "bpm") {
      setMetronomePlaying(false);
    }
  }, [discoverSubTab, tab]);

  useEffect(() => {
    if (!metronomePlaying) {
      clearMetronomeTimer();
      return;
    }

    let cancelled = false;

    const startMetronome = async () => {
      const context = await ensureMetronomeContext();
      if (!context || cancelled) {
        return;
      }

      const intervalMs = Math.max(120, Math.round((60 / bpmFinderBpm) * 1000));
      const runBeat = () => {
        playMetronomeHit(context, metronomeSound);
        setMetronomePulse((previous) => previous + 1);
      };

      clearMetronomeTimer();
      runBeat();
      metronomeTimerRef.current = window.setInterval(runBeat, intervalMs);
    };

    void startMetronome();

    return () => {
      cancelled = true;
      clearMetronomeTimer();
    };
  }, [
    bpmFinderBpm,
    clearMetronomeTimer,
    ensureMetronomeContext,
    metronomePlaying,
    metronomeSound,
    playMetronomeHit,
  ]);

  useEffect(() => {
    if (tab !== "discover" || discoverSubTab !== "bpm") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") {
        return;
      }

      event.preventDefault();
      handleTapTempo();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [discoverSubTab, handleTapTempo, tab]);

  useEffect(() => {
    return () => {
      clearMetronomeTimer();
      if (metronomeAudioContextRef.current) {
        void metronomeAudioContextRef.current.close();
      }
      metronomeNoiseBufferRef.current = null;
    };
  }, [clearMetronomeTimer]);

  useEffect(() => {
    const target = analyzerResult?.bpm ?? 0;
    const startValue = animatedBpmValue;
    const startedAt = performance.now();
    const duration = 650;

    if (bpmAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(bpmAnimationFrameRef.current);
      bpmAnimationFrameRef.current = null;
    }

    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextValue = startValue + (target - startValue) * eased;
      setAnimatedBpmValue(nextValue);

      if (progress < 1) {
        bpmAnimationFrameRef.current = window.requestAnimationFrame(animate);
      } else {
        bpmAnimationFrameRef.current = null;
      }
    };

    bpmAnimationFrameRef.current = window.requestAnimationFrame(animate);

    return () => {
      if (bpmAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(bpmAnimationFrameRef.current);
        bpmAnimationFrameRef.current = null;
      }
    };
  }, [analyzerResult?.bpm]);

  useEffect(() => {
    if (!(tab === "discover" && discoverSubTab === "analyzer")) {
      setActiveChordIndex(0);
      return;
    }

    const chords = analyzerResult?.chordProgression ?? [];
    if (chords.length <= 1) {
      setActiveChordIndex(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      setActiveChordIndex((previous) => (previous + 1) % chords.length);
    }, 880);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [analyzerResult?.chordProgression, discoverSubTab, tab]);

  const loadAnalyzerHistoryFromStorage = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const raw = window.localStorage.getItem(ANALYZER_HISTORY_STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return;
      }

      const normalized = parsed
        .map((entry) => entry as Partial<AnalyzedHistoryEntry>)
        .filter(
          (entry): entry is AnalyzedHistoryEntry =>
            typeof entry?.id === "string" &&
            typeof entry?.fileName === "string" &&
            typeof entry?.analyzedAt === "string" &&
            Boolean(entry?.result),
        )
        .slice(0, MAX_HISTORY_ITEMS);

      setAnalyzerHistory(normalized);
      if (normalized.length > 0) {
        setAnalyzerResult(normalized[0].result);
        setAnalyzedFileName(normalized[0].fileName);
        setActiveAnalysisId(normalized[0].id);
      }
    } catch {
      // Ignore malformed local history payloads.
    }
  }, []);

  useEffect(() => {
    loadAnalyzerHistoryFromStorage();
  }, [loadAnalyzerHistoryFromStorage]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        ANALYZER_HISTORY_STORAGE_KEY,
        JSON.stringify(analyzerHistory.slice(0, MAX_HISTORY_ITEMS)),
      );
    } catch {
      // Ignore storage quota/privacy mode issues.
    }
  }, [analyzerHistory]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        FEATURE_CLEAR_CUTOFF_STORAGE_KEY,
        JSON.stringify(featureClearCutoffs),
      );
    } catch {
      // Ignore storage quota/privacy mode issues.
    }
  }, [featureClearCutoffs]);

  useEffect(() => {
    const run = async () => {
      const supabase = createClient();
      let { data } = await supabase.auth.getSession();
      let accessToken = data.session?.access_token;

      if (!accessToken) {
        await new Promise((resolve) => setTimeout(resolve, 700));
        const retry = await supabase.auth.getSession();
        data = retry.data;
        accessToken = data.session?.access_token;
      }

      if (!accessToken) {
        window.location.href = "/login";
        return;
      }

      setToken(accessToken);
      try {
        const [projectsData, meData] = await Promise.all([
          listProjects(accessToken),
          getMe(accessToken),
        ]);
        const clearCutoffs = readFeatureClearCutoffs();
        setFeatureClearCutoffs(clearCutoffs);
        setProjects(applyProjectHistoryPolicy(projectsData, clearCutoffs));
        setMe(meData);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load dashboard",
        );
      }
    };

    void run();
  }, []);

  const activePollingProjectIds = useMemo(() => {
    const ids = new Set(
      projects
        .filter(
          (project) =>
            project.status === "pending" || project.status === "processing",
        )
        .map((project) => project.id),
    );

    Object.entries(generatingByProject).forEach(([projectId, targets]) => {
      if (targets.length > 0) {
        ids.add(projectId);
      }
    });

    return Array.from(ids);
  }, [generatingByProject, projects]);

  useEffect(() => {
    if (!token || activePollingProjectIds.length === 0) {
      return;
    }

    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      if (cancelled) {
        return;
      }

      if (document.visibilityState !== "visible") {
        timeout = setTimeout(poll, POLL_MS);
        return;
      }

      try {
        const updates = await Promise.all(
          activePollingProjectIds.map((id) => getProject(id, token)),
        );
        if (cancelled) {
          return;
        }

        const updateMap = new Map(updates.map((update) => [update.id, update]));
        setProjects((previous) =>
          previous.map((project) => updateMap.get(project.id) ?? project),
        );
      } catch {
        // Keep polling on transient failures.
      } finally {
        timeout = setTimeout(poll, POLL_MS);
      }
    };

    timeout = setTimeout(poll, POLL_MS);

    return () => {
      cancelled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [activePollingProjectIds, token]);

  const handleUpload = useCallback(
    async (file: File) => {
      if (!token) {
        return;
      }
      if (tab === "discover") {
        setError(null);
        setUploading(true);
        setAnalyzerResult(null);
        setAnalyzedFileName(file.name);
        setAnalyzingStartedAt(Date.now());
        try {
          const { analyzeTrackInBrowser } =
            await import("@/lib/audio/trackAnalyzer");
          const result = await analyzeTrackInBrowser(file, {
            segmentSeconds: 30,
            targetSampleRate: 24000,
            accuracyMode: "high",
          });

          const historyEntry: AnalyzedHistoryEntry = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            fileName: file.name,
            analyzedAt: new Date().toISOString(),
            result,
          };

          setAnalyzerHistory((previous) =>
            [historyEntry, ...previous].slice(0, MAX_HISTORY_ITEMS),
          );
          setActiveAnalysisId(historyEntry.id);
          setAnalyzerResult(result);
        } catch (analyzeError) {
          setError(
            analyzeError instanceof Error
              ? analyzeError.message
              : "Track analysis failed",
          );
        } finally {
          setAnalyzingStartedAt(null);
          setUploading(false);
        }
        return;
      }
      if (!me) {
        return;
      }
      if (!me.unlimited_credits && me.remaining_credits <= 0) {
        setError("No credits left. Upgrade to continue.");
        return;
      }

      setError(null);
      setUploading(true);
      try {
        if (tab === "starter") {
          setError("Use Track Starter Generator controls for this tab.");
          return;
        }
        if (tab === "extraction" && extractStems.length === 0) {
          setError("Select at least one stem.");
          return;
        }

        const accepted = await uploadProject(file, token, {
          feature: tab,
          extractStems,
          variationTarget,
        });
        const project = await getProject(accepted.project_id, token);
        setProjects((previous) => limitProjectHistory([project, ...previous]));
        setMe((previous) =>
          previous
            ? {
                ...previous,
                remaining_credits: previous.unlimited_credits
                  ? previous.remaining_credits
                  : Math.max(0, previous.remaining_credits - 1),
              }
            : previous,
        );
      } catch (uploadError) {
        setError(
          uploadError instanceof Error ? uploadError.message : "Upload failed",
        );
      } finally {
        setUploading(false);
      }
    },
    [extractStems, me, tab, token, variationTarget],
  );

  const visibleProjects = useMemo(
    () =>
      tab === "discover"
        ? []
        : projects.filter((project) => project.feature === tab),
    [projects, tab],
  );

  const toggleExtractStem = useCallback((stem: ExtractionStem) => {
    setExtractStems((previous) =>
      previous.includes(stem)
        ? previous.filter((value) => value !== stem)
        : [...previous, stem],
    );
  }, []);

  const handleGenerateStemMidi = useCallback(
    async (
      projectId: string,
      target: "melody" | "chord" | "bass" | "piano" | "guitar",
    ) => {
      if (!token) {
        return;
      }

      setGeneratingByProject((previous) => {
        const existing = previous[projectId] ?? [];
        if (existing.includes(target)) {
          return previous;
        }
        return {
          ...previous,
          [projectId]: [...existing, target],
        };
      });

      try {
        await generateStemMidi(projectId, target, token);
        setProjects((previous) =>
          previous.map((project) => {
            if (project.id !== projectId) {
              return project;
            }

            return {
              ...project,
              status: "processing",
              options: {
                ...(project.options ?? {}),
                processing_progress: {
                  percent: 45,
                  label: `Generating ${target} MIDI`,
                },
              },
            };
          }),
        );
      } catch (generationError) {
        setError(
          generationError instanceof Error
            ? generationError.message
            : "Failed to start MIDI generation",
        );
      } finally {
        setGeneratingByProject((previous) => ({
          ...previous,
          [projectId]: (previous[projectId] ?? []).filter(
            (value) => value !== target,
          ),
        }));
      }
    },
    [token],
  );

  const handleCancelProject = useCallback(
    async (projectId: string) => {
      if (!token) {
        return;
      }

      setCancellingByProject((previous) => ({
        ...previous,
        [projectId]: true,
      }));

      try {
        await cancelProject(projectId, token);
        const updated = await getProject(projectId, token);
        setProjects((previous) =>
          previous.map((project) =>
            project.id === projectId ? updated : project,
          ),
        );
        setMe((previous) =>
          previous
            ? {
                ...previous,
                remaining_credits: previous.unlimited_credits
                  ? previous.remaining_credits
                  : previous.remaining_credits + 1,
              }
            : previous,
        );
      } catch (cancelError) {
        setError(
          cancelError instanceof Error
            ? cancelError.message
            : "Failed to cancel project",
        );
      } finally {
        setCancellingByProject((previous) => ({
          ...previous,
          [projectId]: false,
        }));
      }
    },
    [token],
  );

  const handleDeleteProject = useCallback(
    async (projectId: string) => {
      if (!token) {
        return;
      }

      setDeletingByProject((previous) => ({
        ...previous,
        [projectId]: true,
      }));

      try {
        await deleteProject(projectId, token);
        setProjects((previous) =>
          previous.filter((project) => project.id !== projectId),
        );
      } catch (deleteError) {
        setError(
          deleteError instanceof Error
            ? deleteError.message
            : "Failed to delete project",
        );
      } finally {
        setDeletingByProject((previous) => ({
          ...previous,
          [projectId]: false,
        }));
      }
    },
    [token],
  );

  const handleClearHistory = useCallback(async () => {
    const clearFeature =
      tab === "extraction" || tab === "variation" || tab === "starter"
        ? tab
        : null;
    if (!clearFeature) {
      return;
    }

    const confirmed = window.confirm(
      `Clear all ${tab} projects from history? This cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    const targetProjectIds = projects
      .filter((project) => project.feature === clearFeature)
      .map((project) => project.id);
    const targetIdSet = new Set(targetProjectIds);
    const clearedAt = new Date().toISOString();

    setFeatureClearCutoffs((previous) => ({
      ...previous,
      [clearFeature]: clearedAt,
    }));

    // Clear matching cards immediately so the UI never appears stuck.
    setProjects((previous) =>
      previous.filter((project) => project.feature !== clearFeature),
    );
    setGeneratingByProject((previous) => omitProjectIds(previous, targetIdSet));
    setAlteringByProject((previous) => omitProjectIds(previous, targetIdSet));
    setCancellingByProject((previous) => omitProjectIds(previous, targetIdSet));
    setDeletingByProject((previous) => omitProjectIds(previous, targetIdSet));

    if (!token) {
      setError(
        "History cleared locally. Sign in again to sync server history.",
      );
      return;
    }

    setClearingHistory(true);
    try {
      await clearProjectHistory(token, clearFeature);
    } catch (clearError) {
      const results = await Promise.allSettled(
        targetProjectIds.map((projectId) => deleteProject(projectId, token)),
      );
      const failedCount = results.filter(
        (result) => result.status === "rejected",
      ).length;

      if (failedCount > 0) {
        setError(
          clearError instanceof Error
            ? `${clearError.message}. ${failedCount} item(s) could not be removed from server history.`
            : `Failed to clear server history for ${failedCount} item(s).`,
        );
      }
    } finally {
      setClearingHistory(false);
    }
  }, [projects, tab, token]);

  const handleAlterVariation = useCallback(
    async (
      projectId: string,
      target: VariationAlterTarget,
      key: string,
      bpm: number | null,
      intent: VariationIntent,
      strength: number | null,
      preserveIdentity: number | null,
      laneMove: VariationProducerMove,
      style: VariationStyle,
      creativity: number | null,
    ) => {
      if (!token) {
        return;
      }

      setAlteringByProject((previous) => ({
        ...previous,
        [projectId]: true,
      }));

      try {
        await alterVariationMidi(
          projectId,
          target,
          key,
          bpm,
          intent,
          strength,
          preserveIdentity,
          laneMove,
          style,
          creativity,
          token,
        );

        const updated = await getProject(projectId, token);
        setProjects((previous) =>
          previous.map((project) =>
            project.id === projectId ? updated : project,
          ),
        );
      } catch (alterError) {
        setError(
          alterError instanceof Error
            ? alterError.message
            : "Failed to alter variation",
        );
      } finally {
        setAlteringByProject((previous) => ({
          ...previous,
          [projectId]: false,
        }));
      }
    },
    [token],
  );

  const handleGenerateStarters = useCallback(async () => {
    if (!token || !me) {
      return;
    }
    if (!me.unlimited_credits && me.remaining_credits <= 0) {
      setError("No credits left. Upgrade to continue.");
      return;
    }

    const parsedBpm = Number.parseFloat(starterBpm);
    const bpm = Number.isFinite(parsedBpm) ? parsedBpm : 118;

    setError(null);
    setStarterGenerating(true);
    try {
      const accepted = await generateTrackStarterIdeas(token, {
        genre: starterGenre,
        mood: starterMood,
        bpm,
        key: starterKey.trim() || undefined,
        complexity: starterComplexity,
        bars: starterBars,
        referenceDescription: starterReference,
      });

      const generated = await Promise.all(
        accepted.project_ids.map((projectId) => getProject(projectId, token)),
      );
      setProjects((previous) =>
        limitProjectHistory([...generated, ...previous]),
      );
      setMe((previous) =>
        previous
          ? {
              ...previous,
              remaining_credits: previous.unlimited_credits
                ? previous.remaining_credits
                : Math.max(0, previous.remaining_credits - 1),
            }
          : previous,
      );
    } catch (starterError) {
      setError(
        starterError instanceof Error
          ? starterError.message
          : "Failed to generate starter ideas",
      );
    } finally {
      setStarterGenerating(false);
    }
  }, [
    me,
    starterBars,
    starterBpm,
    starterComplexity,
    starterGenre,
    starterKey,
    starterMood,
    starterReference,
    token,
  ]);

  const handleSelectAnalyzedHistory = useCallback(
    (entry: AnalyzedHistoryEntry) => {
      setAnalyzerResult(entry.result);
      setAnalyzedFileName(entry.fileName);
      setActiveAnalysisId(entry.id);
    },
    [],
  );

  const handleSelectAnalyzerSpotifyTrack = useCallback(
    async (track: SpotifyTrackSummary) => {
      if (!token || tab !== "discover" || discoverSubTab !== "analyzer") {
        return;
      }
      if (uploading) {
        return;
      }

      const selectedLabel = `${track.name} - ${track.artists.join(", ")}`;
      setAnalyzerSearchQuery(selectedLabel);
      setAnalyzerSearchError(null);
      setAnalyzerSpotifyResults([]);

      setError(null);
      setUploading(true);
      setAnalyzerResult(null);
      setAnalyzedFileName(selectedLabel);
      setAnalyzingStartedAt(Date.now());

      try {
        const result = await analyzeDiscoverSpotifyTrack(
          token,
          track.externalUrl || track.id,
        );

        const historyEntry: AnalyzedHistoryEntry = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          fileName: selectedLabel,
          analyzedAt: new Date().toISOString(),
          result,
        };

        setAnalyzerHistory((previous) =>
          [historyEntry, ...previous].slice(0, MAX_HISTORY_ITEMS),
        );
        setActiveAnalysisId(historyEntry.id);
        setAnalyzerResult(result);
      } catch (analyzeError) {
        setError(
          analyzeError instanceof Error
            ? analyzeError.message
            : "Track analysis failed",
        );
      } finally {
        setAnalyzingStartedAt(null);
        setUploading(false);
      }
    },
    [discoverSubTab, tab, token, uploading],
  );

  const handleClearAnalyzedHistory = useCallback(() => {
    const confirmed = window.confirm(
      "Clear all analyzed history? This cannot be undone.",
    );
    if (!confirmed) {
      return;
    }

    setAnalyzerHistory([]);
    setAnalyzerResult(null);
    setAnalyzedFileName("");
    setActiveAnalysisId(null);
  }, []);

  const handleSelectSpotifyTrack = useCallback(
    async (track: SpotifyTrackSummary) => {
      const selectedLabel = `${track.name} - ${track.artists.join(", ")}`;
      setSpotifyUrlInput(track.externalUrl || track.id);
      setSpotifyQuery(selectedLabel);
      setSpotifySelectedLabel(selectedLabel);
      setSpotifySelectedTrack(track);
      setSimilarFinderResult(null);
      setSelectedTrackContext(null);
      setSelectedTrackContextError(null);
      setSpotifySearchLocked(true);
      setSpotifySearchResults([]);
      setSpotifySearching(false);
      setSpotifySearchError(null);

      if (!token) {
        return;
      }

      setSelectedTrackContextLoading(true);
      try {
        const response = await fetchDiscoverSpotifyTrackContext(token, {
          spotify_track_input: track.externalUrl || track.id,
        });
        setSelectedTrackContext(response);
      } catch (contextError) {
        setSelectedTrackContext(null);
        setSelectedTrackContextError(
          contextError instanceof Error
            ? contextError.message
            : "Last.fm context lookup failed",
        );
      } finally {
        setSelectedTrackContextLoading(false);
      }
    },
    [token],
  );

  const handleFindSimilarSongs = useCallback(async () => {
    if (!token) {
      setError("Sign in is required to use Spotify Similar Track Finder.");
      return;
    }

    const spotifyInput = spotifyUrlInput.trim();
    if (!spotifyInput) {
      setError("Search and select a song first, or paste a Spotify track URL.");
      return;
    }

    setError(null);
    setSelectedTrackContextError(null);
    setSimilarFinderLoading(true);
    try {
      const response = await findSimilarDiscoverTracks(token, {
        spotify_track_input: spotifyInput || undefined,
        song_title: spotifySelectedTrack?.name || undefined,
        song_artist: spotifySelectedTrack?.artists?.[0] || undefined,
        limit: 28,
      });
      setSimilarFinderResult(response);
      if (response.source.track) {
        setSpotifySelectedTrack(response.source.track);
      }
      setSimilarVisibleCount(20);
    } catch (similarError) {
      setError(
        similarError instanceof Error
          ? similarError.message
          : "Failed to find similar songs",
      );
    } finally {
      setSimilarFinderLoading(false);
    }
  }, [setError, spotifyUrlInput, token]);

  const handleRippleClickCapture = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest("button") as HTMLElement | null;
      if (!button) {
        return;
      }

      const rect = button.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 0.55;
      const ripple = document.createElement("span");
      ripple.className = "ui-ripple";
      ripple.style.width = `${size}px`;
      ripple.style.height = `${size}px`;
      ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${event.clientY - rect.top - size / 2}px`;

      button.appendChild(ripple);
      window.setTimeout(() => {
        ripple.remove();
      }, 680);
    },
    [],
  );

  const analyzerKeyConfidencePercent = Math.max(
    0,
    Math.min(100, Math.round((analyzerResult?.keyConfidence ?? 0) * 100)),
  );
  const analyzerCircleRadius = 42;
  const analyzerCircleCircumference = 2 * Math.PI * analyzerCircleRadius;
  const analyzerCircleDashOffset =
    analyzerCircleCircumference * (1 - analyzerKeyConfidencePercent / 100);
  const analyzerSectionBounds = useMemo(() => {
    const sections = analyzerResult?.sections ?? [];
    if (sections.length === 0) {
      return { start: 0, end: 1, total: 1 };
    }
    const start = Math.min(...sections.map((section) => section.startSec));
    const end = Math.max(...sections.map((section) => section.endSec));
    return {
      start,
      end,
      total: Math.max(1, end - start),
    };
  }, [analyzerResult?.sections]);

  return (
    <main
      className="premium-dashboard-shell premium-ripple w-full px-2 py-8 sm:px-3 sm:py-10"
      onClickCapture={handleRippleClickCapture}
    >
      {showWorkspaceSwitcher ? (
        <>
          <section className="premium-hero mb-6 px-5 py-7 sm:px-7 sm:py-8">
            <div className="premium-hero-glow" aria-hidden="true" />
            <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="cyber-heading text-4xl font-bold tracking-tight text-white sm:text-5xl">
                    KeyTone
                  </h1>
                  {me?.is_admin ? (
                    <span className="rounded-full border border-cyan-300/40 bg-cyan-300/10 px-2 py-1 text-xs font-medium uppercase tracking-wide text-cyan-200">
                      Admin
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm text-slate-300 sm:text-base">
                  Create. Discover. Dominate Sound.
                </p>

                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setTab(lastCreateSubTab)}
                    className="premium-cta premium-cta-create"
                  >
                    Create Tools
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTab("discover");
                      setDiscoverSubTab("analyzer");
                    }}
                    className="premium-cta premium-cta-discover"
                  >
                    Discover Music
                  </button>
                </div>
              </div>

              <div className="glass rounded-xl px-4 py-3 text-sm">
                <p className="text-xs uppercase tracking-wide text-foreground/65">
                  Credits
                </p>
                <p className="mt-1 text-xl font-semibold text-cyan-100">
                  {me?.unlimited_credits
                    ? "Unlimited"
                    : (me?.remaining_credits ?? "...")}
                </p>
              </div>
            </div>
          </section>

          <div className="mb-5 grid gap-3 lg:grid-cols-2">
            <section
              className={`premium-panel premium-panel-discover overflow-hidden ${activeMainSection === "discover" ? "border-cyan-300/55" : "border-cyan-700/35"}`}
            >
              <button
                type="button"
                onClick={() => setTab("discover")}
                className={`w-full border-b px-4 py-3 text-left text-sm font-semibold uppercase tracking-[0.14em] transition ${
                  activeMainSection === "discover"
                    ? "border-cyan-300/40 text-cyan-100"
                    : "border-cyan-800/35 text-foreground/75 hover:text-cyan-100"
                }`}
              >
                Discover
              </button>

              <div className="grid gap-2 px-3 py-3 sm:grid-cols-2">
                {DISCOVER_SUBSECTIONS.map((item) => {
                  const isSelected =
                    tab === "discover" && discoverSubTab === item.tab;
                  return (
                    <button
                      key={item.tab}
                      type="button"
                      onClick={() => {
                        setTab("discover");
                        setDiscoverSubTab(item.tab);
                      }}
                      className={`premium-tool-card premium-tool-card-discover ${
                        isSelected
                          ? "premium-tool-card-active-discover"
                          : "border-cyan-800/35 text-foreground/75"
                      }`}
                    >
                      <span className="text-lg text-cyan-200/90">
                        {DISCOVER_TOOL_ICONS[item.tab]}
                      </span>
                      <p className="mt-1 text-xs uppercase tracking-wide text-cyan-100">
                        {item.label}
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>

            <section
              className={`premium-panel premium-panel-create overflow-hidden ${activeMainSection === "create" ? "border-pink-300/55" : "border-fuchsia-800/35"}`}
            >
              <button
                type="button"
                onClick={() => setTab(lastCreateSubTab)}
                className={`w-full border-b px-4 py-3 text-left text-sm font-semibold uppercase tracking-[0.14em] transition ${
                  activeMainSection === "create"
                    ? "border-pink-300/40 text-fuchsia-100"
                    : "border-fuchsia-800/35 text-foreground/75 hover:text-pink-100"
                }`}
              >
                Create
              </button>

              <div className="grid gap-2 px-3 py-3 sm:grid-cols-2">
                {CREATE_SUBSECTIONS.map((item) => {
                  const isSelected = activeCreateSubTab === item.tab;
                  return (
                    <button
                      key={item.tab}
                      type="button"
                      onClick={() => setTab(item.tab)}
                      className={`premium-tool-card premium-tool-card-create ${
                        isSelected
                          ? "premium-tool-card-active-create"
                          : "border-fuchsia-800/35 text-foreground/75"
                      }`}
                    >
                      <span className="text-lg text-pink-200/90">
                        {CREATE_TOOL_ICONS[item.tab]}
                      </span>
                      <p className="mt-1 text-xs uppercase tracking-wide text-pink-100">
                        {item.label}
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        </>
      ) : featureRoute ? (
        <section className="mb-5 rounded-xl border border-cyan-500/25 bg-black/40 p-4 sm:p-5">
          <p className="text-[11px] uppercase tracking-[0.14em] text-cyan-200/85">
            KeyTone Workspace
          </p>
          <h1 className="mt-1 cyber-heading text-xl font-semibold tracking-tight text-cyan-100 sm:text-2xl">
            {FEATURE_ROUTE_LABELS[featureRoute]}
          </h1>
        </section>
      ) : null}

      {tab === "extraction" ? (
        <section className="mb-4 rounded-xl border border-cyan-500/20 bg-black/35 p-4">
          <h2 className="text-sm font-medium text-cyan-100">Stem selection</h2>
          <p className="mt-1 text-xs text-foreground/70">
            Select stems to separate first. MIDI is generated later per stem on
            demand.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(
              ["bass", "drums", "other", "piano", "guitar", "vocals"] as const
            ).map((stem) => (
              <button
                key={stem}
                type="button"
                onClick={() => toggleExtractStem(stem)}
                className={`rounded-md border px-3 py-1.5 text-xs uppercase tracking-wide ${
                  extractStems.includes(stem)
                    ? "border-cyan-300/50 bg-cyan-500/15 text-cyan-100"
                    : "border-cyan-700/40 bg-black/30 text-foreground/70"
                }`}
              >
                {stem}
              </button>
            ))}
          </div>
        </section>
      ) : tab === "variation" ? (
        <section className="mb-4 rounded-xl border border-cyan-500/20 bg-black/35 p-4">
          <h2 className="text-sm font-medium text-cyan-100">
            Chord Improver flow
          </h2>
          <p className="mt-1 text-xs text-foreground/70">
            Upload MIDI first. Then choose target lane, mood mode, key, and
            intensity to generate Safe, Pro, and Bold chord upgrades with
            improved voicing and voice leading.
          </p>
        </section>
      ) : tab === "discover" ? (
        <section className="mb-4 rounded-xl border border-cyan-500/20 bg-black/35 p-4">
          <h2 className="text-sm font-medium text-cyan-100">
            {discoverSubTab === "analyzer"
              ? "Track Analyzer (Discover)"
              : discoverSubTab === "similar"
                ? "Similar Songs (Discover)"
                : "BPM Finder and Tapper (Discover)"}
          </h2>
          <p className="mt-1 text-xs text-foreground/70">
            {discoverSubTab === "analyzer"
              ? "Drop audio for balanced-accuracy Essentia.js analysis with multi-segment BPM and key consensus."
              : discoverSubTab === "similar"
                ? "Find similar references from Spotify + Last.fm in a dedicated Discover workflow."
                : "Use the metronome, drag BPM scroller, and tap tempo (spacebar or click) to lock in tempo fast."}
          </p>
        </section>
      ) : (
        <section className="relative mb-4 overflow-hidden rounded-2xl border border-fuchsia-400/28 bg-black/45 p-5 sm:p-6">
          <div
            className="pointer-events-none absolute inset-0"
            aria-hidden="true"
          >
            <div className="absolute -left-20 top-6 h-40 w-40 rounded-full bg-fuchsia-500/30 blur-3xl" />
            <div className="absolute right-[-3rem] top-12 h-44 w-44 rounded-full bg-cyan-400/26 blur-3xl" />
          </div>

          <div className="relative">
            <h2 className="text-sm font-medium text-cyan-100">
              Track Starter Generator
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-foreground/72">
              Generate safe, fresh, and experimental chord ideas in one click.
              Each idea includes chords-only MIDI so you can build the rest of
              the track your way.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-foreground/60">
                  Genre
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {STARTER_GENRES.map((genre) => (
                    <button
                      key={genre}
                      type="button"
                      onClick={() => setStarterGenre(genre)}
                      className={`rounded-full border px-3 py-1.5 text-xs uppercase tracking-wide transition-all duration-200 ${
                        starterGenre === genre
                          ? "scale-[1.03] border-cyan-300/65 bg-cyan-500/16 text-cyan-100 shadow-[0_0_16px_rgba(34,211,238,0.24)]"
                          : "border-cyan-700/40 bg-black/30 text-foreground/70 hover:border-cyan-500/55 hover:bg-cyan-500/9 hover:text-cyan-100"
                      }`}
                    >
                      {genre.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[11px] uppercase tracking-wide text-foreground/60">
                  Mood
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {STARTER_MOODS.map((mood) => (
                    <button
                      key={mood}
                      type="button"
                      onClick={() => setStarterMood(mood)}
                      className={`rounded-full border px-3 py-1.5 text-xs uppercase tracking-wide transition-all duration-200 ${
                        starterMood === mood
                          ? "scale-[1.03] border-cyan-300/65 bg-cyan-500/16 text-cyan-100 shadow-[0_0_16px_rgba(34,211,238,0.24)]"
                          : "border-cyan-700/40 bg-black/30 text-foreground/70 hover:border-cyan-500/55 hover:bg-cyan-500/9 hover:text-cyan-100"
                      }`}
                    >
                      {mood[0]?.toUpperCase()}
                      {mood.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="text-xs text-foreground/60">BPM</label>
                  <input
                    value={starterBpm}
                    onChange={(event) => setStarterBpm(event.target.value)}
                    inputMode="decimal"
                    className="mt-1.5 w-full rounded-md border border-cyan-700/40 bg-black/30 px-3 py-2 text-sm text-cyan-100 outline-none focus:border-cyan-300/50"
                  />
                </div>
                <div>
                  <p className="text-xs text-foreground/60">Complexity</p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {(["simple", "medium", "complex"] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() =>
                          setStarterComplexity(value as StarterComplexity)
                        }
                        className={`rounded-full border px-3 py-1.5 text-xs uppercase tracking-wide transition-all duration-200 ${
                          starterComplexity === value
                            ? "scale-[1.03] border-fuchsia-300/65 bg-fuchsia-500/14 text-fuchsia-100 shadow-[0_0_16px_rgba(217,70,239,0.22)]"
                            : "border-fuchsia-700/35 bg-black/30 text-foreground/70 hover:border-fuchsia-500/55 hover:bg-fuchsia-500/8 hover:text-fuchsia-100"
                        }`}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-foreground/60">Bars</p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {([8, 16] as const).map((bars) => (
                      <button
                        key={bars}
                        type="button"
                        onClick={() => setStarterBars(bars)}
                        className={`rounded-full border px-3 py-1.5 text-xs uppercase tracking-wide transition-all duration-200 ${
                          starterBars === bars
                            ? "scale-[1.03] border-cyan-300/65 bg-cyan-500/16 text-cyan-100 shadow-[0_0_16px_rgba(34,211,238,0.24)]"
                            : "border-cyan-700/40 bg-black/30 text-foreground/70 hover:border-cyan-500/55 hover:bg-cyan-500/9 hover:text-cyan-100"
                        }`}
                      >
                        {bars} bars
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs text-foreground/60">Key (optional)</p>
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  <button
                    type="button"
                    onClick={() => setStarterKey("")}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs uppercase tracking-wide transition-all duration-200 ${
                      starterKey.trim().length === 0
                        ? "scale-[1.03] border-cyan-300/65 bg-cyan-500/16 text-cyan-100 shadow-[0_0_16px_rgba(34,211,238,0.24)]"
                        : "border-cyan-700/40 bg-black/30 text-foreground/70 hover:border-cyan-500/55 hover:bg-cyan-500/9 hover:text-cyan-100"
                    }`}
                  >
                    Auto
                  </button>
                  {STARTER_KEYS.map((keyName) => (
                    <button
                      key={keyName}
                      type="button"
                      onClick={() => setStarterKey(keyName)}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs tracking-wide transition-all duration-200 ${
                        starterKey === keyName
                          ? "scale-[1.03] border-cyan-300/65 bg-cyan-500/16 text-cyan-100 shadow-[0_0_16px_rgba(34,211,238,0.24)]"
                          : "border-cyan-700/40 bg-black/30 text-foreground/70 hover:border-cyan-500/55 hover:bg-cyan-500/9 hover:text-cyan-100"
                      }`}
                    >
                      {keyName}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-foreground/60">
                  Reference description (optional)
                </label>
                <input
                  value={starterReference}
                  onChange={(event) => setStarterReference(event.target.value)}
                  placeholder="Warm neo-soul intro with emotional top line"
                  className="mt-1.5 w-full rounded-md border border-cyan-700/40 bg-black/30 px-3 py-2 text-sm text-cyan-100 outline-none focus:border-cyan-300/50"
                />
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => void handleGenerateStarters()}
                  disabled={starterGenerating}
                  className="starter-generate-btn disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {starterGenerating ? "Generating..." : "Generate"}
                </button>
              </div>

              {starterGenerating ? (
                <div className="similar-loading-shell rounded-xl border border-cyan-700/35 bg-black/35 p-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="similar-loading-spinner"
                      aria-hidden="true"
                    />
                    <div className="similar-loading-wave" aria-hidden="true">
                      <span className="similar-loading-wave-bar" />
                      <span className="similar-loading-wave-bar" />
                      <span className="similar-loading-wave-bar" />
                      <span className="similar-loading-wave-bar" />
                      <span className="similar-loading-wave-bar" />
                    </div>
                    <p className="similar-loading-title text-xs uppercase tracking-[0.12em] text-cyan-100">
                      {STARTER_LOADING_STEPS[starterLoadingStepIndex]}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      )}

      {tab !== "starter" &&
      (tab !== "discover" || discoverSubTab === "analyzer") ? (
        tab === "discover" && discoverSubTab === "analyzer" ? (
          <article className="scanner-shell mt-2 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.15em] text-cyan-200/85">
                  Scanner Input
                </p>
                <h3 className="mt-1 text-sm font-semibold text-cyan-100">
                  Drop audio or scan a track
                </h3>
              </div>
              <div className="scanner-wave" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
            <UploadDropzone
              onFileAccepted={handleUpload}
              mode="audio"
              disabled={uploading}
              message="Drop audio or scan a track"
              className="mt-3 border-cyan-300/55 bg-black/35"
            />
            <p className="mt-2 text-xs text-cyan-100/75">
              High-accuracy analysis is enabled for stronger BPM and key
              confidence.
            </p>
          </article>
        ) : (
          <>
            <UploadDropzone
              onFileAccepted={handleUpload}
              mode={tab === "variation" ? "audioOrMidi" : "audio"}
              disabled={
                uploading ||
                (tab !== "discover" &&
                  !me?.unlimited_credits &&
                  (me?.remaining_credits ?? 0) <= 0)
              }
            />
            {tab === "extraction" ? (
              <p className="mt-2 text-xs text-foreground/65">
                For optimized MIDI processing, keep uploads under 1 minute, use
                high-quality audio, and prefer isolated instruments.
              </p>
            ) : null}
          </>
        )
      ) : null}

      {tab === "discover" &&
      discoverSubTab === "analyzer" &&
      analyzerHistory.length > 0 ? (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleClearAnalyzedHistory}
            className="rounded-md border border-cyan-700/40 bg-black/30 px-3 py-1.5 text-xs uppercase tracking-wide text-foreground/70 transition hover:border-cyan-500/45 hover:text-cyan-100"
          >
            Clear analyzed
          </button>
        </div>
      ) : tab !== "discover" && visibleProjects.length > 0 ? (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => void handleClearHistory()}
            disabled={clearingHistory}
            className="rounded-md border border-cyan-700/40 bg-black/30 px-3 py-1.5 text-xs uppercase tracking-wide text-foreground/70 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {clearingHistory ? "Clearing..." : `Clear ${tab} history`}
          </button>
        </div>
      ) : null}

      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}

      {tab === "discover" ? (
        <section className="mt-8 space-y-4">
          {discoverSubTab === "similar" ? (
            <article className="glass rounded-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-medium text-cyan-100">
                    Similar Songs Finder (Spotify + Last.fm)
                  </h3>
                  <p className="mt-1 text-xs text-foreground/65">
                    Resolve a source song with Spotify and rank similar songs
                    with Last.fm relevance.
                  </p>
                </div>
              </div>

              <div className="mt-3">
                <label className="text-xs text-foreground/60">
                  Song search (main)
                </label>
                <input
                  value={spotifyQuery}
                  onFocus={() => {
                    if (spotifySearchLocked) {
                      setSpotifySearchLocked(false);
                      setSpotifySelectedTrack(null);
                      setSimilarFinderResult(null);
                      setSelectedTrackContext(null);
                      setSelectedTrackContextError(null);
                      setSelectedTrackContextLoading(false);
                      setSpotifySearchResults([]);
                      setSpotifySearchError(null);
                    }
                  }}
                  onChange={(event) => {
                    setSpotifyQuery(event.target.value);
                    if (spotifySearchLocked) {
                      setSpotifySearchLocked(false);
                      setSpotifySelectedTrack(null);
                      setSimilarFinderResult(null);
                      setSelectedTrackContext(null);
                      setSelectedTrackContextError(null);
                      setSelectedTrackContextLoading(false);
                    }
                  }}
                  placeholder="Search song / artist"
                  className="mt-1 w-full rounded-md border border-cyan-700/40 bg-black/30 px-3 py-2 text-sm text-cyan-100 outline-none focus:border-cyan-300/50"
                />
                {spotifySelectedLabel && spotifySearchLocked ? (
                  <p className="mt-1 text-[11px] text-cyan-200/85">
                    Selected: {spotifySelectedLabel}
                  </p>
                ) : null}

                {spotifySelectedTrack ? (
                  <article className="similar-preview-card mt-3 rounded-xl p-4">
                    <div className="flex flex-col gap-4 sm:flex-row">
                      <div className="shrink-0">
                        {spotifySelectedTrack.imageUrl ? (
                          <img
                            src={spotifySelectedTrack.imageUrl}
                            alt={`${spotifySelectedTrack.name} cover`}
                            className="h-28 w-28 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="flex h-28 w-28 items-center justify-center rounded-lg border border-cyan-700/40 bg-black/40 text-[11px] uppercase tracking-wide text-foreground/55">
                            No Cover
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-semibold text-cyan-100">
                          {spotifySelectedTrack.name}
                        </p>
                        <p className="mt-1 text-xs text-foreground/60">
                          Last.fm tags and preview are loaded when you select a
                          track.
                        </p>

                        <div className="mt-3 grid gap-2">
                          <div className="similar-preview-meta rounded-md px-2.5 py-2">
                            <p className="text-[10px] uppercase tracking-wide text-foreground/60">
                              Genre
                            </p>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {selectedTrackTagContext.genreTags.length > 0 ? (
                                selectedTrackTagContext.genreTags
                                  .slice(0, 5)
                                  .map((tag) => (
                                    <span
                                      key={`genre-${tag}`}
                                      className="similar-tag-pill"
                                    >
                                      {tag}
                                    </span>
                                  ))
                              ) : selectedTrackTagContext.loading ? (
                                <span className="text-[11px] text-foreground/55">
                                  Loading Last.fm genre tags...
                                </span>
                              ) : (
                                <span className="text-[11px] text-foreground/55">
                                  No Last.fm genre tags found
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="similar-preview-meta rounded-md px-2.5 py-2">
                            <p className="text-[10px] uppercase tracking-wide text-foreground/60">
                              Mood
                            </p>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {selectedTrackTagContext.moodTags.length > 0 ? (
                                selectedTrackTagContext.moodTags
                                  .slice(0, 5)
                                  .map((tag) => (
                                    <span
                                      key={`mood-${tag}`}
                                      className="similar-tag-pill similar-tag-pill-mood"
                                    >
                                      {tag}
                                    </span>
                                  ))
                              ) : selectedTrackTagContext.loading ? (
                                <span className="text-[11px] text-foreground/55">
                                  Loading Last.fm mood tags...
                                </span>
                              ) : (
                                <span className="text-[11px] text-foreground/55">
                                  No Last.fm mood tags found
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {spotifySelectedTrack.previewUrl ? (
                            <audio
                              className="w-full"
                              controls
                              preload="none"
                              src={spotifySelectedTrack.previewUrl}
                            />
                          ) : selectedSpotifyEmbedId ? (
                            <div className="w-full overflow-hidden rounded-md border border-cyan-700/40 bg-black/25">
                              <iframe
                                title={`${spotifySelectedTrack.name} Spotify player`}
                                src={`https://open.spotify.com/embed/track/${selectedSpotifyEmbedId}?utm_source=generator`}
                                width="100%"
                                height="80"
                                loading="lazy"
                                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                              />
                            </div>
                          ) : (
                            <p className="w-full text-[11px] text-foreground/55">
                              Inline preview is unavailable for this track.
                            </p>
                          )}
                          {selectedTrackTagContext.lastfmUrl ? (
                            <a
                              href={selectedTrackTagContext.lastfmUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs uppercase tracking-wide text-cyan-100 transition hover:border-cyan-300/60 hover:bg-cyan-500/20"
                            >
                              Open on Last.fm
                            </a>
                          ) : null}
                          {spotifySelectedTrack.externalUrl ? (
                            <a
                              href={spotifySelectedTrack.externalUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-md border border-cyan-700/40 bg-black/40 px-3 py-1.5 text-xs uppercase tracking-wide text-foreground/80 transition hover:border-cyan-300/50 hover:text-cyan-100"
                            >
                              Open Spotify
                            </a>
                          ) : null}
                        </div>
                        {!selectedTrackTagContext.lastfmUrl ? (
                          <p className="mt-1 text-[11px] text-foreground/55">
                            {selectedTrackTagContext.loading
                              ? "Looking up Last.fm preview link..."
                              : "No Last.fm preview link available for this track."}
                          </p>
                        ) : null}
                        {selectedTrackContextError ? (
                          <p className="mt-1 text-[11px] text-danger">
                            Last.fm context unavailable:{" "}
                            {selectedTrackContextError}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ) : null}

                {spotifySearching ? (
                  <p className="mt-2 text-xs text-foreground/65">
                    Searching Spotify tracks...
                  </p>
                ) : null}
                {spotifySearchError ? (
                  <p className="mt-2 text-xs text-danger">
                    {spotifySearchError}
                  </p>
                ) : null}

                {spotifySearchResults.length > 0 ? (
                  <div className="mt-2 max-h-44 space-y-2 overflow-auto pr-1">
                    {spotifySearchResults.map((track) => (
                      <button
                        key={track.id}
                        type="button"
                        onClick={() => void handleSelectSpotifyTrack(track)}
                        className="w-full rounded-md border border-cyan-700/40 bg-black/35 px-3 py-2 text-left text-xs text-foreground/80 transition hover:border-cyan-500/45 hover:text-cyan-100"
                      >
                        <div className="flex items-start gap-2">
                          {track.imageUrl ? (
                            <img
                              src={track.imageUrl}
                              alt={`${track.name} artwork`}
                              className="h-10 w-10 rounded-md object-cover"
                            />
                          ) : null}
                          <div>
                            <p className="font-medium">{track.name}</p>
                            <p className="mt-0.5 text-[11px] text-foreground/60">
                              {track.artists.join(", ")}{" "}
                              {track.albumName ? `- ${track.albumName}` : ""}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="mt-3">
                <label className="text-xs text-foreground/60">
                  Spotify track URL or ID (optional fallback)
                </label>
                <input
                  value={spotifyUrlInput}
                  onChange={(event) => setSpotifyUrlInput(event.target.value)}
                  placeholder="https://open.spotify.com/track/..."
                  className="mt-1 w-full rounded-md border border-cyan-700/40 bg-black/30 px-3 py-2 text-sm text-cyan-100 outline-none focus:border-cyan-300/50"
                />
                <p className="mt-1 text-[11px] text-foreground/55">
                  Search above and click a result, or paste a Spotify URL.
                </p>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleFindSimilarSongs()}
                  disabled={similarFinderLoading}
                  className="cyber-btn px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Find Similar Songs
                </button>
              </div>

              {similarFinderLoading ? (
                <div className="similar-loading-shell mt-3 rounded-xl border border-cyan-700/35 bg-black/35 p-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="similar-loading-spinner"
                      aria-hidden="true"
                    />
                    <div className="similar-loading-wave" aria-hidden="true">
                      <span className="similar-loading-wave-bar" />
                      <span className="similar-loading-wave-bar" />
                      <span className="similar-loading-wave-bar" />
                      <span className="similar-loading-wave-bar" />
                      <span className="similar-loading-wave-bar" />
                    </div>
                    <p className="similar-loading-title text-xs uppercase tracking-[0.12em] text-cyan-100">
                      {SIMILAR_LOADING_STEPS[similarLoadingStepIndex]}
                    </p>
                  </div>
                  <p className="similar-loading-subtitle mt-2 text-[11px] text-foreground/60">
                    Building similarity graph with Spotify and Last.fm signals.
                  </p>
                </div>
              ) : null}

              {similarFinderResult ? (
                <div className="mt-4 space-y-3">
                  <div className="rounded-md border border-cyan-700/40 bg-black/30 p-3 text-xs text-foreground/75">
                    <p className="font-medium text-cyan-100">
                      Source:{" "}
                      {similarFinderResult.source.track?.name ?? "Unknown"}
                    </p>
                    <p className="mt-1">
                      {(similarFinderResult.source.track?.artists ?? []).join(
                        ", ",
                      )}
                    </p>
                    <p className="mt-1 text-[11px] uppercase tracking-wide text-foreground/60">
                      Provider: Last.fm (normalized relevance)
                    </p>
                  </div>

                  {similarFinderResult.similarSongs.length > 0 ? (
                    <>
                      <div className="grid gap-3 lg:grid-cols-2">
                        {similarFinderResult.similarSongs
                          .slice(0, similarVisibleCount)
                          .map((item) => (
                            <article
                              key={`${item.title}-${item.artist}`}
                              className="similar-result-card rounded-xl border border-cyan-700/40 bg-black/30 p-3"
                            >
                              <>
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-start gap-3">
                                    {item.artworkUrl ? (
                                      <img
                                        src={item.artworkUrl}
                                        alt={`${item.title} artwork`}
                                        className="h-12 w-12 rounded-md object-cover"
                                      />
                                    ) : null}
                                    <div>
                                      <h4 className="text-sm font-medium text-cyan-100">
                                        {item.title}
                                      </h4>
                                      <p className="mt-0.5 text-xs text-foreground/70">
                                        {item.artist}
                                      </p>
                                    </div>
                                  </div>
                                  <span className="rounded-full border border-cyan-500/35 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-200">
                                    {Math.round(item.similarityScore * 100)}%
                                    match
                                  </span>
                                </div>

                                <div className="mt-2">
                                  <span className="rounded-full border border-cyan-700/35 bg-black/40 px-2 py-1 text-[10px] uppercase tracking-wide text-foreground/75">
                                    {item.matchLabel}
                                  </span>
                                </div>

                                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                  <div>
                                    <p className="text-[10px] uppercase tracking-wide text-foreground/55">
                                      Genre
                                    </p>
                                    <div className="mt-1 flex flex-wrap gap-1.5">
                                      {(item.genreTags ?? [])
                                        .slice(0, 5)
                                        .map((tag) => (
                                          <span
                                            key={`${item.title}-genre-${tag}`}
                                            className="similar-tag-pill"
                                          >
                                            {tag}
                                          </span>
                                        ))}
                                      {(item.genreTags ?? []).length === 0
                                        ? (item.sharedTags ?? [])
                                            .slice(0, 3)
                                            .map((tag) => (
                                              <span
                                                key={`${item.title}-shared-${tag}`}
                                                className="similar-tag-pill similar-tag-pill-related"
                                              >
                                                {tag}
                                              </span>
                                            ))
                                        : null}
                                      {(item.genreTags ?? []).length === 0 &&
                                      (item.sharedTags ?? []).length === 0 ? (
                                        <p className="text-[11px] text-foreground/55">
                                          Tags still loading...
                                        </p>
                                      ) : null}
                                    </div>
                                  </div>
                                  <div>
                                    <p className="text-[10px] uppercase tracking-wide text-foreground/55">
                                      Mood
                                    </p>
                                    <div className="mt-1 flex flex-wrap gap-1.5">
                                      {(item.moodTags ?? [])
                                        .slice(0, 5)
                                        .map((tag) => (
                                          <span
                                            key={`${item.title}-mood-${tag}`}
                                            className="similar-tag-pill similar-tag-pill-mood"
                                          >
                                            {tag}
                                          </span>
                                        ))}
                                      {(item.moodTags ?? []).length === 0 ? (
                                        <p className="text-[11px] text-foreground/55">
                                          Mood tags not available for this
                                          track.
                                        </p>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>

                                {item.similarityExplanation ? (
                                  <p className="mt-2 text-[11px] text-foreground/65">
                                    {item.similarityExplanation}
                                  </p>
                                ) : null}

                                <div className="mt-3 flex flex-wrap gap-2">
                                  {(() => {
                                    const spotifyEmbedId =
                                      item.spotifyTrack?.id ||
                                      extractSpotifyTrackIdFromUrl(
                                        item.externalUrl,
                                      );

                                    if (
                                      selectedPreviewMode === "embed" &&
                                      spotifyEmbedId
                                    ) {
                                      return (
                                        <div className="w-full overflow-hidden rounded-md border border-cyan-700/40 bg-black/25">
                                          <iframe
                                            title={`${item.title} Spotify player`}
                                            src={`https://open.spotify.com/embed/track/${spotifyEmbedId}?utm_source=generator`}
                                            width="100%"
                                            height="80"
                                            loading="lazy"
                                            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                                          />
                                        </div>
                                      );
                                    }

                                    if (
                                      selectedPreviewMode === "audio" &&
                                      item.previewUrl
                                    ) {
                                      return (
                                        <audio
                                          className="w-full"
                                          controls
                                          preload="none"
                                          src={item.previewUrl}
                                        />
                                      );
                                    }

                                    if (item.previewUrl) {
                                      return (
                                        <audio
                                          className="w-full"
                                          controls
                                          preload="none"
                                          src={item.previewUrl}
                                        />
                                      );
                                    }

                                    if (spotifyEmbedId) {
                                      return (
                                        <div className="w-full overflow-hidden rounded-md border border-cyan-700/40 bg-black/25">
                                          <iframe
                                            title={`${item.title} Spotify player`}
                                            src={`https://open.spotify.com/embed/track/${spotifyEmbedId}?utm_source=generator`}
                                            width="100%"
                                            height="80"
                                            loading="lazy"
                                            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                                          />
                                        </div>
                                      );
                                    }

                                    if (item.providerUrl) {
                                      return (
                                        <a
                                          href={item.providerUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="inline-block rounded-md border border-cyan-500/35 bg-cyan-500/10 px-3 py-1.5 text-xs uppercase tracking-wide text-cyan-100 hover:border-cyan-300/55"
                                        >
                                          Open on Last.fm
                                        </a>
                                      );
                                    }

                                    return (
                                      <p className="w-full text-[11px] text-foreground/55">
                                        Inline preview is unavailable for this
                                        track.
                                      </p>
                                    );
                                  })()}

                                  {item.externalUrl ? (
                                    <a
                                      href={item.externalUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-block rounded-md border border-cyan-700/40 bg-black/40 px-3 py-1.5 text-xs uppercase tracking-wide text-cyan-100 hover:border-cyan-300/50"
                                    >
                                      Open Track
                                    </a>
                                  ) : null}
                                  {item.providerUrl ? (
                                    <a
                                      href={item.providerUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-block rounded-md border border-cyan-700/40 bg-black/40 px-3 py-1.5 text-xs uppercase tracking-wide text-foreground/80 hover:border-cyan-300/50 hover:text-cyan-100"
                                    >
                                      Last.fm
                                    </a>
                                  ) : null}
                                </div>
                              </>
                            </article>
                          ))}
                      </div>
                      {similarFinderResult.similarSongs.length >
                      similarVisibleCount ? (
                        <div className="mt-3 flex justify-center">
                          <button
                            type="button"
                            onClick={() =>
                              setSimilarVisibleCount((previous) =>
                                Math.min(
                                  previous + 20,
                                  similarFinderResult.similarSongs.length,
                                ),
                              )
                            }
                            className="rounded-md border border-cyan-700/40 bg-black/35 px-4 py-2 text-xs uppercase tracking-wide text-cyan-100 transition hover:border-cyan-300/50"
                          >
                            Load more
                          </button>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-xs text-foreground/65">
                      No similar songs were returned for this source.
                    </p>
                  )}
                </div>
              ) : null}
            </article>
          ) : null}

          {discoverSubTab === "bpm" ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <article className="glass rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium text-cyan-100">
                      BPM Finder Metronome
                    </h3>
                    <p className="mt-1 text-xs text-foreground/65">
                      Drag, type, or tap to set BPM. Then hit play and audition
                      the pulse.
                    </p>
                  </div>
                  <span
                    className={`h-3 w-3 rounded-full border transition ${
                      metronomePlaying && metronomePulse % 2 === 1
                        ? "border-cyan-200 bg-cyan-300 shadow-[0_0_14px_rgba(125,211,252,0.8)]"
                        : "border-cyan-700/50 bg-black/30"
                    }`}
                  />
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div>
                    <label className="text-xs text-foreground/60">
                      Drag BPM scroller ({BPM_FINDER_MIN} to {BPM_FINDER_MAX})
                    </label>
                    <input
                      type="range"
                      min={BPM_FINDER_MIN}
                      max={BPM_FINDER_MAX}
                      value={bpmFinderBpm}
                      onChange={(event) => {
                        const nextBpm = clampBpm(Number(event.target.value));
                        setBpmFinderBpm(nextBpm);
                        setBpmFinderInput(String(nextBpm));
                      }}
                      className="mt-2 h-2 w-full cursor-ew-resize appearance-none rounded-full bg-cyan-900/40 accent-cyan-300"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-foreground/60">
                      Type BPM
                    </label>
                    <input
                      value={bpmFinderInput}
                      onChange={(event) =>
                        setBpmFinderInput(event.target.value)
                      }
                      onBlur={() => commitBpmFinderInput(bpmFinderInput)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          commitBpmFinderInput(bpmFinderInput);
                        }
                      }}
                      inputMode="numeric"
                      className="mt-1 w-24 rounded-md border border-cyan-700/40 bg-black/30 px-3 py-1.5 text-right text-sm text-cyan-100 outline-none focus:border-cyan-300/50"
                    />
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wide text-foreground/65">
                    Current BPM
                  </span>
                  <strong className="text-xl text-cyan-100">
                    {bpmFinderBpm}
                  </strong>
                </div>

                <div className="mt-4">
                  <p className="text-xs text-foreground/60">Metronome sound</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(["tick", "hats", "kick"] as const).map((sound) => (
                      <button
                        key={sound}
                        type="button"
                        onClick={() => setMetronomeSound(sound)}
                        className={`rounded-md border px-3 py-1.5 text-xs uppercase tracking-wide transition ${
                          metronomeSound === sound
                            ? "border-cyan-300/55 bg-cyan-500/20 text-cyan-100"
                            : "border-cyan-700/40 bg-black/30 text-foreground/70 hover:border-cyan-500/45 hover:text-cyan-100"
                        }`}
                      >
                        {sound}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-xs text-foreground/60">
                      Metronome volume
                    </label>
                    <span className="text-xs text-cyan-100">
                      {Math.round(metronomeVolume * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={metronomeVolume}
                    onChange={(event) => {
                      const next = Number.parseFloat(event.target.value);
                      if (!Number.isFinite(next)) {
                        return;
                      }
                      setMetronomeVolume(Math.max(0, Math.min(1, next)));
                    }}
                    className="mt-2 h-2 w-full appearance-none rounded-full bg-cyan-900/40 accent-cyan-300"
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleToggleMetronome()}
                    className="cyber-btn px-4 py-2 text-xs"
                  >
                    {metronomePlaying ? "Stop Metronome" : "Start Metronome"}
                  </button>
                  <p className="text-[11px] text-foreground/60">
                    Interval: {(60000 / bpmFinderBpm).toFixed(1)} ms per beat
                  </p>
                </div>
              </article>

              <article className="glass rounded-xl p-4">
                <h3 className="text-sm font-medium text-cyan-100">Tap Tempo</h3>
                <p className="mt-1 text-xs text-foreground/65">
                  Press spacebar or click repeatedly in rhythm to detect BPM.
                </p>

                <button
                  type="button"
                  onClick={handleTapTempo}
                  style={{
                    ...tapFeedbackStyle,
                    animationName:
                      tapPulseTick % 2 === 0
                        ? "tap-hit-press-a"
                        : "tap-hit-press-b",
                  }}
                  className="tap-tempo-hit-zone mt-4 w-full rounded-xl border border-cyan-500/35 bg-cyan-500/10 px-4 py-8 text-center transition hover:border-cyan-300/55 hover:bg-cyan-500/20"
                >
                  {tapPulseTick > 0 ? (
                    <>
                      <span
                        key={`tap-glow-${tapPulseTick}`}
                        className="tap-tempo-glow-pulse"
                        aria-hidden="true"
                      />
                      <span
                        key={`tap-ripple-${tapPulseTick}`}
                        className="tap-tempo-ripple"
                        aria-hidden="true"
                      />
                    </>
                  ) : null}
                  <p className="text-sm font-medium text-cyan-100">Tap Here</p>
                  <p className="mt-1 text-xs text-foreground/65">
                    Click repeatedly or hit spacebar
                  </p>
                </button>

                <div
                  style={tapFeedbackStyle}
                  className="tap-bpm-visual mt-4 rounded-xl border border-cyan-700/40 bg-black/30 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="tap-bpm-orb" aria-hidden="true" />
                    <div className="tap-bpm-bars" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                      <span />
                      <span />
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-foreground/60">
                        Pulse Feedback
                      </p>
                      <p className="mt-1 text-xs text-cyan-100">
                        Synced to {tapVisualBpm} BPM
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md border border-cyan-700/40 bg-black/30 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-foreground/60">
                      Detected BPM
                    </p>
                    <p className="mt-1 text-lg font-semibold text-cyan-100">
                      {tapTempoBpm ?? "-"}
                    </p>
                  </div>
                  <div className="rounded-md border border-cyan-700/40 bg-black/30 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-foreground/60">
                      Tap Count
                    </p>
                    <p className="mt-1 text-lg font-semibold text-cyan-100">
                      {tapTempoCount}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleResetTapTempo}
                    className="rounded-md border border-cyan-700/40 bg-black/35 px-3 py-1.5 text-xs uppercase tracking-wide text-cyan-100 transition hover:border-cyan-300/50"
                  >
                    Reset Taps
                  </button>
                  <p className="text-[11px] text-foreground/60">
                    Tapping auto-updates the metronome BPM.
                  </p>
                </div>
              </article>
            </div>
          ) : null}

          {discoverSubTab === "analyzer" ? (
            <>
              <article className="glass rounded-xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-medium text-cyan-100">
                      Reference Search (Spotify)
                    </h3>
                    <p className="mt-1 text-xs text-foreground/65">
                      Search a Spotify track and select it to analyze.
                    </p>
                  </div>
                </div>

                <div className="mt-3">
                  <input
                    value={analyzerSearchQuery}
                    onChange={(event) =>
                      setAnalyzerSearchQuery(event.target.value)
                    }
                    placeholder="Search on Spotify"
                    className="w-full rounded-md border border-cyan-700/40 bg-black/30 px-3 py-2 text-sm text-cyan-100 outline-none focus:border-cyan-300/50"
                  />
                </div>

                {analyzerSearchLoading ? (
                  <p className="mt-2 text-xs text-foreground/65">
                    Searching Spotify...
                  </p>
                ) : null}
                {analyzerSearchError ? (
                  <p className="mt-2 text-xs text-danger">
                    {analyzerSearchError}
                  </p>
                ) : null}

                {analyzerSpotifyResults.length > 0 ? (
                  <div className="mt-3 max-h-56 space-y-2 overflow-auto pr-1">
                    {analyzerSpotifyResults.map((track) => (
                      <div
                        key={track.id}
                        className="flex items-start justify-between gap-3 rounded-md border border-cyan-700/40 bg-black/35 px-3 py-2"
                      >
                        <button
                          type="button"
                          disabled={uploading}
                          onClick={() =>
                            void handleSelectAnalyzerSpotifyTrack(track)
                          }
                          className="flex flex-1 items-start gap-2 text-left"
                        >
                          {track.imageUrl ? (
                            <img
                              src={track.imageUrl}
                              alt={`${track.name} artwork`}
                              className="h-10 w-10 rounded-md object-cover"
                            />
                          ) : null}
                          <div>
                            <p className="text-xs font-medium text-cyan-100">
                              {track.name}
                            </p>
                            <p className="mt-0.5 text-[11px] text-foreground/60">
                              {track.artists.join(", ")}
                            </p>
                            <p className="mt-1 text-[10px] text-foreground/55">
                              Click to analyze this track
                            </p>
                          </div>
                        </button>
                        {track.externalUrl ? (
                          <a
                            href={track.externalUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                            className="rounded-md border border-cyan-700/40 bg-black/40 px-2 py-1 text-[10px] uppercase tracking-wide text-cyan-100 hover:border-cyan-300/50"
                          >
                            Open
                          </a>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>

              {analyzerHistory.length > 0 ? (
                <article className="glass rounded-xl p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-medium text-cyan-100">
                      Analyzed History
                    </h3>
                    <p className="text-xs text-foreground/60">
                      {analyzerHistory.length} item
                      {analyzerHistory.length === 1 ? "" : "s"}
                    </p>
                  </div>

                  <div className="mt-3 max-h-48 space-y-2 overflow-auto pr-1">
                    {analyzerHistory.map((entry) => {
                      const isActive = activeAnalysisId === entry.id;
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => handleSelectAnalyzedHistory(entry)}
                          className={`w-full rounded-md border px-3 py-2 text-left text-xs transition ${
                            isActive
                              ? "border-cyan-300/55 bg-cyan-500/15 text-cyan-100"
                              : "border-cyan-700/40 bg-black/30 text-foreground/75 hover:border-cyan-500/45 hover:text-cyan-100"
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium">
                              {entry.fileName}
                            </span>
                            <span className="text-[11px] text-foreground/60">
                              {new Date(entry.analyzedAt).toLocaleString()}
                            </span>
                          </div>
                          <div className="mt-1 text-[11px] text-foreground/65">
                            BPM {entry.result.bpm.toFixed(2)} | Key{" "}
                            {entry.result.key}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </article>
              ) : null}

              {uploading ? (
                <article className="glass overflow-hidden rounded-xl p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-medium text-cyan-100">
                        Analyzing Track
                      </h3>
                      <p className="mt-1 text-xs text-foreground/65">
                        {analyzedFileName || "Uploaded audio"}
                      </p>
                    </div>
                    <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[11px] uppercase tracking-wide text-cyan-200">
                      In progress
                    </span>
                  </div>

                  <div className="mt-4 flex items-end gap-1.5">
                    {[12, 20, 16, 26, 18, 24, 14].map((height, index) => (
                      <span
                        key={height}
                        className="w-1.5 rounded-full bg-cyan-300/75 animate-pulse"
                        style={{
                          height,
                          animationDuration: `${700 + index * 120}ms`,
                          animationDelay: `${index * 70}ms`,
                        }}
                      />
                    ))}
                  </div>

                  <p className="mt-3 text-sm text-cyan-100">
                    {ANALYZING_STEPS[analyzingStatusIndex]}
                  </p>
                  <p className="mt-1 text-xs text-foreground/65">
                    This can take a few extra seconds for better key and tempo
                    precision.
                  </p>

                  <div className="mt-4 h-2 w-full overflow-hidden rounded-full border border-cyan-700/40 bg-black/35">
                    <div
                      className="h-full w-2/5 animate-pulse rounded-full bg-cyan-300/60"
                      style={{
                        transform: `translateX(${(analyzingStatusIndex % 4) * 35}%)`,
                        transition: "transform 900ms ease",
                      }}
                    />
                  </div>

                  <p className="mt-2 text-[11px] text-foreground/60">
                    Elapsed:{" "}
                    {analyzingStartedAt
                      ? `${Math.max(0, Math.floor((Date.now() - analyzingStartedAt) / 1000))}s`
                      : "0s"}
                  </p>
                </article>
              ) : analyzerResult ? (
                <div className="space-y-4">
                  <article className="glass rounded-xl p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.14em] text-cyan-200/85">
                          Scanner Results
                        </p>
                        <h3 className="mt-1 text-base font-semibold text-cyan-100">
                          Analyzer Summary
                        </h3>
                        <p className="mt-1 text-xs text-foreground/65">
                          {analyzedFileName || "Uploaded audio"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <article className="rounded-xl border border-cyan-500/35 bg-black/35 p-4 shadow-[0_0_28px_rgba(6,182,212,0.12)]">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-foreground/60">
                          BPM
                        </p>
                        <p className="mt-2 text-4xl font-semibold leading-none text-cyan-100">
                          {animatedBpmValue.toFixed(2)}
                        </p>
                        <p className="mt-2 text-xs text-cyan-200/90">
                          Confidence{" "}
                          {Math.round(analyzerResult.bpmConfidence * 100)}%
                        </p>
                        <p className="mt-1 text-[11px] text-foreground/60">
                          Double-time {(analyzerResult.bpm * 2).toFixed(2)}
                        </p>
                      </article>

                      <article className="rounded-xl border border-cyan-500/35 bg-black/35 p-4 shadow-[0_0_28px_rgba(59,130,246,0.12)]">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-foreground/60">
                          Key
                        </p>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-2xl font-semibold text-cyan-100">
                              {analyzerResult.key}
                            </p>
                            <p className="mt-1 text-xs text-cyan-200/90">
                              Relative {analyzerResult.relativeKey}
                            </p>
                            <p className="mt-1 text-[11px] text-foreground/60">
                              Tempo Stability{" "}
                              {Math.round(
                                (analyzerResult.tempoStability ?? 0) * 100,
                              )}
                              %
                            </p>
                          </div>

                          <div className="relative h-24 w-24 shrink-0">
                            <svg
                              viewBox="0 0 100 100"
                              className="h-full w-full -rotate-90"
                            >
                              <circle
                                cx="50"
                                cy="50"
                                r={analyzerCircleRadius}
                                stroke="rgba(56,189,248,0.2)"
                                strokeWidth="8"
                                fill="none"
                              />
                              <circle
                                cx="50"
                                cy="50"
                                r={analyzerCircleRadius}
                                stroke="rgba(34,211,238,0.95)"
                                strokeWidth="8"
                                fill="none"
                                strokeLinecap="round"
                                strokeDasharray={analyzerCircleCircumference}
                                strokeDashoffset={analyzerCircleDashOffset}
                                style={{
                                  transition: "stroke-dashoffset 320ms ease",
                                }}
                              />
                            </svg>
                            <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-cyan-100">
                              {analyzerKeyConfidencePercent}%
                            </span>
                          </div>
                        </div>
                      </article>
                    </div>
                  </article>

                  <article className="glass rounded-xl p-4">
                    <h3 className="text-sm font-medium text-cyan-100">
                      Alternate Keys
                    </h3>
                    {analyzerResult.alternateKeys.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {analyzerResult.alternateKeys.map((item) => (
                          <span
                            key={item.key}
                            className="rounded-md border border-cyan-700/40 bg-black/35 px-2 py-1 text-xs text-cyan-100"
                          >
                            {item.key} ({Math.round(item.confidence * 100)}%){" "}
                            {item.relation}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-foreground/65">
                        No strong alternate-key candidates detected.
                      </p>
                    )}
                  </article>

                  <article className="glass rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-cyan-100">
                      Chord Progression
                    </h3>
                    {analyzerResult.chordProgression.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {analyzerResult.chordProgression.map((chord, index) => {
                          const isActive = index === activeChordIndex;
                          return (
                            <span
                              key={`${chord}-${index}`}
                              className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                                isActive
                                  ? "border-cyan-300/65 bg-cyan-500/20 text-cyan-100 shadow-[0_0_16px_rgba(34,211,238,0.24)]"
                                  : "border-cyan-700/40 bg-black/30 text-foreground/75"
                              }`}
                            >
                              {chord}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-foreground/65">
                        No stable progression detected.
                      </p>
                    )}
                  </article>

                  <article className="glass rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-cyan-100">
                      Structure Timeline
                    </h3>
                    {analyzerResult.sections.length > 0 ? (
                      <>
                        <div className="mt-3 flex overflow-hidden rounded-md border border-cyan-700/35 bg-black/40">
                          {analyzerResult.sections.map((section, index) => (
                            <div
                              key={`${section.label}-${index}`}
                              style={{
                                width: `${Math.max(8, ((section.endSec - section.startSec) / analyzerSectionBounds.total) * 100)}%`,
                              }}
                              className="relative border-r border-cyan-900/30 bg-gradient-to-r from-cyan-500/25 to-blue-500/20 px-2 py-2 last:border-r-0"
                            >
                              <p className="truncate text-[10px] uppercase tracking-wide text-cyan-100">
                                {section.label}
                              </p>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 space-y-1 text-xs text-foreground/70">
                          {analyzerResult.sections.map((section, index) => (
                            <p key={`meta-${section.label}-${index}`}>
                              {section.label.toUpperCase()}{" "}
                              {section.startSec.toFixed(2)}s -{" "}
                              {section.endSec.toFixed(2)}s
                            </p>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="mt-1 text-xs text-foreground/65">
                        Not enough data to estimate sections.
                      </p>
                    )}
                  </article>
                </div>
              ) : (
                <p className="text-sm text-foreground/70">
                  Upload an audio file to analyze BPM, key, tempo stability,
                  chords, and sections.
                </p>
              )}
            </>
          ) : null}
        </section>
      ) : (
        <section
          className={`mt-8 grid ${tab === "starter" ? "gap-5 sm:gap-6" : "gap-4"}`}
        >
          {visibleProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onGenerateStemMidi={handleGenerateStemMidi}
              generatingTargets={
                generatingByProject[project.id] ?? EMPTY_GENERATING_TARGETS
              }
              onCancelProject={handleCancelProject}
              onDeleteProject={handleDeleteProject}
              onAlterVariation={handleAlterVariation}
              altering={Boolean(alteringByProject[project.id])}
              cancelling={Boolean(cancellingByProject[project.id])}
              deleting={Boolean(deletingByProject[project.id])}
            />
          ))}
          {visibleProjects.length === 0 ? (
            <p className="text-sm text-foreground/70">
              No {tab} projects yet.
              {tab === "starter"
                ? " Generate starter ideas to begin."
                : " Upload a file to start."}
            </p>
          ) : null}
        </section>
      )}
    </main>
  );
}
