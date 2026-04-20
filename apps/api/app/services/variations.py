import math
import random
from pathlib import Path
from typing import Literal
from typing import TypedDict

import pretty_midi


VariationIntent = Literal[
    "catchier",
    "richer",
    "smoother",
    "emotional",
    "rhythmic",
    "modern",
    "sparse",
    "soulful",
    "cinematic",
    "aggressive",
    "premium",
]
LaneTarget = Literal["melody", "chord", "bass", "full"]
ProducerMove = Literal[
    "auto",
    "hook_lift",
    "pocket_rewrite",
    "emotional_resolve",
    "call_response",
    "simplify_phrase",
    "top_line_focus",
    "neo_soul_upgrade",
    "wide_cinema_voicing",
    "smooth_voice_leading",
    "bounce_comping",
    "airy_top_voice",
    "locked_groove",
    "octave_motion",
    "minimal_pocket",
    "approach_note_movement",
    "groove_tightening",
]
CandidateProfile = Literal["safe", "pro", "bold"]


class VariationAnalysis(TypedDict):
    bars: int
    beat_sec: float
    phrase_boundaries: list[int]
    motif_signature: list[tuple[int, int]]
    repetition_score: float
    chord_roots: list[int]
    note_density: dict[str, float]
    syncopation: float
    top_contour: list[int]
    tension_points: list[int]
    release_points: list[int]


class ChordGroupSummary(TypedDict):
    start: float
    end: float
    root_pc: int
    bass_pc: int
    top_pitch: int
    inversion: str
    movement: int
    pitches: list[int]
    pitch_classes: list[int]


class CandidateScore(TypedDict):
    motif_retention: float
    rhythmic_coherence: float
    chord_tone_alignment: float
    phrase_symmetry: float
    groove_quality: float
    top_line_memorability: float
    tension_resolution: float
    lane_realism: float
    voice_leading_smoothness: float
    top_note_motion: float
    register_balance: float
    genre_fit: float
    progression_identity: float
    total: float


class CandidateRender(TypedDict):
    profile: CandidateProfile
    label: str
    move_labels: list[str]
    midi: pretty_midi.PrettyMIDI
    scores: CandidateScore


class AlterMidiResult(TypedDict):
    best_path: Path
    best_label: str
    best_profile: CandidateProfile
    candidate_paths: list[Path]
    candidate_profiles: list[str]
    candidate_labels: list[str]
    candidate_scores: list[float]
    analysis_summary: dict[str, float | int | str]


SCALE_NOTES = {
    "major": [0, 2, 4, 5, 7, 9, 11],
    "minor": [0, 2, 3, 5, 7, 8, 10],
}

KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

MELODY_MOVES: set[str] = {
    "hook_lift",
    "pocket_rewrite",
    "emotional_resolve",
    "call_response",
    "simplify_phrase",
    "top_line_focus",
}
CHORD_MOVES: set[str] = {
    "neo_soul_upgrade",
    "wide_cinema_voicing",
    "smooth_voice_leading",
    "bounce_comping",
    "airy_top_voice",
}
BASS_MOVES: set[str] = {
    "locked_groove",
    "octave_motion",
    "minimal_pocket",
    "approach_note_movement",
    "groove_tightening",
}

MOVE_LABELS = {
    "hook_lift": "Hook Lift",
    "pocket_rewrite": "Pocket Rewrite",
    "emotional_resolve": "Emotional Resolve",
    "call_response": "Call & Response",
    "simplify_phrase": "Simplify Phrase",
    "top_line_focus": "Top-Line Focus",
    "neo_soul_upgrade": "Neo-Soul Upgrade",
    "wide_cinema_voicing": "Wide Cinema Voicing",
    "smooth_voice_leading": "Smooth Voice Leading",
    "bounce_comping": "Bounce Comping",
    "airy_top_voice": "Airy Top Voice",
    "locked_groove": "Locked Groove",
    "octave_motion": "Octave Motion",
    "minimal_pocket": "Minimal Pocket",
    "approach_note_movement": "Approach Note Movement",
    "groove_tightening": "Groove Tightening",
}

INTENT_MOVE_PRIORITY: dict[VariationIntent, dict[str, list[str]]] = {
    "catchier": {
        "melody": ["hook_lift", "top_line_focus", "pocket_rewrite"],
        "chord": ["airy_top_voice", "smooth_voice_leading"],
        "bass": ["octave_motion", "locked_groove"],
    },
    "richer": {
        "melody": ["top_line_focus", "emotional_resolve"],
        "chord": ["neo_soul_upgrade", "airy_top_voice"],
        "bass": ["approach_note_movement", "locked_groove"],
    },
    "smoother": {
        "melody": ["emotional_resolve", "simplify_phrase"],
        "chord": ["smooth_voice_leading", "airy_top_voice"],
        "bass": ["minimal_pocket", "approach_note_movement"],
    },
    "emotional": {
        "melody": ["emotional_resolve", "call_response", "top_line_focus"],
        "chord": ["neo_soul_upgrade", "smooth_voice_leading"],
        "bass": ["approach_note_movement", "minimal_pocket"],
    },
    "rhythmic": {
        "melody": ["pocket_rewrite", "call_response"],
        "chord": ["bounce_comping", "smooth_voice_leading"],
        "bass": ["groove_tightening", "locked_groove"],
    },
    "modern": {
        "melody": ["top_line_focus", "pocket_rewrite"],
        "chord": ["airy_top_voice", "smooth_voice_leading"],
        "bass": ["groove_tightening", "octave_motion"],
    },
    "sparse": {
        "melody": ["simplify_phrase", "emotional_resolve"],
        "chord": ["bounce_comping", "airy_top_voice"],
        "bass": ["minimal_pocket", "locked_groove"],
    },
    "soulful": {
        "melody": ["call_response", "emotional_resolve"],
        "chord": ["neo_soul_upgrade", "smooth_voice_leading"],
        "bass": ["approach_note_movement", "locked_groove"],
    },
    "cinematic": {
        "melody": ["top_line_focus", "emotional_resolve"],
        "chord": ["wide_cinema_voicing", "airy_top_voice"],
        "bass": ["minimal_pocket", "approach_note_movement"],
    },
    "aggressive": {
        "melody": ["hook_lift", "pocket_rewrite"],
        "chord": ["wide_cinema_voicing", "bounce_comping"],
        "bass": ["octave_motion", "groove_tightening"],
    },
    "premium": {
        "melody": ["top_line_focus", "hook_lift"],
        "chord": ["smooth_voice_leading", "airy_top_voice"],
        "bass": ["locked_groove", "approach_note_movement"],
    },
}

PROFILE_SETTINGS: dict[CandidateProfile, dict[str, float | str]] = {
    "safe": {"label": "Safe", "strength_factor": 0.68, "preserve_shift": 0.1},
    "pro": {"label": "Pro", "strength_factor": 1.0, "preserve_shift": 0.0},
    "bold": {"label": "Bold", "strength_factor": 1.35, "preserve_shift": -0.12},
}

SCORING_WEIGHTS = {
    "motif_retention": 0.18,
    "rhythmic_coherence": 0.14,
    "chord_tone_alignment": 0.18,
    "phrase_symmetry": 0.1,
    "groove_quality": 0.12,
    "top_line_memorability": 0.12,
    "tension_resolution": 0.09,
    "lane_realism": 0.07,
}

CHORD_IMPROVER_MODES: set[VariationIntent] = {
    "richer",
    "smoother",
    "emotional",
    "modern",
    "soulful",
    "cinematic",
}


def _profile_bias_for_request(
    strength: float,
    preserve_identity: float,
) -> dict[CandidateProfile, float]:
    # Push candidate selection toward the user's requested intensity instead of
    # always favoring the safest, highest-retention output.
    if strength >= 0.98 or preserve_identity <= 0.66:
        return {"safe": -0.12, "pro": 0.04, "bold": 0.14}
    if strength <= 0.62 and preserve_identity >= 0.78:
        return {"safe": 0.08, "pro": 0.0, "bold": -0.08}
    return {"safe": -0.03, "pro": 0.05, "bold": 0.07}


