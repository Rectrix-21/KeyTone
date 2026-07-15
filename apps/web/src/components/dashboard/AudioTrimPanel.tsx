"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  computePeaks,
  decodeAudioFile,
  estimateWavBytes,
  exceedsUploadLimit,
  trimFileToWavFile,
} from "@/lib/audio/trimAudio";

interface AudioTrimPanelProps {
  file: File;
  onConfirm: (trimmedFile: File) => void;
  onCancel: () => void;
}

type DragTarget = "start" | "end" | "seek" | null;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export function AudioTrimPanel({
  file,
  onConfirm,
  onCancel,
}: AudioTrimPanelProps) {
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [startSec, setStartSec] = useState(0);
  const [endSec, setEndSec] = useState(60);
  const [playheadSec, setPlayheadSec] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const dragTargetRef = useRef<DragTarget>(null);
  const startSecRef = useRef(startSec);
  const endSecRef = useRef(endSec);

  useEffect(() => {
    startSecRef.current = startSec;
  }, [startSec]);

  useEffect(() => {
    endSecRef.current = endSec;
  }, [endSec]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    decodeAudioFile(file)
      .then((decoded) => {
        if (cancelled) return;
        setBuffer(decoded);
        setStartSec(0);
        setEndSec(Math.min(60, decoded.duration));
        setPlayheadSec(0);
      })
      .catch((decodeError) => {
        if (cancelled) return;
        setError(
          decodeError instanceof Error
            ? decodeError.message
            : "Could not read this audio file.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [file]);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    if (audioRef.current) {
      audioRef.current.src = url;
    }
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!buffer || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const peaks = computePeaks(buffer, width);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(148, 163, 184, 0.4)";
    const mid = height / 2;
    for (let i = 0; i < peaks.length; i++) {
      const barHeight = Math.max(1, peaks[i] * mid);
      ctx.fillRect(i, mid - barHeight, 1, barHeight * 2);
    }
  }, [buffer]);

  const duration = buffer?.duration ?? 0;
  const selectionSeconds = Math.max(0, endSec - startSec);
  const estimatedBytes = buffer
    ? estimateWavBytes(buffer, startSec, endSec)
    : 0;
  const tooLarge = exceedsUploadLimit(estimatedBytes);
  const startPct = duration > 0 ? (startSec / duration) * 100 : 0;
  const endPct = duration > 0 ? (endSec / duration) * 100 : 100;
  const playheadPct = duration > 0 ? (playheadSec / duration) * 100 : 0;

  // Keep the playhead (and the audio element) parked at the selection start
  // whenever it's not actively playing, so "play" always starts from there.
  useEffect(() => {
    if (isPlaying) return;
    setPlayheadSec(startSec);
    if (audioRef.current) {
      audioRef.current.currentTime = startSec;
    }
  }, [startSec, isPlaying]);

  // Smooth playhead animation + auto-stop at the selection end while playing.
  useEffect(() => {
    if (!isPlaying) return;
    let raf: number;

    const tick = () => {
      const audio = audioRef.current;
      if (audio) {
        if (audio.currentTime >= endSecRef.current) {
          audio.pause();
          audio.currentTime = startSecRef.current;
          setPlayheadSec(startSecRef.current);
          setIsPlaying(false);
          return;
        }
        setPlayheadSec(audio.currentTime);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  const secFromClientX = useCallback(
    (clientX: number) => {
      const el = waveformRef.current;
      if (!el || duration <= 0) return 0;
      const rect = el.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration],
  );

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const target = dragTargetRef.current;
      if (!target) return;
      const sec = secFromClientX(event.clientX);

      if (target === "start") {
        setStartSec(Math.max(0, Math.min(sec, endSecRef.current - 0.2)));
      } else if (target === "end") {
        setEndSec(Math.min(duration, Math.max(sec, startSecRef.current + 0.2)));
      } else if (target === "seek") {
        const clamped = Math.min(
          endSecRef.current,
          Math.max(startSecRef.current, sec),
        );
        setPlayheadSec(clamped);
        if (audioRef.current) audioRef.current.currentTime = clamped;
      }
    };

    const onPointerUp = () => {
      dragTargetRef.current = null;
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [duration, secFromClientX]);

  const onWaveformPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragTargetRef.current = "seek";
    const sec = secFromClientX(event.clientX);
    const clamped = Math.min(endSec, Math.max(startSec, sec));
    setPlayheadSec(clamped);
    if (audioRef.current) audioRef.current.currentTime = clamped;
  };

  const onHandlePointerDown = (
    target: "start" | "end",
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    event.stopPropagation();
    dragTargetRef.current = target;
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    if (audio.currentTime < startSec || audio.currentTime >= endSec) {
      audio.currentTime = startSec;
    }
    void audio.play();
    setIsPlaying(true);
  };

  const onConfirmClick = () => {
    if (!buffer) return;
    onConfirm(trimFileToWavFile(buffer, startSec, endSec, file.name));
  };

  return (
    <div className="glass mt-3 space-y-4 rounded-xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-cyan-100">
            {file.name} is {formatTime(duration)} long
          </p>
          <p className="mt-1 text-xs text-foreground/70">
            Extraction works best under a minute — drag the handles to choose
            the part you want.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="whitespace-nowrap text-xs text-foreground/60 hover:text-foreground/90"
        >
          Cancel
        </button>
      </div>

      <audio ref={audioRef} className="hidden" preload="auto" />

      {loading ? (
        <p className="text-xs text-foreground/70">Reading audio...</p>
      ) : error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : buffer ? (
        <>
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
              className="pointer-events-none absolute inset-y-2 bg-cyan-400/12"
              style={{
                left: `${startPct}%`,
                width: `${Math.max(0, endPct - startPct)}%`,
              }}
            />

            <div
              className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]"
              style={{ left: `${playheadPct}%` }}
            />

            <div
              onPointerDown={(event) => onHandlePointerDown("start", event)}
              className="absolute inset-y-0 flex w-3 -translate-x-1/2 cursor-ew-resize items-center justify-center"
              style={{ left: `${startPct}%` }}
              aria-label="Drag to set selection start"
              role="slider"
              aria-valuemin={0}
              aria-valuemax={duration}
              aria-valuenow={startSec}
            >
              <div className="h-full w-1 rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.7)]" />
            </div>

            <div
              onPointerDown={(event) => onHandlePointerDown("end", event)}
              className="absolute inset-y-0 flex w-3 -translate-x-1/2 cursor-ew-resize items-center justify-center"
              style={{ left: `${endPct}%` }}
              aria-label="Drag to set selection end"
              role="slider"
              aria-valuemin={0}
              aria-valuemax={duration}
              aria-valuenow={endSec}
            >
              <div className="h-full w-1 rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.7)]" />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-wide text-foreground/60">
            <span>Start {formatTime(startSec)}</span>
            <span>Selected {formatTime(selectionSeconds)}</span>
            <span>End {formatTime(endSec)}</span>
          </div>

          {tooLarge ? (
            <p className="text-xs text-danger">
              Selection is too large ({(estimatedBytes / (1024 * 1024)).toFixed(1)}
              MB) — max 25MB, pick a shorter range.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={togglePlay}
              className="cyber-btn flex items-center gap-1.5 px-3 py-1.5 text-xs"
            >
              {isPlaying ? (
                <>
                  <span aria-hidden="true">⏸</span> Pause
                </>
              ) : (
                <>
                  <span aria-hidden="true">▶</span> Play selection
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onConfirmClick}
              disabled={tooLarge}
              className="cyber-btn-primary px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-60"
            >
              Use this section
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
