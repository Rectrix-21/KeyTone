"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";

interface UploadDropzoneProps {
  onFileAccepted: (file: File) => void;
  disabled?: boolean;
  mode?: "audio" | "audioOrMidi";
  className?: string;
  message?: string;
}

export function UploadDropzone({
  onFileAccepted,
  disabled = false,
  mode = "audio",
  className = "",
  message,
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

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled,
    multiple: false,
    maxSize: 25 * 1024 * 1024,
    accept:
      mode === "audio"
        ? {
            "audio/mpeg": [".mp3"],
            "audio/wav": [".wav"],
            "audio/x-wav": [".wav"],
            "audio/mp4": [".m4a"],
            "audio/x-m4a": [".m4a"],
          }
        : {
            "audio/mpeg": [".mp3"],
            "audio/wav": [".wav"],
            "audio/x-wav": [".wav"],
            "audio/mp4": [".m4a"],
            "audio/x-m4a": [".m4a"],
            "audio/midi": [".mid", ".midi"],
            "audio/x-midi": [".mid", ".midi"],
            "application/octet-stream": [".mid", ".midi"],
          },
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
            ? "Drop MP3/WAV/M4A up to 25MB, or click to upload."
            : "Drop MIDI or MP3/WAV/M4A up to 25MB, or click to upload.")}
      </p>
    </div>
  );
}
