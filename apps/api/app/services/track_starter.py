from __future__ import annotations

import math
import random
import statistics
from pathlib import Path
from typing import Any
from typing import cast
from typing import Literal
from typing import TypedDict

import pretty_midi

from app.core.config import settings


ComplexityLevel = Literal["simple", "medium", "complex"]
StarterVariant = Literal["safe", "fresh", "experimental"]
InstrumentTarget = Literal["piano", "guitar", "synth"]
CandidateLane = Literal["melody", "bass"]


class NoteEvent(TypedDict):
    pitch: int
    velocity: int
    start: float
    end: float
    lane: Literal["melody", "chord", "bass", "drums"]


class TrackStarterResult(TypedDict):
    normalized_genre: str
    normalized_mood: str
    normalized_key: str
    bpm: float
    bars: int
    complexity: ComplexityLevel
    variant: StarterVariant
    instrument_target: InstrumentTarget
    generation_backend: str
    chord_labels: list[str]
    drum_suggestion: str
    explanation: str
    candidate_summary: dict[str, float | int | str]
    preview_notes: list[NoteEvent]
    paths: dict[str, Path]


class PhraseCandidate(TypedDict):
    notes: list[NoteEvent]
    source: str
    temperature: float


class CandidateScore(TypedDict):
    motif_repetition: float
    chord_tone_alignment: float
    rhythmic_coherence: float
    note_density: float
    pitch_range_stability: float
    silence_spacing: float
    total: float


class ScoredPhraseCandidate(TypedDict):
    notes: list[NoteEvent]
    source: str
    temperature: float
    score: CandidateScore
    rejected: bool
    reject_reasons: list[str]


class ChordPlan(TypedDict):
    bar: int
    degree: int
    root_pc: int
    label: str
    chord_tone_pcs: list[int]
    bar_start_beat: float


KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
SCALE_NOTES = {
    "major": [0, 2, 4, 5, 7, 9, 11],
    "minor": [0, 2, 3, 5, 7, 8, 10],
}

QUALITY_INTERVALS = {
    "maj": [0, 4, 7],
    "min": [0, 3, 7],
    "dim": [0, 3, 6],
}

PROGRESSION_TEMPLATES = {
    "rnb": {
        "major": [[1, 6, 2, 5], [1, 3, 6, 4], [4, 5, 3, 6]],
        "minor": [[1, 6, 4, 5], [6, 4, 1, 5], [1, 7, 6, 5]],
    },
    "indie": {
        "major": [[1, 5, 6, 4], [1, 4, 6, 5], [6, 4, 1, 5]],
        "minor": [[1, 7, 6, 7], [6, 7, 1, 4], [1, 5, 6, 7]],
    },
    "edm": {
        "major": [[1, 5, 6, 4], [1, 4, 5, 6], [6, 4, 1, 5]],
        "minor": [[1, 6, 3, 7], [1, 7, 6, 7], [6, 7, 1, 5]],
    },
    "trap": {
        "major": [[1, 6, 4, 5], [1, 5, 6, 4], [6, 4, 1, 7]],
        "minor": [[1, 7, 6, 7], [1, 6, 7, 5], [6, 7, 1, 7]],
    },
    "default": {
        "major": [[1, 5, 6, 4], [1, 4, 5, 1]],
        "minor": [[1, 7, 6, 7], [1, 6, 7, 1]],
    },
}

CHORD_RHYTHM_TEMPLATES = {
    "rnb": [[(0.0, 2.0), (2.0, 2.0)], [(0.0, 1.5), (1.5, 2.5)], [(0.0, 1.0), (1.5, 1.5), (3.25, 0.75)]],
    "indie": [[(0.0, 4.0)], [(0.0, 2.0), (2.0, 2.0)], [(0.0, 1.0), (1.0, 1.0), (2.0, 2.0)]],
    "edm": [[(0.0, 1.0), (1.0, 1.0), (2.0, 1.0), (3.0, 1.0)], [(0.0, 2.0), (2.0, 2.0)], [(0.0, 0.5), (0.5, 0.5), (1.0, 1.0), (2.0, 2.0)]],
    "trap": [[(0.0, 2.0), (2.0, 2.0)], [(0.0, 1.5), (1.5, 1.5), (3.0, 1.0)], [(0.0, 1.0), (1.25, 0.75), (2.0, 1.0), (3.0, 1.0)]],
    "default": [[(0.0, 2.0), (2.0, 2.0)], [(0.0, 4.0)]],
}

MELODY_RHYTHM_BY_COMPLEXITY = {
    "simple": [(0.0, 0.5), (1.0, 0.5), (2.0, 0.75), (3.0, 0.75)],
    "medium": [(0.0, 0.5), (0.75, 0.5), (1.5, 0.5), (2.25, 0.5), (3.0, 0.5), (3.5, 0.5)],
    "complex": [(0.0, 0.25), (0.5, 0.5), (1.0, 0.25), (1.5, 0.5), (2.0, 0.25), (2.5, 0.5), (3.0, 0.25), (3.5, 0.5)],
}

PatternInstrument = Literal["piano", "guitar"]
PianoPatternRole = Literal["root", "tone", "top", "passing"]
GuitarStrumDirection = Literal["up", "down"]

# (offset_beat, duration_beat, role)
PIANO_PATTERN_LIBRARY: dict[ComplexityLevel, list[list[tuple[float, float, PianoPatternRole]]]] = {
    "simple": [
        [(0.0, 0.55, "root"), (0.75, 0.45, "tone"), (1.75, 0.45, "top"), (2.75, 0.5, "tone")],
        [(0.0, 0.5, "root"), (1.0, 0.45, "top"), (2.0, 0.5, "tone"), (3.0, 0.45, "top")],
    ],
    "medium": [
        [(0.0, 0.45, "root"), (0.6, 0.4, "tone"), (1.3, 0.38, "top"), (2.0, 0.42, "tone"), (2.8, 0.4, "top")],
        [(0.0, 0.42, "root"), (0.8, 0.36, "tone"), (1.55, 0.4, "top"), (2.35, 0.35, "passing"), (3.1, 0.35, "top")],
        [(0.2, 0.38, "tone"), (0.95, 0.4, "root"), (1.7, 0.36, "top"), (2.5, 0.35, "tone"), (3.25, 0.3, "top")],
    ],
    "complex": [
        [(0.0, 0.35, "root"), (0.45, 0.3, "tone"), (0.95, 0.3, "top"), (1.55, 0.35, "passing"), (2.1, 0.32, "tone"), (2.75, 0.3, "top"), (3.35, 0.28, "tone")],
        [(0.1, 0.3, "tone"), (0.6, 0.3, "root"), (1.2, 0.3, "top"), (1.8, 0.3, "passing"), (2.35, 0.28, "tone"), (2.9, 0.3, "top"), (3.45, 0.24, "tone")],
        [(0.0, 0.28, "root"), (0.5, 0.28, "tone"), (1.05, 0.3, "top"), (1.6, 0.28, "passing"), (2.2, 0.28, "tone"), (2.85, 0.28, "top"), (3.5, 0.22, "tone")],
    ],
}

# (offset_beat, duration_beat, chord_size, direction)
GUITAR_PATTERN_LIBRARY: dict[ComplexityLevel, list[list[tuple[float, float, int, GuitarStrumDirection]]]] = {
    "simple": [
        [(0.0, 1.2, 3, "down"), (2.0, 1.1, 3, "down")],
        [(0.0, 0.9, 3, "down"), (1.5, 0.9, 2, "up"), (3.0, 0.9, 3, "down")],
    ],
    "medium": [
        [(0.0, 0.95, 3, "down"), (1.25, 0.8, 2, "up"), (2.25, 0.9, 3, "down"), (3.25, 0.75, 2, "up")],
        [(0.0, 0.9, 3, "down"), (1.0, 0.75, 2, "up"), (2.0, 0.9, 4, "down"), (3.1, 0.7, 2, "up")],
        [(0.2, 0.85, 3, "down"), (1.4, 0.75, 2, "up"), (2.4, 0.85, 3, "down"), (3.35, 0.65, 2, "up")],
    ],
    "complex": [
        [(0.0, 0.75, 3, "down"), (0.9, 0.65, 2, "up"), (1.7, 0.7, 4, "down"), (2.5, 0.65, 2, "up"), (3.25, 0.6, 3, "down")],
        [(0.1, 0.7, 3, "down"), (0.95, 0.6, 2, "up"), (1.75, 0.7, 3, "down"), (2.55, 0.6, 2, "up"), (3.3, 0.55, 3, "down")],
        [(0.0, 0.68, 4, "down"), (0.85, 0.58, 2, "up"), (1.6, 0.7, 3, "down"), (2.45, 0.58, 2, "up"), (3.2, 0.52, 3, "down")],
    ],
}

# (offset_beat, duration_beat, accent)
RNB_MELODY_PATTERNS: dict[ComplexityLevel, list[list[tuple[float, float, int]]]] = {
    "simple": [
        [(0.0, 0.75, 1), (1.25, 0.5, 0), (2.0, 0.75, 1), (3.25, 0.5, 0)],
        [(0.5, 0.5, 0), (1.5, 0.75, 1), (2.75, 0.5, 0), (3.5, 0.35, 0)],
    ],
    "medium": [
        [(0.0, 0.5, 1), (0.75, 0.5, 0), (1.5, 0.5, 0), (2.25, 0.5, 1), (3.0, 0.4, 0), (3.5, 0.35, 0)],
        [(0.25, 0.5, 0), (1.0, 0.5, 1), (1.75, 0.5, 0), (2.5, 0.5, 0), (3.25, 0.45, 1), (3.75, 0.2, 0)],
        [(0.0, 0.6, 1), (0.9, 0.45, 0), (1.6, 0.5, 0), (2.4, 0.45, 1), (3.15, 0.4, 0), (3.65, 0.25, 0)],
    ],
    "complex": [
        [(0.0, 0.4, 1), (0.5, 0.35, 0), (0.9, 0.35, 0), (1.4, 0.4, 1), (2.0, 0.35, 0), (2.45, 0.35, 0), (3.0, 0.35, 1), (3.45, 0.3, 0)],
        [(0.25, 0.35, 0), (0.75, 0.35, 0), (1.2, 0.4, 1), (1.8, 0.35, 0), (2.35, 0.35, 0), (2.9, 0.35, 1), (3.35, 0.3, 0), (3.75, 0.2, 0)],
        [(0.0, 0.35, 1), (0.45, 0.35, 0), (1.0, 0.35, 0), (1.55, 0.4, 1), (2.15, 0.35, 0), (2.7, 0.35, 0), (3.2, 0.3, 1), (3.65, 0.25, 0)],
    ],
}

BASS_RHYTHM_TEMPLATES = {
    "rnb": {
        "simple": [(0.0, 2.0), (2.0, 2.0)],
        "medium": [(0.0, 1.5), (1.5, 1.0), (2.75, 1.25)],
        "complex": [(0.0, 1.0), (1.0, 0.75), (2.0, 0.75), (3.0, 1.0)],
    },
    "indie": {
        "simple": [(0.0, 2.0), (2.0, 2.0)],
        "medium": [(0.0, 1.0), (1.5, 1.0), (3.0, 1.0)],
        "complex": [(0.0, 0.75), (1.0, 0.75), (2.0, 0.75), (3.0, 0.75)],
    },
    "edm": {
        "simple": [(0.0, 1.0), (1.0, 1.0), (2.0, 1.0), (3.0, 1.0)],
        "medium": [(0.0, 0.75), (1.0, 0.75), (2.0, 0.75), (3.0, 0.75)],
        "complex": [(0.0, 0.5), (0.75, 0.5), (1.5, 0.5), (2.25, 0.5), (3.0, 0.5), (3.5, 0.5)],
    },
    "trap": {
        "simple": [(0.0, 1.5), (2.0, 1.5)],
        "medium": [(0.0, 1.0), (1.5, 0.75), (2.5, 0.75), (3.5, 0.5)],
        "complex": [(0.0, 0.75), (1.0, 0.5), (1.75, 0.5), (2.5, 0.5), (3.25, 0.5)],
    },
}