def _preferred_profile_order(
    strength: float,
    preserve_identity: float,
) -> list[CandidateProfile]:
    if strength >= 0.98 or preserve_identity <= 0.66:
        return ["bold", "pro", "safe"]
    if strength >= 0.82 or preserve_identity <= 0.72:
        return ["pro", "bold", "safe"]
    if strength <= 0.62 and preserve_identity >= 0.78:
        return ["safe", "pro", "bold"]
    return ["pro", "bold", "safe"]


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _first_tempo(midi: pretty_midi.PrettyMIDI) -> float:
    _, tempi = midi.get_tempo_changes()
    return float(tempi[0]) if len(tempi) > 0 else 120.0


def _normalize_style(style: str | None) -> str | None:
    if not style:
        return None
    value = style.strip().lower()
    if value in {"lift", "groove", "cinematic"}:
        return value
    return None


def _normalize_strength(
    variation_strength: float | None,
    creativity: float | None,
) -> float:
    if variation_strength is not None:
        try:
            return _clamp(float(variation_strength), 0.35, 1.25)
        except (TypeError, ValueError):
            pass
    if creativity is not None:
        try:
            return _clamp(float(creativity), 0.35, 1.25)
        except (TypeError, ValueError):
            pass
    return 0.75


def _normalize_preserve_identity(value: float | None) -> float:
    if value is None:
        return 0.72
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return 0.72
    # Keep 60-80% identity preservation as the main operating range.
    return _clamp(parsed, 0.6, 0.8)


def _normalize_intent(intent: str | None, style: str | None) -> VariationIntent:
    if intent:
        normalized = intent.strip().lower()
        if normalized in INTENT_MOVE_PRIORITY:
            return normalized  # type: ignore[return-value]
    style_to_intent = {
        "lift": "richer",
        "groove": "smoother",
        "cinematic": "cinematic",
    }
    style_name = _normalize_style(style)
    if style_name and style_name in style_to_intent:
        return style_to_intent[style_name]  # type: ignore[return-value]
    return "richer"


def _normalize_lane_move(move: str | None) -> str:
    if not move:
        return "auto"
    normalized = move.strip().lower().replace(" ", "_")
    if normalized == "auto":
        return "auto"
    if normalized in MOVE_LABELS:
        return normalized
    return "auto"


def _key_to_root_and_mode(key: str) -> tuple[int, str]:
    parts = key.strip().split(" ")
    tonic = parts[0].upper() if parts else "C"
    mode_text = parts[1].lower() if len(parts) > 1 else "major"
    if tonic not in KEY_NAMES:
        tonic = "C"
    mode = "minor" if mode_text == "minor" else "major"
    return KEY_NAMES.index(tonic), mode


def _in_scale(note: int, root: int, mode: str) -> bool:
    allowed = {(root + interval) % 12 for interval in SCALE_NOTES.get(mode, SCALE_NOTES["major"])}
    return note % 12 in allowed


def _nearest_scale_note(note: int, root: int, mode: str) -> int:
    clipped = int(_clamp(float(note), 0, 127))
    if _in_scale(clipped, root, mode):
        return clipped
    for distance in range(1, 12):
        for candidate in (clipped + distance, clipped - distance):
            if 0 <= candidate <= 127 and _in_scale(candidate, root, mode):
                return candidate
    return clipped


def _lane_for_pitch(pitch: int) -> str:
    if pitch < 52:
        return "bass"
    if pitch >= 72:
        return "melody"
    return "chord"


def _bar_index(note_time: float, beat_sec: float, bars: int) -> int:
    beat = note_time / max(1e-6, beat_sec)
    return int(_clamp(math.floor(beat / 4.0), 0, max(0, bars - 1)))


def _duration_seconds(note: pretty_midi.Note) -> float:
    return max(0.03, float(note.end) - float(note.start))


def _scale_step(note: int, step: int, root: int, mode: str) -> int:
    direction = 1 if step >= 0 else -1
    remaining = abs(step)
    current = int(note)
    while remaining > 0:
        candidate = current + direction
        while 0 <= candidate <= 127 and not _in_scale(candidate, root, mode):
            candidate += direction
        current = int(_clamp(float(candidate), 0, 127))
        remaining -= 1
    return current


def _collect_lane_notes(midi: pretty_midi.PrettyMIDI) -> dict[str, list[pretty_midi.Note]]:
    lanes = {"melody": [], "chord": [], "bass": []}
    for instrument in midi.instruments:
        if instrument.is_drum:
            continue
        for note in instrument.notes:
            lane = _lane_for_pitch(int(note.pitch))
            lanes[lane].append(note)
    for lane in lanes:
        lanes[lane].sort(key=lambda note: (note.start, note.pitch))
    return lanes


def _build_chord_roots(
    lanes: dict[str, list[pretty_midi.Note]],
    key_root: int,
    bars: int,
    beat_sec: float,
) -> list[int]:
    chord_roots: list[int] = []
    reference = lanes["chord"] if lanes["chord"] else lanes["bass"]
    for bar in range(bars):
        start = bar * 4.0 * beat_sec
        end = (bar + 1) * 4.0 * beat_sec
        bar_notes = [note for note in reference if start <= note.start < end]
        if not bar_notes:
            chord_roots.append(key_root)
            continue
        low = min(bar_notes, key=lambda note: note.pitch)
        chord_roots.append(int(low.pitch) % 12)
    if not chord_roots:
        return [key_root]
    return chord_roots


def _build_top_contour(melody_notes: list[pretty_midi.Note], bars: int, beat_sec: float) -> list[int]:
    contour: list[int] = []
    for bar in range(bars):
        start = bar * 4.0 * beat_sec
        end = (bar + 1) * 4.0 * beat_sec
        bar_notes = [note for note in melody_notes if start <= note.start < end]
        if not bar_notes:
            contour.append(-1)
            continue
        contour.append(max(int(note.pitch) for note in bar_notes))
    return contour


def _motif_signature(notes: list[pretty_midi.Note], beat_sec: float, max_notes: int = 24) -> list[tuple[int, int]]:
    if len(notes) < 3:
        return []
    out: list[tuple[int, int]] = []
    sampled = notes[:max_notes]
    for idx in range(1, len(sampled)):
        interval = int(sampled[idx].pitch) - int(sampled[idx - 1].pitch)
        step = int(round((sampled[idx].start - sampled[idx - 1].start) / max(1e-6, beat_sec) * 4))
        out.append((interval, step))
    return out


def _repetition_score(signature: list[tuple[int, int]]) -> float:
    if len(signature) < 4:
        return 0.0
    counts: dict[tuple[tuple[int, int], tuple[int, int]], int] = {}
    for idx in range(len(signature) - 1):
        gram = (signature[idx], signature[idx + 1])
        counts[gram] = counts.get(gram, 0) + 1
    repeated = sum(value - 1 for value in counts.values() if value > 1)
    return _clamp(repeated / max(1, len(signature) - 1), 0.0, 1.0)


def _syncopation_score(notes: list[pretty_midi.Note], beat_sec: float) -> float:
    if not notes:
        return 0.0
    off = 0
    for note in notes:
        local = (note.start / max(1e-6, beat_sec)) % 1.0
        on_grid = min(abs(local - 0.0), abs(local - 0.5), abs(local - 1.0)) < 0.09
        if not on_grid:
            off += 1
    return _clamp(off / len(notes), 0.0, 1.0)


def _phrase_boundaries_from_density(note_counts: list[int]) -> list[int]:
    bars = len(note_counts)
    boundaries = {0, bars}
    for bar in range(1, bars):
        if bar % 4 == 0:
            boundaries.add(bar)
        if note_counts[bar - 1] > 0 and note_counts[bar] == 0:
            boundaries.add(bar)
    ordered = sorted(boundaries)
    return ordered if len(ordered) > 1 else [0, bars]


