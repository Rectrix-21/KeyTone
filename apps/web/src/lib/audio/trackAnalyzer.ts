import Essentia from "essentia.js/dist/essentia.js-core.es.js";
import createEssentiaWasm from "essentia.js/dist/essentia-wasm.web.js";
import type {
  AlternateKeyInsight,
  AnalyzerSection,
  TrackAnalyzerResult,
} from "@/types/api";

const KEY_NAMES = [
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

const MAJOR_PROFILE = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];
const MINOR_PROFILE = [
  6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];

type KeyMode = "major" | "minor";

type KeyScore = {
  root: number;
  mode: KeyMode;
  score: number;
};

type AnalyzeAccuracyMode = "balanced" | "high";

type SegmentSelection = {
  segment: Float32Array;
  startSec: number;
  durationSec: number;
};

type KeySegmentAnalysis = {
  startSec: number;
  durationSec: number;
  keyScores: KeyScore[];
  extractedKey: KeyScore;
  confidence: number;
};

type EssentiaLike = {
  arrayToVector: (input: Float32Array) => any;
  vectorToArray: (input: any) => Float32Array;
  RhythmExtractor2013: (
    signal: any,
    maxTempo?: number,
    method?: string,
    minTempo?: number,
  ) => any;
  LoopBpmConfidence: (
    signal: any,
    bpmEstimate: number,
    sampleRate?: number,
  ) => any;
  KeyExtractor: (...args: any[]) => any;
  TonalExtractor: (...args: any[]) => any;
};

let essentiaPromise: Promise<EssentiaLike> | null = null;

const RHYTHM_SAMPLE_RATE = 44100;
const TONAL_SAMPLE_RATE = 22050;
const KEY_ANALYSIS_SECONDS = 56;

type RhythmAnalysisResult = {
  bpm: number;
  bpmConfidence: number;
  tempoStability: number;
  ticks: number[];
  bpmIntervals: number[];
  startSec: number;
  durationSec: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length <= 1) {
    return 0;
  }
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function safeDelete(value: unknown): void {
  const maybeDelete = (value as { delete?: () => void })?.delete;
  if (typeof maybeDelete === "function") {
    maybeDelete.call(value);
  }
}

function numberOrDefault(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function vectorLikeToArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  const maybeVector = value as {
    size?: () => number;
    get?: (index: number) => unknown;
  };
  if (
    maybeVector &&
    typeof maybeVector.size === "function" &&
    typeof maybeVector.get === "function"
  ) {
    const size = maybeVector.size();
    const output: unknown[] = [];
    for (let i = 0; i < size; i += 1) {
      output.push(maybeVector.get(i));
    }
    return output;
  }

  return [];
}

function toNumberArray(value: unknown): number[] {
  return vectorLikeToArray(value)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));
}

function toStringArray(value: unknown): string[] {
  return vectorLikeToArray(value)
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length > 0);
}

function normalizeKeyName(value: string): string {
  const cleaned = value
    .trim()
    .toUpperCase()
    .replace("♯", "#")
    .replace("♭", "B");

  const aliases: Record<string, string> = {
    CB: "B",
    DB: "C#",
    EB: "D#",
    FB: "E",
    GB: "F#",
    AB: "G#",
    BB: "A#",
  };

  if (aliases[cleaned]) {
    return aliases[cleaned];
  }
  return cleaned;
}

function keyNameToIndex(value: string): number {
  return KEY_NAMES.indexOf(
    normalizeKeyName(value) as (typeof KEY_NAMES)[number],
  );
}

function rotate(values: number[], shift: number): number[] {
  return values.map(
    (_, index) => values[(index + shift + values.length) % values.length],
  );
}

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) {
    return 0;
  }

  const aSlice = a.slice(0, n);
  const bSlice = b.slice(0, n);
  const aMean = average(aSlice);
  const bMean = average(bSlice);

  let numerator = 0;
  let aVar = 0;
  let bVar = 0;

  for (let i = 0; i < n; i += 1) {
    const da = aSlice[i] - aMean;
    const db = bSlice[i] - bMean;
    numerator += da * db;
    aVar += da * da;
    bVar += db * db;
  }

  const denominator = Math.sqrt(aVar * bVar);
  if (denominator <= 1e-12) {
    return 0;
  }
  return numerator / denominator;
}

function scoreKeys(chroma: number[]): KeyScore[] {
  const scores: KeyScore[] = [];

  for (let root = 0; root < 12; root += 1) {
    const major = pearson(chroma, rotate(MAJOR_PROFILE, root));
    const minor = pearson(chroma, rotate(MINOR_PROFILE, root));
    scores.push({ root, mode: "major", score: major });
    scores.push({ root, mode: "minor", score: minor });
  }

  scores.sort((a, b) => b.score - a.score);
  return scores;
}

function formatKey(root: number, mode: KeyMode): string {
  return `${KEY_NAMES[root]} ${mode}`;
}

function getRelativeKey(
  root: number,
  mode: KeyMode,
): { root: number; mode: KeyMode } {
  if (mode === "major") {
    return { root: (root + 9) % 12, mode: "minor" };
  }
  return { root: (root + 3) % 12, mode: "major" };
}

function keyRelation(
  best: { root: number; mode: KeyMode },
  candidate: { root: number; mode: KeyMode },
  relative: { root: number; mode: KeyMode },
): "relative" | "parallel" | "neighbor" | "other" {
  if (candidate.root === relative.root && candidate.mode === relative.mode) {
    return "relative";
  }
  if (candidate.root === best.root && candidate.mode !== best.mode) {
    return "parallel";
  }

  const diff = Math.min(
    (candidate.root - best.root + 12) % 12,
    (best.root - candidate.root + 12) % 12,
  );
  if (diff <= 2) {
    return "neighbor";
  }
  return "other";
}