DRUM_TEMPLATES = {
    "rnb": {
        "kick": [0, 6, 8, 12],
        "snare": [4, 12],
        "hat": [0, 2, 4, 6, 8, 10, 12, 14],
        "suggestion": "Laid-back pocket with snare on beats 2 and 4, plus swung hats.",
    },
    "indie": {
        "kick": [0, 8, 10],
        "snare": [4, 12],
        "hat": [0, 4, 8, 12],
        "suggestion": "Straight backbeat; open up hi-hats in the second half for lift.",
    },
    "edm": {
        "kick": [0, 4, 8, 12],
        "snare": [4, 12],
        "hat": [2, 6, 10, 14],
        "suggestion": "Four-on-the-floor with off-beat hats; add a pre-drop fill on bar 8/16.",
    },
    "trap": {
        "kick": [0, 3, 8, 11, 14],
        "snare": [4, 12],
        "hat": [0, 2, 4, 6, 8, 10, 12, 14],
        "suggestion": "Sparse kick with snare on 3 and 7 (half-time feel), accented hat rolls.",
    },
}

VARIANT_MULTIPLIER = {
    "safe": 0.82,
    "fresh": 1.0,
    "experimental": 1.22,
}

MIN_MELODY_CANDIDATES = 10
DEFAULT_BASS_CANDIDATES = 8
MAX_CANDIDATES = 16

SCORING_WEIGHTS: dict[str, float] = {
    "motif_repetition": 0.2,
    "chord_tone_alignment": 0.26,
    "rhythmic_coherence": 0.17,
    "note_density": 0.12,
    "pitch_range_stability": 0.15,
    "silence_spacing": 0.1,
}

VARIANT_SELECTION_WEIGHTS: dict[StarterVariant, dict[str, float]] = {
    "safe": {
        "total": 0.62,
        "chord_tone_alignment": 0.2,
        "rhythmic_coherence": 0.1,
        "motif_repetition": 0.08,
    },
    "fresh": {
        "total": 0.5,
        "rhythmic_coherence": 0.2,
        "motif_repetition": 0.15,
        "note_density": 0.15,
    },
    "experimental": {
        "total": 0.45,
        "rhythmic_coherence": 0.18,
        "note_density": 0.18,
        "pitch_range_stability": 0.1,
        "motif_repetition": 0.09,
    },
}


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def _assign_instrument_target(
    *,
    genre: str,
    mood: str,
    complexity: ComplexityLevel,
    bars: int,
) -> InstrumentTarget:
    if genre == "indie":
        return "guitar"
    if genre in {"edm", "trap"}:
        return "synth"
    if mood == "energetic" and complexity == "complex" and bars >= 16:
        return "synth"
    return "piano"