def _analyze_identity(
    midi: pretty_midi.PrettyMIDI,
    key_root: int,
    mode: str,
    target: LaneTarget,
) -> VariationAnalysis:
    tempo = _first_tempo(midi)
    beat_sec = 60.0 / max(40.0, tempo)
    duration = max(2.0, midi.get_end_time())
    bars = int(max(1, math.ceil((duration / beat_sec) / 4.0)))

    lanes = _collect_lane_notes(midi)
    focus_lane = "melody" if target == "full" else target
    focus_notes = lanes.get(focus_lane, []) or lanes["melody"] or lanes["chord"] or lanes["bass"]

    note_density = {
        lane: len(notes) / max(1.0, float(bars)) for lane, notes in lanes.items()
    }

    note_counts = [0 for _ in range(bars)]
    for note in focus_notes:
        note_counts[_bar_index(float(note.start), beat_sec, bars)] += 1

    phrase_boundaries = _phrase_boundaries_from_density(note_counts)
    motif_signature = _motif_signature(focus_notes, beat_sec)
    repetition = _repetition_score(motif_signature)
    chord_roots = _build_chord_roots(lanes, key_root, bars, beat_sec)
    top_contour = _build_top_contour(lanes["melody"] or focus_notes, bars, beat_sec)

    valid_top = [value for value in top_contour if value >= 0]
    if valid_top:
        threshold = sorted(valid_top)[int(max(0, len(valid_top) * 0.68 - 1))]
    else:
        threshold = 72
    tension_points = [idx for idx, pitch in enumerate(top_contour) if pitch >= threshold and pitch >= 0]
    release_points = [max(0, boundary - 1) for boundary in phrase_boundaries[1:] if boundary > 0]

    return {
        "bars": bars,
        "beat_sec": beat_sec,
        "phrase_boundaries": phrase_boundaries,
        "motif_signature": motif_signature,
        "repetition_score": repetition,
        "chord_roots": chord_roots,
        "note_density": note_density,
        "syncopation": _syncopation_score(focus_notes, beat_sec),
        "top_contour": top_contour,
        "tension_points": tension_points,
        "release_points": release_points,
    }


def _anchor_indexes(notes: list[pretty_midi.Note], analysis: VariationAnalysis) -> set[int]:
    if not notes:
        return set()
    anchors: set[int] = {0, len(notes) - 1}
    beat_sec = analysis["beat_sec"]
    boundaries = set(analysis["phrase_boundaries"])
    for idx, note in enumerate(notes):
        bar = _bar_index(float(note.start), beat_sec, analysis["bars"])
        if bar in boundaries or (bar + 1) in boundaries:
            anchors.add(idx)
            continue
        local_beat = (note.start / max(1e-6, beat_sec)) % 4.0
        # Protect phrase downbeats, but do not freeze all grid-aligned notes.
        if abs(local_beat) < 0.07:
            anchors.add(idx)
        if _duration_seconds(note) >= beat_sec * 1.2:
            anchors.add(idx)
    return anchors


def _effective_preserve_for_strength(
    preserve_identity: float,
    strength: float,
) -> float:
    intensity_push = max(0.0, strength - 0.82) * 0.24
    return _clamp(preserve_identity - intensity_push, 0.45, 0.85)


def _mutable_indexes(
    notes: list[pretty_midi.Note],
    anchors: set[int],
    preserve_identity: float,
    rng: random.Random,
) -> set[int]:
    change_budget = int(max(1, round(len(notes) * (1.0 - preserve_identity))))
    pool = [idx for idx in range(len(notes)) if idx not in anchors]
    if not pool:
        return set()
    rng.shuffle(pool)
    return set(pool[: min(change_budget, len(pool))])


def _lane_move_allowed(lane: str, move: str) -> bool:
    if lane == "melody":
        return move in MELODY_MOVES
    if lane == "chord":
        return move in CHORD_MOVES
    if lane == "bass":
        return move in BASS_MOVES
    return False


def _intent_move(intent: VariationIntent, lane: str) -> str:
    lane_moves = INTENT_MOVE_PRIORITY[intent].get(lane, [])
    return lane_moves[0] if lane_moves else "hook_lift"


def _resolve_move(
    *,
    lane: str,
    intent: VariationIntent,
    lane_move: str,
) -> str:
    if lane_move != "auto" and _lane_move_allowed(lane, lane_move):
        return lane_move
    return _intent_move(intent, lane)


def _move_note_to_chord_tone(pitch: int, chord_root: int, mode: str) -> int:
    third = (chord_root + (3 if mode == "minor" else 4)) % 12
    fifth = (chord_root + 7) % 12
    chord_tones = {chord_root, third, fifth, (chord_root + 10) % 12, (chord_root + 11) % 12}
    best = pitch
    best_dist = 999
    for candidate in range(max(0, pitch - 8), min(127, pitch + 8) + 1):
        if candidate % 12 not in chord_tones:
            continue
        dist = abs(candidate - pitch)
        if dist < best_dist:
            best = candidate
            best_dist = dist
    return int(best)


def _apply_melody_move(
    notes: list[pretty_midi.Note],
    move: str,
    analysis: VariationAnalysis,
    key_root: int,
    mode: str,
    strength: float,
    preserve_identity: float,
    rng: random.Random,
) -> None:
    if not notes:
        return
    anchors = _anchor_indexes(notes, analysis)
    mutable = _mutable_indexes(
        notes,
        anchors,
        _effective_preserve_for_strength(preserve_identity, strength),
        rng,
    )
    beat_sec = analysis["beat_sec"]
    phrase_edges = {max(0, boundary - 1) for boundary in analysis["phrase_boundaries"] if boundary > 0}

    for idx, note in enumerate(notes):
        if idx not in mutable:
            continue
        bar = _bar_index(float(note.start), beat_sec, analysis["bars"])
        chord_root = analysis["chord_roots"][bar % len(analysis["chord_roots"])]
        local_beat = (note.start / beat_sec) % 4.0

        if move == "hook_lift":
            if bar in phrase_edges or (idx % 3 == 0 and strength > 0.6):
                note.pitch = int(_clamp(_scale_step(note.pitch, 1 + int(strength > 1.0), key_root, mode), 50, 98))
                note.velocity = int(_clamp(note.velocity + 6 + int(strength * 4), 24, 127))
        elif move == "pocket_rewrite":
            grid = round((note.start / beat_sec) * 4) / 4.0
            swing = 0.06 if abs((grid % 1.0) - 0.5) < 0.01 else 0.0
            note.start = max(0.0, (grid + swing * strength) * beat_sec)
            note.end = max(note.start + 0.05, note.start + _duration_seconds(note) * (0.9 + 0.12 * strength))
        elif move == "emotional_resolve":
            if bar in phrase_edges:
                note.pitch = _move_note_to_chord_tone(note.pitch, chord_root, mode)
                note.end = note.start + _duration_seconds(note) * (1.12 + 0.1 * strength)
            else:
                note.pitch = _scale_step(note.pitch, -1 if local_beat > 2.0 else 1, key_root, mode)
        elif move == "call_response":
            if bar % 2 == 1:
                note.pitch = int(_clamp(note.pitch - 2 - int(strength > 1.0), 48, 94))
                note.velocity = int(_clamp(note.velocity - 8, 18, 127))
            else:
                note.velocity = int(_clamp(note.velocity + 5, 18, 127))
        elif move == "simplify_phrase":
            if idx % 2 == 1:
                note.velocity = int(_clamp(note.velocity * (0.58 - 0.12 * (strength - 0.6)), 12, 127))
                note.end = note.start + max(0.05, _duration_seconds(note) * 0.58)
            else:
                note.end = note.start + max(0.1, _duration_seconds(note) * 1.22)
        elif move == "top_line_focus":
            contour_pitch = analysis["top_contour"][bar] if bar < len(analysis["top_contour"]) else -1
            if contour_pitch > 0 and note.pitch < contour_pitch:
                note.pitch = int(_clamp(note.pitch + 2 + int(strength > 1.0), 50, 100))
                note.velocity = int(_clamp(note.velocity + 4, 18, 127))

        note.pitch = _nearest_scale_note(int(note.pitch), key_root, mode)
        note.end = max(note.start + 0.03, note.end)


