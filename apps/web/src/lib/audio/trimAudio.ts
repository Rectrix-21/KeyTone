const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function getAudioContextClass(): typeof AudioContext {
  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioContextClass) {
    throw new Error("Audio trimming is not supported in this browser.");
  }

  return AudioContextClass;
}

export function probeAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      URL.revokeObjectURL(url);
      if (!Number.isFinite(duration)) {
        reject(new Error("Could not read audio duration."));
        return;
      }
      resolve(duration);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read audio duration."));
    };
    audio.src = url;
  });
}

export async function decodeAudioFile(file: File): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  const AudioContextClass = getAudioContextClass();
  const context = new AudioContextClass();
  try {
    return await context.decodeAudioData(arrayBuffer);
  } finally {
    void context.close();
  }
}

export function computePeaks(
  buffer: AudioBuffer,
  targetPoints: number,
): Float32Array {
  const channelData = buffer.getChannelData(0);
  const blockSize = Math.max(1, Math.floor(channelData.length / targetPoints));
  const peaks = new Float32Array(targetPoints);

  for (let i = 0; i < targetPoints; i++) {
    const start = i * blockSize;
    const end = Math.min(start + blockSize, channelData.length);
    let max = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(channelData[j]);
      if (abs > max) max = abs;
    }
    peaks[i] = max;
  }

  return peaks;
}

export function trimAudioBuffer(
  buffer: AudioBuffer,
  startSec: number,
  endSec: number,
): AudioBuffer {
  const sampleRate = buffer.sampleRate;
  const startFrame = Math.max(
    0,
    Math.min(buffer.length, Math.floor(startSec * sampleRate)),
  );
  const endFrame = Math.max(
    startFrame,
    Math.min(buffer.length, Math.floor(endSec * sampleRate)),
  );
  const frameCount = Math.max(1, endFrame - startFrame);

  const trimmed = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: frameCount,
    sampleRate,
  });

  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const sourceData = buffer.getChannelData(channel);
    trimmed
      .getChannelData(channel)
      .set(sourceData.subarray(startFrame, startFrame + frameCount));
  }

  return trimmed;
}

export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const channelData: Float32Array[] = [];
  for (let channel = 0; channel < numChannels; channel++) {
    channelData.push(buffer.getChannelData(channel));
  }

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

export function estimateWavBytes(
  buffer: AudioBuffer,
  startSec: number,
  endSec: number,
): number {
  const seconds = Math.max(0, endSec - startSec);
  return Math.ceil(
    44 + seconds * buffer.sampleRate * buffer.numberOfChannels * 2,
  );
}

export function exceedsUploadLimit(bytes: number): boolean {
  return bytes > MAX_UPLOAD_BYTES;
}

export function trimFileToWavFile(
  buffer: AudioBuffer,
  startSec: number,
  endSec: number,
  originalName: string,
): File {
  const trimmed = trimAudioBuffer(buffer, startSec, endSec);
  const blob = audioBufferToWavBlob(trimmed);
  const baseName = originalName.replace(/\.[^/.]+$/, "");
  return new File([blob], `${baseName}-trimmed.wav`, { type: "audio/wav" });
}
