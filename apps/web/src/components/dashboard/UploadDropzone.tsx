"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";

interface UploadDropzoneProps {
  onFileAccepted: (file: File) => void;
  disabled?: boolean;
  mode?: "audio" | "audioOrMidi" | "midi";
  className?: string;
  message?: string;
  maxSizeMb?: number;
}

export function UploadDropzone({
  onFileAccepted,
  disabled = false,
  mode = "audio",
  className = "",
  message,
  maxSizeMb = 25,
}: UploadDropzoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (file) {
        onFileAccepted(file);
      }
    },
    [onFileAccepted],
  );

  const MIDI_ACCEPT = {
    "audio/midi": [".mid", ".midi"],
    "audio/x-midi": [".mid", ".midi"],
    "application/octet-stream": [".mid", ".midi"],
  };

  const AUDIO_ACCEPT = {
    "audio/mpeg": [".mp3"],
    "audio/wav": [".wav"],
    "audio/x-wav": [".wav"],
    "audio/mp4": [".m4a"],
    "audio/x-m4a": [".m4a"],
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled,
    multiple: false,
    maxSize: maxSizeMb * 1024 * 1024,
    accept:
      mode === "audio"
        ? AUDIO_ACCEPT
        : mode === "midi"
          ? MIDI_ACCEPT
          : { ...AUDIO_ACCEPT, ...MIDI_ACCEPT },
  });

  return (
    <div
      {...getRootProps()}
      className={`rounded-xl border border-dashed p-6 text-center transition sm:p-10 ${
        isDragActive
          ? "border-cyan-300/70 bg-cyan-500/10"
          : "border-cyan-500/30 bg-black/35"
      } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"} ${className}`}
    >
      <input {...getInputProps()} />
      <p className="text-sm text-foreground/80">
        {message ??
          (mode === "audio"
            ? `Drop MP3/WAV/M4A up to ${maxSizeMb}MB, or click to upload.`
            : mode === "midi"
              ? `Drop a MIDI file up to ${maxSizeMb}MB, or click to upload.`
              : `Drop MIDI or MP3/WAV/M4A up to ${maxSizeMb}MB, or click to upload.`)}
      </p>
    </div>
  );
}