def _group_chord_notes(notes: list[pretty_midi.Note], tolerance: float = 0.045) -> list[list[pretty_midi.Note]]:
    groups: list[list[pretty_midi.Note]] = []
    current: list[pretty_midi.Note] = []
    current_start = -999.0
    for note in notes:
        if not current or abs(note.start - current_start) <= tolerance:
            current.append(note)
            current_start = note.start if current_start < 0 else current_start
            continue
        groups.append(current)
        current = [note]
        current_start = note.start
    if current:
        groups.append(current)
    return groups


def _closest_pitch_for_pc(pc: int, target: float, low: int, high: int) -> int:
    best = int(_clamp(target, low, high))
    best_distance = 1e9
    for octave in range(-2, 11):
        candidate = (octave * 12) + int(pc)
        while candidate < low:
            candidate += 12
        while candidate > high:
            candidate -= 12
        if low <= candidate <= high:
            distance = abs(candidate - target)
            if distance < best_distance:
                best_distance = distance
                best = candidate
            for shifted in (candidate - 12, candidate + 12):
                if low <= shifted <= high:
                    shifted_distance = abs(shifted - target)
                    if shifted_distance < best_distance:
                        best_distance = shifted_distance
                        best = shifted
    return int(_clamp(best, low, high))


def _infer_chord_root_pc(pitch_classes: set[int], mode: str) -> int:
    if not pitch_classes:
        return 0
    best_root = next(iter(pitch_classes))
    best_score = -1.0
    for root in pitch_classes:
        major_third = (root + 4) % 12
        minor_third = (root + 3) % 12
        fifth = (root + 7) % 12
        seventh_minor = (root + 10) % 12
        seventh_major = (root + 11) % 12
        ninth = (root + 2) % 12
        score = 1.2
        if fifth in pitch_classes:
            score += 1.0
        if major_third in pitch_classes:
            score += 0.8 if mode == "major" else 0.55
        if minor_third in pitch_classes:
            score += 0.8 if mode == "minor" else 0.55
        if seventh_minor in pitch_classes or seventh_major in pitch_classes:
            score += 0.5
        if ninth in pitch_classes:
            score += 0.3
        if score > best_score:
            best_score = score
            best_root = root
    return best_root


def _chord_inversion(root_pc: int, bass_pc: int, pitch_classes: set[int], mode: str) -> str:
    third = (root_pc + (3 if mode == "minor" else 4)) % 12
    fifth = (root_pc + 7) % 12
    seventh_minor = (root_pc + 10) % 12
    seventh_major = (root_pc + 11) % 12
    if bass_pc == root_pc:
        return "root"
    if bass_pc == third:
        return "1st"
    if bass_pc == fifth:
        return "2nd"
    if bass_pc in {seventh_minor, seventh_major} and bass_pc in pitch_classes:
        return "3rd"
    return "slash"


def _analyze_chord_groups(notes: list[pretty_midi.Note], mode: str) -> list[ChordGroupSummary]:
    groups = _group_chord_notes(notes)
    summaries: list[ChordGroupSummary] = []
    previous_root = None
    for group in groups:
        if not group:
            continue
        pitches = sorted(int(note.pitch) for note in group)
        pitch_classes = {pitch % 12 for pitch in pitches}
        if len(pitch_classes) < 2:
            continue
        root_pc = _infer_chord_root_pc(pitch_classes, mode)
        bass_pc = pitches[0] % 12
        movement = 0
        if previous_root is not None:
            movement = int(((root_pc - previous_root + 6) % 12) - 6)
        previous_root = root_pc
        summaries.append(
            {
                "start": float(min(note.start for note in group)),
                "end": float(max(note.end for note in group)),
                "root_pc": int(root_pc),
                "bass_pc": int(bass_pc),
                "top_pitch": int(pitches[-1]),
                "inversion": _chord_inversion(root_pc, bass_pc, pitch_classes, mode),
                "movement": int(movement),
                "pitches": pitches,
                "pitch_classes": sorted(int(value) for value in pitch_classes),
            }
        )
    return summaries


def _mode_color_intervals(improve_mode: VariationIntent, mode: str, profile: CandidateProfile) -> list[int]:
    third = 3 if mode == "minor" else 4
    seventh = 10 if mode == "minor" else 11
    base = [0, third, 7]
    if improve_mode == "richer":
        base += [seventh, 2]
    elif improve_mode == "smoother":
        base += [seventh]
    elif improve_mode == "emotional":
        base += [10, 2]
    elif improve_mode == "modern":
        base = [0, 2, 7, 11 if mode == "major" else 10]
    elif improve_mode == "soulful":
        base += [10, 2]
    elif improve_mode == "cinematic":
        base = [0, 5, 7, 2]
    if profile == "bold":
        extras = {
            "richer": [9],
            "smoother": [2],
            "emotional": [5],
            "modern": [6],
            "soulful": [9],
            "cinematic": [9],
        }
        base += extras.get(improve_mode, [])
    ordered: list[int] = []
    for interval in base:
        wrapped = interval % 12
        if wrapped not in ordered:
            ordered.append(wrapped)
    return ordered


def _build_chord_voicing(
    root_pc: int,
    voice_count: int,
    current_pitches: list[int],
    previous_voicing: list[int] | None,
    improve_mode: VariationIntent,
    mode: str,
    profile: CandidateProfile,
) -> list[int]:
    intervals = _mode_color_intervals(improve_mode, mode, profile)
    if voice_count <= 0:
        return []
    active_intervals = intervals[: max(2, min(voice_count, len(intervals)))]
    if 0 not in active_intervals:
        active_intervals = [0, *active_intervals]
    while len(active_intervals) < voice_count:
        active_intervals.append(active_intervals[len(active_intervals) % len(active_intervals)])

    current_sorted = sorted(current_pitches) if current_pitches else [48, 55, 60]
    bass_target = float(current_sorted[0])
    bass_pitch = _closest_pitch_for_pc(root_pc, bass_target, 34, 60)

    result = [bass_pitch]
    for idx in range(1, voice_count):
        interval = active_intervals[idx % len(active_intervals)]
        pc = (root_pc + interval) % 12
        lower_bound = int(_clamp(result[-1] + 3, 36, 104))
        target = float(current_sorted[min(idx, len(current_sorted) - 1)])
        if previous_voicing and idx < len(previous_voicing):
            target = (target + previous_voicing[idx]) / 2.0
        pitch = _closest_pitch_for_pc(pc, target, lower_bound, 104)
        while pitch <= result[-1] + 2 and pitch + 12 <= 108:
            pitch += 12
        result.append(int(_clamp(pitch, lower_bound, 108)))

    if previous_voicing:
        for idx in range(1, min(len(result), len(previous_voicing))):
            while result[idx] - previous_voicing[idx] > 7 and result[idx] - 12 > result[idx - 1] + 2:
                result[idx] -= 12
            while previous_voicing[idx] - result[idx] > 7 and result[idx] + 12 <= 108:
                candidate = result[idx] + 12
                if idx > 0 and candidate <= result[idx - 1] + 2:
                    break
                result[idx] = candidate

    if improve_mode == "cinematic" and len(result) >= 4:
        result[1] = int(_clamp(result[1] - 12, 34, result[2] - 3))
        result[-1] = int(_clamp(result[-1] + 5, result[-2] + 3, 114))

    for idx in range(1, len(result)):
        if result[idx] <= result[idx - 1] + 2:
            result[idx] = min(116, result[idx - 1] + 3)

    return [int(_clamp(pitch, 30, 118)) for pitch in result]


