from dataclasses import dataclass
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf


@dataclass(frozen=True)
class InstrumentDetectionResult:
    detected_instruments: list[str]
    stem_instruments: dict[str, list[str]]
    stem_energies: dict[str, float]


def _load_mono(path: Path, target_sr: int = 22050) -> tuple[np.ndarray, int]:
    audio, sr = librosa.load(str(path), sr=target_sr, mono=True)
    return audio, int(sr)


def _stem_energy(path: Path) -> float:
    audio, _ = _load_mono(path)
    if audio.size == 0:
        return 0.0
    return float(np.sqrt(np.mean(np.square(audio))))


def _classify_other_stem(path: Path) -> list[str]:
    audio, sr = _load_mono(path)
    if audio.size == 0:
        return ["others"]

    centroid = float(np.mean(librosa.feature.spectral_centroid(y=audio, sr=sr)))
    flatness = float(np.mean(librosa.feature.spectral_flatness(y=audio)))
    zcr = float(np.mean(librosa.feature.zero_crossing_rate(y=audio)))

    tags: list[str] = []
    if centroid < 1200 and flatness < 0.14 and zcr < 0.08:
        tags.append("pads")
    if centroid < 2100 and zcr < 0.15:
        tags.append("piano")
    if 1100 <= centroid <= 3600 and 0.07 <= zcr <= 0.24:
        tags.append("guitar")

    if not tags:
        tags.append("others")

    deduped: list[str] = []
    for tag in tags:
        if tag not in deduped:
            deduped.append(tag)
    return deduped


def detect_instruments_from_stems(stems: dict[str, Path]) -> InstrumentDetectionResult:
    stem_instruments: dict[str, list[str]] = {}
    stem_energies: dict[str, float] = {}

    for stem_name, path in stems.items():
        stem_energies[stem_name] = _stem_energy(path)
        if stem_name == "drums":
            stem_instruments[stem_name] = ["drums"]
        elif stem_name == "bass":
            stem_instruments[stem_name] = ["bass"]
        elif stem_name == "vocals":
            stem_instruments[stem_name] = ["vocals"]
        else:
            stem_instruments[stem_name] = _classify_other_stem(path)

    detected: list[str] = []
    for tags in stem_instruments.values():
        for tag in tags:
            if tag not in detected:
                detected.append(tag)

    return InstrumentDetectionResult(
        detected_instruments=detected,
        stem_instruments=stem_instruments,
        stem_energies=stem_energies,
    )


def select_stems_for_target(
    target: str,
    stems: dict[str, Path],
    detected: InstrumentDetectionResult,
) -> list[Path]:
    selected: list[Path] = []

    if target == "bass":
        if "bass" in stems:
            selected.append(stems["bass"])
        return selected

    if target == "chord":
        other_tags = set(detected.stem_instruments.get("other", []))
        if "other" in stems and ({"piano", "guitar", "pads"} & other_tags):
            selected.append(stems["other"])
        if not selected and "other" in stems:
            selected.append(stems["other"])
        return selected

    if target == "melody":
        if "vocals" in stems and detected.stem_energies.get("vocals", 0.0) > 0.01:
            selected.append(stems["vocals"])
        if "other" in stems:
            other_tags = set(detected.stem_instruments.get("other", []))
            if {"guitar", "piano"} & other_tags:
                selected.append(stems["other"])
        if not selected:
            if "vocals" in stems:
                selected.append(stems["vocals"])
            elif "other" in stems:
                selected.append(stems["other"])
        return selected

    return selected


def build_target_mix_audio(stem_paths: list[Path], output_path: Path, target_sr: int = 22050) -> Path:
    if not stem_paths:
        raise ValueError("No stems provided for mix")

    tracks: list[np.ndarray] = []
    max_len = 0
    for path in stem_paths:
        audio, _ = _load_mono(path, target_sr)
        tracks.append(audio)
        max_len = max(max_len, len(audio))

    if max_len == 0:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        sf.write(str(output_path), np.zeros(1, dtype=np.float32), target_sr)
        return output_path

    mixed = np.zeros(max_len, dtype=np.float32)
    for track in tracks:
        if len(track) < max_len:
            padded = np.pad(track, (0, max_len - len(track)))
        else:
            padded = track
        mixed += padded.astype(np.float32)

    max_abs = float(np.max(np.abs(mixed))) if mixed.size else 0.0
    if max_abs > 0.999:
        mixed = mixed / max_abs

    output_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(output_path), mixed, target_sr)
    return output_path
