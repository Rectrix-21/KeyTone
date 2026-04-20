"use client";

import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  ExtractionStem,
  MidiPreviewNote,
  Project,
  VariationAlterTarget,
  VariationIntent,
  VariationProducerMove,
  VariationStyle,
} from "@/types/api";

interface ProjectCardProps {
  project: Project;
  onGenerateStemMidi?: (
    projectId: string,
    target: "melody" | "chord" | "bass" | "piano" | "guitar",
  ) => void;
  generatingTargets?: string[];
  onCancelProject?: (projectId: string) => void;
  onDeleteProject?: (projectId: string) => void;
  onAlterVariation?: (
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
  ) => void;
  altering?: boolean;
  cancelling?: boolean;
  deleting?: boolean;
}

const KEY_PRESETS = [
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

const STYLE_PRESETS = [
  { value: "auto", label: "Auto (Random)" },
  { value: "lift", label: "Lift" },
  { value: "groove", label: "Groove" },
  { value: "cinematic", label: "Cinematic" },
] as const;

const INTENT_PRESETS: Array<{ value: VariationIntent; label: string }> = [
  { value: "richer", label: "Make richer" },
  { value: "smoother", label: "Make smoother" },
  { value: "emotional", label: "Make more emotional" },
  { value: "modern", label: "Make more modern" },
  { value: "soulful", label: "Make more soulful" },
  { value: "cinematic", label: "Make more cinematic" },
];

const INTENT_DESCRIPTIONS: Record<VariationIntent, string> = {
  catchier: "Shapes stronger hooks and clearer resolution points.",
  richer: "Adds extensions (7ths, 9ths) and fuller voicing spread.",
  smoother: "Improves voice leading and reduces harsh jumps between chords.",
  emotional: "Uses tension and release voicings to increase emotional pull.",
  rhythmic: "Tightens harmonic rhythm to lock with groove movement.",
  modern: "Applies contemporary voicing colors like add9 and suspended tones.",
  sparse: "Removes dense tones for cleaner harmonic space.",
  soulful: "Leans into warm 7th and 9th color tones for neo-soul flavor.",
  cinematic: "Builds wide, atmospheric chord colors with dramatic movement.",
  aggressive: "Pushes brighter tensions and stronger harmonic contrast.",
  premium: "Balances modern color, smooth movement, and polished density.",
};

const CHORD_IMPROVER_STEPS = [
  "Analyzing harmony...",
  "Enhancing voicing...",
  "Applying extensions...",
] as const;

const STRENGTH_PRESETS = [
  { value: "0.55", label: "Subtle" },
  { value: "0.75", label: "Balanced" },
  { value: "0.95", label: "Strong" },
  { value: "1.15", label: "Bold" },
] as const;

const PRESERVE_PRESETS = [
  { value: "0.8", label: "High Identity" },
  { value: "0.72", label: "Balanced" },
  { value: "0.64", label: "More Change" },
] as const;

const AUTO_MOVE_OPTION: { value: VariationProducerMove; label: string } = {
  value: "auto",
  label: "Auto (Intent-driven)",
};

const MELODY_MOVE_OPTIONS: Array<{
  value: VariationProducerMove;
  label: string;
}> = [
  AUTO_MOVE_OPTION,
  { value: "hook_lift", label: "Hook Lift" },
  { value: "pocket_rewrite", label: "Pocket Rewrite" },
  { value: "emotional_resolve", label: "Emotional Resolve" },
  { value: "call_response", label: "Call & Response" },
  { value: "simplify_phrase", label: "Simplify Phrase" },
  { value: "top_line_focus", label: "Top-Line Focus" },
];

const CHORD_MOVE_OPTIONS: Array<{
  value: VariationProducerMove;
  label: string;
}> = [
  AUTO_MOVE_OPTION,
  { value: "neo_soul_upgrade", label: "Neo-Soul Upgrade" },
  { value: "wide_cinema_voicing", label: "Wide Cinema Voicing" },
  { value: "smooth_voice_leading", label: "Smooth Voice Leading" },
  { value: "bounce_comping", label: "Bounce Comping" },
  { value: "airy_top_voice", label: "Airy Top Voice" },
];

const BASS_MOVE_OPTIONS: Array<{
  value: VariationProducerMove;
  label: string;
}> = [
  AUTO_MOVE_OPTION,
  { value: "locked_groove", label: "Locked Groove" },
  { value: "octave_motion", label: "Octave Motion" },
  { value: "minimal_pocket", label: "Minimal Pocket" },
  { value: "approach_note_movement", label: "Approach Note Movement" },
  { value: "groove_tightening", label: "Groove Tightening" },
];

const CREATIVITY_PRESETS = [
  { value: "0.45", label: "Subtle" },
  { value: "0.7", label: "Balanced" },
  { value: "0.95", label: "Bold" },
  { value: "1.15", label: "Wild" },
] as const;

const EXTRACTION_PROCESS_STEPS = [
  "Analyzing frequencies...",
  "Separating stems...",
  "Extracting piano + guitar...",
  "Generating MIDI...",
] as const;

const EXTRACTION_PRIMARY_STEM_ORDER: ExtractionStem[] = [
  "bass",
  "drums",
  "piano",
  "guitar",
];

const STEM_TARGET_MAP: Record<
  ExtractionStem,
  "melody" | "chord" | "bass" | "piano" | "guitar" | null
> = {
  bass: "bass",
  drums: null,
  vocals: "melody",
  other: "chord",
  piano: "piano",
  guitar: "guitar",
};

const REQUIRED_STEM_BY_TARGET: Record<
  "melody" | "chord" | "bass" | "piano" | "guitar",
  ExtractionStem
> = {
  bass: "bass",
  melody: "vocals",
  chord: "other",
  piano: "piano",
  guitar: "guitar",
};

const STEM_ACCENT_COLORS: Record<string, string> = {
  bass: "#22c55e",
  drums: "#f59e0b",
  piano: "#60a5fa",
  guitar: "#a78bfa",
  vocals: "#f472b6",
  other: "#22d3ee",
};

const STEM_BAR_PATTERNS: Record<string, number[]> = {
  bass: [10, 18, 24, 16, 28, 14, 26, 12, 22, 30],
  drums: [24, 16, 30, 20, 28, 18, 26, 14, 22, 18],
  piano: [12, 20, 16, 26, 14, 24, 18, 28, 16, 22],
  guitar: [14, 22, 18, 26, 20, 24, 16, 30, 18, 24],
  vocals: [10, 16, 22, 28, 20, 24, 18, 26, 14, 20],
  other: [12, 18, 24, 20, 26, 16, 22, 14, 28, 18],
};

const STEM_IDLE_BAR_HEIGHT = 3;
const STEM_MAX_BAR_HEIGHT = 24;
const STEM_NOISE_FLOOR = 0.045;
const STRENGTH_MIN = 0.55;
const STRENGTH_MAX = 1.15;

function strengthToPercent(value: number): number {
  const bounded = Math.max(STRENGTH_MIN, Math.min(STRENGTH_MAX, value));
  const ratio = (bounded - STRENGTH_MIN) / (STRENGTH_MAX - STRENGTH_MIN);
  return Math.round(ratio * 100);
}

function percentToStrength(percent: number): number {
  const bounded = Math.max(0, Math.min(100, percent));
  return STRENGTH_MIN + (bounded / 100) * (STRENGTH_MAX - STRENGTH_MIN);
}

const CHROMATIC_NOTES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

type DetectedChordQuality = "maj" | "min" | "dim" | "aug" | null;

function detectChordFromNotes(notes: MidiPreviewNote[]): string | null {
  if (notes.length === 0) {
    return null;
  }

  const pitchClasses = Array.from(
    new Set(notes.map((note) => ((note.pitch % 12) + 12) % 12)),
  );
  if (pitchClasses.length === 0) {
    return null;
  }

  const lowestNote = notes.reduce((lowest, note) =>
    note.pitch < lowest.pitch ? note : lowest,
  );

  let bestRoot = ((lowestNote.pitch % 12) + 12) % 12;
  let bestQuality: DetectedChordQuality = null;
  let bestIntervals = new Set<number>();
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const root of pitchClasses) {
    const intervals = new Set(
      pitchClasses.map((pitchClass) => (pitchClass - root + 12) % 12),
    );

    let quality: DetectedChordQuality = null;
    let score = 0;

    if (intervals.has(4) && intervals.has(7)) {
      quality = "maj";
      score += 4;
    } else if (intervals.has(3) && intervals.has(7)) {
      quality = "min";
      score += 4;
    } else if (intervals.has(3) && intervals.has(6)) {
      quality = "dim";
      score += 3.3;
    } else if (intervals.has(4) && intervals.has(8)) {
      quality = "aug";
      score += 3.1;
    }

    if (intervals.has(10) || intervals.has(11)) {
      score += 1;
    }
    if (intervals.has(2) || intervals.has(9)) {
      score += 0.35;
    }
    score += Math.min(5, intervals.size) * 0.08;

    if (score > bestScore) {
      bestScore = score;
      bestRoot = root;
      bestQuality = quality;
      bestIntervals = intervals;
    }
  }

  if (!Number.isFinite(bestScore) || bestScore <= 0.4) {
    return null;
  }

  const rootLabel = CHROMATIC_NOTES[bestRoot] ?? "C";
  const hasMinorSeventh = bestIntervals.has(10);
  const hasMajorSeventh = bestIntervals.has(11);
  const hasNinth = bestIntervals.has(2);

  if (bestQuality === "min") {
    if (hasMajorSeventh) {
      return `${rootLabel}m(maj7)`;
    }
    if (hasMinorSeventh) {
      return `${rootLabel}m7`;
    }
    if (hasNinth) {
      return `${rootLabel}madd9`;
    }
    return `${rootLabel}m`;
  }

  if (bestQuality === "dim") {
    return hasMinorSeventh ? `${rootLabel}m7b5` : `${rootLabel}dim`;
  }

  if (bestQuality === "aug") {
    return `${rootLabel}aug`;
  }

  if (hasMajorSeventh) {
    return `${rootLabel}maj7`;
  }
  if (hasMinorSeventh) {
    return `${rootLabel}7`;
  }
  if (hasNinth) {
    return `${rootLabel}add9`;
  }
  return rootLabel;
}