def _apply_chord_improver(
    notes: list[pretty_midi.Note],
    improve_mode: VariationIntent,
    analysis: VariationAnalysis,
    mode: str,
    profile: CandidateProfile,
    strength: float,
    preserve_identity: float,
    rng: random.Random,
) -> None:
    groups = _group_chord_notes(notes)
    if not groups:
        return

    effective_preserve = _effective_preserve_for_strength(preserve_identity, strength)
    mutable_group_count = int(max(1, round(len(groups) * (1.0 - effective_preserve))))
    group_indexes = list(range(len(groups)))
    rng.shuffle(group_indexes)
    mutable_indexes = set(group_indexes[:mutable_group_count])
    previous_voicing: list[int] | None = None

    for index, group in enumerate(groups):
        if not group:
            continue
        group.sort(key=lambda note: note.pitch)
        current_pitches = [int(note.pitch) for note in group]
        if index not in mutable_indexes:
            previous_voicing = current_pitches
            continue

        pitch_classes = {pitch % 12 for pitch in current_pitches}
        root_pc = _infer_chord_root_pc(pitch_classes, mode)
        voice_count = len(current_pitches)
        target_voicing = _build_chord_voicing(
            root_pc=root_pc,
            voice_count=voice_count,
            current_pitches=current_pitches,
            previous_voicing=previous_voicing,
            improve_mode=improve_mode,
            mode=mode,
            profile=profile,
        )

        base_duration = max(0.09, float(group[-1].end - group[0].start))
        sustain = 1.08 if improve_mode in {"smoother", "cinematic"} else 1.0
        for note_index, note in enumerate(group):
            note.pitch = int(_clamp(target_voicing[note_index], 30, 118))
            note.velocity = int(_clamp(note.velocity + (4 if improve_mode in {"richer", "soulful"} else 1), 18, 127))
            note.end = max(note.start + 0.06, note.start + base_duration * sustain)

        previous_voicing = [int(note.pitch) for note in group]


def _apply_chord_move(
    notes: list[pretty_midi.Note],
    move: str,
    intent: VariationIntent,
    profile: CandidateProfile,
    analysis: VariationAnalysis,
    key_root: int,
    mode: str,
    strength: float,
    preserve_identity: float,
    rng: random.Random,
) -> None:
    if not notes:
        return
    if intent in CHORD_IMPROVER_MODES:
        _apply_chord_improver(
            notes=notes,
            improve_mode=intent,
            analysis=analysis,
            mode=mode,
            profile=profile,
            strength=strength,
            preserve_identity=preserve_identity,
            rng=rng,
        )
        return
    groups = _group_chord_notes(notes)
    beat_sec = analysis["beat_sec"]
    effective_preserve = _effective_preserve_for_strength(preserve_identity, strength)
    mutable_group_count = int(max(1, round(len(groups) * (1.0 - effective_preserve))))
    group_indexes = list(range(len(groups)))
    rng.shuffle(group_indexes)
    mutable_indexes = set(group_indexes[:mutable_group_count])

    previous_center = None
    for index, group in enumerate(groups):
        if index not in mutable_indexes:
            continue
        group.sort(key=lambda note: note.pitch)
        bar = _bar_index(group[0].start, beat_sec, analysis["bars"])
        chord_root = analysis["chord_roots"][bar % len(analysis["chord_roots"])]

        if move == "neo_soul_upgrade":
            top = group[-1]
            top.pitch = _move_note_to_chord_tone(int(top.pitch + 2), chord_root, mode)
            top.end = top.start + _duration_seconds(top) * (1.15 + 0.08 * strength)
        elif move == "wide_cinema_voicing":
            for note_idx, note in enumerate(group):
                if note_idx == 0:
                    note.pitch = int(_clamp(note.pitch - 12, 28, 108))
                elif note_idx == len(group) - 1:
                    note.pitch = int(_clamp(note.pitch + 7 + int(strength > 1.0) * 5, 36, 118))
                note.end = note.start + _duration_seconds(note) * 1.08
        elif move == "smooth_voice_leading":
            center = sum(note.pitch for note in group) / max(1, len(group))
            if previous_center is not None:
                delta = int(_clamp(previous_center - center, -4, 4))
                for note in group:
                    note.pitch = int(_clamp(note.pitch + delta, 30, 108))
            previous_center = sum(note.pitch for note in group) / max(1, len(group))
        elif move == "bounce_comping":
            local = (group[0].start / beat_sec) % 1.0
            offbeat_target = 0.5 if local < 0.5 else 0.75
            shift = (offbeat_target - local) * beat_sec * 0.6
            for note in group:
                note.start = max(0.0, note.start + shift)
                note.end = note.start + max(0.08, _duration_seconds(note) * 0.55)
                note.velocity = int(_clamp(note.velocity + 4, 18, 127))
        elif move == "airy_top_voice":
            top = group[-1]
            top.pitch = int(_clamp(top.pitch + 12, 40, 118))
            top.velocity = int(_clamp(top.velocity + 6, 18, 127))
            top.end = top.start + _duration_seconds(top) * (1.25 + 0.1 * strength)

        for note in group:
            note.pitch = _nearest_scale_note(int(note.pitch), key_root, mode)
            note.end = max(note.start + 0.03, note.end)


def _apply_bass_move(
    notes: list[pretty_midi.Note],
    move: str,
    analysis: VariationAnalysis,
    key_root: int,
    mode: str,
    strength: float,
    preserve_identity: float,
    rng: random.Random,
) -> None:
    if not notes:
        return
    anchors = _anchor_indexes(notes, analysis)
    mutable = _mutable_indexes(
        notes,
        anchors,
        _effective_preserve_for_strength(preserve_identity, strength),
        rng,
    )
    beat_sec = analysis["beat_sec"]

    for idx, note in enumerate(notes):
        if idx not in mutable:
            continue
        bar = _bar_index(float(note.start), beat_sec, analysis["bars"])
        chord_root = analysis["chord_roots"][bar % len(analysis["chord_roots"])]

        if move == "locked_groove":
            local = (note.start / beat_sec) % 4.0
            target_slots = [0.0, 1.5, 2.0, 3.0]
            nearest = min(target_slots, key=lambda slot: abs(slot - local))
            beat = (math.floor(note.start / beat_sec / 4.0) * 4.0) + nearest
            note.start = max(0.0, beat * beat_sec)
            note.pitch = _move_note_to_chord_tone(note.pitch, chord_root, mode)
        elif move == "octave_motion":
            if idx % 2 == 1:
                note.pitch = int(_clamp(note.pitch + 12, 28, 72))
            else:
                note.pitch = int(_clamp(note.pitch - 12, 24, 72))
        elif move == "minimal_pocket":
            if idx % 2 == 1:
                note.velocity = int(_clamp(note.velocity * 0.55, 12, 127))
                note.end = note.start + max(0.06, _duration_seconds(note) * 0.5)
            else:
                note.end = note.start + max(0.15, _duration_seconds(note) * 1.2)
        elif move == "approach_note_movement":
            next_bar = min(len(analysis["chord_roots"]) - 1, bar + 1)
            next_root = analysis["chord_roots"][next_bar]
            if next_root != chord_root:
                direction = 1 if ((next_root - chord_root) % 12) <= 6 else -1
                note.pitch = _nearest_scale_note(int(note.pitch + direction), key_root, mode)
            note.pitch = _move_note_to_chord_tone(note.pitch, chord_root, mode)
        elif move == "groove_tightening":
            quantized = round((note.start / beat_sec) * 4) / 4.0
            note.start = max(0.0, quantized * beat_sec)
            note.end = note.start + max(0.08, _duration_seconds(note) * 0.86)
            note.velocity = int(_clamp(note.velocity + 3, 18, 127))

        note.pitch = int(_clamp(note.pitch, 24, 76))
        note.pitch = _nearest_scale_note(int(note.pitch), key_root, mode)
        note.end = max(note.start + 0.03, note.end)


def _clone_with_time_scale(
    source: pretty_midi.PrettyMIDI,
    target_bpm: float,
    time_scale: float,
) -> tuple[pretty_midi.PrettyMIDI, dict[str, list[pretty_midi.Note]]]:
    cloned = pretty_midi.PrettyMIDI(initial_tempo=target_bpm)
    lanes = {"melody": [], "chord": [], "bass": []}
    for instrument in source.instruments:
        new_inst = pretty_midi.Instrument(
            program=instrument.program,
            is_drum=instrument.is_drum,
            name=instrument.name,
        )
        for note in instrument.notes:
            new_note = pretty_midi.Note(
                velocity=int(note.velocity),
                pitch=int(note.pitch),
                start=max(0.0, float(note.start) * time_scale),
                end=max(0.03, float(note.end) * time_scale),
            )
            new_inst.notes.append(new_note)
            if not instrument.is_drum:
                lanes[_lane_for_pitch(new_note.pitch)].append(new_note)
        cloned.instruments.append(new_inst)
    for lane in lanes:
        lanes[lane].sort(key=lambda note: (note.start, note.pitch))
    return cloned, lanes