function downmixToMono(buffer: AudioBuffer): Float32Array {
  const channels = buffer.numberOfChannels;
  const output = new Float32Array(buffer.length);

  for (let channel = 0; channel < channels; channel += 1) {
    const source = buffer.getChannelData(channel);
    for (let i = 0; i < buffer.length; i += 1) {
      output[i] += source[i] / channels;
    }
  }

  return output;
}

function computeRmsEnvelope(
  samples: Float32Array,
  frameSize: number,
  hopSize: number,
): number[] {
  if (samples.length < frameSize) {
    return [0];
  }

  const frameCount = Math.floor((samples.length - frameSize) / hopSize) + 1;
  const rms: number[] = [];

  for (let frame = 0; frame < frameCount; frame += 1) {
    const start = frame * hopSize;
    let sumSq = 0;

    for (let i = 0; i < frameSize; i += 1) {
      const sample = samples[start + i] ?? 0;
      sumSq += sample * sample;
    }

    rms.push(Math.sqrt(sumSq / frameSize));
  }

  return rms;
}

function pickRepresentativeSegment(
  samples: Float32Array,
  sampleRate: number,
  segmentSeconds: number,
): SegmentSelection {
  const segmentSamples = Math.max(1, Math.floor(segmentSeconds * sampleRate));
  if (samples.length <= segmentSamples) {
    return {
      segment: samples,
      startSec: 0,
      durationSec: samples.length / sampleRate,
    };
  }

  const rms = computeRmsEnvelope(samples, 2048, 1024);
  const frameRate = sampleRate / 1024;
  const windowFrames = Math.max(1, Math.floor(segmentSeconds * frameRate));
  const stepFrames = Math.max(1, Math.floor(4 * frameRate));

  let bestFrame = 0;
  let bestScore = -Infinity;

  for (
    let startFrame = 0;
    startFrame + windowFrames <= rms.length;
    startFrame += stepFrames
  ) {
    const window = rms.slice(startFrame, startFrame + windowFrames);
    const score = average(window) + stdDev(window) * 0.8;
    if (score > bestScore) {
      bestScore = score;
      bestFrame = startFrame;
    }
  }

  const startSample = Math.min(
    samples.length - segmentSamples,
    Math.floor((bestFrame / frameRate) * sampleRate),
  );
  const segment = samples.slice(startSample, startSample + segmentSamples);

  return {
    segment,
    startSec: startSample / sampleRate,
    durationSec: segment.length / sampleRate,
  };
}

