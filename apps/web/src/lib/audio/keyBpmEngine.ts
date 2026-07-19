import { SoundTouchNode, processOffline } from "@soundtouchjs/audio-worklet";
import { analyzeTrackInBrowser } from "@/lib/audio/trackAnalyzer";

const PROCESSOR_URL = "/soundtouch/soundtouch-processor.js";
const MIN_TEMPO_RATIO = 0.5;
const MAX_TEMPO_RATIO = 1.5;
const MIN_PITCH_SEMITONES = -12;
const MAX_PITCH_SEMITONES = 12;

const registeredContexts = new WeakMap<BaseAudioContext, Promise<void>>();

function registerSoundTouchWorklet(context: BaseAudioContext): Promise<void> {
  let pending = registeredContexts.get(context);
  if (!pending) {
    pending = SoundTouchNode.register(context, PROCESSOR_URL);
    registeredContexts.set(context, pending);
  }
  return pending;
}

export function clampTempoRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(MAX_TEMPO_RATIO, Math.max(MIN_TEMPO_RATIO, value));
}

export function clampPitchSemitones(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(
    MAX_PITCH_SEMITONES,
    Math.max(MIN_PITCH_SEMITONES, Math.round(value)),
  );
}

export { MIN_TEMPO_RATIO, MAX_TEMPO_RATIO, MIN_PITCH_SEMITONES, MAX_PITCH_SEMITONES };

export interface DetectedBaseline {
  bpm: number;
  key: string;
}

export async function detectOriginalBpmKey(
  file: File,
): Promise<DetectedBaseline> {
  const result = await analyzeTrackInBrowser(file, { accuracyMode: "balanced" });
  return { bpm: result.bpm, key: result.key };
}

export async function renderProcessedBuffer(
  input: AudioBuffer,
  options: { pitchSemitones: number; tempoRatio: number },
): Promise<AudioBuffer> {
  return processOffline({
    input,
    processorUrl: PROCESSOR_URL,
    pitchSemitones: clampPitchSemitones(options.pitchSemitones),
    playbackRate: clampTempoRatio(options.tempoRatio),
  });
}

interface PlayerState {
  bufferOffsetSec: number;
  contextTimeAtOffset: number;
  isPlaying: boolean;
}

export class LiveKeyBpmPlayer {
  private context: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private stNode: SoundTouchNode | null = null;
  private gainNode: GainNode | null = null;
  private tempoRatio = 1;
  private pitchSemitones = 0;
  private state: PlayerState = {
    bufferOffsetSec: 0,
    contextTimeAtOffset: 0,
    isPlaying: false,
  };
  private onEndedCallback: (() => void) | null = null;

  async load(buffer: AudioBuffer): Promise<void> {
    this.stop();
    this.buffer = buffer;

    if (!this.context) {
      this.context = new AudioContext();
    }
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
    await registerSoundTouchWorklet(this.context);

    this.state = {
      bufferOffsetSec: 0,
      contextTimeAtOffset: this.context.currentTime,
      isPlaying: false,
    };
  }

  setOnEnded(callback: (() => void) | null): void {
    this.onEndedCallback = callback;
  }

  get duration(): number {
    return this.buffer?.duration ?? 0;
  }

  private computeOffsetSec(): number {
    if (!this.context) {
      return this.state.bufferOffsetSec;
    }
    if (!this.state.isPlaying) {
      return this.state.bufferOffsetSec;
    }
    const elapsedReal = this.context.currentTime - this.state.contextTimeAtOffset;
    return this.state.bufferOffsetSec + elapsedReal * this.tempoRatio;
  }

  getPositionSec(): number {
    const duration = this.duration;
    return Math.min(Math.max(this.computeOffsetSec(), 0), duration);
  }

  private teardownSource(): void {
    if (this.source) {
      this.source.onended = null;
      try {
        this.source.stop();
      } catch {
        // Already stopped.
      }
      this.source.disconnect();
      this.source = null;
    }
    if (this.stNode) {
      this.stNode.disconnect();
      this.stNode = null;
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
  }

  async play(): Promise<void> {
    if (!this.context || !this.buffer) {
      return;
    }
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
    if (this.state.isPlaying) {
      return;
    }

    const startOffset = this.computeOffsetSec();
    this.teardownSource();

    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.playbackRate.value = this.tempoRatio;

    const stNode = new SoundTouchNode({ context: this.context });
    stNode.playbackRate.value = this.tempoRatio;
    stNode.pitchSemitones.value = this.pitchSemitones;

    const gainNode = this.context.createGain();
    gainNode.gain.value = 1;

    source.connect(stNode);
    stNode.connect(gainNode);
    gainNode.connect(this.context.destination);

    source.onended = () => {
      if (this.source !== source) {
        return;
      }
      this.state = {
        bufferOffsetSec: 0,
        contextTimeAtOffset: this.context?.currentTime ?? 0,
        isPlaying: false,
      };
      this.teardownSource();
      this.onEndedCallback?.();
    };

    source.start(this.context.currentTime, Math.max(0, startOffset));

    this.source = source;
    this.stNode = stNode;
    this.gainNode = gainNode;
    this.state = {
      bufferOffsetSec: startOffset,
      contextTimeAtOffset: this.context.currentTime,
      isPlaying: true,
    };
  }

  pause(): void {
    if (!this.state.isPlaying) {
      return;
    }
    const offset = this.computeOffsetSec();
    this.teardownSource();
    this.state = {
      bufferOffsetSec: offset,
      contextTimeAtOffset: this.context?.currentTime ?? 0,
      isPlaying: false,
    };
  }

  stop(): void {
    this.teardownSource();
    this.state = {
      bufferOffsetSec: 0,
      contextTimeAtOffset: this.context?.currentTime ?? 0,
      isPlaying: false,
    };
  }

  seek(sec: number): void {
    const duration = this.duration;
    const clamped = Math.min(Math.max(sec, 0), duration);
    const wasPlaying = this.state.isPlaying;
    this.teardownSource();
    this.state = {
      bufferOffsetSec: clamped,
      contextTimeAtOffset: this.context?.currentTime ?? 0,
      isPlaying: false,
    };
    if (wasPlaying) {
      void this.play();
    }
  }

  setTempoRatio(ratio: number): void {
    const clamped = clampTempoRatio(ratio);
    const offset = this.computeOffsetSec();
    this.tempoRatio = clamped;
    if (this.context) {
      this.state = {
        bufferOffsetSec: offset,
        contextTimeAtOffset: this.context.currentTime,
        isPlaying: this.state.isPlaying,
      };
    }
    if (this.source && this.stNode) {
      this.source.playbackRate.value = clamped;
      this.stNode.playbackRate.value = clamped;
    }
  }

  setPitchSemitones(semitones: number): void {
    const clamped = clampPitchSemitones(semitones);
    this.pitchSemitones = clamped;
    if (this.stNode) {
      this.stNode.pitchSemitones.value = clamped;
    }
  }

  get isPlaying(): boolean {
    return this.state.isPlaying;
  }

  dispose(): void {
    this.teardownSource();
    if (this.context) {
      void this.context.close();
      this.context = null;
    }
    this.buffer = null;
    this.onEndedCallback = null;
  }
}