def _collect_lane_note_refs(
    midi: pretty_midi.PrettyMIDI,
) -> dict[str, list[tuple[pretty_midi.Instrument, pretty_midi.Note]]]:
    refs: dict[str, list[tuple[pretty_midi.Instrument, pretty_midi.Note]]] = {
        "melody": [],
        "chord": [],
        "bass": [],
    }
    for instrument in midi.instruments:
        if instrument.is_drum:
            continue
        for note in instrument.notes:
            refs[_lane_for_pitch(int(note.pitch))].append((instrument, note))
    for lane in refs:
        refs[lane].sort(key=lambda pair: (pair[1].start, pair[1].pitch))
    return refs


def _add_creative_layers(
    *,
    midi: pretty_midi.PrettyMIDI,
    selected_lanes: list[str],
    profile: CandidateProfile,
    strength: float,
    key_root: int,
    mode: str,
    beat_sec: float,
    rng: random.Random,
) -> int:
    if profile == "safe":
        return 0

    refs = _collect_lane_note_refs(midi)
    selected = set(selected_lanes)
    additions = 0
    max_additions = 12 if profile == "pro" else 24

    if "melody" in selected:
        melody_refs = refs["melody"]
        step = 7 if profile == "pro" else 4
        for idx, (instrument, note) in enumerate(melody_refs):
            if additions >= max_additions or idx % step != 0:
                continue
            offset = beat_sec * (0.25 if profile == "pro" else 0.5)
            new_start = float(note.start) + offset
            new_duration = max(0.05, _duration_seconds(note) * (0.5 if profile == "pro" else 0.62))
            new_end = new_start + new_duration
            shift = 2 if idx % 2 == 0 else -2
            if profile == "bold" and strength > 1.0 and rng.random() < 0.4:
                shift = 5 if idx % 2 == 0 else -5
            new_pitch = _nearest_scale_note(int(note.pitch) + shift, key_root, mode)
            new_velocity = int(_clamp(int(note.velocity) * 0.66, 18, 112))
            instrument.notes.append(
                pretty_midi.Note(
                    velocity=new_velocity,
                    pitch=int(_clamp(new_pitch, 44, 108)),
                    start=max(0.0, new_start),
                    end=max(new_start + 0.03, new_end),
                )
            )
            additions += 1

    if "chord" in selected:
        chord_refs = refs["chord"]
        step = 9 if profile == "pro" else 6
        for idx, (instrument, note) in enumerate(chord_refs):
            if additions >= max_additions or idx % step != 0:
                continue
            local = (float(note.start) / max(1e-6, beat_sec)) % 1.0
            if local > 0.12:
                continue
            extension = 7 if profile == "pro" else (10 if mode == "minor" else 11)
            new_pitch = _nearest_scale_note(int(note.pitch) + extension, key_root, mode)
            if new_pitch <= int(note.pitch):
                new_pitch = _nearest_scale_note(int(note.pitch) + 12, key_root, mode)
            new_duration = max(0.12, _duration_seconds(note) * (0.85 if profile == "pro" else 1.0))
            new_velocity = int(_clamp(int(note.velocity) * 0.58, 16, 104))
            instrument.notes.append(
                pretty_midi.Note(
                    velocity=new_velocity,
                    pitch=int(_clamp(new_pitch, 40, 118)),
                    start=max(0.0, float(note.start)),
                    end=max(float(note.start) + 0.03, float(note.start) + new_duration),
                )
            )
            additions += 1

    if "bass" in selected:
        bass_refs = refs["bass"]
        step = 8 if profile == "pro" else 5
        for idx, (instrument, note) in enumerate(bass_refs):
            if additions >= max_additions or idx % step != 0:
                continue
            local = (float(note.start) / max(1e-6, beat_sec)) % 4.0
            if abs(local - 0.0) > 0.11 and abs(local - 2.0) > 0.11:
                continue
            pickup_start = max(0.0, float(note.start) - beat_sec * 0.25)
            pickup_end = min(float(note.start) - 0.01, pickup_start + max(0.05, beat_sec * 0.18))
            if pickup_end <= pickup_start + 0.02:
                continue
            shift = -2 if rng.random() < 0.5 else 2
            pickup_pitch = _nearest_scale_note(int(note.pitch) + shift, key_root, mode)
            pickup_velocity = int(_clamp(int(note.velocity) * 0.74, 18, 108))
            instrument.notes.append(
                pretty_midi.Note(
                    velocity=pickup_velocity,
                    pitch=int(_clamp(pickup_pitch, 24, 76)),
                    start=pickup_start,
                    end=max(pickup_start + 0.03, pickup_end),
                )
            )
            additions += 1

    for instrument in midi.instruments:
        if instrument.is_drum:
            continue
        instrument.notes.sort(key=lambda note: (note.start, note.pitch))

    return additions


def _motif_similarity(a: list[tuple[int, int]], b: list[tuple[int, int]]) -> float:
    if not a or not b:
        return 0.0
    a_set = set(a)
    b_set = set(b)
    intersection = len(a_set & b_set)
    union = len(a_set | b_set)
    if union <= 0:
        return 0.0
    return _clamp(intersection / union, 0.0, 1.0)


def _phrase_symmetry_score(analysis: VariationAnalysis) -> float:
    boundaries = analysis["phrase_boundaries"]
    if len(boundaries) < 3:
        return 0.65
    lengths = [boundaries[idx + 1] - boundaries[idx] for idx in range(len(boundaries) - 1)]
    if not lengths:
        return 0.65
    avg = sum(lengths) / len(lengths)
    deviation = sum(abs(length - avg) for length in lengths) / max(1, len(lengths))
    return _clamp(1.0 - deviation / max(1.0, avg), 0.0, 1.0)


def _chord_alignment_score(
    midi: pretty_midi.PrettyMIDI,
    analysis: VariationAnalysis,
    mode: str,
) -> float:
    notes = _collect_lane_notes(midi)
    focus = notes["melody"] + notes["chord"] + notes["bass"]
    if not focus:
        return 0.0
    aligned = 0
    for note in focus:
        bar = _bar_index(float(note.start), analysis["beat_sec"], analysis["bars"])
        root_pc = analysis["chord_roots"][bar % len(analysis["chord_roots"])]
        third = (root_pc + (3 if mode == "minor" else 4)) % 12
        chord_tones = {root_pc, third, (root_pc + 7) % 12}
        if note.pitch % 12 in chord_tones:
            aligned += 1
    return _clamp(aligned / len(focus), 0.0, 1.0)


def _lane_realism_score(notes: dict[str, list[pretty_midi.Note]]) -> float:
    score = 1.0
    melody = notes["melody"]
    chord = notes["chord"]
    bass = notes["bass"]

    if melody:
        melody_pitches = [note.pitch for note in melody]
        melody_span = max(melody_pitches) - min(melody_pitches)
        if melody_span > 32:
            score -= 0.18
    if chord:
        chord_durations = [_duration_seconds(note) for note in chord]
        avg = sum(chord_durations) / len(chord_durations)
        if avg < 0.08:
            score -= 0.14
    if bass:
        bass_pitches = [note.pitch for note in bass]
        if max(bass_pitches) > 78 or min(bass_pitches) < 20:
            score -= 0.2
    return _clamp(score, 0.0, 1.0)


def _tension_resolution_score(base: VariationAnalysis, candidate: VariationAnalysis) -> float:
    base_set = set(base["release_points"])
    cand_set = set(candidate["release_points"])
    if not base_set and not cand_set:
        return 0.6
    if not base_set or not cand_set:
        return 0.35
    overlap = len(base_set & cand_set)
    return _clamp(overlap / max(1, len(base_set | cand_set)), 0.0, 1.0)