function dedupeSegmentSelections(
  segments: SegmentSelection[],
): SegmentSelection[] {
  const unique: SegmentSelection[] = [];
  const seen = new Set<string>();

  for (const segment of segments) {
    const key = `${Math.round(segment.startSec * 2)}:${Math.round(
      segment.durationSec * 2,
    )}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(segment);
  }

  return unique;
}

function resampleLinear(
  source: Float32Array,
  sourceRate: number,
  targetRate: number,
): Float32Array {
  if (sourceRate === targetRate) {
    return source;
  }

  const ratio = sourceRate / targetRate;
  const targetLength = Math.max(1, Math.floor(source.length / ratio));
  const output = new Float32Array(targetLength);

  for (let i = 0; i < targetLength; i += 1) {
    const sourceIndex = i * ratio;
    const left = Math.floor(sourceIndex);
    const right = Math.min(source.length - 1, left + 1);
    const frac = sourceIndex - left;
    output[i] = source[left] * (1 - frac) + source[right] * frac;
  }

  return output;
}

function foldTo12Bins(hpcp: number[]): number[] {
  if (hpcp.length === 0) {
    return new Array(12).fill(1 / 12);
  }

  const bins = new Array(12).fill(0);
  for (let i = 0; i < hpcp.length; i += 1) {
    bins[i % 12] += hpcp[i];
  }

  const total = bins.reduce((sum, value) => sum + value, 0);
  if (total <= 1e-9) {
    return new Array(12).fill(1 / 12);
  }

  return bins.map((value) => value / total);
}

function normalizeChordLabel(chord: string): string | null {
  const cleaned = chord.trim();
  if (!cleaned) {
    return null;
  }

  const match = cleaned.match(/^([A-Ga-g])([#b♯♭]?)(.*)$/);
  if (!match) {
    return null;
  }

  const letter = match[1].toUpperCase();
  const accidental = match[2].replace("♯", "#").replace("♭", "b");
  const suffix = match[3].toLowerCase();

  const root = normalizeKeyName(`${letter}${accidental}`);
  if (keyNameToIndex(root) === -1) {
    return null;
  }

  const isMinor = suffix.startsWith("m") && !suffix.startsWith("maj");
  return isMinor ? `${root}m` : root;
}

function normalizeChordSequence(chords: string[]): string[] {
  return chords
    .map((chord) => normalizeChordLabel(chord))
    .filter((chord): chord is string => Boolean(chord));
}

function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function computeChroma(
  samples: Float32Array,
  sampleRate: number,
): { chroma: number[]; frameChroma: number[][]; hopSize: number } {
  const frameSize = 2048;
  const hopSize = 1024;
  if (samples.length < frameSize) {
    return {
      chroma: new Array(12).fill(1 / 12),
      frameChroma: [],
      hopSize,
    };
  }

  const frameCount = Math.floor((samples.length - frameSize) / hopSize) + 1;
  const bins: Array<{ pc: number; coeff: number }> = [];

  for (let midi = 48; midi <= 83; midi += 1) {
    const frequency = midiToFrequency(midi);
    bins.push({
      pc: midi % 12,
      coeff: 2 * Math.cos((2 * Math.PI * frequency) / sampleRate),
    });
  }

  const chroma = new Array(12).fill(0);
  const frameChroma: number[][] = [];

  for (let frame = 0; frame < frameCount; frame += 1) {
    const start = frame * hopSize;
    const local = new Array(12).fill(0);

    for (const bin of bins) {
      let q0 = 0;
      let q1 = 0;
      let q2 = 0;
      for (let i = 0; i < frameSize; i += 1) {
        const sample = samples[start + i] ?? 0;
        q0 = bin.coeff * q1 - q2 + sample;
        q2 = q1;
        q1 = q0;
      }
      const power = q1 * q1 + q2 * q2 - bin.coeff * q1 * q2;
      local[bin.pc] += Math.max(0, power);
    }

    const localSum = local.reduce((sum, value) => sum + value, 0);
    const normalized =
      localSum > 0
        ? local.map((value) => value / localSum)
        : new Array(12).fill(1 / 12);

    frameChroma.push(normalized);
    for (let pc = 0; pc < 12; pc += 1) {
      chroma[pc] += normalized[pc];
    }
  }

  const chromaSum = chroma.reduce((sum, value) => sum + value, 0);
  const chromaNorm =
    chromaSum > 0
      ? chroma.map((value) => value / chromaSum)
      : new Array(12).fill(1 / 12);

  return { chroma: chromaNorm, frameChroma, hopSize };
}

function matchChord(chroma: number[]): { label: string; score: number } {
  let bestLabel = "C";
  let bestScore = -1;

  for (let root = 0; root < 12; root += 1) {
    const majorScore =
      chroma[root] +
      chroma[(root + 4) % 12] * 0.9 +
      chroma[(root + 7) % 12] * 0.78;
    if (majorScore > bestScore) {
      bestScore = majorScore;
      bestLabel = KEY_NAMES[root];
    }

    const minorScore =
      chroma[root] +
      chroma[(root + 3) % 12] * 0.9 +
      chroma[(root + 7) % 12] * 0.78;
    if (minorScore > bestScore) {
      bestScore = minorScore;
      bestLabel = `${KEY_NAMES[root]}m`;
    }
  }

  return { label: bestLabel, score: bestScore };
}

function detectChordProgressionByBars(
  frameChroma: number[][],
  sampleRate: number,
  hopSize: number,
  bpm: number,
  durationSec: number,
): string[] {
  if (frameChroma.length === 0 || bpm <= 0) {
    return [];
  }

  const hopSec = hopSize / sampleRate;
  const barSec = (60 / bpm) * 4;
  const maxBars = Math.min(16, Math.max(1, Math.floor(durationSec / barSec)));

  const progression: string[] = [];
  for (let bar = 0; bar < maxBars; bar += 1) {
    const barStart = bar * barSec;
    const barEnd = barStart + barSec;

    const aggregate = new Array(12).fill(0);
    let count = 0;

    for (let frame = 0; frame < frameChroma.length; frame += 1) {
      const time = frame * hopSec;
      if (time < barStart || time >= barEnd) {
        continue;
      }
      count += 1;
      const chroma = frameChroma[frame];
      for (let pc = 0; pc < 12; pc += 1) {
        aggregate[pc] += chroma[pc];
      }
    }

    if (count === 0) {
      continue;
    }

    const normalized = aggregate.map((value) => value / count);
    const chord = matchChord(normalized);
    if (chord.score < 0.23) {
      continue;
    }

    const previous = progression[progression.length - 1];
    if (previous !== chord.label) {
      progression.push(chord.label);
    }
  }

  return progression.slice(0, 10);
}

function detectChordProgressionFromBeats(
  frameChroma: number[][],
  sampleRate: number,
  hopSize: number,
  ticks: number[],
  bpm: number,
  durationSec: number,
): string[] {
  if (frameChroma.length === 0) {
    return [];
  }

  const hopSec = hopSize / sampleRate;
  const usableTicks = ticks
    .filter((tick) => tick >= 0 && tick <= durationSec)
    .sort((a, b) => a - b);

  if (usableTicks.length < 4) {
    return detectChordProgressionByBars(
      frameChroma,
      sampleRate,
      hopSize,
      bpm,
      durationSec,
    );
  }

  const windows: Array<{ start: number; end: number }> = [];
  for (let i = 0; i + 2 < usableTicks.length; i += 2) {
    const start = usableTicks[i];
    const end = usableTicks[i + 2];
    if (end - start >= 0.2) {
      windows.push({ start, end });
    }
  }

  const progression: string[] = [];
  for (const window of windows) {
    const aggregate = new Array(12).fill(0);
    let count = 0;

    for (let frame = 0; frame < frameChroma.length; frame += 1) {
      const time = frame * hopSec;
      if (time < window.start || time >= window.end) {
        continue;
      }
      count += 1;
      const chroma = frameChroma[frame];
      for (let pc = 0; pc < 12; pc += 1) {
        aggregate[pc] += chroma[pc];
      }
    }

    if (count === 0) {
      continue;
    }

    const normalized = aggregate.map((value) => value / count);
    const chord = matchChord(normalized);
    if (chord.score < 0.22) {
      continue;
    }

    const previous = progression[progression.length - 1];
    if (previous !== chord.label) {
      progression.push(chord.label);
    }
  }

  if (progression.length === 0) {
    return detectChordProgressionByBars(
      frameChroma,
      sampleRate,
      hopSize,
      bpm,
      durationSec,
    );
  }

  return progression.slice(0, 10);
}

function blendKeyScores(
  hpcpScores: KeyScore[],
  chromaScores: KeyScore[],
): KeyScore[] {
  const map = new Map<string, KeyScore>();

  const apply = (scores: KeyScore[], weight: number) => {
    for (const score of scores) {
      const key = `${score.root}:${score.mode}`;
      const previous = map.get(key);
      const contribution = score.score * weight;
      if (!previous) {
        map.set(key, {
          root: score.root,
          mode: score.mode,
          score: contribution,
        });
      } else {
        previous.score += contribution;
      }
    }
  };

  apply(hpcpScores, 0.7);
  apply(chromaScores, 0.3);

  return Array.from(map.values()).sort((a, b) => b.score - a.score);
}

function buildAlternateKeys(
  primaryKey: KeyScore,
  relative: { root: number; mode: KeyMode },
  candidateScores: KeyScore[],
): AlternateKeyInsight[] {
  const base = candidateScores
    .filter(
      (score) =>
        score.root !== primaryKey.root || score.mode !== primaryKey.mode,
    )
    .map((score) => ({
      key: formatKey(score.root, score.mode),
      confidence: roundTo(clamp((score.score + 1) / 2, 0.01, 1), 3),
      relation: keyRelation(
        { root: primaryKey.root, mode: primaryKey.mode },
        { root: score.root, mode: score.mode },
        relative,
      ),
    }));

  const relativeLabel = formatKey(relative.root, relative.mode);
  if (!base.some((item) => item.key === relativeLabel)) {
    base.unshift({
      key: relativeLabel,
      confidence: 0.35,
      relation: "relative",
    });
  }

  const unique: AlternateKeyInsight[] = [];
  for (const item of base) {
    if (!unique.some((existing) => existing.key === item.key)) {
      unique.push(item);
    }
    if (unique.length >= 4) {
      break;
    }
  }

  return unique;
}

function estimateEnergyScore(rms: number[]): number {
  if (rms.length === 0) {
    return 0;
  }

  const sorted = [...rms].sort((a, b) => a - b);
  const mean = average(rms);
  const p95 =
    sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1] ?? 0;
  const score = (mean * 2.25 + p95 * 1.8) * 100;
  return roundTo(clamp(score, 0, 100), 1);
}

function classifyMood(
  keyMode: KeyMode,
  energyScore: number,
): "dark" | "happy" | "emotional" | "energetic" | "calm" {
  if (keyMode === "minor") {
    if (energyScore >= 70) {
      return "energetic";
    }
    if (energyScore >= 45) {
      return "emotional";
    }
    return "dark";
  }

  if (energyScore >= 70) {
    return "energetic";
  }
  if (energyScore >= 45) {
    return "happy";
  }
  return "calm";
}

function detectGroove(
  ticks: number[],
  bpm: number,
): "tight" | "swing" | "humanized" {
  if (ticks.length < 6 || bpm <= 0) {
    return "humanized";
  }

  const beatSec = 60 / bpm;
  const quantErrors = ticks.map((time) => {
    const subdivisions = time / beatSec;
    const nearest = Math.round(subdivisions * 2) / 2;
    return Math.abs(subdivisions - nearest) * beatSec;
  });
  const meanError = average(quantErrors);

  const offbeatDelays: number[] = [];
  for (const time of ticks) {
    const beatPos = (time / beatSec) % 1;
    if (Math.abs(beatPos - 0.5) <= 0.2) {
      offbeatDelays.push((beatPos - 0.5) * beatSec);
    }
  }
  const meanOffbeatDelay = average(offbeatDelays);

  if (meanOffbeatDelay > beatSec * 0.06 && meanError < beatSec * 0.09) {
    return "swing";
  }
  if (meanError < beatSec * 0.03) {
    return "tight";
  }
  return "humanized";
}

function estimateTempoStability(
  ticks: number[],
  bpmIntervals: number[],
): number {
  let intervals = bpmIntervals.filter((value) => value > 0);

  if (intervals.length < 3 && ticks.length > 3) {
    intervals = [];
    for (let i = 1; i < ticks.length; i += 1) {
      const delta = ticks[i] - ticks[i - 1];
      if (delta > 0) {
        intervals.push(delta);
      }
    }
  }

  if (intervals.length < 3) {
    return 0.45;
  }

  const mean = average(intervals);
  if (mean <= 1e-9) {
    return 0.45;
  }

  const cv = stdDev(intervals) / mean;
  return clamp(1 - cv * 2.7, 0.05, 1);
}

function normalizeBpmCandidates(candidates: number[]): number[] {
  const expanded: number[] = [];
  const factors = [0.5, 1, 2];

  for (const candidate of candidates) {
    if (!Number.isFinite(candidate) || candidate <= 0) {
      continue;
    }
    for (const factor of factors) {
      const value = candidate * factor;
      if (value >= 40 && value <= 208) {
        expanded.push(roundTo(value, 2));
      }
    }
  }

  const unique: number[] = [];
  for (const candidate of expanded) {
    if (!unique.some((existing) => Math.abs(existing - candidate) < 0.2)) {
      unique.push(candidate);
    }
  }

  return unique;
}

function selectBestBpm(
  essentia: EssentiaLike,
  rhythmSignalVector: unknown,
  initialBpm: number,
  rhythmEstimates: number[],
): { bpm: number; loopConfidence: number } {
  const candidates = normalizeBpmCandidates([initialBpm, ...rhythmEstimates]);
  if (candidates.length === 0) {
    const confidence = clamp(
      numberOrDefault(
        essentia.LoopBpmConfidence(
          rhythmSignalVector,
          initialBpm,
          RHYTHM_SAMPLE_RATE,
        )?.confidence,
        0,
      ),
      0,
      1,
    );
    return { bpm: initialBpm, loopConfidence: confidence };
  }

  let bestBpm = initialBpm;
  let bestConfidence = -1;

  for (const candidate of candidates) {
    const confidence = clamp(
      numberOrDefault(
        essentia.LoopBpmConfidence(
          rhythmSignalVector,
          candidate,
          RHYTHM_SAMPLE_RATE,
        )?.confidence,
        0,
      ),
      0,
      1,
    );

    if (confidence > bestConfidence) {
      bestConfidence = confidence;
      bestBpm = candidate;
    }
  }

  return { bpm: bestBpm, loopConfidence: Math.max(0, bestConfidence) };
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function estimateTickBpm(
  ticks: number[],
  bpmIntervals: number[],
): number | null {
  let intervals = bpmIntervals.filter((value) => value > 0);
  if (intervals.length < 3 && ticks.length > 3) {
    intervals = [];
    for (let i = 1; i < ticks.length; i += 1) {
      const delta = ticks[i] - ticks[i - 1];
      if (delta > 0) {
        intervals.push(delta);
      }
    }
  }

  if (intervals.length < 3) {
    return null;
  }

  const beatSec = median(intervals);
  if (beatSec <= 1e-9) {
    return null;
  }

  let bpm = 60 / beatSec;
  while (bpm < 40) {
    bpm *= 2;
  }
  while (bpm > 208) {
    bpm *= 0.5;
  }

  return roundTo(clamp(bpm, 40, 208), 2);
}

function pickSegmentByRatio(
  samples: Float32Array,
  sampleRate: number,
  centerRatio: number,
  segmentSeconds: number,
): SegmentSelection {
  const totalSec = samples.length / sampleRate;
  if (totalSec <= segmentSeconds) {
    return {
      segment: samples,
      startSec: 0,
      durationSec: totalSec,
    };
  }

  const startSec = clamp(
    totalSec * centerRatio - segmentSeconds * 0.5,
    0,
    totalSec - segmentSeconds,
  );
  const startSample = Math.floor(startSec * sampleRate);
  const lengthSamples = Math.floor(segmentSeconds * sampleRate);
  const segment = samples.slice(startSample, startSample + lengthSamples);

  return {
    segment,
    startSec,
    durationSec: segment.length / sampleRate,
  };
}

function mergeWeightedKeyScores(
  sources: Array<{ scores: KeyScore[]; weight: number }>,
  votes: Array<{ root: number; mode: KeyMode; weight: number }> = [],
): KeyScore[] {
  const map = new Map<string, KeyScore>();

  let sourceWeightTotal = 0;
  for (const source of sources) {
    const weight = Math.max(0, source.weight);
    if (weight <= 0) {
      continue;
    }
    sourceWeightTotal += weight;

    for (const score of source.scores) {
      const key = `${score.root}:${score.mode}`;
      const existing = map.get(key);
      const value = score.score * weight;

      if (!existing) {
        map.set(key, {
          root: score.root,
          mode: score.mode,
          score: value,
        });
      } else {
        existing.score += value;
      }
    }
  }

  let voteWeightTotal = 0;
  for (const vote of votes) {
    const weight = Math.max(0, vote.weight);
    if (weight <= 0) {
      continue;
    }
    voteWeightTotal += weight;

    const key = `${vote.root}:${vote.mode}`;
    const existing = map.get(key);
    const bonus = weight * 0.14;

    if (!existing) {
      map.set(key, {
        root: vote.root,
        mode: vote.mode,
        score: bonus,
      });
    } else {
      existing.score += bonus;
    }
  }

  const divisor = Math.max(1e-6, sourceWeightTotal + voteWeightTotal * 0.14);

  return Array.from(map.values())
    .map((score) => ({
      ...score,
      score: score.score / divisor,
    }))
    .sort((a, b) => b.score - a.score);
}

function analyzeRhythmSegment(
  essentia: EssentiaLike,
  rhythmSamples: Float32Array,
  startSec: number,
  durationSec: number,
): RhythmAnalysisResult {
  let signalVector: unknown = null;

  try {
    signalVector = essentia.arrayToVector(rhythmSamples);

    const rhythm = essentia.RhythmExtractor2013(
      signalVector,
      208,
      "multifeature",
      40,
    );

    const initialBpm = roundTo(
      clamp(numberOrDefault(rhythm?.bpm, 120), 40, 208),
      2,
    );
    const ticks = toNumberArray(rhythm?.ticks).sort((a, b) => a - b);
    const bpmIntervals = toNumberArray(rhythm?.bpmIntervals);
    const rhythmEstimates = toNumberArray(rhythm?.estimates);
    const tickBpm = estimateTickBpm(ticks, bpmIntervals);

    const candidatePool =
      tickBpm === null ? rhythmEstimates : [...rhythmEstimates, tickBpm];
    const bestBpm = selectBestBpm(
      essentia,
      signalVector,
      initialBpm,
      candidatePool,
    );

    let rhythmConfidence = clamp(numberOrDefault(rhythm?.confidence, 0), 0, 1);
    const loopConfidence = bestBpm.loopConfidence;
    if (rhythmConfidence < 0.15) {
      rhythmConfidence = loopConfidence;
    }

    const bpmConfidence = roundTo(
      clamp(Math.max(rhythmConfidence, loopConfidence * 0.9), 0.05, 1),
      3,
    );

    return {
      bpm: bestBpm.bpm,
      bpmConfidence,
      tempoStability: roundTo(estimateTempoStability(ticks, bpmIntervals), 3),
      ticks,
      bpmIntervals,
      startSec,
      durationSec,
    };
  } finally {
    safeDelete(signalVector);
  }
}

function aggregateRhythmResults(
  results: RhythmAnalysisResult[],
): RhythmAnalysisResult & { segmentCount: number } {
  if (results.length === 1) {
    return {
      ...results[0],
      segmentCount: 1,
    };
  }

  let bestIndex = 0;
  let bestSupport = -Infinity;

  for (let i = 0; i < results.length; i += 1) {
    const candidate = results[i];
    let support = 0;

    for (const result of results) {
      const relDiff =
        Math.abs(candidate.bpm - result.bpm) /
        Math.max(candidate.bpm, result.bpm, 1e-6);
      const closeness = Math.exp(-(relDiff * relDiff) / 0.0064);
      support += result.bpmConfidence * closeness;
    }

    if (support > bestSupport) {
      bestSupport = support;
      bestIndex = i;
    }
  }

  const target = results[bestIndex];
  const aligned = results.filter((result) => {
    const relDiff =
      Math.abs(result.bpm - target.bpm) /
      Math.max(result.bpm, target.bpm, 1e-6);
    return relDiff <= 0.08;
  });

  const pool = aligned.length > 0 ? aligned : [target];
  const totalWeight = Math.max(
    1e-6,
    pool.reduce((sum, result) => sum + result.bpmConfidence, 0),
  );

  const bpm = roundTo(
    pool.reduce((sum, result) => sum + result.bpm * result.bpmConfidence, 0) /
      totalWeight,
    2,
  );
  const tempoStability = roundTo(
    pool.reduce(
      (sum, result) => sum + result.tempoStability * result.bpmConfidence,
      0,
    ) / totalWeight,
    3,
  );
  const weightedConfidence =
    pool.reduce(
      (sum, result) => sum + result.bpmConfidence * result.bpmConfidence,
      0,
    ) / totalWeight;
  const consensus = pool.length / results.length;
  const bpmConfidence = roundTo(
    clamp(weightedConfidence * 0.8 + consensus * 0.3, 0.05, 1),
    3,
  );

  const source = [...pool].sort((a, b) => b.bpmConfidence - a.bpmConfidence)[0];

  return {
    bpm,
    bpmConfidence,
    tempoStability,
    ticks: source.ticks,
    bpmIntervals: source.bpmIntervals,
    startSec: source.startSec,
    durationSec: source.durationSec,
    segmentCount: results.length,
  };
}

function estimateSections(
  rms: number[],
  sampleRate: number,
  hopSize: number,
  durationSec: number,
): AnalyzerSection[] {
  if (rms.length === 0 || durationSec <= 1) {
    return [];
  }

  const windowSec = 8;
  const frameSec = hopSize / sampleRate;
  const windowFrames = Math.max(1, Math.floor(windowSec / frameSec));

  const windowEnergy: number[] = [];
  for (let start = 0; start < rms.length; start += windowFrames) {
    const slice = rms.slice(start, start + windowFrames);
    windowEnergy.push(average(slice));
  }

  const peakWindow = windowEnergy.reduce(
    (bestIndex, value, index, arr) =>
      value > arr[bestIndex] ? index : bestIndex,
    0,
  );

  const peakCenterRatio = clamp(
    ((peakWindow + 0.5) * windowSec) / durationSec,
    0.4,
    0.82,
  );
  const chorusStart = clamp(peakCenterRatio - 0.12, 0.38, 0.78) * durationSec;
  const introEnd = Math.min(durationSec * 0.18, chorusStart * 0.55);
  const verseEnd = Math.max(introEnd + durationSec * 0.22, chorusStart);
  const outroStart = Math.max(
    chorusStart + durationSec * 0.22,
    durationSec * 0.84,
  );

  const sections: AnalyzerSection[] = [];

  const pushSection = (
    label: AnalyzerSection["label"],
    startSec: number,
    endSec: number,
  ) => {
    if (endSec - startSec < 2) {
      return;
    }

    const startFrame = Math.max(0, Math.floor(startSec / frameSec));
    const endFrame = Math.min(rms.length, Math.ceil(endSec / frameSec));
    const localEnergy = average(rms.slice(startFrame, endFrame));

    sections.push({
      label,
      startSec: roundTo(startSec, 2),
      endSec: roundTo(endSec, 2),
      energy: roundTo(clamp(localEnergy * 300, 0, 100), 1),
    });
  };

  pushSection("intro", 0, introEnd);
  pushSection("verse", introEnd, verseEnd);
  pushSection("chorus", verseEnd, outroStart);

  if (durationSec - outroStart > 8 && durationSec > 70) {
    const bridgeEnd = Math.min(
      durationSec - 6,
      outroStart + (durationSec - outroStart) * 0.45,
    );
    pushSection("bridge", outroStart, bridgeEnd);
    pushSection("outro", bridgeEnd, durationSec);
  } else {
    pushSection("outro", outroStart, durationSec);
  }

  return sections;
}

function parseKey(
  keyValue: unknown,
  scaleValue: unknown,
  fallback: KeyScore,
): KeyScore {
  const keyName = String(keyValue ?? "").trim();
  const keyIndex = keyNameToIndex(keyName);
  const scale = String(scaleValue ?? "").toLowerCase();
  const mode: KeyMode = scale.startsWith("min") ? "minor" : "major";

  if (keyIndex === -1) {
    return fallback;
  }

  return {
    root: keyIndex,
    mode,
    score: fallback.score,
  };
}

async function getEssentia(): Promise<EssentiaLike> {
  if (!essentiaPromise) {
    essentiaPromise = (async () => {
      const wasmModule = await createEssentiaWasm({
        locateFile: (path: string) => {
          if (path.endsWith(".wasm")) {
            return "/essentia/essentia-wasm.web.wasm";
          }
          return path;
        },
      });
      return new Essentia(wasmModule, false) as EssentiaLike;
    })();
  }

  return essentiaPromise;
}

export async function analyzeTrackInBrowser(
  file: File,
  options: {
    segmentSeconds?: number;
    targetSampleRate?: number;
    accuracyMode?: AnalyzeAccuracyMode;
  } = {},
): Promise<TrackAnalyzerResult> {
  const accuracyMode = options.accuracyMode ?? "balanced";
  const tonalSampleRate =
    options.targetSampleRate ??
    (accuracyMode === "high" ? 24000 : TONAL_SAMPLE_RATE);
  const segmentSeconds =
    accuracyMode === "high"
      ? clamp(options.segmentSeconds ?? 30, 24, 34)
      : clamp(options.segmentSeconds ?? 28, 20, 30);
  const keySegmentSeconds =
    accuracyMode === "high"
      ? clamp(Math.max(KEY_ANALYSIS_SECONDS + 8, segmentSeconds * 2), 44, 84)
      : clamp(Math.max(KEY_ANALYSIS_SECONDS, segmentSeconds * 1.8), 36, 72);

  const arrayBuffer = await file.arrayBuffer();
  const audioContext = new AudioContext();
  let chordSignalVector: unknown = null;

  try {
    const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const mono = downmixToMono(decoded);
    const rhythmSegmentInfo = pickRepresentativeSegment(
      mono,
      decoded.sampleRate,
      segmentSeconds,
    );
    const keySegmentInfo = pickRepresentativeSegment(
      mono,
      decoded.sampleRate,
      keySegmentSeconds,
    );

    const rhythmCenterRatios =
      accuracyMode === "high" ? [0.2, 0.35, 0.65, 0.8] : [0.35, 0.65];
    const rhythmSegmentCandidates = [
      rhythmSegmentInfo,
      ...rhythmCenterRatios.map((ratio) =>
        pickSegmentByRatio(mono, decoded.sampleRate, ratio, segmentSeconds),
      ),
    ];
    const uniqueRhythmSegments = dedupeSegmentSelections(
      rhythmSegmentCandidates,
    );

    const keyCenterRatios =
      accuracyMode === "high" ? [0.22, 0.5, 0.78] : [0.3, 0.7];
    const keySegmentCandidates = [
      keySegmentInfo,
      ...keyCenterRatios.map((ratio) =>
        pickSegmentByRatio(mono, decoded.sampleRate, ratio, keySegmentSeconds),
      ),
    ];
    const uniqueKeySegments = dedupeSegmentSelections(keySegmentCandidates);

    const chordSamples = resampleLinear(
      rhythmSegmentInfo.segment,
      decoded.sampleRate,
      tonalSampleRate,
    );

    const rms = computeRmsEnvelope(chordSamples, 1024, 512);
    const essentia = await getEssentia();

    const rhythmResults = uniqueRhythmSegments.map((segmentInfo) => {
      const rhythmSamples = resampleLinear(
        segmentInfo.segment,
        decoded.sampleRate,
        RHYTHM_SAMPLE_RATE,
      );

      return analyzeRhythmSegment(
        essentia,
        rhythmSamples,
        segmentInfo.startSec,
        segmentInfo.durationSec,
      );
    });
    const rhythmAggregate = aggregateRhythmResults(rhythmResults);
    const bpm = rhythmAggregate.bpm;
    const ticks = rhythmAggregate.ticks;
    const bpmIntervals = rhythmAggregate.bpmIntervals;
    const bpmConfidence = rhythmAggregate.bpmConfidence;
    const tempoStability = rhythmAggregate.tempoStability;

    chordSignalVector = essentia.arrayToVector(chordSamples);
    const tonalForChords = essentia.TonalExtractor(
      chordSignalVector,
      4096,
      2048,
      440,
    );

    const keySegmentAnalyses: KeySegmentAnalysis[] = [];

    for (const segmentInfo of uniqueKeySegments) {
      const keySamples = resampleLinear(
        segmentInfo.segment,
        decoded.sampleRate,
        tonalSampleRate,
      );

      let keyVector: unknown = null;
      try {
        keyVector = essentia.arrayToVector(keySamples);

        const keyExtraction = essentia.KeyExtractor(
          keyVector,
          true,
          4096,
          2048,
          12,
          3500,
          60,
          25,
          0.2,
          "bgate",
          tonalSampleRate,
          0.0001,
          440,
          "cosine",
          "hann",
        );

        const tonalForKey = essentia.TonalExtractor(keyVector, 4096, 2048, 440);
        const hpcpHighRes = toNumberArray(tonalForKey?.hpcp_highres);
        const hpcp =
          hpcpHighRes.length > 0
            ? foldTo12Bins(hpcpHighRes)
            : foldTo12Bins(toNumberArray(tonalForKey?.hpcp));

        const keyChroma = computeChroma(keySamples, tonalSampleRate);
        const segmentScores = blendKeyScores(
          scoreKeys(hpcp),
          scoreKeys(keyChroma.chroma),
        );

        const fallback = segmentScores[0] ?? {
          root: 0,
          mode: "major" as KeyMode,
          score: 0,
        };
        const extracted = parseKey(
          keyExtraction?.key,
          keyExtraction?.scale,
          fallback,
        );
        const second = segmentScores.find(
          (score) =>
            score.root !== fallback.root || score.mode !== fallback.mode,
        ) ??
          segmentScores[1] ?? {
            root: (fallback.root + 7) % 12,
            mode: fallback.mode === "major" ? "minor" : "major",
            score: fallback.score - 0.08,
          };

        const keyStrength = clamp(
          numberOrDefault(keyExtraction?.strength, 0),
          0,
          1,
        );
        const localGapConfidence = clamp(
          (fallback.score - second.score) * 0.72 + 0.5,
          0.05,
          1,
        );

        keySegmentAnalyses.push({
          startSec: segmentInfo.startSec,
          durationSec: segmentInfo.durationSec,
          keyScores: segmentScores,
          extractedKey: extracted,
          confidence: roundTo(Math.max(keyStrength, localGapConfidence), 3),
        });
      } finally {
        safeDelete(keyVector);
      }
    }

    const mergedKeyScores = mergeWeightedKeyScores(
      keySegmentAnalyses.map((segment) => ({
        scores: segment.keyScores,
        weight: 0.45 + segment.confidence,
      })),
      keySegmentAnalyses.map((segment) => ({
        root: segment.extractedKey.root,
        mode: segment.extractedKey.mode,
        weight: segment.confidence,
      })),
    );

    const primaryKey = mergedKeyScores[0] ?? {
      root: 0,
      mode: "major" as KeyMode,
      score: 0,
    };

    const secondKey = mergedKeyScores.find(
      (score) =>
        score.root !== primaryKey.root || score.mode !== primaryKey.mode,
    ) ??
      mergedKeyScores[1] ?? {
        root: (primaryKey.root + 7) % 12,
        mode: primaryKey.mode === "major" ? "minor" : "major",
        score: primaryKey.score - 0.08,
      };

    const keyVoteWeight = Math.max(
      1e-6,
      keySegmentAnalyses.reduce((sum, segment) => sum + segment.confidence, 0),
    );
    const keyAgreement =
      keySegmentAnalyses.reduce((sum, segment) => {
        if (
          segment.extractedKey.root === primaryKey.root &&
          segment.extractedKey.mode === primaryKey.mode
        ) {
          return sum + segment.confidence;
        }
        return sum;
      }, 0) / keyVoteWeight;
    const weightedSegmentConfidence =
      keySegmentAnalyses.reduce(
        (sum, segment) => sum + segment.confidence * segment.confidence,
        0,
      ) / keyVoteWeight;
    const scoreGapConfidence = clamp(
      (primaryKey.score - secondKey.score) * 0.9 + 0.5,
      0.05,
      1,
    );
    const keyConfidence = roundTo(
      clamp(
        Math.max(
          scoreGapConfidence,
          weightedSegmentConfidence * 0.92,
          keyAgreement * 0.98,
        ),
        0.05,
        1,
      ),
      3,
    );

    const keyReferenceSegment = [...keySegmentAnalyses].sort((a, b) => {
      const aMatch =
        a.extractedKey.root === primaryKey.root &&
        a.extractedKey.mode === primaryKey.mode
          ? 0.2
          : 0;
      const bMatch =
        b.extractedKey.root === primaryKey.root &&
        b.extractedKey.mode === primaryKey.mode
          ? 0.2
          : 0;
      return b.confidence + bMatch - (a.confidence + aMatch);
    })[0] ?? {
      startSec: keySegmentInfo.startSec,
      durationSec: keySegmentInfo.durationSec,
    };

    const relative = getRelativeKey(primaryKey.root, primaryKey.mode);
    const alternateKeys = buildAlternateKeys(
      primaryKey,
      relative,
      mergedKeyScores,
    );

    const essentiaChords = normalizeChordSequence(
      toStringArray(tonalForChords?.chords_progression),
    );
    const chordChroma = computeChroma(chordSamples, tonalSampleRate);
    const chromaChords = detectChordProgressionFromBeats(
      chordChroma.frameChroma,
      tonalSampleRate,
      chordChroma.hopSize,
      ticks,
      bpm,
      rhythmSegmentInfo.durationSec,
    );

    const chordProgressionSource =
      chromaChords.length >= 3
        ? chromaChords
        : essentiaChords.length >= 3
          ? essentiaChords
          : chromaChords.length >= essentiaChords.length
            ? chromaChords
            : essentiaChords;
    const chordProgression = chordProgressionSource.slice(0, 8);

    const energyScore = estimateEnergyScore(rms);
    const mood = classifyMood(primaryKey.mode, energyScore);
    const groove = detectGroove(ticks, bpm);
    const sections = estimateSections(
      rms,
      tonalSampleRate,
      512,
      rhythmSegmentInfo.durationSec,
    );

    return {
      bpm,
      bpmConfidence,
      key: formatKey(primaryKey.root, primaryKey.mode),
      keyConfidence,
      relativeKey: formatKey(relative.root, relative.mode),
      alternateKeys,
      energyScore,
      mood,
      groove,
      chordProgression,
      sections,
      tempoStability,
      analysisJson: {
        fileName: file.name,
        analysisEngine: "essentia.js",
        analysisMode: accuracyMode,
        tempoMethod: "RhythmExtractor2013 ensemble (multi-segment)",
        segmentStartSec: roundTo(rhythmAggregate.startSec, 2),
        segmentDurationSec: roundTo(rhythmAggregate.durationSec, 2),
        rhythmSegmentsAnalyzed: rhythmAggregate.segmentCount,
        keyMethod: "KeyExtractor + HPCP/chroma ensemble (multi-segment)",
        keySegmentStartSec: roundTo(keyReferenceSegment.startSec, 2),
        keySegmentDurationSec: roundTo(keyReferenceSegment.durationSec, 2),
        keySegmentsAnalyzed: keySegmentAnalyses.length,
        rhythmSampleRate: RHYTHM_SAMPLE_RATE,
        tonalSampleRate,
        bpm,
        bpmConfidence,
        tempoStability,
        key: formatKey(primaryKey.root, primaryKey.mode),
        keyConfidence,
        relativeKey: formatKey(relative.root, relative.mode),
        alternateKeys,
        energyScore,
        mood,
        groove,
        essentiaChordProgression: essentiaChords,
        chromaChordProgression: chromaChords,
        chordProgression,
        sections,
      },
    };
  } finally {
    safeDelete(chordSignalVector);
    void audioContext.close();
  }
}
