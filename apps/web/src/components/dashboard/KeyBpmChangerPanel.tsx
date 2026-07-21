"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UploadDropzone } from "@/components/dashboard/UploadDropzone";
import {
  audioBufferToWavBlob,
  decodeAudioFile,
  renderWaveformBars,
} from "@/lib/audio/trimAudio";
import {
  LiveKeyBpmPlayer,
  MAX_TEMPO_RATIO,
  MIN_TEMPO_RATIO,
  clampPitchSemitones,
  clampTempoRatio,
  detectOriginalBpmKey,
  renderProcessedBuffer,
} from "@/lib/audio/keyBpmEngine";

interface KeyBpmChangerPanelProps {
  isProUser: boolean;
}

interface DetectedBaseline {
  bpm: number;
  key: string;
}

const NOTE_NAMES = [
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

const TEMPO_PERCENT_MIN = Math.round((MIN_TEMPO_RATIO - 1) * 100);
const TEMPO_PERCENT_MAX = Math.round((MAX_TEMPO_RATIO - 1) * 100);

function transposeKeyLabel(key: string, semitones: number): string {
  const match = key.trim().match(/^([A-Ga-g]#?)\s*(major|minor)$/i);
  if (!match) {
    return key;
  }
  const [, root, mode] = match;
  const index = NOTE_NAMES.indexOf(
    root.toUpperCase() as (typeof NOTE_NAMES)[number],
  );
  if (index === -1) {
    return key;
  }
  const shifted = NOTE_NAMES[(((index + semitones) % 12) + 12) % 12];
  return `${shifted} ${mode.toLowerCase()}`;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export function KeyBpmChangerPanel({ isProUser }: KeyBpmChangerPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detected, setDetected] = useState<DetectedBaseline | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [tempoPercent, setTempoPercent] = useState(0);
  const [pitchSemitones, setPitchSemitones] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadSec, setPlayheadSec] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  const isSeekDraggingRef = useRef(false);
  const playerRef = useRef<LiveKeyBpmPlayer | null>(null);

  if (!playerRef.current) {
    playerRef.current = new LiveKeyBpmPlayer();
  }

  useEffect(() => {
    const player = playerRef.current;
    return () => {
      player?.dispose();
    };
  }, []);

  const tempoRatio = clampTempoRatio(1 + tempoPercent / 100);

  const onFileAccepted = useCallback((accepted: File) => {
    setFile(accepted);
    setError(null);
    setDetected(null);
    setLoading(true);
    setIsPlaying(false);
    setPlayheadSec(0);
    setTempoPercent(0);
    setPitchSemitones(0);

    decodeAudioFile(accepted)
      .then(async (decoded) => {
        setBuffer(decoded);
        const player = playerRef.current;
        if (player) {
          await player.load(decoded);
          player.setOnEnded(() => {
            setIsPlaying(false);
            setPlayheadSec(0);
          });
        }
      })
      .catch((decodeError) => {
        setError(
          decodeError instanceof Error
            ? decodeError.message
            : "Could not read this audio file.",
        );
      })
      .finally(() => setLoading(false));

    setDetecting(true);
    detectOriginalBpmKey(accepted)
      .then((result) => setDetected(result))
      .catch(() => setDetected(null))
      .finally(() => setDetecting(false));
  }, []);

  useEffect(() => {
    if (!buffer || !canvasRef.current) {
      return;
    }
    renderWaveformBars(canvasRef.current, buffer);
  }, [buffer]);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }
    let raf: number;

    const tick = () => {
      const player = playerRef.current;
      if (player) {
        setPlayheadSec(player.getPositionSec());
        if (!player.isPlaying) {
          setIsPlaying(false);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  useEffect(() => {
    playerRef.current?.setTempoRatio(tempoRatio);
  }, [tempoRatio]);

  useEffect(() => {
    playerRef.current?.setPitchSemitones(pitchSemitones);
  }, [pitchSemitones]);

  const secFromClientX = useCallback(
    (clientX: number) => {
      const el = waveformRef.current;
      const trackDuration = buffer?.duration ?? 0;
      if (!el || trackDuration <= 0) {
        return 0;
      }
      const rect = el.getBoundingClientRect();
      const ratio = Math.min(
        1,
        Math.max(0, (clientX - rect.left) / rect.width),
      );
      return ratio * trackDuration;
    },
    [buffer],
  );

  const lastSeekCommitRef = useRef(0);
  const lastDragSecRef = useRef(0);

  const seekTo = useCallback((sec: number, throttle: boolean) => {
    setPlayheadSec(sec);
    const now = performance.now();
    if (throttle && now - lastSeekCommitRef.current < 60) {
      return;
    }
    lastSeekCommitRef.current = now;
    playerRef.current?.seek(sec);
  }, []);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!isSeekDraggingRef.current) {
        return;
      }
      const sec = secFromClientX(event.clientX);
      lastDragSecRef.current = sec;
      seekTo(sec, true);
    };

    const onPointerUp = () => {
      if (isSeekDraggingRef.current) {
        isSeekDraggingRef.current = false;
        seekTo(lastDragSecRef.current, false);
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [secFromClientX, seekTo]);

  const onWaveformPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      isSeekDraggingRef.current = true;
      const sec = secFromClientX(event.clientX);
      lastDragSecRef.current = sec;
      seekTo(sec, false);
    },
    [secFromClientX, seekTo],
  );

  const togglePlay = useCallback(async () => {
    const player = playerRef.current;
    if (!player || !buffer) {
      return;
    }
    if (isPlaying) {
      player.pause();
      setIsPlaying(false);
    } else {
      await player.play();
      setIsPlaying(true);
    }
  }, [isPlaying, buffer]);

  const onResetFaders = useCallback(() => {
    setTempoPercent(0);
    setPitchSemitones(0);
  }, []);

  const onLoadDifferentTrack = useCallback(() => {
    playerRef.current?.dispose();
    playerRef.current = new LiveKeyBpmPlayer();
    setFile(null);
    setBuffer(null);
    setDetected(null);
    setIsPlaying(false);
    setPlayheadSec(0);
    setTempoPercent(0);
    setPitchSemitones(0);
    setError(null);
  }, []);

  const onExport = useCallback(async () => {
    if (!buffer || !isProUser) {
      return;
    }
    setExporting(true);
    setExportError(null);
    try {
      const processed = await renderProcessedBuffer(buffer, {
        pitchSemitones,
        tempoRatio,
      });
      const blob = audioBufferToWavBlob(processed);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const baseName = (file?.name ?? "track").replace(/\.[^/.]+$/, "");
      link.href = url;
      link.download = `${baseName}-keybpm.wav`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (exportErr) {
      setExportError(
        exportErr instanceof Error
          ? exportErr.message
          : "Could not export the processed track.",
      );
    } finally {
      setExporting(false);
    }
  }, [buffer, isProUser, pitchSemitones, tempoRatio, file]);

  const duration = buffer?.duration ?? 0;
  const playheadPct = duration > 0 ? (playheadSec / duration) * 100 : 0;
  const displayedBpm = detected ? Math.round(detected.bpm * tempoRatio) : null;
  const displayedKey = detected
    ? transposeKeyLabel(detected.key, pitchSemitones)
    : null;

  return (
    <div className="space-y-4">
      {!buffer ? (
        <UploadDropzone
          onFileAccepted={onFileAccepted}
          mode="audio"
          maxSizeMb={100}
          message="Drop MP3/WAV/M4A up to 100MB to load it into the key & BPM changer."
        />
      ) : null}

      {loading ? (
        <p className="text-xs text-foreground/70">Reading audio...</p>
      ) : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}

      {buffer ? (
        <div className="glass space-y-4 rounded-xl p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-cyan-100">
                {file?.name}
              </p>
              <p className="mt-1 text-xs text-foreground/70">
                {detecting
                  ? "Detecting original BPM and key..."
                  : detected
                    ? `Detected: ${Math.round(detected.bpm)} BPM · ${detected.key}`
                    : "Could not detect BPM/key for this track."}
              </p>
            </div>
            <button
              type="button"
              onClick={onLoadDifferentTrack}
              className="whitespace-nowrap text-xs text-foreground/60 hover:text-foreground/90"
            >
              Load a different track
            </button>
          </div>

          <div
            ref={waveformRef}
            onPointerDown={onWaveformPointerDown}
            className="relative touch-none select-none rounded-md border border-cyan-700/40 bg-black/40 py-2"
          >
            <canvas
              ref={canvasRef}
              width={600}
              height={72}
              className="block h-[72px] w-full cursor-pointer"
            />
            <div
              className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]"
              style={{ left: `${playheadPct}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-foreground/60">
            <span>{formatTime(playheadSec)}</span>
            <span>{formatTime(duration)}</span>
          </div>

          <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-start">
            <div className="flex flex-col items-center gap-2">
              <p className="text-xs uppercase tracking-wide text-foreground/60">
                Tempo
              </p>
              <div className="flex h-56 w-12 items-center justify-center">
                <input
                  type="range"
                  min={TEMPO_PERCENT_MIN}
                  max={TEMPO_PERCENT_MAX}
                  step={1}
                  value={tempoPercent}
                  onChange={(event) =>
                    setTempoPercent(Number(event.target.value))
                  }
                  className="h-2 w-52 -rotate-90 cursor-ns-resize appearance-none rounded-full bg-cyan-900/40 accent-cyan-300"
                  aria-label="Tempo adjustment percent"
                />
              </div>
              <p className="text-sm font-semibold text-cyan-100">
                {tempoPercent > 0 ? "+" : ""}
                {tempoPercent}%
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-foreground/60">
                  Key
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setPitchSemitones((value) =>
                        clampPitchSemitones(value - 1),
                      )
                    }
                    className="cyber-btn h-8 w-8 rounded-md text-sm"
                    aria-label="Lower key by one semitone"
                  >
                    -
                  </button>
                  <span className="min-w-[3ch] text-center text-sm font-semibold text-cyan-100">
                    {pitchSemitones > 0 ? "+" : ""}
                    {pitchSemitones}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setPitchSemitones((value) =>
                        clampPitchSemitones(value + 1),
                      )
                    }
                    className="cyber-btn h-8 w-8 rounded-md text-sm"
                    aria-label="Raise key by one semitone"
                  >
                    +
                  </button>
                  <span className="text-xs text-foreground/60">
                    semitones
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-cyan-700/35 bg-black/30 p-3">
                <p className="text-xs uppercase tracking-wide text-foreground/60">
                  Now playing at
                </p>
                <p className="mt-1 text-lg font-semibold text-cyan-100">
                  {displayedBpm ?? "--"} BPM · {displayedKey ?? "--"}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void togglePlay()}
                  className="cyber-btn flex items-center gap-1.5 px-3 py-1.5 text-xs"
                >
                  {isPlaying ? (
                    <>
                      <span aria-hidden="true">⏸</span> Pause
                    </>
                  ) : (
                    <>
                      <span aria-hidden="true">▶</span> Play
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={onResetFaders}
                  className="cyber-btn px-3 py-1.5 text-xs"
                >
                  Reset
                </button>
                {isProUser ? (
                  <button
                    type="button"
                    onClick={() => void onExport()}
                    disabled={exporting}
                    className="cyber-btn-primary px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {exporting ? "Exporting..." : "Download WAV"}
                  </button>
                ) : null}
              </div>

              {!isProUser ? (
                <p className="text-[11px] text-fuchsia-300/80">
                  Get Pro to export the processed track as a WAV file.
                </p>
              ) : null}
              {exportError ? (
                <p className="text-xs text-danger">{exportError}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