def _genre_fit_targets(improve_mode: VariationIntent, mode: str) -> set[int]:
    seventh = 10 if mode == "minor" else 11
    mapping: dict[VariationIntent, set[int]] = {
        "richer": {seventh, 2, 9},
        "smoother": {seventh, 2},
        "emotional": {10, 2, 5},
        "modern": {2, 6, 11},
        "soulful": {10, 2, 9},
        "cinematic": {2, 5, 9},
        "catchier": {2},
        "rhythmic": {2},
        "sparse": {2},
        "aggressive": {10},
        "premium": {11, 2},
    }
    return mapping.get(improve_mode, {2})


def _score_chord_improver(
    base_groups: list[ChordGroupSummary],
    candidate_groups: list[ChordGroupSummary],
    improve_mode: VariationIntent,
    mode: str,
) -> tuple[float, float, float, float, float]:
    if not candidate_groups:
        return (0.0, 0.0, 0.0, 0.0, 0.0)

    smoothness = 0.7
    top_motion = 0.7
    register = 0.7
    genre_fit = 0.65
    progression_identity = 0.65

    if len(candidate_groups) > 1:
        moves: list[float] = []
        top_leaps: list[float] = []
        for previous, current in zip(candidate_groups, candidate_groups[1:]):
            previous_pitches = previous["pitches"]
            current_pitches = current["pitches"]
            if previous_pitches and current_pitches:
                voice_move = 0.0
                for pitch in current_pitches:
                    voice_move += min(abs(pitch - ref) for ref in previous_pitches)
                voice_move /= max(1, len(current_pitches))
                moves.append(voice_move)
            top_leaps.append(abs(current["top_pitch"] - previous["top_pitch"]))

        if moves:
            average_move = sum(moves) / len(moves)
            smoothness = _clamp(1.0 - (average_move / 9.0), 0.0, 1.0)
        if top_leaps:
            stepwise = sum(1 for leap in top_leaps if leap <= 5) / len(top_leaps)
            oversized = sum(1 for leap in top_leaps if leap > 9) / len(top_leaps)
            top_motion = _clamp((stepwise * 0.85) + ((1.0 - oversized) * 0.15), 0.0, 1.0)

    register_penalties: list[float] = []
    genre_targets = _genre_fit_targets(improve_mode, mode)
    genre_hits = 0
    genre_total = 0
    for group in candidate_groups:
        pitches = group["pitches"]
        if not pitches:
            continue
        bass = pitches[0]
        top = pitches[-1]
        spread = top - bass
        penalty = 0.0
        if bass < 32 or bass > 60:
            penalty += 0.35
        if top < 58 or top > 94:
            penalty += 0.35
        if spread < 7 or spread > 28:
            penalty += 0.3
        register_penalties.append(penalty)

        root = group["root_pc"]
        intervals = {(pc - root) % 12 for pc in group["pitch_classes"]}
        genre_hits += len(intervals & genre_targets)
        genre_total += max(1, len(genre_targets))

    if register_penalties:
        register = _clamp(1.0 - (sum(register_penalties) / len(register_penalties)), 0.0, 1.0)
    if genre_total > 0:
        genre_fit = _clamp(genre_hits / genre_total, 0.0, 1.0)

    if base_groups and candidate_groups:
        limit = min(len(base_groups), len(candidate_groups))
        shared = 0
        for index in range(limit):
            if base_groups[index]["root_pc"] == candidate_groups[index]["root_pc"]:
                shared += 1
        progression_identity = _clamp(shared / max(1, limit), 0.0, 1.0)

    return (smoothness, top_motion, register, genre_fit, progression_identity)


def _score_candidate(
    *,
    source_midi: pretty_midi.PrettyMIDI,
    base: VariationAnalysis,
    candidate: VariationAnalysis,
    candidate_midi: pretty_midi.PrettyMIDI,
    key_root: int,
    mode: str,
    intent: VariationIntent,
) -> CandidateScore:
    motif_retention = _motif_similarity(base["motif_signature"], candidate["motif_signature"])
    rhythmic_coherence = _clamp(1.0 - abs(base["syncopation"] - candidate["syncopation"]), 0.0, 1.0)
    chord_tone_alignment = _chord_alignment_score(candidate_midi, candidate, mode)
    phrase_symmetry = _phrase_symmetry_score(candidate)
    groove_quality = _clamp((rhythmic_coherence * 0.6) + (candidate["repetition_score"] * 0.4), 0.0, 1.0)
    top_line_memorability = _clamp((candidate["repetition_score"] * 0.65) + (motif_retention * 0.35), 0.0, 1.0)
    tension_resolution = _tension_resolution_score(base, candidate)
    lane_realism = _lane_realism_score(_collect_lane_notes(candidate_midi))

    voice_leading_smoothness = lane_realism
    top_note_motion = top_line_memorability
    register_balance = lane_realism
    genre_fit = chord_tone_alignment
    progression_identity = motif_retention

    if intent in CHORD_IMPROVER_MODES:
        base_chords = _analyze_chord_groups(_collect_lane_notes(source_midi)["chord"], mode)
        candidate_chords = _analyze_chord_groups(_collect_lane_notes(candidate_midi)["chord"], mode)
        (
            voice_leading_smoothness,
            top_note_motion,
            register_balance,
            genre_fit,
            progression_identity,
        ) = _score_chord_improver(base_chords, candidate_chords, intent, mode)

    total = (
        motif_retention * SCORING_WEIGHTS["motif_retention"]
        + rhythmic_coherence * SCORING_WEIGHTS["rhythmic_coherence"]
        + chord_tone_alignment * SCORING_WEIGHTS["chord_tone_alignment"]
        + phrase_symmetry * SCORING_WEIGHTS["phrase_symmetry"]
        + groove_quality * SCORING_WEIGHTS["groove_quality"]
        + top_line_memorability * SCORING_WEIGHTS["top_line_memorability"]
        + tension_resolution * SCORING_WEIGHTS["tension_resolution"]
        + lane_realism * SCORING_WEIGHTS["lane_realism"]
    )

    if intent in CHORD_IMPROVER_MODES:
        chord_total = (
            voice_leading_smoothness * 0.3
            + top_note_motion * 0.2
            + register_balance * 0.2
            + genre_fit * 0.2
            + progression_identity * 0.1
        )
        total = _clamp((total * 0.25) + (chord_total * 0.75), 0.0, 1.0)

    return {
        "motif_retention": round(motif_retention, 4),
        "rhythmic_coherence": round(rhythmic_coherence, 4),
        "chord_tone_alignment": round(chord_tone_alignment, 4),
        "phrase_symmetry": round(phrase_symmetry, 4),
        "groove_quality": round(groove_quality, 4),
        "top_line_memorability": round(top_line_memorability, 4),
        "tension_resolution": round(tension_resolution, 4),
        "lane_realism": round(lane_realism, 4),
        "voice_leading_smoothness": round(voice_leading_smoothness, 4),
        "top_note_motion": round(top_note_motion, 4),
        "register_balance": round(register_balance, 4),
        "genre_fit": round(genre_fit, 4),
        "progression_identity": round(progression_identity, 4),
        "total": round(total, 4),
    }


def _retune_all_non_drum(
    midi: pretty_midi.PrettyMIDI,
    key_root: int,
    mode: str,
    retune_lanes: set[str] | None = None,
) -> None:
    for instrument in midi.instruments:
        if instrument.is_drum:
            continue
        for note in instrument.notes:
            lane = _lane_for_pitch(int(note.pitch))
            should_retune = retune_lanes is None or lane in retune_lanes
            if should_retune:
                note.pitch = _nearest_scale_note(int(note.pitch), key_root, mode)
            note.start = max(0.0, float(note.start))
            note.end = max(note.start + 0.03, float(note.end))
            note.velocity = int(_clamp(note.velocity, 12, 127))


