from dataclasses import dataclass
from pathlib import Path

import librosa
import numpy as np
import pretty_midi

from app.core.config import settings


@dataclass(frozen=True)
class StemQualityMetrics:
    rms_energy: float
    harmonic_ratio: float
    onset_density: float
    sustained_ratio: float
    quality_score: float
    transcription_confidence: float
    passed: bool


def _clamp(value: float, lower: float = 0.0, upper: float = 1.0) -> float:
    return max(lower, min(upper, value))


def analyze_stem_audio_quality(stem_path: Path) -> dict[str, float]:
    y, sr = librosa.load(str(stem_path), sr=22050, mono=True)
    if y.size == 0:
        return {
            "rms_energy": 0.0,
            "harmonic_ratio": 0.0,
            "onset_density": 0.0,
            "sustained_ratio": 0.0,
            "duration": 0.0,
        }

    duration = float(len(y) / sr)
    rms = librosa.feature.rms(y=y)[0]
    rms_energy = float(np.mean(rms)) if rms.size else 0.0

    harmonic, percussive = librosa.effects.hpss(y)
    harmonic_energy = float(np.sqrt(np.mean(np.square(harmonic))))
    percussive_energy = float(np.sqrt(np.mean(np.square(percussive))))
    harmonic_ratio = harmonic_energy / max(harmonic_energy + percussive_energy, 1e-9)

    onsets = librosa.onset.onset_detect(y=y, sr=sr)
    onset_density = float(len(onsets) / max(duration, 1e-9))

    sustain_threshold = max(0.008, rms_energy * 0.8)
    sustained_ratio = float(np.mean(rms > sustain_threshold)) if rms.size else 0.0

    return {
        "rms_energy": rms_energy,
        "harmonic_ratio": harmonic_ratio,
        "onset_density": onset_density,
        "sustained_ratio": sustained_ratio,
        "duration": duration,
    }


def evaluate_transcription_confidence(midi_path: Path) -> float:
    midi = pretty_midi.PrettyMIDI(str(midi_path))
    notes = [
        note
        for instrument in midi.instruments
        if not instrument.is_drum
        for note in instrument.notes
    ]
    if not notes:
        return 0.0

    count = len(notes)
    durations = np.array([max(0.0, note.end - note.start) for note in notes], dtype=np.float64)
    avg_duration = float(np.mean(durations)) if durations.size else 0.0
    sustained_ratio = float(np.mean(durations >= 0.20)) if durations.size else 0.0
    velocity_mean = float(np.mean([note.velocity for note in notes])) / 127.0

    count_score = _clamp(count / 42.0)
    duration_score = _clamp(avg_duration / 0.45)
    sustained_score = _clamp(sustained_ratio)
    velocity_score = _clamp(velocity_mean)

    return _clamp(
        count_score * 0.28
        + duration_score * 0.30
        + sustained_score * 0.28
        + velocity_score * 0.14
    )


def score_target_stem_quality(stem_metrics: dict[str, float], transcription_confidence: float) -> StemQualityMetrics:
    rms_score = _clamp(stem_metrics["rms_energy"] / max(settings.stem_rms_min * 2.3, 1e-6))
    harmonic_score = _clamp(
        (stem_metrics["harmonic_ratio"] - settings.stem_harmonic_ratio_min)
        / max(1.0 - settings.stem_harmonic_ratio_min, 1e-6)
    )
    onset_score = _clamp(1.0 - (stem_metrics["onset_density"] / max(settings.stem_onset_density_max, 1e-6)))
    sustained_score = _clamp(
        stem_metrics["sustained_ratio"] / max(settings.stem_sustained_ratio_min * 1.8, 1e-6)
    )

    quality_score = _clamp(
        rms_score * 0.24 + harmonic_score * 0.30 + onset_score * 0.20 + sustained_score * 0.26
    )

    passed = (
        stem_metrics["rms_energy"] >= settings.stem_rms_min
        and stem_metrics["harmonic_ratio"] >= settings.stem_harmonic_ratio_min
        and stem_metrics["onset_density"] <= settings.stem_onset_density_max
        and stem_metrics["sustained_ratio"] >= settings.stem_sustained_ratio_min
        and transcription_confidence >= settings.transcription_confidence_min
    )

    return StemQualityMetrics(
        rms_energy=stem_metrics["rms_energy"],
        harmonic_ratio=stem_metrics["harmonic_ratio"],
        onset_density=stem_metrics["onset_density"],
        sustained_ratio=stem_metrics["sustained_ratio"],
        quality_score=quality_score,
        transcription_confidence=transcription_confidence,
        passed=passed,
    )
