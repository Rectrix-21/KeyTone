from __future__ import annotations

import random
from pathlib import Path
from typing import cast
from typing import Literal
from typing import TypedDict

import pretty_midi


ComplexityLevel = Literal["simple", "medium", "complex"]
StarterVariant = Literal["safe", "fresh", "experimental"]
InstrumentTarget = Literal["piano", "guitar", "synth"]


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


_REFERENCE_RICHNESS_KEYWORDS: dict[str, float] = {
    "warm": 0.15,
    "lush": 0.2,
    "emotional": 0.15,
    "soulful": 0.2,
    "rich": 0.2,
    "dreamy": 0.15,
    "cinematic": 0.15,
    "atmospheric": 0.15,
    "romantic": 0.1,
    "neo-soul": 0.2,
    "neosoul": 0.2,
    "jazzy": 0.2,
    "lo-fi": 0.1,
    "lofi": 0.1,
    "smooth": 0.12,
    "silky": 0.15,
    "minimal": -0.2,
    "simple": -0.15,
    "clean": -0.1,
    "sparse": -0.2,
    "stripped": -0.15,
    "bare": -0.15,
    "raw": -0.1,
    "plain": -0.15,
    "basic": -0.1,
}

_REFERENCE_ENERGETIC_KEYWORDS = {
    "energetic",
    "upbeat",
    "driving",
    "fast",
    "intense",
    "aggressive",
    "hype",
    "powerful",
    "punchy",
    "banger",
}

_REFERENCE_CALM_KEYWORDS = {
    "calm",
    "gentle",
    "soft",
    "mellow",
    "slow",
    "chill",
    "relaxed",
    "peaceful",
    "ambient",
    "sleepy",
    "quiet",
}


def _analyze_reference_description(text: str) -> tuple[float, int, list[str]]:
    """Derive generation biases from the free-text reference description.

    This is a rule-based generator, not an LLM, so it can't truly
    "understand" the description -- instead it scans for a curated set of
    descriptive keywords and turns them into real adjustments to chord
    richness (more/fewer extensions) and rhythmic energy (busier/sparser
    patterns), so the field actually changes the generated output rather
    than only appearing in the displayed explanation text.
    """
    if not text or not text.strip():
        return 0.0, 0, []

    lowered = text.lower()
    matched: list[str] = []

    richness = 0.0
    for keyword, weight in _REFERENCE_RICHNESS_KEYWORDS.items():
        if keyword in lowered:
            richness += weight
            matched.append(keyword)
    richness = max(-0.3, min(0.3, richness))

    energy = 0
    if any(keyword in lowered for keyword in _REFERENCE_ENERGETIC_KEYWORDS):
        energy += 1
        matched.extend(
            keyword for keyword in _REFERENCE_ENERGETIC_KEYWORDS if keyword in lowered
        )
    if any(keyword in lowered for keyword in _REFERENCE_CALM_KEYWORDS):
        energy -= 1
        matched.extend(
            keyword for keyword in _REFERENCE_CALM_KEYWORDS if keyword in lowered
        )

    return richness, energy, matched


def _extension_for_chord(
    genre: str,
    quality: Literal["maj", "min", "dim"],
    complexity: ComplexityLevel,
    variant: StarterVariant,
    rng: random.Random,
    richness_bias: float = 0.0,
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
    chance = max(
        0.0, min(0.95, base_prob + complexity_bias + variant_bias + richness_bias)
    )

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
    reference_description: str = "",
) -> tuple[list[NoteEvent], list[ChordPlan], list[str]]:
    templates = PROGRESSION_TEMPLATES.get(genre, PROGRESSION_TEMPLATES["default"])
    progression = rng.choice(templates[mode])
    degrees = _bar_degrees(bars, progression, mode, mood)

    richness_bias, energy_bias, _matched_keywords = _analyze_reference_description(
        reference_description
    )

    beat_sec = 60.0 / bpm
    rhythm_bank = CHORD_RHYTHM_TEMPLATES.get(genre, CHORD_RHYTHM_TEMPLATES["default"])
    max_pattern_index = {"simple": 0, "medium": 1, "complex": len(rhythm_bank) - 1}[complexity]
    if variant == "safe":
        max_pattern_index = min(max_pattern_index, 1 if complexity == "complex" else 0)
    max_pattern_index = max(
        0, min(len(rhythm_bank) - 1, max_pattern_index + energy_bias)
    )

    notes: list[NoteEvent] = []
    plan: list[ChordPlan] = []
    labels: list[str] = []

    for bar in range(bars):
        degree = degrees[bar]
        quality = _quality_for_degree(mode, degree)
        extension = _extension_for_chord(
            genre, quality, complexity, variant, rng, richness_bias
        )
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


def _swing_adjust(beat: float, genre: str, variant: StarterVariant) -> float:
    if genre not in {"rnb", "trap"}:
        return beat
    swing_amount = 0.05 if variant == "safe" else (0.085 if variant == "fresh" else 0.11)
    frac = beat % 1.0
    if abs(frac - 0.5) < 1e-6:
        return beat + swing_amount
    return beat


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
    detected_keywords = str(candidate_summary.get("reference_keywords_detected", ""))
    if reference_description.strip() and detected_keywords:
        reference_line = (
            f" Reference mood: {reference_description.strip()}. Detected style"
            f" keywords ({detected_keywords}) nudged chord richness and rhythmic"
            f" energy."
        )
    elif reference_description.strip():
        reference_line = (
            f" Reference mood: {reference_description.strip()}."
            " No specific style keywords recognized in it, so it didn't change"
            " generation this time -- try words like warm, lush, soulful, minimal,"
            " energetic, or calm."
        )
    else:
        reference_line = ""
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
        reference_description=reference_description,
    )
    _richness_bias, _energy_bias, reference_keywords = _analyze_reference_description(
        reference_description
    )

    generation_backend = "rule_chords"
    candidate_summary: dict[str, float | int | str] = {
        "generation_mode": "chords_only",
        "chord_events": len(chords),
        "chord_labels": len(chord_labels),
        "reference_richness_bias": round(_richness_bias, 3),
        "reference_energy_bias": _energy_bias,
        "reference_keywords_detected": ", ".join(sorted(set(reference_keywords))),
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