def _build_candidate(
    *,
    source: pretty_midi.PrettyMIDI,
    base_analysis: VariationAnalysis,
    key_root: int,
    mode: str,
    target: LaneTarget,
    target_bpm: float,
    time_scale: float,
    intent: VariationIntent,
    lane_move: str,
    profile: CandidateProfile,
    strength: float,
    preserve_identity: float,
    rng: random.Random,
) -> CandidateRender:
    settings = PROFILE_SETTINGS[profile]
    effective_strength = _clamp(strength * float(settings["strength_factor"]), 0.35, 1.35)
    effective_preserve = _clamp(
        preserve_identity + float(settings["preserve_shift"]),
        0.55,
        0.82,
    )

    midi, lanes = _clone_with_time_scale(source, target_bpm, time_scale)
    selected_lanes = ["melody", "chord", "bass"] if target == "full" else [target]

    move_labels: list[str] = []
    for lane in selected_lanes:
        lane_notes = lanes[lane]
        move = _resolve_move(lane=lane, intent=intent, lane_move=lane_move)
        if lane == "melody":
            _apply_melody_move(
                lane_notes,
                move,
                base_analysis,
                key_root,
                mode,
                effective_strength,
                effective_preserve,
                rng,
            )
        elif lane == "chord":
            _apply_chord_move(
                lane_notes,
                move,
                intent,
                profile,
                base_analysis,
                key_root,
                mode,
                effective_strength,
                effective_preserve,
                rng,
            )
        elif lane == "bass":
            _apply_bass_move(
                lane_notes,
                move,
                base_analysis,
                key_root,
                mode,
                effective_strength,
                effective_preserve,
                rng,
            )
        move_labels.append(MOVE_LABELS.get(move, move.replace("_", " ").title()))

    beat_sec = 60.0 / max(40.0, target_bpm)
    creative_layers = _add_creative_layers(
        midi=midi,
        selected_lanes=selected_lanes,
        profile=profile,
        strength=effective_strength,
        key_root=key_root,
        mode=mode,
        beat_sec=beat_sec,
        rng=rng,
    )
    if creative_layers > 0:
        move_labels.append(f"Creative Layer x{creative_layers}")

    _retune_all_non_drum(midi, key_root, mode, set(selected_lanes))
    candidate_analysis = _analyze_identity(midi, key_root, mode, target)
    scores = _score_candidate(
        source_midi=source,
        base=base_analysis,
        candidate=candidate_analysis,
        candidate_midi=midi,
        key_root=key_root,
        mode=mode,
        intent=intent,
    )

    move_text = " + ".join(move_labels[:2]) if move_labels else "Identity-preserving upgrade"
    return {
        "profile": profile,
        "label": f"{settings['label']}: {move_text}",
        "move_labels": move_labels,
        "midi": midi,
        "scores": scores,
    }


def alter_midi(
    base_midi_path: Path,
    output_path: Path,
    key: str,
    target: str,
    bpm: float | None = None,
    generation: int = 1,
    seed: int | None = None,
    style: str | None = None,
    creativity: float | None = None,
    intent: str | None = None,
    variation_strength: float | None = None,
    preserve_identity: float | None = None,
    lane_move: str | None = None,
) -> AlterMidiResult:
    source = pretty_midi.PrettyMIDI(str(base_midi_path))
    key_root, mode = _key_to_root_and_mode(key)
    original_bpm = _first_tempo(source)
    target_bpm = max(40.0, min(260.0, float(bpm))) if bpm else original_bpm
    time_scale = original_bpm / target_bpm if target_bpm > 0 else 1.0

    target_lane: LaneTarget = "full"
    if target in {"melody", "chord", "bass", "full"}:
        target_lane = target  # type: ignore[assignment]

    normalized_intent = _normalize_intent(intent, style)
    normalized_strength = _normalize_strength(variation_strength, creativity)
    normalized_preserve_identity = _normalize_preserve_identity(preserve_identity)
    normalized_lane_move = _normalize_lane_move(lane_move)

    generation_boost = min(0.18, max(0, int(generation) - 1) * 0.045)
    normalized_strength = _clamp(normalized_strength + generation_boost, 0.35, 1.35)

    chosen_seed = seed if seed is not None else random.SystemRandom().randint(1, 2_147_483_647)
    rng = random.Random(chosen_seed)

    base_analysis = _analyze_identity(source, key_root, mode, target_lane)
    base_chord_groups = _analyze_chord_groups(_collect_lane_notes(source)["chord"], mode)
    candidates: list[CandidateRender] = []
    for profile in ("safe", "pro", "bold"):
        candidate_rng = random.Random(rng.randint(1, 2_147_483_647))
        render = _build_candidate(
            source=source,
            base_analysis=base_analysis,
            key_root=key_root,
            mode=mode,
            target=target_lane,
            target_bpm=target_bpm,
            time_scale=time_scale,
            intent=normalized_intent,
            lane_move=normalized_lane_move,
            profile=profile,
            strength=normalized_strength,
            preserve_identity=normalized_preserve_identity,
            rng=candidate_rng,
        )
        candidates.append(render)

    profile_bias = _profile_bias_for_request(
        normalized_strength,
        normalized_preserve_identity,
    )

    def _rank_value(item: CandidateRender) -> float:
        return float(item["scores"]["total"]) + profile_bias[item["profile"]]

    ranked = sorted(candidates, key=_rank_value, reverse=True)
    preferred_order = _preferred_profile_order(
        normalized_strength,
        normalized_preserve_identity,
    )

    best = ranked[0]
    for profile in preferred_order:
        match = next((candidate for candidate in ranked if candidate["profile"] == profile), None)
        if match is not None:
            best = match
            break

    output_path.parent.mkdir(parents=True, exist_ok=True)
    candidate_paths: list[Path] = []
    candidate_profiles: list[str] = []
    candidate_labels: list[str] = []
    candidate_scores: list[float] = []
    for candidate in ranked:
        profile = candidate["profile"]
        profile_path = output_path.parent / f"{output_path.stem}_{profile}.mid"
        candidate["midi"].write(str(profile_path))
        candidate_paths.append(profile_path)
        candidate_profiles.append(profile)
        candidate_labels.append(candidate["label"])
        candidate_scores.append(_clamp(_rank_value(candidate), 0.0, 1.0))

    best["midi"].write(str(output_path))

    dominant_inversion = "root"
    average_harmonic_movement = 0.0
    top_note_span = 0
    if base_chord_groups:
        inversion_counts: dict[str, int] = {}
        for group in base_chord_groups:
            inversion_counts[group["inversion"]] = inversion_counts.get(group["inversion"], 0) + 1
        dominant_inversion = max(inversion_counts, key=lambda name: inversion_counts[name])

        movements = [abs(group["movement"]) for group in base_chord_groups[1:]]
        if movements:
            average_harmonic_movement = sum(movements) / len(movements)

        tops = [group["top_pitch"] for group in base_chord_groups]
        if tops:
            top_note_span = max(tops) - min(tops)

    return {
        "best_path": output_path,
        "best_label": best["label"],
        "best_profile": best["profile"],
        "candidate_paths": candidate_paths,
        "candidate_profiles": candidate_profiles,
        "candidate_labels": candidate_labels,
        "candidate_scores": candidate_scores,
        "analysis_summary": {
            "bars": base_analysis["bars"],
            "repetition_score": base_analysis["repetition_score"],
            "syncopation": base_analysis["syncopation"],
            "intent": normalized_intent,
            "preserve_identity": normalized_preserve_identity,
            "chord_group_count": len(base_chord_groups),
            "dominant_inversion": dominant_inversion,
            "avg_harmonic_movement": round(average_harmonic_movement, 4),
            "top_note_span": int(top_note_span),
        },
    }


def create_variations(base_midi_path: Path, output_dir: Path, key: str, target: str = "full") -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    render = alter_midi(
        base_midi_path=base_midi_path,
        output_path=output_dir / "variation_best.mid",
        key=key,
        target=target,
        intent="catchier",
        variation_strength=0.75,
        preserve_identity=0.72,
        lane_move="auto",
        style="auto",
        creativity=0.75,
    )

    variation_paths: list[Path] = []
    for idx, source_path in enumerate(render["candidate_paths"][:3]):
        destination = output_dir / f"variation_{idx + 1}.mid"
        destination.write_bytes(source_path.read_bytes())
        variation_paths.append(destination)
    return variation_paths