function deriveChordProgressionFromPreviewNotes(
  notes: MidiPreviewNote[] | undefined,
): string[] {
  if (!notes || notes.length === 0) {
    return [];
  }

  const harmonicLaneNotes = notes.filter(
    (note) =>
      note.lane === "chord" || note.lane === "piano" || note.lane === "guitar",
  );
  const noDrumsBass = notes.filter(
    (note) => note.lane !== "drums" && note.lane !== "bass",
  );
  const sourceNotes =
    harmonicLaneNotes.length > 0
      ? harmonicLaneNotes
      : noDrumsBass.length > 0
        ? noDrumsBass
        : notes;

  const sorted = [...sourceNotes].sort((a, b) => a.start - b.start);
  const onsetTimes: number[] = [];
  for (const note of sorted) {
    const lastOnset = onsetTimes[onsetTimes.length - 1];
    if (lastOnset === undefined || note.start - lastOnset > 0.45) {
      onsetTimes.push(note.start);
    }
  }

  const progression: string[] = [];
  for (const onset of onsetTimes) {
    const windowEnd = onset + 0.6;
    const cluster = sourceNotes.filter(
      (note) => note.start <= windowEnd && note.end >= onset + 0.04,
    );
    const detected = detectChordFromNotes(cluster);
    if (!detected) {
      continue;
    }

    const previous = progression[progression.length - 1];
    if (previous !== detected) {
      progression.push(detected);
    }
    if (progression.length >= 16) {
      break;
    }
  }

  return progression;
}

function extractionStepIndex(percent: number): number {
  const safePercent = Math.max(0, Math.min(100, percent));
  return Math.min(
    EXTRACTION_PROCESS_STEPS.length - 1,
    Math.floor((safePercent / 100) * EXTRACTION_PROCESS_STEPS.length),
  );
}

function stemAccentColor(stemName: string): string {
  return STEM_ACCENT_COLORS[stemName.toLowerCase()] ?? "#22d3ee";
}

function stemBarPattern(stemName: string): number[] {
  return STEM_BAR_PATTERNS[stemName.toLowerCase()] ?? STEM_BAR_PATTERNS.other;
}

type StemVisualizerNode = {
  element: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  analyser: AnalyserNode;
  data: Uint8Array<ArrayBuffer>;
  bars: number;
};

function creativityPresetFromValue(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "0.7";
  }

  let closest: string = CREATIVITY_PRESETS[0]?.value ?? "0.7";
  let closestDistance = Number.POSITIVE_INFINITY;
  CREATIVITY_PRESETS.forEach((preset) => {
    const distance = Math.abs(Number.parseFloat(preset.value) - value);
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = preset.value;
    }
  });
  return closest;
}

function nearestPresetValue(
  value: number | undefined,
  presets: ReadonlyArray<{ value: string; label: string }>,
  fallback: string,
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  let closest = fallback;
  let closestDistance = Number.POSITIVE_INFINITY;
  presets.forEach((preset) => {
    const distance = Math.abs(Number.parseFloat(preset.value) - value);
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = preset.value;
    }
  });
  return closest;
}

function laneMoveOptionsForTarget(
  target: VariationAlterTarget,
): Array<{ value: VariationProducerMove; label: string }> {
  if (target === "melody") {
    return MELODY_MOVE_OPTIONS;
  }
  if (target === "chord") {
    return CHORD_MOVE_OPTIONS;
  }
  if (target === "bass") {
    return BASS_MOVE_OPTIONS;
  }
  return [AUTO_MOVE_OPTION];
}

function formatUtcDate(dateValue: string): string {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  }).format(date);
}

function midiPitchToLabel(pitch: number): string {
  const names = [
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
  ];
  const note = names[pitch % 12] ?? "C";
  const octave = Math.floor(pitch / 12) - 1;
  return `${note}${octave}`;
}

const SOFT_PIANO_BASE_URL = "https://tonejs.github.io/audio/salamander/";

const SOFT_PIANO_URLS: Record<string, string> = {
  A0: "A0.mp3",
  C1: "C1.mp3",
  "D#1": "Ds1.mp3",
  "F#1": "Fs1.mp3",
  A1: "A1.mp3",
  C2: "C2.mp3",
  "D#2": "Ds2.mp3",
  "F#2": "Fs2.mp3",
  A2: "A2.mp3",
  C3: "C3.mp3",
  "D#3": "Ds3.mp3",
  "F#3": "Fs3.mp3",
  A3: "A3.mp3",
  C4: "C4.mp3",
  "D#4": "Ds4.mp3",
  "F#4": "Fs4.mp3",
  A4: "A4.mp3",
  C5: "C5.mp3",
  "D#5": "Ds5.mp3",
  "F#5": "Fs5.mp3",
  A5: "A5.mp3",
  C6: "C6.mp3",
  "D#6": "Ds6.mp3",
  "F#6": "Fs6.mp3",
  A6: "A6.mp3",
  C7: "C7.mp3",
  "D#7": "Ds7.mp3",
  "F#7": "Fs7.mp3",
  A7: "A7.mp3",
  C8: "C8.mp3",
};

type SoftPianoState = {
  loadPromise: Promise<void> | null;
  tone: typeof import("tone") | null;
  sampler: import("tone").Sampler | null;
  filter: import("tone").Filter | null;
};

const softPianoState: SoftPianoState = {
  loadPromise: null,
  tone: null,
  sampler: null,
  filter: null,
};

async function ensureSoftPianoEngine(): Promise<SoftPianoState | null> {
  if (typeof window === "undefined") {
    return null;
  }

  if (!softPianoState.loadPromise) {
    softPianoState.loadPromise = (async () => {
      const Tone = await import("tone");
      const context = Tone.getContext();
      context.lookAhead = 0.01;
      const filter = new Tone.Filter({
        frequency: 2600,
        type: "lowpass",
        rolloff: -12,
      }).toDestination();
      const sampler = new Tone.Sampler({
        urls: SOFT_PIANO_URLS,
        baseUrl: SOFT_PIANO_BASE_URL,
        attack: 0.01,
        release: 0.9,
      });
      sampler.volume.value = -7;
      sampler.connect(filter);
      await Tone.loaded();
      softPianoState.tone = Tone;
      softPianoState.sampler = sampler;
      softPianoState.filter = filter;
    })();
  }

  await softPianoState.loadPromise;
  return softPianoState;
}

async function prepareSoftPianoPlayback(): Promise<boolean> {
  const engine = await ensureSoftPianoEngine();
  if (!engine || !engine.tone) {
    return false;
  }

  try {
    await engine.tone.start();
    return true;
  } catch {
    return false;
  }
}

async function playSoftPianoPreviewNote(
  pitch: number,
  velocity: number,
  durationSeconds: number,
  startsInSeconds: number = 0,
): Promise<void> {
  const engine = await ensureSoftPianoEngine();
  if (!engine || !engine.tone || !engine.sampler) {
    return;
  }

  try {
    const noteName = engine.tone.Frequency(Math.trunc(pitch), "midi").toNote();
    const length = Math.max(0.08, Math.min(durationSeconds * 1.03, 2.6));
    const normalizedVelocity = Math.max(0.12, Math.min(1, velocity / 127));
    const triggerAt =
      engine.tone.now() -
      engine.tone.getContext().lookAhead +
      Math.max(0, startsInSeconds);
    engine.sampler.triggerAttackRelease(
      noteName,
      length,
      triggerAt,
      normalizedVelocity,
    );
  } catch {
    // Ignore transient playback start failures (e.g. autoplay policy race).
  }
}

function getStatusProgress(
  status: Project["status"],
  createdAt: string,
  nowMs: number,
  backendProgress?: {
    percent: number;
    label: string;
    updated_at?: string;
  } | null,
): { percent: number; label: string; elapsedSec: number } {
  if (backendProgress && (status === "pending" || status === "processing")) {
    const createdMs = new Date(createdAt).getTime();
    const elapsedSec = Number.isFinite(createdMs)
      ? Math.max(0, (nowMs - createdMs) / 1000)
      : 0;
    return {
      percent: Math.max(0, Math.min(100, backendProgress.percent)),
      label: backendProgress.label || "Processing",
      elapsedSec,
    };
  }

  if (status === "completed") {
    return { percent: 100, label: "Completed", elapsedSec: 0 };
  }

  if (status === "failed") {
    return { percent: 100, label: "Failed", elapsedSec: 0 };
  }

  const createdMs = new Date(createdAt).getTime();
  const elapsedSec = Number.isFinite(createdMs)
    ? Math.max(0, (nowMs - createdMs) / 1000)
    : 0;

  if (status === "pending") {
    const pendingPercent = Math.min(18, 8 + elapsedSec * 1.2);
    return {
      percent: pendingPercent,
      label: "Queued for processing",
      elapsedSec,
    };
  }

  if (elapsedSec < 8) {
    return { percent: 28, label: "Separating stems", elapsedSec };
  }
  if (elapsedSec < 18) {
    return { percent: 45, label: "Extracting harmonic content", elapsedSec };
  }
  if (elapsedSec < 32) {
    return { percent: 63, label: "Transcribing MIDI", elapsedSec };
  }
  if (elapsedSec < 48) {
    return { percent: 79, label: "Cleaning note clusters", elapsedSec };
  }
  if (elapsedSec < 75) {
    return { percent: 90, label: "Finalizing outputs", elapsedSec };
  }

  const wave = (Math.sin(nowMs / 850) + 1) / 2;
  const percent = 92 + wave * 6;
  const label =
    elapsedSec > 180
      ? "Still finalizing (taking longer than usual)"
      : "Finalizing outputs";
  return { percent, label, elapsedSec };
}