def _bar_index_for_time(start_sec: float, bpm: float, bars: int) -> int:
    beat = (start_sec * bpm) / 60.0
    return int(max(0, min(bars - 1, beat // 4)))


def _chord_plan_for_time(
    *,
    chord_plan: list[ChordPlan],
    start_sec: float,
    bpm: float,
) -> ChordPlan:
    if not chord_plan:
        raise ValueError("Chord plan is empty")
    bar = _bar_index_for_time(start_sec, bpm, len(chord_plan))
    return chord_plan[bar]


def _quantize_beat(beat: float, step: float = 0.25) -> float:
    return round(round(beat / step) * step, 3)


def _note_duration(note: NoteEvent) -> float:
    return max(0.03, float(note["end"]) - float(note["start"]))


def _project_phrase_to_harmony(
    *,
    notes: list[NoteEvent],
    lane: CandidateLane,
    chord_plan: list[ChordPlan],
    bpm: float,
    key_root: int,
    mode: Literal["major", "minor"],
) -> list[NoteEvent]:
    if not notes:
        return []

    projected: list[NoteEvent] = []
    prev_pitch = 62 if lane == "melody" else 41
    low, high = (50, 92) if lane == "melody" else (30, 64)

    for note in sorted(notes, key=lambda item: (item["start"], item["pitch"])):
        start = float(note["start"])
        end = float(note["end"])
        if end <= start:
            end = start + 0.08

        try:
            plan = _chord_plan_for_time(chord_plan=chord_plan, start_sec=start, bpm=bpm)
            chord_pcs = set(plan["chord_tone_pcs"]) or {int(plan["root_pc"])}
            root_pc = int(plan["root_pc"])
        except Exception:
            chord_pcs = {_scale_pc(key_root, mode, 1)}
            root_pc = _scale_pc(key_root, mode, 1)

        source_pitch = int(note["pitch"])
        if lane == "bass":
            target_pcs = {root_pc, (root_pc + 7) % 12} | chord_pcs
            projected_pitch = _nearest_pitch_from_pcs(float(source_pitch), target_pcs, low, high)
        else:
            projected_pitch = _nearest_pitch_from_pcs(float(source_pitch), chord_pcs, low, high)
            projected_pitch = _smooth_melodic_leap(prev_pitch, projected_pitch, key_root, mode, chord_pcs)

        prev_pitch = projected_pitch
        projected.append(
            {
                "pitch": int(max(low, min(high, projected_pitch))),
                "velocity": int(max(42, min(116, int(note["velocity"])))),
                "start": round(start, 6),
                "end": round(max(start + 0.05, end), 6),
                "lane": lane,
            }
        )

    projected.sort(key=lambda item: (item["start"], item["pitch"]))
    return projected


def _mutate_phrase_candidate(
    *,
    seed_notes: list[NoteEvent],
    lane: CandidateLane,
    chord_plan: list[ChordPlan],
    bpm: float,
    key_root: int,
    mode: Literal["major", "minor"],
    rng: random.Random,
    temperature: float,
) -> list[NoteEvent]:
    if not seed_notes:
        return []

    beat_sec = 60.0 / bpm
    shifted: list[NoteEvent] = []

    for note in seed_notes:
        if rng.random() < (0.06 + temperature * 0.06):
            continue

        start = float(note["start"])
        end = float(note["end"])
        duration = _note_duration(note)

        jitter = rng.choice([-0.125, -0.0625, 0.0, 0.0625, 0.125]) * beat_sec * temperature
        moved_start = max(0.0, start + jitter)

        duration_scale = 1.0 + rng.uniform(-0.22, 0.24) * temperature
        moved_duration = max(0.08 if lane == "melody" else 0.12, duration * duration_scale)

        semitone_shift = rng.choice([-3, -2, -1, 0, 0, 1, 2, 3]) if lane == "melody" else rng.choice([-2, -1, 0, 0, 1, 2])
        moved_pitch = int(note["pitch"]) + int(round(semitone_shift * temperature))

        velocity_shift = int(round(rng.uniform(-10, 10) * temperature))
        moved_velocity = int(max(42, min(116, int(note["velocity"]) + velocity_shift)))

        shifted.append(
            {
                "pitch": moved_pitch,
                "velocity": moved_velocity,
                "start": round(moved_start, 6),
                "end": round(moved_start + moved_duration, 6),
                "lane": lane,
            }
        )

    shifted.sort(key=lambda item: (item["start"], item["pitch"]))
    if not shifted:
        shifted = [
            {
                "pitch": int(note["pitch"]),
                "velocity": int(note["velocity"]),
                "start": float(note["start"]),
                "end": float(note["end"]),
                "lane": lane,
            }
            for note in seed_notes
        ]

    return _project_phrase_to_harmony(
        notes=shifted,
        lane=lane,
        chord_plan=chord_plan,
        bpm=bpm,
        key_root=key_root,
        mode=mode,
    )


class SymbolicCandidateGenerator:
    backend_name = "deterministic"

    def __init__(self, rng: random.Random) -> None:
        self._rng = rng

    def generate_melody_candidates(
        self,
        *,
        chord_plan: list[ChordPlan],
        genre: str,
        bpm: float,
        key_root: int,
        mode: Literal["major", "minor"],
        complexity: ComplexityLevel,
        count: int,
    ) -> list[PhraseCandidate]:
        seed = generate_melody(
            chord_plan=chord_plan,
            genre=genre,
            bpm=bpm,
            key_root=key_root,
            mode=mode,
            complexity=complexity,
            variant="fresh",
            rng=self._rng,
        )
        return self._build_mutations(
            seed_notes=seed,
            lane="melody",
            chord_plan=chord_plan,
            bpm=bpm,
            key_root=key_root,
            mode=mode,
            count=count,
        )

    def generate_bass_candidates(
        self,
        *,
        chord_plan: list[ChordPlan],
        genre: str,
        bpm: float,
        key_root: int,
        mode: Literal["major", "minor"],
        complexity: ComplexityLevel,
        count: int,
    ) -> list[PhraseCandidate]:
        seed = generate_bass(
            chord_plan=chord_plan,
            genre=genre,
            bpm=bpm,
            complexity=complexity,
            variant="fresh",
            rng=self._rng,
        )
        return self._build_mutations(
            seed_notes=seed,
            lane="bass",
            chord_plan=chord_plan,
            bpm=bpm,
            key_root=key_root,
            mode=mode,
            count=count,
        )

    def _build_mutations(
        self,
        *,
        seed_notes: list[NoteEvent],
        lane: CandidateLane,
        chord_plan: list[ChordPlan],
        bpm: float,
        key_root: int,
        mode: Literal["major", "minor"],
        count: int,
    ) -> list[PhraseCandidate]:
        if not seed_notes:
            return []

        candidates: list[PhraseCandidate] = []
        scaled_count = int(max(1, min(MAX_CANDIDATES, count)))
        for index in range(scaled_count):
            temperature = 0.55 + (index / max(1, scaled_count - 1)) * 0.75
            mutated = _mutate_phrase_candidate(
                seed_notes=seed_notes,
                lane=lane,
                chord_plan=chord_plan,
                bpm=bpm,
                key_root=key_root,
                mode=mode,
                rng=self._rng,
                temperature=temperature,
            )
            candidates.append({"notes": mutated, "source": self.backend_name, "temperature": round(temperature, 3)})
        return candidates


class MusicVAECandidateGenerator(SymbolicCandidateGenerator):
    backend_name = "musicvae"

    def __init__(self, rng: random.Random) -> None:
        super().__init__(rng)
        self._model: Any | None = None
        self._model_ready: bool | None = None

    def _ensure_model(self) -> bool:
        if self._model_ready is not None:
            return self._model_ready

        enabled = bool(getattr(settings, "musicvae_enabled", True))
        checkpoint = str(getattr(settings, "musicvae_checkpoint_path", "")).strip()
        config_name = str(getattr(settings, "musicvae_config_name", "cat-mel_2bar_big")).strip() or "cat-mel_2bar_big"

        if not enabled or not checkpoint:
            self._model_ready = False
            return False

        try:
            import numpy as np

            # Older Magenta code paths still reference removed numpy aliases.
            if not hasattr(np, "bool"):
                np.bool = np.bool_  # type: ignore[attr-defined]
            if not hasattr(np, "int"):
                np.int = int  # type: ignore[attr-defined]
            if not hasattr(np, "float"):
                np.float = float  # type: ignore[attr-defined]

            from magenta.models.music_vae import configs as musicvae_configs  # type: ignore
            from magenta.models.music_vae.trained_model import TrainedModel  # type: ignore

            config = musicvae_configs.CONFIG_MAP.get(config_name)
            if config is None:
                self._model_ready = False
                return False

            self._model = TrainedModel(config, batch_size=4, checkpoint_dir_or_path=checkpoint)
            self._model_ready = True
            return True
        except Exception:
            self._model_ready = False
            return False

    def _sequence_to_events(
        self,
        *,
        sequence: Any,
        lane: CandidateLane,
        bars: int,
        bpm: float,
    ) -> list[NoteEvent]:
        limit = bars * 4.0 * (60.0 / bpm)
        events: list[NoteEvent] = []
        for note in getattr(sequence, "notes", []):
            start = float(getattr(note, "start_time", 0.0))
            end = float(getattr(note, "end_time", start + 0.08))
            if start >= limit:
                continue
            velocity = int(getattr(note, "velocity", 84))
            pitch = int(getattr(note, "pitch", 60))
            events.append(
                {
                    "pitch": pitch,
                    "velocity": velocity,
                    "start": round(start, 6),
                    "end": round(min(limit, max(start + 0.05, end)), 6),
                    "lane": lane,
                }
            )
        events.sort(key=lambda item: (item["start"], item["pitch"]))
        return events

    def _sample_with_musicvae(
        self,
        *,
        lane: CandidateLane,
        bars: int,
        count: int,
        bpm: float,
    ) -> list[PhraseCandidate]:
        if not self._ensure_model() or self._model is None:
            return []

        steps = bars * 16
        variants: list[PhraseCandidate] = []
        temperatures = [0.65, 0.82, 0.95, 1.08, 1.2]

        for temperature in temperatures:
            if len(variants) >= count:
                break
            request_count = min(4, count - len(variants))
            try:
                sampled = self._model.sample(n=request_count, length=steps, temperature=temperature)
            except Exception:
                return []

            for sequence in sampled:
                notes = self._sequence_to_events(
                    sequence=sequence,
                    lane=lane,
                    bars=bars,
                    bpm=bpm,
                )
                if notes:
                    variants.append(
                        {
                            "notes": notes,
                            "source": "musicvae",
                            "temperature": round(float(temperature), 3),
                        }
                    )
                if len(variants) >= count:
                    break

        return variants

    def _blend_with_fallback(
        self,
        *,
        lane: CandidateLane,
        chord_plan: list[ChordPlan],
        genre: str,
        bpm: float,
        key_root: int,
        mode: Literal["major", "minor"],
        complexity: ComplexityLevel,
        count: int,
        sampled: list[PhraseCandidate],
    ) -> list[PhraseCandidate]:
        fixed: list[PhraseCandidate] = []
        for candidate in sampled:
            fixed_notes = _project_phrase_to_harmony(
                notes=candidate["notes"],
                lane=lane,
                chord_plan=chord_plan,
                bpm=bpm,
                key_root=key_root,
                mode=mode,
            )
            if fixed_notes:
                fixed.append(
                    {
                        "notes": fixed_notes,
                        "source": candidate["source"],
                        "temperature": candidate["temperature"],
                    }
                )

        if len(fixed) >= count:
            return fixed[:count]

        fallback = super().generate_melody_candidates(
            chord_plan=chord_plan,
            genre=genre,
            bpm=bpm,
            key_root=key_root,
            mode=mode,
            complexity=complexity,
            count=max(1, count - len(fixed)),
        ) if lane == "melody" else super().generate_bass_candidates(
            chord_plan=chord_plan,
            genre=genre,
            bpm=bpm,
            key_root=key_root,
            mode=mode,
            complexity=complexity,
            count=max(1, count - len(fixed)),
        )

        for item in fallback:
            fixed.append(
                {
                    "notes": item["notes"],
                    "source": f"{item['source']}-fallback",
                    "temperature": item["temperature"],
                }
            )
            if len(fixed) >= count:
                break

        return fixed[:count]

    def generate_melody_candidates(
        self,
        *,
        chord_plan: list[ChordPlan],
        genre: str,
        bpm: float,
        key_root: int,
        mode: Literal["major", "minor"],
        complexity: ComplexityLevel,
        count: int,
    ) -> list[PhraseCandidate]:
        bars = len(chord_plan)
        sampled = self._sample_with_musicvae(lane="melody", bars=bars, count=count, bpm=bpm)
        blended = self._blend_with_fallback(
            lane="melody",
            chord_plan=chord_plan,
            genre=genre,
            bpm=bpm,
            key_root=key_root,
            mode=mode,
            complexity=complexity,
            count=count,
            sampled=sampled,
        )
        if not sampled:
            self.backend_name = "deterministic-fallback"
        return blended

    def generate_bass_candidates(
        self,
        *,
        chord_plan: list[ChordPlan],
        genre: str,
        bpm: float,
        key_root: int,
        mode: Literal["major", "minor"],
        complexity: ComplexityLevel,
        count: int,
    ) -> list[PhraseCandidate]:
        bars = len(chord_plan)
        sampled = self._sample_with_musicvae(lane="bass", bars=bars, count=count, bpm=bpm)
        blended = self._blend_with_fallback(
            lane="bass",
            chord_plan=chord_plan,
            genre=genre,
            bpm=bpm,
            key_root=key_root,
            mode=mode,
            complexity=complexity,
            count=count,
            sampled=sampled,
        )
        if not sampled:
            self.backend_name = "deterministic-fallback"
        return blended


def _motif_signature(notes: list[NoteEvent], bpm: float) -> list[tuple[int, int, int]]:
    beat_sec = 60.0 / bpm
    signature: list[tuple[int, int, int]] = []
    last_pitch = notes[0]["pitch"] if notes else 60
    for note in notes:
        beat = float(note["start"]) / beat_sec
        dur = _note_duration(note) / beat_sec
        interval = int(note["pitch"]) - int(last_pitch)
        signature.append((int(round(interval)), int(round(_quantize_beat(beat, 0.25) * 4)), int(round(_quantize_beat(dur, 0.25) * 4))))
        last_pitch = int(note["pitch"])
    return signature


def _score_motif_repetition(notes: list[NoteEvent], bpm: float) -> float:
    if len(notes) < 6:
        return 0.35
    sig = _motif_signature(notes, bpm)
    grams: dict[tuple[tuple[int, int, int], ...], int] = {}
    for index in range(0, len(sig) - 2):
        gram = tuple(sig[index : index + 3])
        grams[gram] = grams.get(gram, 0) + 1
    if not grams:
        return 0.0
    repeated = sum(count - 1 for count in grams.values() if count > 1)
    possible = max(1, len(sig) - 2)
    ratio = repeated / possible
    return _clamp01(0.2 + ratio * 1.25)


def _score_chord_tone_alignment(notes: list[NoteEvent], chord_plan: list[ChordPlan], bpm: float) -> float:
    if not notes or not chord_plan:
        return 0.0

    beat_sec = 60.0 / bpm
    weighted = 0.0
    scored = 0.0
    for note in notes:
        start = float(note["start"])
        beat = start / beat_sec
        local = beat % 4.0
        strong = min(abs(local - round(local)), abs(local - 2.0)) < 0.12
        weight = 1.35 if strong else 1.0

        plan = _chord_plan_for_time(chord_plan=chord_plan, start_sec=start, bpm=bpm)
        chord_pcs = set(plan["chord_tone_pcs"]) or {int(plan["root_pc"])}

        scored += weight
        if int(note["pitch"]) % 12 in chord_pcs:
            weighted += weight

    return _clamp01(weighted / max(1e-6, scored))


def _score_rhythmic_coherence(notes: list[NoteEvent], bars: int, bpm: float) -> float:
    if not notes:
        return 0.0
    if bars <= 1:
        return 0.7

    beat_sec = 60.0 / bpm
    patterns: list[set[int]] = [set() for _ in range(bars)]
    for note in notes:
        beat = float(note["start"]) / beat_sec
        bar = int(max(0, min(bars - 1, beat // 4)))
        slot = int(max(0, min(15, round((beat % 4.0) * 4))))
        patterns[bar].add(slot)

    similarities: list[float] = []
    for bar in range(1, bars):
        reference = patterns[bar % 2]
        current = patterns[bar]
        union = len(reference | current)
        if union == 0:
            similarities.append(0.0)
            continue
        similarities.append(len(reference & current) / union)

    return _clamp01((sum(similarities) / max(1, len(similarities))) * 1.2)


def _score_note_density(notes: list[NoteEvent], bars: int, lane: CandidateLane) -> float:
    if bars <= 0:
        return 0.0
    per_bar = len(notes) / bars
    target = 5.5 if lane == "melody" else 3.0
    tolerance = 2.8 if lane == "melody" else 1.8
    return _clamp01(1.0 - abs(per_bar - target) / tolerance)


def _score_pitch_range_stability(notes: list[NoteEvent], bars: int, bpm: float, lane: CandidateLane, instrument_target: InstrumentTarget) -> float:
    if len(notes) < 2:
        return 0.4

    pitches = [int(note["pitch"]) for note in notes]
    span = max(pitches) - min(pitches)
    if lane == "bass":
        span_target = 16
    elif instrument_target == "guitar":
        span_target = 14
    elif instrument_target == "piano":
        span_target = 18
    else:
        span_target = 24

    span_score = _clamp01(1.0 - max(0.0, span - span_target) / max(1.0, span_target))

    beat_sec = 60.0 / bpm
    per_bar: list[list[int]] = [[] for _ in range(max(1, bars))]
    for note in notes:
        beat = float(note["start"]) / beat_sec
        bar = int(max(0, min(max(0, bars - 1), beat // 4)))
        per_bar[bar].append(int(note["pitch"]))

    centers = [statistics.mean(bar_pitches) for bar_pitches in per_bar if bar_pitches]
    if len(centers) <= 1:
        center_score = 0.7
    else:
        drift = statistics.pstdev(centers)
        center_score = _clamp01(1.0 - drift / 6.5)

    return _clamp01(span_score * 0.55 + center_score * 0.45)


def _score_silence_spacing(notes: list[NoteEvent], bars: int, bpm: float, lane: CandidateLane) -> float:
    if not notes:
        return 0.0

    total_duration = bars * 4.0 * (60.0 / bpm)
    covered = 0.0
    for note in notes:
        covered += min(_note_duration(note), 1.2)
    density_ratio = min(1.0, covered / max(0.001, total_duration))
    silence_ratio = 1.0 - density_ratio
    target = 0.3 if lane == "melody" else 0.45
    tolerance = 0.28 if lane == "melody" else 0.24
    return _clamp01(1.0 - abs(silence_ratio - target) / tolerance)


def _score_phrase_candidate(
    *,
    candidate: PhraseCandidate,
    lane: CandidateLane,
    instrument_target: InstrumentTarget,
    chord_plan: list[ChordPlan],
    bars: int,
    bpm: float,
) -> ScoredPhraseCandidate:
    notes = candidate["notes"]
    motif = _score_motif_repetition(notes, bpm)
    chord_alignment = _score_chord_tone_alignment(notes, chord_plan, bpm)
    rhythm = _score_rhythmic_coherence(notes, bars, bpm)
    density = _score_note_density(notes, bars, lane)
    pitch_stability = _score_pitch_range_stability(notes, bars, bpm, lane, instrument_target)
    silence = _score_silence_spacing(notes, bars, bpm, lane)

    total = (
        motif * SCORING_WEIGHTS["motif_repetition"]
        + chord_alignment * SCORING_WEIGHTS["chord_tone_alignment"]
        + rhythm * SCORING_WEIGHTS["rhythmic_coherence"]
        + density * SCORING_WEIGHTS["note_density"]
        + pitch_stability * SCORING_WEIGHTS["pitch_range_stability"]
        + silence * SCORING_WEIGHTS["silence_spacing"]
    )

    score: CandidateScore = {
        "motif_repetition": round(motif, 4),
        "chord_tone_alignment": round(chord_alignment, 4),
        "rhythmic_coherence": round(rhythm, 4),
        "note_density": round(density, 4),
        "pitch_range_stability": round(pitch_stability, 4),
        "silence_spacing": round(silence, 4),
        "total": round(total, 4),
    }

    reasons: list[str] = []
    if chord_alignment < 0.52:
        reasons.append("weak_chord_alignment")
    if rhythm < 0.34:
        reasons.append("weak_rhythm")
    if density < 0.2:
        reasons.append("poor_density")
    if pitch_stability < 0.25:
        reasons.append("unstable_range")
    if total < 0.5:
        reasons.append("low_total")

    return {
        "notes": notes,
        "source": candidate["source"],
        "temperature": candidate["temperature"],
        "score": score,
        "rejected": bool(reasons),
        "reject_reasons": reasons,
    }


def _score_candidate_pool(
    *,
    candidates: list[PhraseCandidate],
    lane: CandidateLane,
    instrument_target: InstrumentTarget,
    chord_plan: list[ChordPlan],
    bars: int,
    bpm: float,
) -> list[ScoredPhraseCandidate]:
    scored = [
        _score_phrase_candidate(
            candidate=candidate,
            lane=lane,
            instrument_target=instrument_target,
            chord_plan=chord_plan,
            bars=bars,
            bpm=bpm,
        )
        for candidate in candidates
    ]
    scored.sort(key=lambda item: item["score"]["total"], reverse=True)
    return scored


def _pool_best_candidates(scored: list[ScoredPhraseCandidate], minimum_keep: int = 3) -> list[ScoredPhraseCandidate]:
    survivors = [item for item in scored if not item["rejected"]]
    if len(survivors) >= minimum_keep:
        return survivors
    return scored[: max(1, minimum_keep)]


def _weighted_variant_rank(candidate: ScoredPhraseCandidate, variant: StarterVariant) -> float:
    weights = VARIANT_SELECTION_WEIGHTS[variant]
    score = candidate["score"]
    return (
        score["total"] * weights.get("total", 0.0)
        + score["chord_tone_alignment"] * weights.get("chord_tone_alignment", 0.0)
        + score["rhythmic_coherence"] * weights.get("rhythmic_coherence", 0.0)
        + score["motif_repetition"] * weights.get("motif_repetition", 0.0)
        + score["note_density"] * weights.get("note_density", 0.0)
        + score["pitch_range_stability"] * weights.get("pitch_range_stability", 0.0)
    )


def _select_variant_candidate(scored: list[ScoredPhraseCandidate], variant: StarterVariant) -> ScoredPhraseCandidate:
    pool = _pool_best_candidates(scored)
    if not pool:
        raise ValueError("No candidates to select from")

    ranked = sorted(pool, key=lambda item: _weighted_variant_rank(item, variant), reverse=True)
    if variant == "experimental" and len(ranked) > 1:
        # Keep adventurous output from over-collapsing into the safest top score.
        return ranked[min(1, len(ranked) - 1)]
    return ranked[0]


def _melody_bass_cohesion(melody: list[NoteEvent], bass: list[NoteEvent], bpm: float) -> float:
    if not melody or not bass:
        return 0.0

    beat_sec = 60.0 / bpm
    melody_slots = {int(round((float(note["start"]) / beat_sec) * 2)) for note in melody}
    bass_slots = {int(round((float(note["start"]) / beat_sec) * 2)) for note in bass}
    overlap = len(melody_slots & bass_slots)
    union = len(melody_slots | bass_slots)
    if union == 0:
        return 0.0

    overlap_ratio = overlap / union
    complement_score = 1.0 - overlap_ratio
    return _clamp01(0.35 + complement_score * 0.65)


def _select_bass_candidate(
    *,
    scored_bass: list[ScoredPhraseCandidate],
    selected_melody: ScoredPhraseCandidate,
    variant: StarterVariant,
    bpm: float,
) -> ScoredPhraseCandidate:
    pool = _pool_best_candidates(scored_bass, minimum_keep=2)
    if not pool:
        raise ValueError("No bass candidates to select from")

    ranked: list[tuple[float, ScoredPhraseCandidate]] = []
    for bass_candidate in pool:
        cohesion = _melody_bass_cohesion(selected_melody["notes"], bass_candidate["notes"], bpm)
        total = bass_candidate["score"]["total"] * 0.76 + cohesion * 0.24
        if variant == "experimental":
            total += bass_candidate["score"]["note_density"] * 0.05
        ranked.append((total, bass_candidate))

    ranked.sort(key=lambda item: item[0], reverse=True)
    return ranked[0][1]


def _format_phrase_for_piano(
    *,
    phrase: list[NoteEvent],
    chord_plan: list[ChordPlan],
    bpm: float,
    key_root: int,
    mode: Literal["major", "minor"],
    complexity: ComplexityLevel,
    variant: StarterVariant,
    rng: random.Random,
) -> list[NoteEvent]:
    if not phrase:
        return []

    formatted: list[NoteEvent] = []
    beat_sec = 60.0 / bpm
    prep_prob = {"simple": 0.3, "medium": 0.46, "complex": 0.58}[complexity]
    riff_prob = {"safe": 0.14, "fresh": 0.24, "experimental": 0.34}[variant]

    for note in sorted(phrase, key=lambda item: (item["start"], item["pitch"])):
        start = float(note["start"])
        plan = _chord_plan_for_time(chord_plan=chord_plan, start_sec=start, bpm=bpm)
        chord_pcs = set(plan["chord_tone_pcs"]) or {int(plan["root_pc"])}

        top_pitch = _nearest_pitch_from_pcs(float(note["pitch"]), chord_pcs, 56, 92)
        duration = _note_duration(note)
        top_duration = max(0.09, min(duration * 0.9, beat_sec * 1.1))

        formatted.append(
            {
                "pitch": int(top_pitch),
                "velocity": int(max(48, min(112, int(note["velocity"]) + 4))),
                "start": round(start, 6),
                "end": round(start + top_duration, 6),
                "lane": "melody",
            }
        )

        if rng.random() < prep_prob:
            prep_pitch = _nearest_pitch_from_pcs(float(top_pitch - rng.choice([3, 5, 7])), chord_pcs, 48, 84)
            prep_start = max(0.0, start - min(0.12, duration * 0.35))
            formatted.append(
                {
                    "pitch": int(prep_pitch),
                    "velocity": int(max(42, min(106, int(note["velocity"]) - 5))),
                    "start": round(prep_start, 6),
                    "end": round(min(start, prep_start + min(0.13, top_duration * 0.7)), 6),
                    "lane": "melody",
                }
            )

        if rng.random() < riff_prob:
            passing_target = top_pitch + rng.choice([-2, -1, 1, 2])
            passing_pitch = _nearest_scale_pitch(float(passing_target), key_root, mode, 54, 90)
            riff_start = start + min(top_duration * 0.55, beat_sec * 0.35)
            riff_dur = max(0.06, top_duration * 0.4)
            formatted.append(
                {
                    "pitch": int(passing_pitch),
                    "velocity": int(max(40, min(104, int(note["velocity"]) - 8))),
                    "start": round(riff_start, 6),
                    "end": round(riff_start + riff_dur, 6),
                    "lane": "melody",
                }
            )

    formatted.sort(key=lambda item: (item["start"], item["pitch"]))
    return formatted


def _format_phrase_for_guitar(
    *,
    phrase: list[NoteEvent],
    chord_plan: list[ChordPlan],
    bpm: float,
    variant: StarterVariant,
    rng: random.Random,
) -> list[NoteEvent]:
    if not phrase:
        return []

    beat_sec = 60.0 / bpm
    spread = {"safe": 0.014, "fresh": 0.02, "experimental": 0.028}[variant]
    sustain_scale = {"safe": 1.14, "fresh": 1.26, "experimental": 1.36}[variant]
    max_polyphony = {"safe": 2, "fresh": 3, "experimental": 3}[variant]

    formatted: list[NoteEvent] = []
    direction_down = True

    for note in sorted(phrase, key=lambda item: (item["start"], item["pitch"])):
        start = float(note["start"])
        duration = _note_duration(note)

        plan = _chord_plan_for_time(chord_plan=chord_plan, start_sec=start, bpm=bpm)
        chord_pcs = set(plan["chord_tone_pcs"]) or {int(plan["root_pc"])}
        root_pc = int(plan["root_pc"])
        center = int(max(54, min(70, int(note["pitch"]))))

        size = min(max_polyphony, 3 if rng.random() < 0.65 else 2)
        voicing = _build_guitar_voicing(
            root_pc=root_pc,
            chord_pcs=chord_pcs,
            position_center=center,
            chord_size=size,
        )

        ordered = sorted(voicing, reverse=direction_down)
        direction_down = not direction_down

        for idx, pitch in enumerate(ordered[:max_polyphony]):
            note_start = start + idx * spread
            note_dur = max(0.1, min(duration * sustain_scale, beat_sec * 1.6))
            velocity = int(max(42, min(110, int(note["velocity"]) + (5 if idx == 0 else -2) + rng.randint(-4, 4))))
            formatted.append(
                {
                    "pitch": int(max(48, min(82, pitch))),
                    "velocity": velocity,
                    "start": round(note_start, 6),
                    "end": round(note_start + note_dur, 6),
                    "lane": "melody",
                }
            )

    formatted.sort(key=lambda item: (item["start"], item["pitch"]))
    return formatted


def _format_phrase_for_synth(
    *,
    phrase: list[NoteEvent],
    bpm: float,
    variant: StarterVariant,
    rng: random.Random,
) -> list[NoteEvent]:
    if not phrase:
        return []

    beat_sec = 60.0 / bpm
    gate_scale = {"safe": 0.82, "fresh": 0.76, "experimental": 0.68}[variant]
    octave_prob = {"safe": 0.08, "fresh": 0.16, "experimental": 0.24}[variant]

    formatted: list[NoteEvent] = []
    for note in sorted(phrase, key=lambda item: (item["start"], item["pitch"])):
        start = float(note["start"])
        beat = _quantize_beat(start / beat_sec, 0.25)
        quantized_start = beat * beat_sec
        duration = max(0.08, _note_duration(note) * gate_scale)
        pitch = int(max(50, min(94, int(note["pitch"]))))

        formatted.append(
            {
                "pitch": pitch,
                "velocity": int(max(44, min(114, int(note["velocity"]) + 3))),
                "start": round(quantized_start, 6),
                "end": round(quantized_start + duration, 6),
                "lane": "melody",
            }
        )

        if rng.random() < octave_prob:
            formatted.append(
                {
                    "pitch": int(max(50, min(98, pitch + 12))),
                    "velocity": int(max(40, min(106, int(note["velocity"]) - 8))),
                    "start": round(quantized_start, 6),
                    "end": round(quantized_start + duration * 0.88, 6),
                    "lane": "melody",
                }
            )

    formatted.sort(key=lambda item: (item["start"], item["pitch"]))
    return formatted


def _format_bass_phrase(
    *,
    phrase: list[NoteEvent],
    chord_plan: list[ChordPlan],
    bpm: float,
    variant: StarterVariant,
) -> list[NoteEvent]:
    if not phrase:
        return []

    beat_sec = 60.0 / bpm
    length_scale = {"safe": 0.95, "fresh": 0.88, "experimental": 0.8}[variant]
    formatted: list[NoteEvent] = []

    for note in sorted(phrase, key=lambda item: (item["start"], item["pitch"])):
        start = float(note["start"])
        plan = _chord_plan_for_time(chord_plan=chord_plan, start_sec=start, bpm=bpm)
        root_pc = int(plan["root_pc"])
        target_pcs = {root_pc, (root_pc + 7) % 12} | set(plan["chord_tone_pcs"])
        pitch = _nearest_pitch_from_pcs(float(note["pitch"]), target_pcs, 30, 62)
        duration = max(0.12, _note_duration(note) * length_scale)

        formatted.append(
            {
                "pitch": int(pitch),
                "velocity": int(max(46, min(108, int(note["velocity"]) + 2))),
                "start": round(start, 6),
                "end": round(start + duration, 6),
                "lane": "bass",
            }
        )

    formatted.sort(key=lambda item: (item["start"], item["pitch"]))
    return formatted


def _format_melody_by_instrument(
    *,
    phrase: list[NoteEvent],
    instrument_target: InstrumentTarget,
    chord_plan: list[ChordPlan],
    bpm: float,
    key_root: int,
    mode: Literal["major", "minor"],
    complexity: ComplexityLevel,
    variant: StarterVariant,
    rng: random.Random,
) -> list[NoteEvent]:
    if instrument_target == "guitar":
        return _format_phrase_for_guitar(
            phrase=phrase,
            chord_plan=chord_plan,
            bpm=bpm,
            variant=variant,
            rng=rng,
        )
    if instrument_target == "synth":
        return _format_phrase_for_synth(
            phrase=phrase,
            bpm=bpm,
            variant=variant,
            rng=rng,
        )
    return _format_phrase_for_piano(
        phrase=phrase,
        chord_plan=chord_plan,
        bpm=bpm,
        key_root=key_root,
        mode=mode,
        complexity=complexity,
        variant=variant,
        rng=rng,
    )


def _generate_scored_parts(
    *,
    chord_plan: list[ChordPlan],
    genre: str,
    bpm: float,
    key_root: int,
    mode: Literal["major", "minor"],
    complexity: ComplexityLevel,
    bars: int,
    variant: StarterVariant,
    instrument_target: InstrumentTarget,
    rng: random.Random,
) -> tuple[list[NoteEvent], list[NoteEvent], str, dict[str, float | int | str]]:
    generator = MusicVAECandidateGenerator(rng)

    melody_candidates = generator.generate_melody_candidates(
        chord_plan=chord_plan,
        genre=genre,
        bpm=bpm,
        key_root=key_root,
        mode=mode,
        complexity=complexity,
        count=max(MIN_MELODY_CANDIDATES, 12),
    )
    bass_candidates = generator.generate_bass_candidates(
        chord_plan=chord_plan,
        genre=genre,
        bpm=bpm,
        key_root=key_root,
        mode=mode,
        complexity=complexity,
        count=DEFAULT_BASS_CANDIDATES,
    )

    melody_scored = _score_candidate_pool(
        candidates=melody_candidates,
        lane="melody",
        instrument_target=instrument_target,
        chord_plan=chord_plan,
        bars=bars,
        bpm=bpm,
    )
    bass_scored = _score_candidate_pool(
        candidates=bass_candidates,
        lane="bass",
        instrument_target=instrument_target,
        chord_plan=chord_plan,
        bars=bars,
        bpm=bpm,
    )

    if not melody_scored:
        fallback_melody = generate_melody(
            chord_plan=chord_plan,
            genre=genre,
            bpm=bpm,
            key_root=key_root,
            mode=mode,
            complexity=complexity,
            variant=variant,
            rng=rng,
        )
        fallback_melody_scored: ScoredPhraseCandidate = {
            "notes": fallback_melody,
            "source": "deterministic-fallback",
            "temperature": 0.0,
            "score": {
                "motif_repetition": 0.5,
                "chord_tone_alignment": 0.6,
                "rhythmic_coherence": 0.5,
                "note_density": 0.5,
                "pitch_range_stability": 0.5,
                "silence_spacing": 0.5,
                "total": 0.52,
            },
            "rejected": False,
            "reject_reasons": [],
        }
        melody_scored = [fallback_melody_scored]

    if not bass_scored:
        fallback_bass = generate_bass(
            chord_plan=chord_plan,
            genre=genre,
            bpm=bpm,
            complexity=complexity,
            variant=variant,
            rng=rng,
        )
        fallback_bass_scored: ScoredPhraseCandidate = {
            "notes": fallback_bass,
            "source": "deterministic-fallback",
            "temperature": 0.0,
            "score": {
                "motif_repetition": 0.5,
                "chord_tone_alignment": 0.65,
                "rhythmic_coherence": 0.48,
                "note_density": 0.54,
                "pitch_range_stability": 0.55,
                "silence_spacing": 0.52,
                "total": 0.54,
            },
            "rejected": False,
            "reject_reasons": [],
        }
        bass_scored = [fallback_bass_scored]

    selected_melody_raw = _select_variant_candidate(melody_scored, variant)
    selected_bass_raw = _select_bass_candidate(
        scored_bass=bass_scored,
        selected_melody=selected_melody_raw,
        variant=variant,
        bpm=bpm,
    )

    melody = _format_melody_by_instrument(
        phrase=selected_melody_raw["notes"],
        instrument_target=instrument_target,
        chord_plan=chord_plan,
        bpm=bpm,
        key_root=key_root,
        mode=mode,
        complexity=complexity,
        variant=variant,
        rng=rng,
    )
    bass = _format_bass_phrase(
        phrase=selected_bass_raw["notes"],
        chord_plan=chord_plan,
        bpm=bpm,
        variant=variant,
    )

    rejected_melody = sum(1 for item in melody_scored if item["rejected"])
    rejected_bass = sum(1 for item in bass_scored if item["rejected"])
    summary: dict[str, float | int | str] = {
        "melody_candidates_total": len(melody_scored),
        "melody_candidates_rejected": rejected_melody,
        "bass_candidates_total": len(bass_scored),
        "bass_candidates_rejected": rejected_bass,
        "selected_melody_total_score": selected_melody_raw["score"]["total"],
        "selected_bass_total_score": selected_bass_raw["score"]["total"],
        "selected_melody_source": selected_melody_raw["source"],
        "selected_bass_source": selected_bass_raw["source"],
        "selected_melody_temperature": selected_melody_raw["temperature"],
        "selected_bass_temperature": selected_bass_raw["temperature"],
    }
    return melody, bass, generator.backend_name, summary


def _normalize_genre(genre: str) -> str:
    value = genre.strip().lower()
    if value in {"rnb", "indie", "edm", "trap"}:
        return value
    return "default"


def _normalize_mood(mood: str) -> str:
    value = mood.strip().lower()
    if value in {"dark", "happy", "emotional", "energetic"}:
        return value
    return "emotional"


def _normalize_complexity(complexity: str) -> ComplexityLevel:
    value = complexity.strip().lower()
    if value in {"simple", "medium", "complex"}:
        return cast(ComplexityLevel, value)
    return "medium"


def _normalize_bars(bars: int) -> int:
    return 16 if int(bars) >= 16 else 8


def _normalize_bpm(bpm: float) -> float:
    return max(68.0, min(178.0, float(bpm)))


def _mode_from_mood(mood: str) -> Literal["major", "minor"]:
    if mood in {"dark", "emotional"}:
        return "minor"
    return "major"


def _auto_key(genre: str, mood: str, rng: random.Random) -> str:
    preferred_minor = ["A minor", "D minor", "E minor", "F# minor", "C minor"]
    preferred_major = ["C major", "D major", "G major", "A major", "F major"]
    if _mode_from_mood(mood) == "minor":
        return rng.choice(preferred_minor if genre != "edm" else ["F minor", "G minor", "A minor", "D minor"])
    return rng.choice(preferred_major if genre != "trap" else ["F major", "G major", "A# major", "C major"])


def _parse_key(key: str | None, genre: str, mood: str, rng: random.Random) -> tuple[int, Literal["major", "minor"], str]:
    if not key or not key.strip():
        key = _auto_key(genre, mood, rng)

    parts = key.strip().split(" ")
    tonic = parts[0].upper()
    if tonic not in KEY_NAMES:
        tonic = "C"
    mode_text = parts[1].lower() if len(parts) > 1 else _mode_from_mood(mood)
    mode: Literal["major", "minor"] = "minor" if mode_text == "minor" else "major"
    return KEY_NAMES.index(tonic), mode, f"{tonic} {mode}"


def _scale_pc(root_pc: int, mode: Literal["major", "minor"], degree: int) -> int:
    scale = SCALE_NOTES[mode]
    return (root_pc + scale[(degree - 1) % 7]) % 12


def _pc_to_midi(pc: int, octave: int) -> int:
    return int((octave + 1) * 12 + pc)


def _quality_for_degree(mode: Literal["major", "minor"], degree: int) -> Literal["maj", "min", "dim"]:
    if mode == "major":
        lookup: dict[int, Literal["maj", "min", "dim"]] = {
            1: "maj",
            2: "min",
            3: "min",
            4: "maj",
            5: "maj",
            6: "min",
            7: "dim",
        }
    else:
        lookup = {
            1: "min",
            2: "dim",
            3: "maj",
            4: "min",
            5: "min",
            6: "maj",
            7: "maj",
        }
    return lookup.get(degree, "maj")


def _extension_for_chord(
    genre: str,
    quality: Literal["maj", "min", "dim"],
    complexity: ComplexityLevel,
    variant: StarterVariant,
    rng: random.Random,
) -> Literal["triad", "7", "9"]:
    if quality == "dim":
        return "triad"

    base_prob = {
        "rnb": 0.78,
        "indie": 0.38,
        "edm": 0.28,
        "trap": 0.46,
        "default": 0.35,
    }.get(genre, 0.35)

    complexity_bias = {"simple": -0.2, "medium": 0.0, "complex": 0.14}[complexity]
    variant_bias = {"safe": -0.14, "fresh": 0.0, "experimental": 0.18}[variant]
    chance = max(0.0, min(0.95, base_prob + complexity_bias + variant_bias))

    if rng.random() > chance:
        return "triad"

    ninth_bias = 0.34 if genre == "rnb" else 0.18
    if complexity == "complex":
        ninth_bias += 0.12
    if variant == "experimental":
        ninth_bias += 0.1

    return "9" if rng.random() < min(0.85, ninth_bias) else "7"


def _build_chord_pitches(
    root_pc: int,
    quality: Literal["maj", "min", "dim"],
    extension: Literal["triad", "7", "9"],
    complexity: ComplexityLevel,
    variant: StarterVariant,
    rng: random.Random,
) -> list[int]:
    intervals = list(QUALITY_INTERVALS[quality])

    if extension in {"7", "9"}:
        intervals.append(11 if quality == "maj" else 10)
    if extension == "9":
        intervals.append(14)

    root = _pc_to_midi(root_pc, 3)
    pitches = [root + interval for interval in intervals]

    inversion_chance = 0.18 if complexity == "simple" else 0.34
    if variant == "experimental":
        inversion_chance += 0.2
    if rng.random() < inversion_chance:
        max_inv = 1 if complexity == "simple" else 2
        inversion_count = rng.randint(1, max_inv)
        for _ in range(inversion_count):
            lowest = pitches.pop(0)
            pitches.append(lowest + 12)

    while pitches and pitches[-1] > 86:
        pitches = [pitch - 12 for pitch in pitches]
    while pitches and pitches[0] < 46:
        pitches = [pitch + 12 for pitch in pitches]

    return sorted(set(max(28, min(100, pitch)) for pitch in pitches))


def _chord_label(degree: int, quality: str, extension: Literal["triad", "7", "9"]) -> str:
    roman_major = ["I", "II", "III", "IV", "V", "VI", "VII"]
    numeral = roman_major[(degree - 1) % 7]
    if quality == "min":
        numeral = numeral.lower()
    if quality == "dim":
        numeral = numeral.lower() + "°"
    if extension == "7":
        return f"{numeral}7"
    if extension == "9":
        return f"{numeral}9"
    return numeral


def _bar_degrees(
    bars: int,
    progression: list[int],
    mode: Literal["major", "minor"],
    mood: str,
) -> list[int]:
    out: list[int] = []
    for bar in range(bars):
        degree = progression[bar % len(progression)]
        if bar == bars - 2:
            degree = 5 if mood != "dark" else 7
        elif bar == bars - 1:
            degree = 1 if mode == "major" else (1 if mood != "dark" else 6)
        out.append(degree)

    if bars >= 16:
        for bar in range(8, bars):
            if bar % 4 == 1:
                out[bar] = out[bar] if out[bar] != 1 else 3
    return out


def _shape_chord_pattern(
    pattern: list[tuple[float, float]],
    *,
    variant: StarterVariant,
    complexity: ComplexityLevel,
    rng: random.Random,
) -> list[tuple[float, float]]:
    shaped = list(pattern)

    if variant == "safe":
        if len(shaped) > 2:
            shaped = shaped[:2]
        if complexity == "simple":
            shaped = [(0.0, 4.0)]
    elif variant == "fresh":
        if len(shaped) == 1 and complexity != "simple" and rng.random() < 0.45:
            shaped = [(0.0, 2.0), (2.0, 2.0)]
    else:
        if rng.random() < 0.6:
            extra_start = rng.choice([0.75, 1.5, 1.75, 2.5, 2.75, 3.25])
            extra_duration = rng.choice([0.5, 0.75, 1.0])
            shaped.append((float(extra_start), float(extra_duration)))

    cleaned: list[tuple[float, float]] = []
    for start, duration in shaped:
        bounded_start = max(0.0, min(3.875, float(start)))
        max_duration = max(0.125, 4.0 - bounded_start)
        bounded_duration = max(0.125, min(float(duration), max_duration))
        cleaned.append((round(bounded_start, 3), round(bounded_duration, 3)))

    cleaned.sort(key=lambda item: item[0])
    return cleaned


def generate_chords(
    *,
    genre: str,
    mood: str,
    bpm: float,
    key_root: int,
    mode: Literal["major", "minor"],
    bars: int,
    complexity: ComplexityLevel,
    variant: StarterVariant,
    rng: random.Random,
) -> tuple[list[NoteEvent], list[ChordPlan], list[str]]:
    templates = PROGRESSION_TEMPLATES.get(genre, PROGRESSION_TEMPLATES["default"]) 
    progression = rng.choice(templates[mode])
    degrees = _bar_degrees(bars, progression, mode, mood)

    beat_sec = 60.0 / bpm
    rhythm_bank = CHORD_RHYTHM_TEMPLATES.get(genre, CHORD_RHYTHM_TEMPLATES["default"])
    max_pattern_index = {"simple": 0, "medium": 1, "complex": len(rhythm_bank) - 1}[complexity]
    if variant == "safe":
        max_pattern_index = min(max_pattern_index, 1 if complexity == "complex" else 0)

    notes: list[NoteEvent] = []
    plan: list[ChordPlan] = []
    labels: list[str] = []

    for bar in range(bars):
        degree = degrees[bar]
        quality = _quality_for_degree(mode, degree)
        extension = _extension_for_chord(genre, quality, complexity, variant, rng)
        root_pc = _scale_pc(key_root, mode, degree)
        chord_pitches = _build_chord_pitches(root_pc, quality, extension, complexity, variant, rng)

        label = _chord_label(degree, quality, extension)
        labels.append(label)

        pattern = rhythm_bank[rng.randint(0, max_pattern_index)] if max_pattern_index > 0 else rhythm_bank[0]
        bar_start_beat = bar * 4.0

        chord_tone_pcs = sorted({pitch % 12 for pitch in chord_pitches})
        plan.append(
            {
                "bar": bar,
                "degree": degree,
                "root_pc": root_pc,
                "label": label,
                "chord_tone_pcs": chord_tone_pcs,
                "bar_start_beat": bar_start_beat,
            }
        )

        pattern = _shape_chord_pattern(
            pattern,
            variant=variant,
            complexity=complexity,
            rng=rng,
        )

        velocity_base = {
            "safe": 70 if complexity != "simple" else 66,
            "fresh": 76 if complexity != "simple" else 70,
            "experimental": 82 if complexity != "simple" else 74,
        }[variant]
        velocity_spread = {"safe": 5, "fresh": 8, "experimental": 11}[variant]

        for offset_beat, dur_beat in pattern:
            shifted_offset_beat = _swing_adjust(offset_beat, genre, variant)
            if variant == "experimental" and rng.random() < 0.24:
                shifted_offset_beat = max(0.0, min(3.875, shifted_offset_beat + rng.choice([-0.03, 0.03, 0.05])))

            start = (bar_start_beat + shifted_offset_beat) * beat_sec
            end = (bar_start_beat + shifted_offset_beat + dur_beat) * beat_sec
            for pitch in chord_pitches:
                velocity = int(max(48, min(110, velocity_base + rng.randint(-velocity_spread, velocity_spread))))
                notes.append(
                    {
                        "pitch": int(pitch),
                        "velocity": velocity,
                        "start": round(start, 6),
                        "end": round(max(start + 0.05, end), 6),
                        "lane": "chord",
                    }
                )

    notes.sort(key=lambda item: (item["start"], item["pitch"]))
    return notes, plan, labels


def _nearest_scale_pitch(
    target: float,
    key_root: int,
    mode: Literal["major", "minor"],
    low: int,
    high: int,
) -> int:
    allowed = {(key_root + interval) % 12 for interval in SCALE_NOTES[mode]}
    best = low
    best_dist = float("inf")
    for pitch in range(low, high + 1):
        if pitch % 12 not in allowed:
            continue
        dist = abs(pitch - target)
        if dist < best_dist:
            best = pitch
            best_dist = dist
    return int(best)


def _nearest_pitch_from_pcs(target: float, pcs: set[int], low: int, high: int) -> int:
    best = low
    best_dist = float("inf")
    for pitch in range(low, high + 1):
        if pitch % 12 not in pcs:
            continue
        dist = abs(pitch - target)
        if dist < best_dist:
            best = pitch
            best_dist = dist
    return int(best)


def _motif_contour(length: int, rng: random.Random) -> list[int]:
    templates = [
        [0, 1, 2, 1, 0, -1, 0, 1],
        [0, 2, 1, 3, 1, 0, -1, 0],
        [0, 1, -1, 2, 1, 0, 2, 1],
    ]
    base = list(rng.choice(templates))
    if length <= len(base):
        return base[:length]
    out = base[:]
    while len(out) < length:
        out.append(out[len(out) % len(base)] + rng.choice([-1, 0, 1]))
    return out[:length]


def _swing_adjust(beat: float, genre: str, variant: StarterVariant) -> float:
    if genre not in {"rnb", "trap"}:
        return beat
    swing_amount = 0.05 if variant == "safe" else (0.085 if variant == "fresh" else 0.11)
    frac = beat % 1.0
    if abs(frac - 0.5) < 1e-6:
        return beat + swing_amount
    return beat


def _chord_role_pcs(root_pc: int, chord_pcs: set[int]) -> tuple[list[int], list[int], list[int]]:
    thirds = [pc for pc in ((root_pc + 3) % 12, (root_pc + 4) % 12) if pc in chord_pcs]
    sevenths = [pc for pc in ((root_pc + 10) % 12, (root_pc + 11) % 12) if pc in chord_pcs]
    colors = [pc for pc in ((root_pc + 2) % 12, (root_pc + 5) % 12, (root_pc + 9) % 12) if pc in chord_pcs]
    return thirds, sevenths, colors


def _preferred_rnb_pcs(
    root_pc: int,
    chord_pcs: set[int],
    is_strong: bool,
    phrase_end: bool,
) -> set[int]:
    thirds, sevenths, colors = _chord_role_pcs(root_pc, chord_pcs)
    anchor = [root_pc] + thirds + sevenths
    colorish = colors + [((root_pc + 7) % 12)]

    if phrase_end:
        target = thirds + [root_pc] + sevenths
        return set(target or list(chord_pcs))
    if is_strong:
        target = thirds + sevenths + [root_pc]
        return set(target or list(chord_pcs))

    combined = colorish + thirds + list(chord_pcs)
    return set(combined or list(chord_pcs))


def _smooth_melodic_leap(
    previous_pitch: int,
    candidate_pitch: int,
    key_root: int,
    mode: Literal["major", "minor"],
    preferred_pcs: set[int],
) -> int:
    leap = candidate_pitch - previous_pitch
    if abs(leap) <= 8:
        return candidate_pitch

    bounded_target = previous_pitch + (8 if leap > 0 else -8)
    if preferred_pcs:
        return _nearest_pitch_from_pcs(float(bounded_target), preferred_pcs, 60, 92)
    return _nearest_scale_pitch(float(bounded_target), key_root, mode, 60, 92)


def _melody_program_for_genre(genre: str) -> int:
    # Keep starter melodies instrument-led (keys/guitar), not voice-like lead synths.
    if genre == "rnb":
        return 4  # Electric Piano 1
    if genre == "indie":
        return 25  # Acoustic Guitar (steel)
    if genre == "trap":
        return 5  # Electric Piano 2
    if genre == "edm":
        return 2  # Electric Grand Piano
    return 0  # Acoustic Grand Piano


def _pattern_instrument_for_genre(genre: str) -> PatternInstrument:
    return "guitar" if genre == "indie" else "piano"


def _chord_tones_in_range(chord_pcs: set[int], low: int, high: int) -> list[int]:
    return [pitch for pitch in range(low, high + 1) if pitch % 12 in chord_pcs]


def _nearest_pitch_for_pc(pc: int, target: float, low: int, high: int) -> int:
    best = low
    best_dist = float("inf")
    for pitch in range(low, high + 1):
        if pitch % 12 != pc:
            continue
        dist = abs(pitch - target)
        if dist < best_dist:
            best = pitch
            best_dist = dist
    return int(best)


def _groove_shift(beat: float, genre: str) -> float:
    frac = round(beat % 1.0, 3)
    if genre in {"rnb", "trap"}:
        if abs(frac - 0.5) < 0.03:
            return 0.06
        if abs(frac - 0.75) < 0.03:
            return 0.025
    if genre in {"indie", "edm"}:
        if abs(frac - 0.5) < 0.03:
            return 0.015
    return 0.0


def _choose_piano_pitch(
    *,
    role: PianoPatternRole,
    root_pc: int,
    chord_pcs: set[int],
    key_root: int,
    mode: Literal["major", "minor"],
    previous_pitch: int,
    top_anchor: int,
) -> int:
    if role == "root":
        return _nearest_pitch_for_pc(root_pc, 61, 52, 84)
    if role == "top":
        return _nearest_pitch_from_pcs(float(top_anchor), chord_pcs, 64, 90)
    if role == "passing":
        passing_target = previous_pitch + (2 if top_anchor >= previous_pitch else -2)
        return _nearest_scale_pitch(float(passing_target), key_root, mode, 54, 88)
    return _nearest_pitch_from_pcs(float(previous_pitch + 1.5), chord_pcs, 54, 88)


def _build_guitar_voicing(
    *,
    root_pc: int,
    chord_pcs: set[int],
    position_center: int,
    chord_size: int,
) -> list[int]:
    tones = _chord_tones_in_range(chord_pcs, 50, 78)
    if not tones:
        tones = [position_center]

    root_pitch = _nearest_pitch_for_pc(root_pc, float(position_center - 3), 50, 78)
    ordered = sorted(tones, key=lambda pitch: abs(pitch - root_pitch))

    selected: list[int] = [root_pitch]
    for candidate in ordered:
        if candidate in selected:
            continue
        if any(abs(candidate - existing) < 3 for existing in selected):
            continue
        selected.append(candidate)
        if len(selected) >= chord_size:
            break

    selected = sorted(selected)
    while selected and (selected[-1] - selected[0]) > 12:
        selected.pop()

    if len(selected) < 2:
        extra = _nearest_pitch_from_pcs(float(root_pitch + 5), chord_pcs, 50, 78)
        if extra not in selected:
            selected.append(extra)

    return sorted(selected[:4])


def _generate_piano_pattern_melody(
    *,
    chord_plan: list[ChordPlan],
    genre: str,
    bpm: float,
    key_root: int,
    mode: Literal["major", "minor"],
    complexity: ComplexityLevel,
    variant: StarterVariant,
    rng: random.Random,
) -> list[NoteEvent]:
    beat_sec = 60.0 / bpm
    patterns = PIANO_PATTERN_LIBRARY[complexity]
    cycle_len = 2 if complexity != "complex" else 4
    base_cycle = [list(rng.choice(patterns)) for _ in range(cycle_len)]
    variation_interval = rng.randint(2, 4)

    notes: list[NoteEvent] = []
    previous_pitch = _nearest_scale_pitch(66, key_root, mode, 54, 86)
    top_anchor = _nearest_scale_pitch(74, key_root, mode, 64, 90)

    for bar, plan in enumerate(chord_plan):
        bar_pattern = list(base_cycle[bar % cycle_len])
        chord_pcs = set(plan["chord_tone_pcs"]) or {_scale_pc(key_root, mode, int(plan["degree"]))}
        root_pc = int(plan["root_pc"])
        bar_start_beat = float(plan["bar_start_beat"])

        is_variation_bar = bar > 0 and (bar + 1) % variation_interval == 0
        variation_indexes: set[int] = set()
        if is_variation_bar and bar_pattern:
            change_count = 1 if complexity == "simple" else min(2, len(bar_pattern))
            variation_indexes = set(rng.sample(range(len(bar_pattern)), k=change_count))

        if bar % 2 == 1:
            top_anchor = _nearest_scale_pitch(float(top_anchor + rng.choice([-2, -1, 1, 2])), key_root, mode, 64, 90)

        for idx, (offset_beat, dur_beat, role) in enumerate(bar_pattern):
            local_offset = offset_beat + _groove_shift(offset_beat, genre)
            local_offset = max(0.0, min(3.85, local_offset))

            event_role: PianoPatternRole = role
            if idx in variation_indexes and role != "root":
                event_role = cast(
                    PianoPatternRole,
                    rng.choice(["tone", "top", "passing"]),
                )

            pitch = _choose_piano_pitch(
                role=event_role,
                root_pc=root_pc,
                chord_pcs=chord_pcs,
                key_root=key_root,
                mode=mode,
                previous_pitch=previous_pitch,
                top_anchor=top_anchor,
            )

            pitch = _smooth_melodic_leap(previous_pitch, pitch, key_root, mode, chord_pcs)
            previous_pitch = pitch
            if event_role == "top":
                top_anchor = pitch

            start = (bar_start_beat + local_offset) * beat_sec
            base_scale = {"safe": 0.9, "fresh": 0.82, "experimental": 0.76}[variant]
            note_dur = dur_beat * beat_sec * base_scale
            velocity = 76 + (5 if role in {"root", "top"} else 0) + rng.randint(-6, 7)

            notes.append(
                {
                    "pitch": int(max(50, min(90, pitch))),
                    "velocity": int(max(45, min(112, velocity))),
                    "start": round(start, 6),
                    "end": round(max(start + 0.05, start + note_dur), 6),
                    "lane": "melody",
                }
            )

    notes.sort(key=lambda item: (item["start"], item["pitch"]))
    return notes


def _generate_guitar_pattern_melody(
    *,
    chord_plan: list[ChordPlan],
    genre: str,
    bpm: float,
    complexity: ComplexityLevel,
    variant: StarterVariant,
    rng: random.Random,
) -> list[NoteEvent]:
    beat_sec = 60.0 / bpm
    patterns = GUITAR_PATTERN_LIBRARY[complexity]
    cycle_len = 2 if complexity == "simple" else 4
    base_cycle = [list(rng.choice(patterns)) for _ in range(cycle_len)]
    variation_interval = rng.randint(2, 4)

    notes: list[NoteEvent] = []
    position_center = 60

    for bar, plan in enumerate(chord_plan):
        if bar % 4 == 0 and bar > 0:
            position_center = int(max(55, min(68, position_center + rng.choice([-2, 0, 2]))))

        bar_pattern = list(base_cycle[bar % cycle_len])
        root_pc = int(plan["root_pc"])
        chord_pcs = set(plan["chord_tone_pcs"]) or {root_pc}
        bar_start_beat = float(plan["bar_start_beat"])

        is_variation_bar = bar > 0 and (bar + 1) % variation_interval == 0
        variation_indexes: set[int] = set()
        if is_variation_bar and bar_pattern:
            change_count = 1 if complexity == "simple" else min(2, len(bar_pattern))
            variation_indexes = set(rng.sample(range(len(bar_pattern)), k=change_count))

        for idx, (offset_beat, dur_beat, chord_size, direction) in enumerate(bar_pattern):
            local_offset = offset_beat + _groove_shift(offset_beat, genre)
            local_offset = max(0.0, min(3.85, local_offset))

            local_size = chord_size
            local_direction = direction
            if idx in variation_indexes:
                local_size = int(max(2, min(4, chord_size + rng.choice([-1, 1]))))
                if rng.random() < 0.5:
                    local_direction = "up" if direction == "down" else "down"

            voicing = _build_guitar_voicing(
                root_pc=root_pc,
                chord_pcs=chord_pcs,
                position_center=position_center,
                chord_size=local_size,
            )
            if local_direction == "down":
                ordered = sorted(voicing, reverse=True)
            else:
                ordered = sorted(voicing)

            strum_spread = {"safe": 0.014, "fresh": 0.02, "experimental": 0.027}[variant]
            sustain_scale = {"safe": 1.18, "fresh": 1.26, "experimental": 1.35}[variant]

            for note_index, pitch in enumerate(ordered):
                start = (bar_start_beat + local_offset) * beat_sec + note_index * strum_spread
                note_dur = dur_beat * beat_sec * sustain_scale
                velocity = 72 + rng.randint(-8, 7)
                if note_index == 0:
                    velocity += 5

                notes.append(
                    {
                        "pitch": int(max(48, min(82, pitch))),
                        "velocity": int(max(42, min(110, velocity))),
                        "start": round(start, 6),
                        "end": round(max(start + 0.08, start + note_dur), 6),
                        "lane": "melody",
                    }
                )

    notes.sort(key=lambda item: (item["start"], item["pitch"]))
    return notes


def _generate_rnb_melody(
    *,
    chord_plan: list[ChordPlan],
    bpm: float,
    key_root: int,
    mode: Literal["major", "minor"],
    complexity: ComplexityLevel,
    variant: StarterVariant,
    rng: random.Random,
) -> list[NoteEvent]:
    beat_sec = 60.0 / bpm
    pool = RNB_MELODY_PATTERNS[complexity]
    notes: list[NoteEvent] = []

    motif_map: dict[int, tuple[list[tuple[float, float, int]], list[int], list[tuple[float, float, int]], list[int]]] = {}
    previous_pitch = _nearest_scale_pitch(67 if mode == "minor" else 69, key_root, mode, 57, 86)

    for bar, plan in enumerate(chord_plan):
        section = bar // 4
        bar_in_section = bar % 4
        if section not in motif_map:
            pattern_a = list(rng.choice(pool))
            pattern_b = list(rng.choice(pool))
            contour_a = _motif_contour(len(pattern_a), rng)
            contour_b = _motif_contour(len(pattern_b), rng)
            motif_map[section] = (pattern_a, contour_a, pattern_b, contour_b)

        pattern_a, contour_a, pattern_b, contour_b = motif_map[section]
        use_a = bar_in_section in {0, 2}
        rhythm = list(pattern_a if use_a else pattern_b)
        contour = list(contour_a if use_a else contour_b)

        apply_variation = bar_in_section >= 2 or bar >= len(chord_plan) // 2
        if apply_variation:
            for idx in range(len(contour)):
                if idx % 3 == 1 and rng.random() < 0.45:
                    contour[idx] += rng.choice([-1, 0, 1])

        chord_pcs = set(plan["chord_tone_pcs"]) or {_scale_pc(key_root, mode, int(plan["degree"]))}
        root_pc = int(plan["root_pc"])

        for idx, (offset_beat, dur_beat, accent) in enumerate(rhythm):
            local_offset = _swing_adjust(offset_beat, "rnb", variant)
            if apply_variation and rng.random() < (0.15 if variant == "safe" else 0.3):
                local_offset = max(0.0, min(3.8, local_offset + rng.choice([-0.125, 0.0, 0.125])))

            phrase_end = idx == len(rhythm) - 1 and bar_in_section in {1, 3}
            is_strong = accent == 1 or local_offset < 0.05 or abs(local_offset - 2.0) < 0.18

            interval_gain = {"safe": 1.1, "fresh": 1.6, "experimental": 2.0}[variant]
            register_lift = 1 if (bar >= len(chord_plan) // 2 and variant != "safe") else 0
            target = previous_pitch + contour[idx] * interval_gain + register_lift

            preferred_pcs = _preferred_rnb_pcs(root_pc, chord_pcs, is_strong, phrase_end)
            pitch = _nearest_pitch_from_pcs(float(target), preferred_pcs or chord_pcs, 60, 92)

            # RnB starter melodies should feel like playable key/guitar riffs,
            # so favor arpeggio-like movement over vocal-style long-line drift.
            arp_probability = {"simple": 0.38, "medium": 0.52, "complex": 0.64}[complexity]
            if rng.random() < arp_probability:
                arp_target = previous_pitch + rng.choice([-5, -3, -2, 2, 3, 5, 7])
                pitch = _nearest_pitch_from_pcs(
                    float(arp_target),
                    set(chord_pcs),
                    57,
                    88,
                )

            passing_probability = {"simple": 0.08, "medium": 0.18, "complex": 0.28}[complexity]
            if (not is_strong) and rng.random() < passing_probability:
                passing_target = (previous_pitch + pitch) / 2
                pitch = _nearest_scale_pitch(passing_target, key_root, mode, 57, 88)

            pitch = _smooth_melodic_leap(previous_pitch, pitch, key_root, mode, preferred_pcs)

            if phrase_end:
                resolution_pcs = _preferred_rnb_pcs(root_pc, chord_pcs, True, True)
                pitch = _nearest_pitch_from_pcs(float(pitch), resolution_pcs, 60, 90)

            bar_start_beat = float(plan["bar_start_beat"])
            start = (bar_start_beat + local_offset) * beat_sec
            length_scale = 0.74 if complexity == "complex" else 0.8
            note_dur = dur_beat * beat_sec * length_scale
            if phrase_end:
                note_dur *= 0.95

            velocity_base = 80 + (6 if is_strong else 0) + (3 if phrase_end else 0)
            velocity = velocity_base + rng.randint(-7, 8)
            notes.append(
                {
                    "pitch": int(max(54, min(90, pitch))),
                    "velocity": int(max(52, min(118, velocity))),
                    "start": round(start, 6),
                    "end": round(max(start + 0.04, start + note_dur), 6),
                    "lane": "melody",
                }
            )
            previous_pitch = int(pitch)

    notes.sort(key=lambda item: (item["start"], item["pitch"]))
    return notes


def generate_melody(
    *,
    chord_plan: list[ChordPlan],
    genre: str,
    bpm: float,
    key_root: int,
    mode: Literal["major", "minor"],
    complexity: ComplexityLevel,
    variant: StarterVariant,
    rng: random.Random,
) -> list[NoteEvent]:
    instrument = _pattern_instrument_for_genre(genre)
    if instrument == "guitar":
        return _generate_guitar_pattern_melody(
            chord_plan=chord_plan,
            genre=genre,
            bpm=bpm,
            complexity=complexity,
            variant=variant,
            rng=rng,
        )

    return _generate_piano_pattern_melody(
        chord_plan=chord_plan,
        genre=genre,
        bpm=bpm,
        key_root=key_root,
        mode=mode,
        complexity=complexity,
        variant=variant,
        rng=rng,
    )


def generate_bass(
    *,
    chord_plan: list[ChordPlan],
    genre: str,
    bpm: float,
    complexity: ComplexityLevel,
    variant: StarterVariant,
    rng: random.Random,
) -> list[NoteEvent]:
    beat_sec = 60.0 / bpm
    patterns = BASS_RHYTHM_TEMPLATES.get(genre, BASS_RHYTHM_TEMPLATES["indie"])
    rhythm = patterns[complexity]

    notes: list[NoteEvent] = []
    for bar, plan in enumerate(chord_plan):
        root_pc = int(plan["root_pc"])
        bar_start_beat = float(plan["bar_start_beat"])

        root_pitch = _pc_to_midi(root_pc, 1)
        while root_pitch < 34:
            root_pitch += 12

        for offset_beat, dur_beat in rhythm:
            start = (bar_start_beat + offset_beat) * beat_sec
            duration = dur_beat * beat_sec
            pitch = root_pitch

            if rng.random() < (0.1 if variant == "safe" else 0.2):
                pitch += 12
            if complexity == "complex" and rng.random() < 0.24:
                pitch = root_pitch + rng.choice([0, 7, 12])

            velocity = 74 + rng.randint(-8, 8)
            notes.append(
                {
                    "pitch": int(max(28, min(68, pitch))),
                    "velocity": int(max(45, min(108, velocity))),
                    "start": round(start, 6),
                    "end": round(max(start + 0.05, start + duration * 0.95), 6),
                    "lane": "bass",
                }
            )

    notes.sort(key=lambda item: (item["start"], item["pitch"]))
    return notes


def _generate_drums(
    *,
    genre: str,
    bars: int,
    bpm: float,
    variant: StarterVariant,
    rng: random.Random,
) -> tuple[list[NoteEvent], str]:
    template = DRUM_TEMPLATES.get(genre, DRUM_TEMPLATES["indie"])
    beat_sec = 60.0 / bpm

    notes: list[NoteEvent] = []

    for bar in range(bars):
        for step in template["kick"]:
            beat = bar * 4.0 + step * 0.25
            start = beat * beat_sec
            notes.append(
                {
                    "pitch": 36,
                    "velocity": 96 if step in {0, 8} else 84,
                    "start": round(start, 6),
                    "end": round(start + 0.11, 6),
                    "lane": "drums",
                }
            )

        for step in template["snare"]:
            beat = bar * 4.0 + step * 0.25
            start = beat * beat_sec
            notes.append(
                {
                    "pitch": 38,
                    "velocity": 92,
                    "start": round(start, 6),
                    "end": round(start + 0.1, 6),
                    "lane": "drums",
                }
            )

        for step in template["hat"]:
            beat = bar * 4.0 + step * 0.25
            if genre in {"rnb", "trap"} and step % 2 == 1:
                beat += 0.03 if variant == "safe" else (0.05 if variant == "fresh" else 0.07)
            start = beat * beat_sec
            notes.append(
                {
                    "pitch": 42,
                    "velocity": 62 + rng.randint(-6, 6),
                    "start": round(start, 6),
                    "end": round(start + 0.06, 6),
                    "lane": "drums",
                }
            )

        if variant == "experimental" and (bar + 1) % 4 == 0:
            fill_start = (bar * 4.0 + 3.0) * beat_sec
            for idx in range(4):
                start = fill_start + idx * 0.12
                notes.append(
                    {
                        "pitch": 47 if idx % 2 == 0 else 43,
                        "velocity": 80 + idx * 6,
                        "start": round(start, 6),
                        "end": round(start + 0.08, 6),
                        "lane": "drums",
                    }
                )

    notes.sort(key=lambda item: (item["start"], item["pitch"]))
    return notes, str(template["suggestion"])


def build_midi(
    *,
    tracks: dict[str, list[NoteEvent]],
    bpm: float,
    genre: str,
) -> pretty_midi.PrettyMIDI:
    midi = pretty_midi.PrettyMIDI(initial_tempo=bpm)

    instrument_layout = {
        "chords": {"program": 4 if genre == "rnb" else 0, "is_drum": False, "name": "Chords"},
        "melody": {"program": _melody_program_for_genre(genre), "is_drum": False, "name": "Melody"},
        "bass": {"program": 38 if genre != "edm" else 33, "is_drum": False, "name": "Bass"},
        "drums": {"program": 0, "is_drum": True, "name": "Drums"},
    }

    for name, events in tracks.items():
        if not events:
            continue
        spec = instrument_layout.get(name)
        if not spec:
            continue
        instrument = pretty_midi.Instrument(
            program=int(spec["program"]),
            is_drum=bool(spec["is_drum"]),
            name=str(spec["name"]),
        )
        for event in sorted(events, key=lambda item: (item["start"], item["pitch"])):
            instrument.notes.append(
                pretty_midi.Note(
                    velocity=int(max(1, min(127, event["velocity"]))),
                    pitch=int(max(0, min(127, event["pitch"]))),
                    start=float(max(0.0, event["start"])),
                    end=float(max(event["start"] + 0.03, event["end"])),
                )
            )
        midi.instruments.append(instrument)

    return midi


def _compose_explanation(
    *,
    variant: StarterVariant,
    genre: str,
    mood: str,
    instrument_target: InstrumentTarget,
    generation_backend: str,
    normalized_key: str,
    bpm: float,
    bars: int,
    chord_labels: list[str],
    complexity: ComplexityLevel,
    candidate_summary: dict[str, float | int | str],
    reference_description: str,
) -> str:
    profile_text = {
        "safe": "Safe keeps the phrasing grounded and DAW-ready with clean voice-leading.",
        "fresh": "Fresh adds rhythmic personality and melodic turns while staying musical.",
        "experimental": "Experimental pushes intervals and syncopation for more edge and surprise.",
    }[variant]

    short_progression = " - ".join(chord_labels[: min(4, len(chord_labels))])
    reference_line = (
        f" Reference mood: {reference_description.strip()}."
        if reference_description.strip()
        else ""
    )
    candidate_line = (
        f" Chord events: {int(candidate_summary.get('chord_events', 0))}."
        f" Generation mode: {str(candidate_summary.get('generation_mode', 'chords_only'))}."
    )

    return (
        f"{profile_text} Genre: {genre}. Mood: {mood}. Key: {normalized_key}. "
        f"Tempo: {bpm:.1f} BPM. Structure: {bars} bars with motif repetition and end-bar resolution. "
        f"Target instrument: {instrument_target}. Candidate model: {generation_backend}. "
        f"Core progression idea: {short_progression}. Complexity: {complexity}."
        f" {candidate_line}{reference_line}"
    )


def generate_track_starter_idea(
    *,
    output_dir: Path,
    genre: str,
    mood: str,
    bpm: float,
    key: str | None,
    complexity: str,
    bars: int,
    reference_description: str,
    variant: StarterVariant,
    seed: int | None = None,
) -> TrackStarterResult:
    rng = random.Random(seed if seed is not None else random.SystemRandom().randint(1, 2_147_483_647))
    normalized_genre = _normalize_genre(genre)
    normalized_mood = _normalize_mood(mood)
    normalized_complexity = _normalize_complexity(complexity)
    normalized_bars = _normalize_bars(bars)
    normalized_bpm = _normalize_bpm(bpm)
    key_root, mode, normalized_key = _parse_key(key, normalized_genre, normalized_mood, rng)
    instrument_target = _assign_instrument_target(
        genre=normalized_genre,
        mood=normalized_mood,
        complexity=normalized_complexity,
        bars=normalized_bars,
    )

    chords, chord_plan, chord_labels = generate_chords(
        genre=normalized_genre,
        mood=normalized_mood,
        bpm=normalized_bpm,
        key_root=key_root,
        mode=mode,
        bars=normalized_bars,
        complexity=normalized_complexity,
        variant=variant,
        rng=rng,
    )

    generation_backend = "rule_chords"
    candidate_summary: dict[str, float | int | str] = {
        "generation_mode": "chords_only",
        "chord_events": len(chords),
        "chord_labels": len(chord_labels),
    }
    drum_suggestion = ""

    tracks = {"chords": chords}

    output_dir.mkdir(parents=True, exist_ok=True)
    paths = {
        "full": output_dir / "idea.mid",
        "chords": output_dir / "chords.mid",
    }

    full_midi = build_midi(tracks=tracks, bpm=normalized_bpm, genre=normalized_genre)
    full_midi.write(str(paths["full"]))

    for track_name in ["chords"]:
        if track_name not in paths:
            continue
        track_midi = build_midi(
            tracks={track_name: tracks.get(track_name, [])},
            bpm=normalized_bpm,
            genre=normalized_genre,
        )
        track_midi.write(str(paths[track_name]))

    preview_notes = sorted(
        chords,
        key=lambda item: (item["start"], item["pitch"]),
    )

    explanation = _compose_explanation(
        variant=variant,
        genre=normalized_genre,
        mood=normalized_mood,
        instrument_target=instrument_target,
        generation_backend=generation_backend,
        normalized_key=normalized_key,
        bpm=normalized_bpm,
        bars=normalized_bars,
        chord_labels=chord_labels,
        complexity=normalized_complexity,
        candidate_summary=candidate_summary,
        reference_description=reference_description,
    )

    return {
        "normalized_genre": normalized_genre,
        "normalized_mood": normalized_mood,
        "normalized_key": normalized_key,
        "bpm": normalized_bpm,
        "bars": normalized_bars,
        "complexity": normalized_complexity,
        "variant": variant,
        "instrument_target": instrument_target,
        "generation_backend": generation_backend,
        "chord_labels": chord_labels,
        "drum_suggestion": drum_suggestion,
        "explanation": explanation,
        "candidate_summary": candidate_summary,
        "preview_notes": preview_notes,
        "paths": paths,
    }