function formatElapsed(elapsedSec: number): string {
  const total = Math.max(0, Math.floor(elapsedSec));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function laneColorClass(lane: MidiLane): string {
  if (lane === "melody") {
    return "bg-cyan-300/70";
  }
  if (lane === "chord") {
    return "bg-blue-300/70";
  }
  if (lane === "piano") {
    return "bg-indigo-300/70";
  }
  if (lane === "guitar") {
    return "bg-violet-300/70";
  }
  if (lane === "drums") {
    return "bg-amber-300/70";
  }
  return "bg-teal-300/70";
}

function StaticPianoRoll({
  title,
  notes,
}: {
  title: string;
  notes: MidiPreviewNote[] | undefined;
}) {
  const safeNotes = notes ?? [];
  const sorted = useMemo(
    () => [...safeNotes].sort((a, b) => a.start - b.start),
    [safeNotes],
  );
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const schedulerRef = useRef<number | null>(null);
  const nextNoteIndexRef = useRef(0);
  const elapsedRef = useRef(0);
  const frameRef = useRef<number | null>(null);

  const duration = useMemo(() => {
    if (sorted.length === 0) {
      return 4;
    }
    return Math.max(4, sorted[sorted.length - 1].end);
  }, [sorted]);

  const playPreviewNote = (
    pitch: number,
    velocity: number,
    durationSeconds: number,
    startsInSeconds: number = 0,
  ) => {
    void playSoftPianoPreviewNote(
      pitch,
      velocity,
      durationSeconds,
      startsInSeconds,
    );
  };

  useEffect(() => {
    if (!playing) {
      return;
    }

    const startedAt = performance.now() - elapsedRef.current * 1000;

    const step = (timestamp: number) => {
      const nextElapsed = (timestamp - startedAt) / 1000;
      elapsedRef.current = nextElapsed;
      setElapsed(nextElapsed);
      if (
        sorted.length > 0 &&
        nextElapsed > sorted[sorted.length - 1].end + 0.25
      ) {
        setPlaying(false);
        return;
      }
      frameRef.current = window.requestAnimationFrame(step);
    };

    frameRef.current = window.requestAnimationFrame(step);

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [elapsed, playing, sorted]);

  useEffect(() => {
    if (!playing || sorted.length === 0) {
      return;
    }

    const lookaheadSec = 0.08;
    const tickMs = 20;
    nextNoteIndexRef.current = 0;

    const schedule = () => {
      const nowElapsed = elapsedRef.current;
      while (nextNoteIndexRef.current < sorted.length) {
        const note = sorted[nextNoteIndexRef.current];
        const startsIn = note.start - nowElapsed;

        if (startsIn < -0.02) {
          nextNoteIndexRef.current += 1;
          continue;
        }

        if (startsIn <= lookaheadSec) {
          playPreviewNote(
            note.pitch,
            note.velocity,
            note.end - note.start,
            startsIn,
          );
          nextNoteIndexRef.current += 1;
          continue;
        }

        break;
      }
    };

    schedule();
    schedulerRef.current = window.setInterval(schedule, tickMs);

    return () => {
      if (schedulerRef.current !== null) {
        window.clearInterval(schedulerRef.current);
        schedulerRef.current = null;
      }
    };
  }, [playing, sorted]);

  useEffect(() => {
    if (!playing) {
      setElapsed(0);
      elapsedRef.current = 0;
      nextNoteIndexRef.current = 0;
    }
  }, [playing]);

  useEffect(() => {
    setPlaying(false);
    setElapsed(0);
    elapsedRef.current = 0;
    nextNoteIndexRef.current = 0;
  }, [notes]);

  if (safeNotes.length === 0) {
    return (
      <div className="rounded-md border border-cyan-500/20 bg-black/45 p-3">
        <p className="mb-2 text-xs text-foreground/70">{title}</p>
        <p className="text-xs text-foreground/55">No notes yet.</p>
      </div>
    );
  }

  const minPitch = Math.min(...sorted.map((note) => note.pitch));
  const maxPitch = Math.max(...sorted.map((note) => note.pitch));
  const pitchSpan = Math.max(12, maxPitch - minPitch + 1);
  const width = Math.max(520, Math.ceil(duration * 100));
  const height = 170;

  return (
    <div className="rounded-md border border-cyan-500/20 bg-black/45 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs text-foreground/70">{title}</p>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-foreground/60">
            t={elapsed.toFixed(2)}s
          </span>
          <button
            type="button"
            onClick={() => {
              if (playing) {
                setPlaying(false);
                return;
              }

              void (async () => {
                const ready = await prepareSoftPianoPlayback();
                if (!ready) {
                  return;
                }
                nextNoteIndexRef.current = 0;
                elapsedRef.current = 0;
                setElapsed(0);
                setPlaying(true);
              })();
            }}
            className="cyber-btn px-3 py-1 text-xs"
          >
            {playing ? "Stop" : "Play"}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto overflow-y-hidden rounded border border-cyan-500/20 bg-black/55 p-2">
        <div
          className="relative"
          style={{
            width: `${width}px`,
            height: `${height}px`,
            backgroundImage:
              "repeating-linear-gradient(to right, rgba(34,211,238,0.10) 0, rgba(34,211,238,0.10) 1px, transparent 1px, transparent 30px), repeating-linear-gradient(to bottom, rgba(34,211,238,0.08) 0, rgba(34,211,238,0.08) 1px, transparent 1px, transparent 12px)",
          }}
        >
          {sorted.map((note, index) => {
            const left = (note.start / duration) * width;
            const noteWidth = Math.max(
              ((note.end - note.start) / duration) * width,
              3,
            );
            const top = ((maxPitch - note.pitch) / pitchSpan) * (height - 8);
            return (
              <div
                key={`${note.pitch}-${note.start}-${index}`}
                className={`absolute rounded-sm ${laneColorClass(note.lane)}`}
                style={{
                  left: `${left}px`,
                  top: `${top}px`,
                  width: `${noteWidth}px`,
                  height: "7px",
                }}
              />
            );
          })}
          {playing ? (
            <div
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-cyan-100/90"
              style={{
                left: `${Math.min((elapsed / duration) * width, width)}px`,
                boxShadow: "0 0 12px rgba(125, 211, 252, 0.55)",
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

type MidiLane = "melody" | "chord" | "bass" | "piano" | "guitar" | "drums";

function isMidiLane(value: string): value is MidiLane {
  return (
    value === "melody" ||
    value === "chord" ||
    value === "bass" ||
    value === "piano" ||
    value === "guitar" ||
    value === "drums"
  );
}

function getUsedProcessingDevice(
  project: Project,
): "gpu" | "cpu" | "failed" | null {
  const options = (project.options ?? {}) as Record<string, unknown>;
  const separation = (options.separation_details ??
    options.separation ??
    null) as Record<string, unknown> | null;

  const resolveDevice = (value: unknown): "gpu" | "cpu" | null => {
    if (typeof value !== "string") {
      return null;
    }
    const normalized = value.toLowerCase();
    if (normalized.includes("cuda") || normalized.includes("gpu")) {
      return "gpu";
    }
    if (normalized.includes("cpu")) {
      return "cpu";
    }
    return null;
  };

  const topLevel = resolveDevice(separation?.used_device);
  if (topLevel) {
    return topLevel;
  }

  const runtime = options.separation_runtime as Record<string, unknown> | null;
  const runtimeDevice = resolveDevice(runtime?.device);
  if (runtimeDevice) {
    return runtimeDevice;
  }

  if (project.status === "failed") {
    return "failed";
  }
  return null;
}

const ProjectCardComponent = ({
  project,
  onGenerateStemMidi,
  generatingTargets = [],
  onCancelProject,
  onDeleteProject,
  onAlterVariation,
  altering = false,
  cancelling = false,
  deleting = false,
}: ProjectCardProps) => {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [selectedLane, setSelectedLane] = useState<"full" | MidiLane>("full");
  const [streaming, setStreaming] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const nextNoteIndexRef = useRef(0);
  const elapsedRef = useRef(0);
  const schedulerRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const rollViewportRef = useRef<HTMLDivElement | null>(null);

  const [variationLocalTarget, setVariationLocalTarget] =
    useState<VariationAlterTarget>("chord");
  const [variationLocalKey, setVariationLocalKey] = useState("C major");
  const [variationLocalBpm, setVariationLocalBpm] = useState("");
  const [variationLocalIntent, setVariationLocalIntent] =
    useState<VariationIntent>("richer");
  const [variationLocalStrength, setVariationLocalStrength] = useState("0.95");
  const [variationLocalPreserveIdentity, setVariationLocalPreserveIdentity] =
    useState("0.64");
  const [variationLocalLaneMove, setVariationLocalLaneMove] =
    useState<VariationProducerMove>("auto");
  const [variationLocalStyle, setVariationLocalStyle] =
    useState<VariationStyle>("auto");
  const [variationLocalCreativity, setVariationLocalCreativity] =
    useState("0.7");
  const [hoveredIntent, setHoveredIntent] = useState<VariationIntent | null>(
    null,
  );
  const [chordImproverStepIndex, setChordImproverStepIndex] = useState(0);

  const [playingStems, setPlayingStems] = useState<Record<string, boolean>>({});
  const [stemWaveLevels, setStemWaveLevels] = useState<
    Record<string, number[]>
  >({});

  const stemAudioContextRef = useRef<AudioContext | null>(null);
  const stemVisualizerNodesRef = useRef<
    Record<
      string,
      {
        element: HTMLAudioElement;
        source: MediaElementAudioSourceNode;
        analyser: AnalyserNode;
        data: Uint8Array;
        bars: number;
      }
    >
  >({});
  const stemVisualizerFrameRef = useRef<number | null>(null);
  const stemSmoothedLevelsRef = useRef<Record<string, number[]>>({});

  useEffect(() => {
    const isRunningProject =
      project.status === "pending" || project.status === "processing";
    if (!isRunningProject) {
      return;
    }

    const timerId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timerId);
    };
  }, [project.status]);

  const previewNotes = project.assets?.midi_preview_notes ?? [];
  const previewLaneOptions = useMemo(() => {
    const lanes = Array.from(
      new Set(previewNotes.map((note) => note.lane).filter(isMidiLane)),
    );
    return ["full", ...lanes] as Array<"full" | MidiLane>;
  }, [previewNotes]);

  useEffect(() => {
    if (!previewLaneOptions.includes(selectedLane)) {
      setSelectedLane("full");
    }
  }, [previewLaneOptions, selectedLane]);

  const laneNotes = useMemo(() => {
    if (selectedLane === "full") {
      return previewNotes;
    }
    return previewNotes.filter((note) => note.lane === selectedLane);
  }, [previewNotes, selectedLane]);

  const minPitch = useMemo(() => {
    if (laneNotes.length === 0) {
      return 36;
    }
    return Math.min(...laneNotes.map((note) => note.pitch));
  }, [laneNotes]);

  const maxPitch = useMemo(() => {
    if (laneNotes.length === 0) {
      return 84;
    }
    return Math.max(...laneNotes.map((note) => note.pitch));
  }, [laneNotes]);

  const pitchSpan = Math.max(12, maxPitch - minPitch + 1);
  const duration = useMemo(() => {
    if (laneNotes.length === 0) {
      return 8;
    }
    return Math.max(4, laneNotes[laneNotes.length - 1].end);
  }, [laneNotes]);

  const rollWidth = Math.max(680, Math.ceil(duration * 120));
  const rollHeight = 220;

  const pitchRows = useMemo(() => {
    const rows: number[] = [];
    for (let pitch = maxPitch; pitch >= minPitch; pitch -= 1) {
      rows.push(pitch);
    }
    return rows;
  }, [maxPitch, minPitch]);

  const playPreviewNote = (
    pitch: number,
    velocity: number,
    durationSeconds: number,
    startsInSeconds: number = 0,
  ) => {
    void playSoftPianoPreviewNote(
      pitch,
      velocity,
      durationSeconds,
      startsInSeconds,
    );
  };

  useEffect(() => {
    if (!streaming) {
      return;
    }

    const startedAt = performance.now() - elapsedRef.current * 1000;

    const step = (timestamp: number) => {
      const nextElapsed = (timestamp - startedAt) / 1000;
      elapsedRef.current = nextElapsed;
      setElapsed(nextElapsed);
      if (
        laneNotes.length > 0 &&
        nextElapsed > laneNotes[laneNotes.length - 1].end + 0.25
      ) {
        setStreaming(false);
        return;
      }
      frameRef.current = window.requestAnimationFrame(step);
    };

    frameRef.current = window.requestAnimationFrame(step);

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [laneNotes, streaming]);

  useEffect(() => {
    if (!streaming || laneNotes.length === 0) {
      return;
    }

    const lookaheadSec = 0.08;
    const tickMs = 20;
    nextNoteIndexRef.current = 0;

    const schedule = () => {
      const nowElapsed = elapsedRef.current;
      while (nextNoteIndexRef.current < laneNotes.length) {
        const note = laneNotes[nextNoteIndexRef.current];
        const startsIn = note.start - nowElapsed;

        if (startsIn < -0.02) {
          nextNoteIndexRef.current += 1;
          continue;
        }

        if (startsIn <= lookaheadSec) {
          playPreviewNote(
            note.pitch,
            note.velocity,
            note.end - note.start,
            startsIn,
          );
          nextNoteIndexRef.current += 1;
          continue;
        }

        break;
      }
    };

    schedule();
    schedulerRef.current = window.setInterval(schedule, tickMs);

    return () => {
      if (schedulerRef.current !== null) {
        window.clearInterval(schedulerRef.current);
        schedulerRef.current = null;
      }
    };
  }, [laneNotes, streaming]);

  useEffect(() => {
    if (!streaming) {
      setElapsed(0);
      elapsedRef.current = 0;
      nextNoteIndexRef.current = 0;
    }
  }, [streaming]);

  useEffect(() => {
    setStreaming(false);
    setElapsed(0);
    elapsedRef.current = 0;
    nextNoteIndexRef.current = 0;
  }, [selectedLane]);

  useEffect(() => {
    if (!streaming) {
      return;
    }

    const viewport = rollViewportRef.current;
    if (!viewport) {
      return;
    }

    const playheadX = Math.min((elapsed / duration) * rollWidth, rollWidth);
    const targetScroll = Math.max(0, playheadX - viewport.clientWidth * 0.35);
    viewport.scrollLeft += (targetScroll - viewport.scrollLeft) * 0.22;
  }, [duration, elapsed, rollWidth, streaming]);

  const activeCount = useMemo(
    () =>
      laneNotes.filter((note) => note.start <= elapsed && note.end >= elapsed)
        .length,
    [elapsed, laneNotes],
  );

  const stemEntries = useMemo(() => {
    const urls = project.assets?.stem_audio_urls;
    if (!urls) {
      return [] as Array<{ stemName: string; stemUrl: string }>;
    }

    return Object.entries(urls).map(([stemName, stemUrl]) => ({
      stemName,
      stemUrl,
    }));
  }, [project.assets?.stem_audio_urls]);

  const orderedStemEntries = useMemo(() => {
    const byName = new Map(
      stemEntries.map((entry) => [entry.stemName.toLowerCase(), entry]),
    );
    const orderedPrimary = EXTRACTION_PRIMARY_STEM_ORDER.map(
      (stemName) => byName.get(stemName) ?? null,
    ).filter((entry): entry is { stemName: string; stemUrl: string } =>
      Boolean(entry),
    );

    const primarySet = new Set(EXTRACTION_PRIMARY_STEM_ORDER);
    const extras = stemEntries.filter(
      (entry) =>
        !primarySet.has(entry.stemName.toLowerCase() as ExtractionStem),
    );

    return [...orderedPrimary, ...extras];
  }, [stemEntries]);

  const selectedStems = Array.isArray(project.options?.extract_stems)
    ? project.options.extract_stems
    : [];

  const featureLabel =
    project.feature === "variation"
      ? "MIDI Variation"
      : project.feature === "starter"
        ? "Track Starter"
        : "Stem and Midi Extraction";
  const starterExplanation =
    project.feature === "starter" &&
    typeof project.options?.starter_explanation === "string"
      ? project.options.starter_explanation
      : null;
  const starterVariant =
    project.feature === "starter" &&
    typeof project.options?.starter_variant === "string"
      ? project.options.starter_variant
      : null;
  const normalizedStarterVariant = starterVariant?.toLowerCase() ?? "";
  const starterCardToneClass =
    project.feature !== "starter"
      ? ""
      : normalizedStarterVariant === "safe"
        ? "starter-result-card starter-result-card-safe"
        : normalizedStarterVariant === "fresh"
          ? "starter-result-card starter-result-card-fresh"
          : normalizedStarterVariant === "experimental"
            ? "starter-result-card starter-result-card-experimental"
            : "starter-result-card";
  const starterVariantBadgeClass =
    normalizedStarterVariant === "safe"
      ? "border-blue-300/45 bg-blue-500/18 text-blue-100"
      : normalizedStarterVariant === "fresh"
        ? "border-emerald-300/45 bg-emerald-500/18 text-emerald-100"
        : normalizedStarterVariant === "experimental"
          ? "border-fuchsia-300/45 bg-fuchsia-500/18 text-fuchsia-100"
          : "border-cyan-500/30 bg-cyan-500/10 text-cyan-100";
  const progress = useMemo(
    () =>
      getStatusProgress(
        project.status,
        project.created_at,
        nowMs,
        project.options?.processing_progress,
      ),
    [
      nowMs,
      project.created_at,
      project.options?.processing_progress,
      project.status,
    ],
  );
  const extractionStepActiveIndex = useMemo(
    () => extractionStepIndex(progress.percent),
    [progress.percent],
  );
  const extractionCurrentStepLabel =
    EXTRACTION_PROCESS_STEPS[extractionStepActiveIndex] ??
    EXTRACTION_PROCESS_STEPS[0];
  const isRunning =
    project.status === "pending" || project.status === "processing";
  const canCancel = isRunning && Boolean(onCancelProject);
  const canDelete = !isRunning && Boolean(onDeleteProject);
  const canAlter = project.feature === "variation" && Boolean(onAlterVariation);
  const originalVariationNotes =
    project.assets?.original_midi_preview_notes ?? [];
  const alteredVariationNotes =
    project.assets?.altered_midi_preview_notes ??
    project.assets?.midi_preview_notes ??
    [];
  const variationStrengthNumber = Number.isFinite(
    Number.parseFloat(variationLocalStrength),
  )
    ? Number.parseFloat(variationLocalStrength)
    : 0.95;
  const variationStrengthPercent = strengthToPercent(variationStrengthNumber);
  const effectiveVariationIntent =
    project.options?.variation_intent ?? variationLocalIntent;
  const effectiveVariationStrength =
    typeof project.options?.variation_strength === "number"
      ? project.options.variation_strength
      : variationStrengthNumber;
  const intentPreviewIntent = hoveredIntent ?? effectiveVariationIntent;
  const intentPreviewDescription = INTENT_DESCRIPTIONS[intentPreviewIntent];
  const backendOriginalProgression =
    project.analysis?.detected_chord_progression ?? [];
  const backendAlteredProgression =
    project.analysis?.altered_chord_progression ?? [];
  const fallbackOriginalProgression = useMemo(
    () => deriveChordProgressionFromPreviewNotes(originalVariationNotes),
    [originalVariationNotes],
  );
  const fallbackAlteredProgression = useMemo(
    () => deriveChordProgressionFromPreviewNotes(alteredVariationNotes),
    [alteredVariationNotes],
  );
  const variationOriginalProgression = useMemo(
    () =>
      backendOriginalProgression.length > 0
        ? backendOriginalProgression
        : fallbackOriginalProgression,
    [backendOriginalProgression, fallbackOriginalProgression],
  );
  const improvedChordProgression = useMemo(
    () =>
      backendAlteredProgression.length > 0
        ? backendAlteredProgression
        : fallbackAlteredProgression,
    [backendAlteredProgression, fallbackAlteredProgression],
  );
  const variationDownloadUrl =
    project.assets?.altered_midi_url ||
    project.assets?.midi_base_url ||
    project.assets?.midi_variation_urls?.[0] ||
    null;
  const currentLaneMoveOptions = useMemo(
    () => laneMoveOptionsForTarget(variationLocalTarget),
    [variationLocalTarget],
  );

  useEffect(() => {
    const valid = currentLaneMoveOptions.some(
      (option) => option.value === variationLocalLaneMove,
    );
    if (!valid) {
      setVariationLocalLaneMove("auto");
    }
  }, [currentLaneMoveOptions, variationLocalLaneMove]);

  useEffect(() => {
    if (!canAlter || !altering) {
      setChordImproverStepIndex(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      setChordImproverStepIndex(
        (previous) => (previous + 1) % CHORD_IMPROVER_STEPS.length,
      );
    }, 1050);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [altering, canAlter]);

  const usedDevice = useMemo(() => getUsedProcessingDevice(project), [project]);
  const showRuntimeFailedNote = usedDevice === "failed";

  useEffect(() => {
    if (project.feature !== "variation") {
      return;
    }

    const optionsTarget = project.options?.variation_target;
    const initialTarget: VariationAlterTarget =
      optionsTarget === "melody" ||
      optionsTarget === "chord" ||
      optionsTarget === "bass" ||
      optionsTarget === "full"
        ? optionsTarget
        : "chord";
    const initialKey =
      project.options?.variation_key || project.analysis?.key || "C major";
    const initialBpm =
      typeof project.options?.variation_bpm === "number"
        ? project.options.variation_bpm
        : project.analysis?.bpm && project.analysis.bpm > 0
          ? project.analysis.bpm
          : null;
    const optionsIntent = project.options?.variation_intent;
    const initialIntent: VariationIntent =
      optionsIntent === "catchier" ||
      optionsIntent === "richer" ||
      optionsIntent === "smoother" ||
      optionsIntent === "emotional" ||
      optionsIntent === "rhythmic" ||
      optionsIntent === "modern" ||
      optionsIntent === "sparse" ||
      optionsIntent === "soulful" ||
      optionsIntent === "cinematic" ||
      optionsIntent === "aggressive" ||
      optionsIntent === "premium"
        ? optionsIntent
        : "richer";
    const optionsLaneMove = project.options?.variation_lane_move;
    const initialLaneMove: VariationProducerMove =
      optionsLaneMove === "hook_lift" ||
      optionsLaneMove === "pocket_rewrite" ||
      optionsLaneMove === "emotional_resolve" ||
      optionsLaneMove === "call_response" ||
      optionsLaneMove === "simplify_phrase" ||
      optionsLaneMove === "top_line_focus" ||
      optionsLaneMove === "neo_soul_upgrade" ||
      optionsLaneMove === "wide_cinema_voicing" ||
      optionsLaneMove === "smooth_voice_leading" ||
      optionsLaneMove === "bounce_comping" ||
      optionsLaneMove === "airy_top_voice" ||
      optionsLaneMove === "locked_groove" ||
      optionsLaneMove === "octave_motion" ||
      optionsLaneMove === "minimal_pocket" ||
      optionsLaneMove === "approach_note_movement" ||
      optionsLaneMove === "groove_tightening" ||
      optionsLaneMove === "auto"
        ? optionsLaneMove
        : "auto";
    const initialStrength = nearestPresetValue(
      project.options?.variation_strength,
      STRENGTH_PRESETS,
      "0.95",
    );
    const initialPreserveIdentity = nearestPresetValue(
      project.options?.variation_preserve_identity,
      PRESERVE_PRESETS,
      "0.64",
    );
    const optionsStyle = project.options?.variation_style;
    const initialStyle: VariationStyle =
      optionsStyle === "lift" ||
      optionsStyle === "groove" ||
      optionsStyle === "cinematic" ||
      optionsStyle === "auto"
        ? optionsStyle
        : "auto";
    const initialCreativity = creativityPresetFromValue(
      project.options?.variation_creativity,
    );

    setVariationLocalTarget(initialTarget);
    setVariationLocalKey(initialKey);
    setVariationLocalBpm(initialBpm ? initialBpm.toFixed(1) : "");
    setVariationLocalIntent(initialIntent);
    setVariationLocalStrength(initialStrength);
    setVariationLocalPreserveIdentity(initialPreserveIdentity);
    setVariationLocalLaneMove(initialLaneMove);
    setVariationLocalStyle(initialStyle);
    setVariationLocalCreativity(initialCreativity);
  }, [
    project.analysis?.bpm,
    project.analysis?.key,
    project.feature,
    project.id,
    project.options?.variation_bpm,
    project.options?.variation_intent,
    project.options?.variation_strength,
    project.options?.variation_preserve_identity,
    project.options?.variation_lane_move,
    project.options?.variation_creativity,
    project.options?.variation_key,
    project.options?.variation_style,
    project.options?.variation_target,
  ]);

  useEffect(() => {
    setPlayingStems({});
    setStemWaveLevels({});
    stemSmoothedLevelsRef.current = {};
  }, [project.id]);

  useEffect(() => {
    const activeStemNames = new Set(
      orderedStemEntries.map((entry) => entry.stemName),
    );
    for (const [stemName, node] of Object.entries(
      stemVisualizerNodesRef.current,
    )) {
      if (activeStemNames.has(stemName)) {
        continue;
      }
      node.source.disconnect();
      node.analyser.disconnect();
      delete stemVisualizerNodesRef.current[stemName];
      delete stemSmoothedLevelsRef.current[stemName];
    }

    setStemWaveLevels((previous) => {
      const filteredEntries = Object.entries(previous).filter(([stemName]) =>
        activeStemNames.has(stemName),
      );
      if (filteredEntries.length === Object.keys(previous).length) {
        return previous;
      }
      return Object.fromEntries(filteredEntries);
    });
  }, [orderedStemEntries]);

  useEffect(() => {
    return () => {
      if (stemVisualizerFrameRef.current !== null) {
        window.cancelAnimationFrame(stemVisualizerFrameRef.current);
        stemVisualizerFrameRef.current = null;
      }

      for (const node of Object.values(stemVisualizerNodesRef.current)) {
        node.source.disconnect();
        node.analyser.disconnect();
      }
      stemVisualizerNodesRef.current = {};
      stemSmoothedLevelsRef.current = {};

      if (stemAudioContextRef.current) {
        void stemAudioContextRef.current.close();
        stemAudioContextRef.current = null;
      }
    };
  }, []);

  const runStemVisualizerFrame = () => {
    const nextLevels: Record<string, number[]> = {};
    let hasActivePlayback = false;

    for (const [stemName, node] of Object.entries(
      stemVisualizerNodesRef.current,
    )) {
      if (node.element.paused || node.element.ended) {
        continue;
      }

      hasActivePlayback = true;
      node.analyser.getByteFrequencyData(node.data as Uint8Array<ArrayBuffer>);
      const chunkSize = Math.max(1, Math.floor(node.data.length / node.bars));
      const previousHeights =
        stemSmoothedLevelsRef.current[stemName] ??
        Array.from({ length: node.bars }, () => STEM_IDLE_BAR_HEIGHT);
      const nextHeights: number[] = [];

      let totalEnergy = 0;
      for (let index = 0; index < node.data.length; index += 1) {
        totalEnergy += node.data[index] ?? 0;
      }
      const rms =
        node.data.length > 0 ? totalEnergy / (node.data.length * 255) : 0;
      const isNearSilence = rms < STEM_NOISE_FLOOR;

      for (let barIndex = 0; barIndex < node.bars; barIndex += 1) {
        const start = barIndex * chunkSize;
        const end = Math.min(node.data.length, start + chunkSize);
        let total = 0;
        let count = 0;

        for (let index = start; index < end; index += 1) {
          total += node.data[index] ?? 0;
          count += 1;
        }

        const normalized = count > 0 ? total / (count * 255) : 0;
        const gated = isNearSilence
          ? 0
          : Math.max(
              0,
              (normalized - STEM_NOISE_FLOOR) / (1 - STEM_NOISE_FLOOR),
            );
        const target =
          STEM_IDLE_BAR_HEIGHT +
          Math.pow(gated, 0.95) * (STEM_MAX_BAR_HEIGHT - STEM_IDLE_BAR_HEIGHT);
        const previous = previousHeights[barIndex] ?? STEM_IDLE_BAR_HEIGHT;
        const alpha = isNearSilence ? 0.56 : target > previous ? 0.62 : 0.45;
        const smooth = previous + (target - previous) * alpha;
        nextHeights.push(
          Math.round(
            Math.max(
              STEM_IDLE_BAR_HEIGHT,
              Math.min(STEM_MAX_BAR_HEIGHT, smooth),
            ),
          ),
        );
      }

      stemSmoothedLevelsRef.current[stemName] = nextHeights;
      nextLevels[stemName] = nextHeights;
    }

    setStemWaveLevels((previous) => {
      const previousKeys = Object.keys(previous);
      const nextKeys = Object.keys(nextLevels);
      if (!hasActivePlayback && previousKeys.length === 0) {
        return previous;
      }
      if (!hasActivePlayback) {
        return {};
      }

      if (
        previousKeys.length === nextKeys.length &&
        nextKeys.every((key) => {
          const current = previous[key];
          const next = nextLevels[key];
          if (!current || !next || current.length !== next.length) {
            return false;
          }
          return current.every((value, index) => value === next[index]);
        })
      ) {
        return previous;
      }

      return nextLevels;
    });

    if (hasActivePlayback) {
      stemVisualizerFrameRef.current = window.requestAnimationFrame(
        runStemVisualizerFrame,
      );
    } else {
      stemVisualizerFrameRef.current = null;
    }
  };

  const startStemVisualizerLoop = () => {
    if (stemVisualizerFrameRef.current !== null) {
      return;
    }
    stemVisualizerFrameRef.current = window.requestAnimationFrame(
      runStemVisualizerFrame,
    );
  };

  const ensureStemVisualizerFor = (
    stemName: string,
    element: HTMLAudioElement,
  ) => {
    if (typeof window === "undefined") {
      return;
    }

    const existingNode = stemVisualizerNodesRef.current[stemName];
    if (existingNode?.element === element) {
      return;
    }

    if (existingNode) {
      existingNode.source.disconnect();
      existingNode.analyser.disconnect();
      delete stemVisualizerNodesRef.current[stemName];
    }

    const AudioContextClass = (window.AudioContext ||
      (window as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext) as typeof AudioContext | undefined;

    if (!AudioContextClass) {
      return;
    }

    if (!stemAudioContextRef.current) {
      stemAudioContextRef.current = new AudioContextClass();
    }

    const context = stemAudioContextRef.current;
    if (context.state === "suspended") {
      void context.resume();
    }

    try {
      const source = context.createMediaElementSource(element);
      const analyser = context.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.82;
      source.connect(analyser);
      analyser.connect(context.destination);

      stemVisualizerNodesRef.current[stemName] = {
        element,
        source,
        analyser,
        data: new Uint8Array(
          analyser.frequencyBinCount,
        ) as Uint8Array<ArrayBuffer>,
        bars: stemBarPattern(stemName).length,
      };
    } catch {
      // If media-source creation fails (e.g., browser restriction), keep CSS fallback animation.
    }
  };

  return (
    <article
      className={`glass min-w-0 overflow-hidden rounded-xl p-5 transition-transform duration-300 ${starterCardToneClass}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium" title={project.file_name}>
            {project.file_name}
          </h3>
          <p className="mt-1 text-xs text-foreground/60">
            {formatUtcDate(project.created_at)} UTC
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-xs text-cyan-200/80">{featureLabel}</p>
            {starterVariant ? (
              <span
                className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${starterVariantBadgeClass}`}
              >
                {starterVariant}
              </span>
            ) : null}
            {usedDevice ? (
              <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-cyan-100">
                Runtime{" "}
                {usedDevice === "failed" ? "FAILED" : usedDevice.toUpperCase()}
              </span>
            ) : null}
          </div>
          {showRuntimeFailedNote ? (
            <p className="mt-1 text-[10px] text-foreground/60">
              Separation failed; using fallback audio path.
            </p>
          ) : null}
        </div>
        <span className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-xs uppercase tracking-wide whitespace-nowrap">
          {project.status}
        </span>
      </div>

      {canCancel || canDelete ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {canCancel ? (
            <button
              type="button"
              onClick={() => onCancelProject?.(project.id)}
              disabled={cancelling}
              className="rounded-md border border-cyan-700/40 bg-black/30 px-3 py-1.5 text-xs uppercase tracking-wide text-foreground/70 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cancelling ? "Cancelling..." : "Cancel Processing"}
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              onClick={() => onDeleteProject?.(project.id)}
              disabled={deleting}
              className="rounded-md border border-cyan-700/40 bg-black/30 px-3 py-1.5 text-xs uppercase tracking-wide text-foreground/70 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          ) : null}
        </div>
      ) : null}

      {canAlter ? (
        <div className="mt-3 rounded-md border border-cyan-500/20 bg-black/35 p-3">
          <p className="text-xs text-foreground/70">Chord Improver settings</p>
          <div className="mt-3 space-y-3">
            <div>
              <p className="text-xs text-foreground/60">Lane</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {(["full", "melody", "chord", "bass"] as const).map(
                  (target) => (
                    <button
                      key={target}
                      type="button"
                      onClick={() => setVariationLocalTarget(target)}
                      className={`rounded-full border px-3 py-1.5 text-xs uppercase tracking-wide transition-all duration-200 ${
                        variationLocalTarget === target
                          ? "scale-[1.03] border-cyan-300/55 bg-cyan-500/18 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.2)]"
                          : "border-cyan-700/40 bg-black/30 text-foreground/70 hover:scale-[1.02] hover:border-cyan-500/55 hover:bg-cyan-500/10 hover:text-cyan-100"
                      }`}
                    >
                      {target}
                    </button>
                  ),
                )}
              </div>
            </div>

            <div>
              <p className="text-xs text-foreground/60">Intent</p>
              <div className="mt-1 flex gap-2 overflow-x-auto pb-1">
                {INTENT_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onMouseEnter={() => setHoveredIntent(preset.value)}
                    onMouseLeave={() => setHoveredIntent(null)}
                    onFocus={() => setHoveredIntent(preset.value)}
                    onBlur={() => setHoveredIntent(null)}
                    onClick={() => setVariationLocalIntent(preset.value)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs tracking-wide transition-all duration-200 ${
                      variationLocalIntent === preset.value
                        ? "scale-[1.03] border-cyan-300/55 bg-cyan-500/18 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.2)]"
                        : "border-cyan-700/40 bg-black/30 text-foreground/70 hover:scale-[1.02] hover:border-cyan-500/55 hover:bg-cyan-500/10 hover:text-cyan-100"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 rounded-md border border-cyan-700/30 bg-black/35 px-3 py-2 text-[11px] text-foreground/70">
                {intentPreviewDescription}
              </p>
            </div>

            <div>
              <p className="text-xs text-foreground/60">Variation Strength</p>
              <div className="mt-2 rounded-md border border-cyan-700/35 bg-black/30 px-3 py-2">
                <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-foreground/60">
                  <span>Subtle</span>
                  <span>Bold</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={variationStrengthPercent}
                  onChange={(event) => {
                    const nextPercent = Number.parseFloat(event.target.value);
                    if (!Number.isFinite(nextPercent)) {
                      return;
                    }
                    setVariationLocalStrength(
                      percentToStrength(nextPercent).toFixed(2),
                    );
                  }}
                  className="mt-2 h-2 w-full cursor-ew-resize appearance-none rounded-full bg-cyan-900/35 accent-cyan-300"
                />
                <p className="mt-1 text-right text-[11px] text-cyan-100">
                  {variationStrengthNumber.toFixed(2)}
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs text-foreground/60">Preserve Identity</p>
              <div className="mt-1 flex gap-2 overflow-x-auto pb-1">
                {PRESERVE_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() =>
                      setVariationLocalPreserveIdentity(preset.value)
                    }
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs tracking-wide transition-all duration-200 ${
                      variationLocalPreserveIdentity === preset.value
                        ? "scale-[1.03] border-cyan-300/55 bg-cyan-500/18 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.2)]"
                        : "border-cyan-700/40 bg-black/30 text-foreground/70 hover:scale-[1.02] hover:border-cyan-500/55 hover:bg-cyan-500/10 hover:text-cyan-100"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs text-foreground/60">Producer Move</p>
              <div className="mt-1 flex gap-2 overflow-x-auto pb-1">
                {currentLaneMoveOptions.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setVariationLocalLaneMove(preset.value)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs tracking-wide transition-all duration-200 ${
                      variationLocalLaneMove === preset.value
                        ? "scale-[1.03] border-cyan-300/55 bg-cyan-500/18 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.2)]"
                        : "border-cyan-700/40 bg-black/30 text-foreground/70 hover:scale-[1.02] hover:border-cyan-500/55 hover:bg-cyan-500/10 hover:text-cyan-100"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs text-foreground/60">Key</p>
              <div className="mt-1 flex gap-2 overflow-x-auto pb-1">
                {KEY_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setVariationLocalKey(preset)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs tracking-wide transition-all duration-200 ${
                      variationLocalKey === preset
                        ? "scale-[1.03] border-cyan-300/55 bg-cyan-500/18 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.2)]"
                        : "border-cyan-700/40 bg-black/30 text-foreground/70 hover:scale-[1.02] hover:border-cyan-500/55 hover:bg-cyan-500/10 hover:text-cyan-100"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-foreground/60">BPM</label>
              <input
                value={variationLocalBpm}
                onChange={(event) => setVariationLocalBpm(event.target.value)}
                className="mt-1 w-full rounded-md border border-cyan-700/40 bg-black/30 px-3 py-1.5 text-sm text-cyan-100 outline-none focus:border-cyan-300/50"
                inputMode="decimal"
                placeholder="Detected BPM"
              />
            </div>

            <div>
              <p className="text-xs text-foreground/60">Style</p>
              <div className="mt-1 flex gap-2 overflow-x-auto pb-1">
                {STYLE_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setVariationLocalStyle(preset.value)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs tracking-wide transition-all duration-200 ${
                      variationLocalStyle === preset.value
                        ? "scale-[1.03] border-cyan-300/55 bg-cyan-500/18 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.2)]"
                        : "border-cyan-700/40 bg-black/30 text-foreground/70 hover:scale-[1.02] hover:border-cyan-500/55 hover:bg-cyan-500/10 hover:text-cyan-100"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs text-foreground/60">Creative Control</p>
              <div className="mt-1 flex gap-2 overflow-x-auto pb-1">
                {CREATIVITY_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setVariationLocalCreativity(preset.value)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs tracking-wide transition-all duration-200 ${
                      variationLocalCreativity === preset.value
                        ? "scale-[1.03] border-cyan-300/55 bg-cyan-500/18 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.2)]"
                        : "border-cyan-700/40 bg-black/30 text-foreground/70 hover:scale-[1.02] hover:border-cyan-500/55 hover:bg-cyan-500/10 hover:text-cyan-100"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                const parsed = Number.parseFloat(variationLocalBpm);
                const bpm = Number.isFinite(parsed) ? parsed : null;
                const parsedStrength = Number.parseFloat(
                  variationLocalStrength,
                );
                const strength = Number.isFinite(parsedStrength)
                  ? parsedStrength
                  : null;
                const parsedPreserveIdentity = Number.parseFloat(
                  variationLocalPreserveIdentity,
                );
                const preserveIdentity = Number.isFinite(parsedPreserveIdentity)
                  ? parsedPreserveIdentity
                  : null;
                const parsedCreativity = Number.parseFloat(
                  variationLocalCreativity,
                );
                const creativity = Number.isFinite(parsedCreativity)
                  ? parsedCreativity
                  : null;
                onAlterVariation?.(
                  project.id,
                  variationLocalTarget,
                  variationLocalKey,
                  bpm,
                  variationLocalIntent,
                  strength,
                  preserveIdentity,
                  variationLocalLaneMove,
                  variationLocalStyle,
                  creativity,
                );
              }}
              disabled={altering}
              className="cyber-btn px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-60"
            >
              {altering ? "Improving..." : "Improve Chords"}
            </button>
          </div>

          {altering ? (
            <div className="mt-3 rounded-md border border-cyan-500/25 bg-black/35 p-2.5">
              <div className="mb-1.5 flex items-center justify-between text-[11px] text-foreground/70">
                <span>{CHORD_IMPROVER_STEPS[chordImproverStepIndex]}</span>
                <span>
                  {Math.round(
                    ((chordImproverStepIndex + 1) /
                      CHORD_IMPROVER_STEPS.length) *
                      100,
                  )}
                  %
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-cyan-950/60">
                <div
                  className="h-full rounded-full bg-cyan-300/80 transition-all duration-500 ease-out"
                  style={{
                    width: `${((chordImproverStepIndex + 1) / CHORD_IMPROVER_STEPS.length) * 100}%`,
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {isRunning ? (
        <div className="mt-3 rounded-md border border-cyan-500/20 bg-black/35 p-2.5">
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-foreground/70">
            <span>
              {project.feature === "extraction"
                ? extractionCurrentStepLabel
                : progress.label}
            </span>
            <span>{Math.round(progress.percent)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-cyan-950/60">
            <div
              className="h-full rounded-full bg-cyan-300/80 transition-all duration-700 ease-out"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          {project.feature === "extraction" ? (
            <div className="mt-2.5 rounded-md border border-cyan-500/20 bg-black/35 p-2">
              <div className="extraction-process-wave" aria-hidden="true">
                {Array.from({ length: 12 }).map((_, index) => (
                  <span
                    key={`process-wave-${index}`}
                    style={{
                      animationDelay: `${-index * 0.08}s`,
                    }}
                  />
                ))}
              </div>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {EXTRACTION_PROCESS_STEPS.map((step, index) => {
                  const isActive = index === extractionStepActiveIndex;
                  const isDone = index < extractionStepActiveIndex;
                  return (
                    <p
                      key={step}
                      className={`rounded border px-2 py-1 text-[10px] tracking-wide ${
                        isActive
                          ? "border-cyan-300/45 bg-cyan-500/14 text-cyan-100"
                          : isDone
                            ? "border-cyan-700/35 bg-cyan-500/8 text-cyan-200/90"
                            : "border-cyan-700/30 bg-black/25 text-foreground/55"
                      }`}
                    >
                      {step}
                    </p>
                  );
                })}
              </div>
            </div>
          ) : null}
          <p className="mt-1 text-[10px] text-foreground/55">
            Elapsed: {formatElapsed(progress.elapsedSec)}
          </p>
        </div>
      ) : null}

      {project.analysis && project.feature !== "extraction" ? (
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-foreground/60">BPM</dt>
            <dd className="font-medium">{project.analysis.bpm.toFixed(1)}</dd>
          </div>
          <div>
            <dt className="text-foreground/60">Key</dt>
            <dd className="font-medium">{project.analysis.key}</dd>
          </div>
        </dl>
      ) : null}

      {starterExplanation ? (
        <div className="mt-3 rounded-md border border-cyan-500/20 bg-black/35 p-3 text-xs text-foreground/75">
          <p className="font-medium text-cyan-100/90">Idea notes</p>
          <p className="mt-1 leading-relaxed">{starterExplanation}</p>
        </div>
      ) : null}

      {project.assets ? (
        <div className="mt-4 space-y-3 text-sm">
          {project.feature === "extraction" &&
          project.assets.source_audio_url ? (
            <div className="rounded-xl border border-cyan-500/20 bg-black/40 p-3">
              <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-foreground/60">
                Original Track
              </p>
              <audio
                controls
                src={project.assets.source_audio_url}
                preload="none"
                className="w-full"
              />
            </div>
          ) : null}

          {project.feature !== "extraction" &&
          project.assets.source_audio_url ? (
            <audio
              controls
              src={project.assets.source_audio_url}
              preload="none"
              className="w-full"
            />
          ) : null}

          {project.feature === "extraction" && orderedStemEntries.length > 0 ? (
            <div className="rounded-xl border border-cyan-500/20 bg-black/35 p-3">
              <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-foreground/60">
                Stem Grid
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {orderedStemEntries.map(({ stemName, stemUrl }) => {
                  const normalizedStem = stemName.toLowerCase();
                  const target =
                    STEM_TARGET_MAP[normalizedStem as ExtractionStem] ?? null;
                  const isSelectedTarget = target
                    ? selectedStems.length === 0 ||
                      selectedStems.includes(REQUIRED_STEM_BY_TARGET[target])
                    : false;
                  const isGenerating = target
                    ? generatingTargets.includes(target)
                    : false;
                  const hasMidi = Boolean(
                    target && project.assets?.midi_stem_urls?.[target],
                  );
                  const isPlaying = Boolean(playingStems[stemName]);
                  const accentColor = stemAccentColor(stemName);
                  const barPattern = stemBarPattern(stemName);
                  const liveBars = stemWaveLevels[stemName];
                  const visualBars =
                    liveBars && liveBars.length === barPattern.length
                      ? liveBars
                      : Array.from(
                          { length: barPattern.length },
                          () => STEM_IDLE_BAR_HEIGHT,
                        );
                  const visualStyle = {
                    "--stem-accent": accentColor,
                  } as CSSProperties;

                  return (
                    <div
                      key={stemName}
                      className="rounded-xl border border-cyan-500/20 bg-black/45 p-3"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-[11px] uppercase tracking-[0.13em] text-cyan-100">
                          {stemName}
                        </p>
                        {target === null ? (
                          <span className="text-[10px] text-foreground/55">
                            No MIDI
                          </span>
                        ) : null}
                      </div>

                      <div
                        className={`stem-mini-wave ${isPlaying ? "stem-mini-wave-playing" : ""}`}
                        style={visualStyle}
                        aria-hidden="true"
                      >
                        {visualBars.map((height, index) => (
                          <span
                            key={`${stemName}-bar-${index}`}
                            style={{
                              height: `${height}px`,
                              transition:
                                "height 75ms ease-out, opacity 95ms linear",
                            }}
                          />
                        ))}
                      </div>

                      <audio
                        controls
                        src={stemUrl}
                        crossOrigin="anonymous"
                        preload="none"
                        className="mt-2 w-full"
                        onPlay={(event) => {
                          ensureStemVisualizerFor(
                            stemName,
                            event.currentTarget,
                          );
                          startStemVisualizerLoop();
                          setPlayingStems((previous) => ({
                            ...previous,
                            [stemName]: true,
                          }));
                        }}
                        onPause={() =>
                          setPlayingStems((previous) => ({
                            ...previous,
                            [stemName]: false,
                          }))
                        }
                        onEnded={() =>
                          setPlayingStems((previous) => ({
                            ...previous,
                            [stemName]: false,
                          }))
                        }
                      />

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {target ? (
                          <button
                            type="button"
                            onClick={() =>
                              onGenerateStemMidi?.(project.id, target)
                            }
                            disabled={
                              isGenerating ||
                              hasMidi ||
                              !onGenerateStemMidi ||
                              !isSelectedTarget
                            }
                            className="cyber-btn px-3 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {!isSelectedTarget
                              ? "Not selected"
                              : hasMidi
                                ? "MIDI Ready"
                                : isGenerating
                                  ? "Generating..."
                                  : `Generate ${target} MIDI`}
                          </button>
                        ) : (
                          <p className="text-xs text-foreground/60">
                            Drums are excluded from MIDI generation.
                          </p>
                        )}

                        {hasMidi && target ? (
                          <a
                            href={project.assets?.midi_stem_urls?.[target]}
                            target="_blank"
                            rel="noreferrer"
                            className="cyber-btn px-3 py-1 text-xs"
                          >
                            Download MIDI
                          </a>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {project.feature === "extraction" ? (
            <div className="rounded-xl border border-cyan-300/35 bg-gradient-to-br from-cyan-500/14 via-sky-500/10 to-blue-500/8 p-4 shadow-[0_0_30px_rgba(34,211,238,0.12)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-100">
                  MIDI Section
                </p>
                <span className="text-[10px] uppercase tracking-wide text-cyan-100/80">
                  Highlighted Output
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {project.assets.midi_base_url ? (
                  <a
                    href={project.assets.midi_base_url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-cyan-200/45 bg-cyan-500/20 px-4 py-2 text-xs font-medium uppercase tracking-wide text-cyan-50 transition hover:border-cyan-100/70 hover:bg-cyan-500/30"
                  >
                    Most Accurate MIDI
                  </a>
                ) : null}

                {project.assets.midi_stem_urls
                  ? Object.entries(project.assets.midi_stem_urls).map(
                      ([target, url]) => (
                        <a
                          key={target}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="cyber-btn px-3 py-1.5 text-xs"
                        >
                          {target[0]?.toUpperCase()}
                          {target.slice(1)} Stem MIDI
                        </a>
                      ),
                    )
                  : null}
              </div>
            </div>
          ) : null}

          {project.feature !== "extraction" ? (
            <div className="flex flex-wrap gap-2">
              {project.feature === "variation" ? (
                variationDownloadUrl ? (
                  <a
                    href={variationDownloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="cyber-btn px-3 py-1.5"
                  >
                    Download MIDI
                  </a>
                ) : null
              ) : (
                <>
                  {project.assets.midi_base_url ? (
                    <a
                      href={project.assets.midi_base_url}
                      target="_blank"
                      rel="noreferrer"
                      className="cyber-btn px-3 py-1.5"
                    >
                      Most Accurate MIDI
                    </a>
                  ) : null}
                  {project.assets.midi_variation_urls.map((url, index) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="cyber-btn px-3 py-1.5"
                    >
                      Variation {index + 1}
                    </a>
                  ))}
                  {project.assets.altered_midi_url ? (
                    <a
                      href={project.assets.altered_midi_url}
                      target="_blank"
                      rel="noreferrer"
                      className="cyber-btn px-3 py-1.5"
                    >
                      Altered MIDI
                    </a>
                  ) : null}
                </>
              )}
              {project.assets.midi_stem_urls
                ? Object.entries(project.assets.midi_stem_urls).map(
                    ([target, url]) => (
                      <a
                        key={target}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="cyber-btn px-3 py-1.5"
                      >
                        {target[0]?.toUpperCase()}
                        {target.slice(1)} Stem
                      </a>
                    ),
                  )
                : null}
            </div>
          ) : null}

          {project.feature === "variation" ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-cyan-500/20 bg-black/35 p-3 text-xs text-foreground/80">
                <p>
                  <span className="text-foreground/60">Original:</span>{" "}
                  {variationOriginalProgression.length > 0
                    ? variationOriginalProgression.join(" · ")
                    : "Unavailable"}
                </p>
                <p className="mt-1 text-cyan-100/95">
                  <span className="text-cyan-200/75">Improved:</span>{" "}
                  {improvedChordProgression.length > 0
                    ? improvedChordProgression.join(" · ")
                    : "Waiting for improved progression"}
                </p>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <StaticPianoRoll
                  title="Uploaded MIDI Preview"
                  notes={originalVariationNotes}
                />
                <StaticPianoRoll
                  title="Altered MIDI Preview"
                  notes={alteredVariationNotes}
                />
              </div>
            </div>
          ) : null}

          {previewNotes.length > 0 && project.feature !== "variation" ? (
            <div className="rounded-lg border border-cyan-500/20 bg-black/35 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-foreground/70">
                  Realtime MIDI piano roll ({selectedLane})
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-foreground/60">
                    t={elapsed.toFixed(2)}s · active {activeCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (streaming) {
                        setStreaming(false);
                        return;
                      }

                      void (async () => {
                        const ready = await prepareSoftPianoPlayback();
                        if (!ready) {
                          return;
                        }
                        nextNoteIndexRef.current = 0;
                        elapsedRef.current = 0;
                        setElapsed(0);
                        setStreaming(true);
                      })();
                    }}
                    className="cyber-btn px-3 py-1 text-xs"
                  >
                    {streaming ? "Stop" : "Start"}
                  </button>
                </div>
              </div>
              <div className="mb-2 flex flex-wrap gap-2">
                {previewLaneOptions.map((lane) => (
                  <button
                    key={lane}
                    type="button"
                    onClick={() => setSelectedLane(lane)}
                    className={`rounded-md border px-3 py-1 text-xs uppercase tracking-wide ${
                      selectedLane === lane
                        ? "border-cyan-300/50 bg-cyan-500/15 text-cyan-100"
                        : "border-cyan-700/40 bg-black/30 text-foreground/70"
                    }`}
                  >
                    {lane === "full" ? "Full mix" : `${lane} only`}
                  </button>
                ))}
              </div>
              <div className="min-w-0 max-w-full overflow-hidden rounded-md border border-cyan-500/20 bg-black/45">
                <div className="flex" style={{ height: `${rollHeight}px` }}>
                  <div className="relative w-16 shrink-0 border-r border-cyan-500/20 bg-black/60">
                    {pitchRows.map((pitch) => {
                      const top = ((maxPitch - pitch) / pitchSpan) * rollHeight;
                      const isCNote = pitch % 12 === 0;
                      return (
                        <div
                          key={pitch}
                          className="absolute left-0 right-0 border-b border-cyan-500/5"
                          style={{
                            top: `${top}px`,
                            height: `${rollHeight / pitchSpan}px`,
                          }}
                        >
                          {isCNote ? (
                            <span className="pointer-events-none absolute left-2 -translate-y-1/2 text-[10px] text-cyan-200/80">
                              {midiPitchToLabel(pitch)}
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  <div
                    ref={rollViewportRef}
                    className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden p-2"
                  >
                    <div
                      className="relative inline-block"
                      style={{
                        width: `${rollWidth}px`,
                        minWidth: `${rollWidth}px`,
                        height: `${rollHeight - 4}px`,
                        backgroundImage:
                          "repeating-linear-gradient(to right, rgba(34,211,238,0.10) 0, rgba(34,211,238,0.10) 1px, transparent 1px, transparent 30px), repeating-linear-gradient(to bottom, rgba(34,211,238,0.08) 0, rgba(34,211,238,0.08) 1px, transparent 1px, transparent 12px)",
                      }}
                    >
                      {laneNotes.map((note, index) => {
                        const left = (note.start / duration) * rollWidth;
                        const width = Math.max(
                          ((note.end - note.start) / duration) * rollWidth,
                          3,
                        );
                        const top =
                          ((maxPitch - note.pitch) / pitchSpan) *
                          (rollHeight - 12);
                        const isActive =
                          note.start <= elapsed && note.end >= elapsed;

                        const laneClass = laneColorClass(note.lane);

                        return (
                          <div
                            key={`${note.pitch}-${note.start}-${index}`}
                            className={`absolute rounded-sm ${laneClass} ${isActive ? "ring-1 ring-cyan-100/60" : "opacity-85"}`}
                            style={{
                              left: `${left}px`,
                              top: `${top}px`,
                              width: `${width}px`,
                              height: "8px",
                            }}
                            title={`${note.lane.toUpperCase()} · ${midiPitchToLabel(note.pitch)} · ${note.start.toFixed(2)}-${note.end.toFixed(2)}s`}
                          />
                        );
                      })}

                      {streaming ? (
                        <div
                          className="pointer-events-none absolute top-0 bottom-0 w-px bg-cyan-100/90"
                          style={{
                            left: `${Math.min((elapsed / duration) * rollWidth, rollWidth)}px`,
                            boxShadow: "0 0 12px rgba(125, 211, 252, 0.55)",
                          }}
                        />
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {project.status === "failed" && project.error_message ? (
        <p className="mt-3 text-xs text-danger">
          Error: {project.error_message}
        </p>
      ) : null}
    </article>
  );
};

export const ProjectCard = memo(ProjectCardComponent);
