import asyncio
import secrets
import tempfile
from pathlib import Path
from collections.abc import Coroutine
from types import SimpleNamespace
from typing import Any
from typing import Literal

import httpx
import lameenc
import numpy as np
import pretty_midi
import soundfile as sf

from app.core.config import settings
from app.services.audio_analysis import estimate_bpm_and_key, suggest_chords
from app.services.chord_cleanup import (
    cleanup_chord_midi,
    preprocess_harmonic_audio,
)
from app.services.instrument_detection import (
    InstrumentDetectionResult,
    build_target_mix_audio,
    detect_instruments_from_stems,
    select_stems_for_target,
)
from app.services.repository import Repository
from app.services.source_separation import StemSeparationResult, separate_audio_stems
from app.services.stem_quality import (
    analyze_stem_audio_quality,
    evaluate_transcription_confidence,
    score_target_stem_quality,
)
from app.services.storage import StorageService
from app.services.track_starter import generate_track_starter_idea
from app.services.transcription import transcribe_to_midi
from app.services.variations import alter_midi, create_variations


_active_project_tasks: dict[str, asyncio.Task[None]] = {}


def start_project_task(project_id: str, coroutine: Coroutine[Any, Any, None]) -> asyncio.Task[None]:
    existing = _active_project_tasks.get(project_id)
    if existing and not existing.done():
        existing.cancel()

    task: asyncio.Task[None] = asyncio.create_task(coroutine)
    _active_project_tasks[project_id] = task

    def _cleanup(completed_task: asyncio.Task[None]) -> None:
        current = _active_project_tasks.get(project_id)
        if current is completed_task:
            _active_project_tasks.pop(project_id, None)

    task.add_done_callback(_cleanup)
    return task


def cancel_project_task(project_id: str) -> bool:
    task = _active_project_tasks.get(project_id)
    if not task or task.done():
        return False
    task.cancel()
    return True


def _quantized_onset(start_time: float, step: float = 0.06) -> int:
    return int(round(start_time / step))


def _target_filter(target: str, note: dict[str, int | float | str]) -> bool:
    pitch = int(note["pitch"])
    velocity = int(note["velocity"])
    duration = float(note["end"]) - float(note["start"])

    if target == "chord":
        return 48 <= pitch <= 84 and velocity >= 38 and duration >= 0.12
    if target == "bass":
        return pitch <= 60 and velocity >= 28 and duration >= 0.08
    if target == "melody":
        return pitch >= 55 and velocity >= 28 and duration >= 0.08
    return True


def _target_audio_from_stems(target: str, stems: dict[str, Path], fallback_audio: Path) -> Path:
    if target == "chord":
        return stems.get("other") or stems.get("vocals") or fallback_audio
    if target == "bass":
        return stems.get("bass") or fallback_audio
    if target == "melody":
        return stems.get("vocals") or stems.get("other") or fallback_audio
    if target == "piano":
        return stems.get("piano") or stems.get("other") or fallback_audio
    if target == "guitar":
        return stems.get("guitar") or stems.get("other") or fallback_audio
    return fallback_audio


def _select_separation_model(
    feature: Literal["extraction", "variation"],
    extract_targets: list[str],
) -> str:
    requested = {value.strip().lower() for value in extract_targets if value.strip()}
    if feature == "extraction" and requested and not ({"piano", "guitar"} & requested):
        return "htdemucs"
    return settings.demucs_model


def _wav_to_mp3(wav_path: Path, output_path: Path) -> Path:
    audio, sr = sf.read(str(wav_path), dtype="float32")
    if audio.ndim > 1:
        audio = np.mean(audio, axis=1)
    audio = np.clip(audio, -1.0, 1.0)
    pcm = (audio * 32767.0).astype(np.int16)

    encoder = lameenc.Encoder()
    encoder.set_bit_rate(192)
    encoder.set_in_sample_rate(int(sr))
    encoder.set_channels(1)
    encoder.set_quality(2)

    mp3_data = encoder.encode(pcm.tobytes())
    mp3_data += encoder.flush()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(mp3_data)
    return output_path


def _download_file_to_path(url: str, output_path: Path) -> Path:
    response = httpx.get(url, timeout=120)
    response.raise_for_status()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(response.content)
    return output_path


def _target_audio_with_detection(
    target: str,
    stems: dict[str, Path] | None,
    detection: InstrumentDetectionResult | None,
    fallback_audio: Path,
    output_path: Path,
) -> Path:
    if not stems or not detection:
        return fallback_audio

    selected = select_stems_for_target(target, stems, detection)
    if not selected:
        return _target_audio_from_stems(target, stems, fallback_audio)

    try:
        return build_target_mix_audio(selected, output_path)
    except Exception:
        return _target_audio_from_stems(target, stems, fallback_audio)


def _collect_preview_notes_from_target_midis(
    target_midis: dict[str, Path],
    allowed_lanes: set[str],
    limit: int = 240,
) -> list[dict[str, int | float | str]]:
    notes: list[dict[str, int | float | str]] = []
    for lane, midi_path in target_midis.items():
        if lane not in allowed_lanes:
            continue

        midi = pretty_midi.PrettyMIDI(str(midi_path))
        for instrument in midi.instruments:
            if instrument.is_drum:
                continue
            for note in instrument.notes:
                record = {
                    "pitch": int(note.pitch),
                    "velocity": int(note.velocity),
                    "start": float(note.start),
                    "end": float(note.end),
                    "lane": lane,
                }
                if _target_filter(lane, record):
                    notes.append(record)

    notes.sort(key=lambda item: float(item["start"]))
    return notes[:limit]


def _analyze_midi_lanes(
    base_midi_path: Path,
) -> list[dict[str, int | float | str]]:
    midi = pretty_midi.PrettyMIDI(str(base_midi_path))

    note_events: list[dict[str, int | float | str]] = []
    for instrument in midi.instruments:
        if instrument.is_drum:
            continue
        for note in instrument.notes:
            duration = float(note.end - note.start)
            if duration < 0.05 and int(note.velocity) < 45:
                continue

            note_events.append(
                {
                    "pitch": int(note.pitch),
                    "velocity": int(note.velocity),
                    "start": float(note.start),
                    "end": float(note.end),
                }
            )

    if not note_events:
        return []

    chord_candidates_by_onset: dict[int, list[int]] = {}
    for index, event in enumerate(note_events):
        onset_key = _quantized_onset(float(event["start"]))
        chord_candidates_by_onset.setdefault(onset_key, []).append(index)

    chord_indexes: set[int] = set()
    for indexes in chord_candidates_by_onset.values():
        if len(indexes) < 2:
            continue

        pitches = {int(note_events[index]["pitch"]) for index in indexes}
        if len(pitches) < 2:
            continue

        pitch_values = sorted(pitches)
        pitch_span = pitch_values[-1] - pitch_values[0]
        if pitch_span > 28:
            continue

        is_strong_chord = len(pitches) >= 3
        is_two_note_chord = len(pitches) == 2 and 3 <= pitch_span <= 12
        if not (is_strong_chord or is_two_note_chord):
            continue

        for index in indexes:
            pitch = int(note_events[index]["pitch"])
            velocity = int(note_events[index]["velocity"])
            duration = float(note_events[index]["end"]) - float(note_events[index]["start"])
            if 46 <= pitch <= 86 and velocity >= 34 and duration >= 0.09:
                chord_indexes.add(index)

    non_chord_pitches = [
        int(event["pitch"]) for index, event in enumerate(note_events) if index not in chord_indexes
    ]
    pivot_pitch = sorted(non_chord_pitches)[len(non_chord_pitches) // 2] if non_chord_pitches else 60

    analyzed: list[dict[str, int | float | str]] = []
    for index, event in enumerate(note_events):
        pitch = int(event["pitch"])
        lane: Literal["melody", "chord", "bass"]
        if index in chord_indexes:
            lane = "chord"
        elif pitch <= max(50, pivot_pitch - 7):
            lane = "bass"
        elif pitch >= min(74, pivot_pitch + 5):
            lane = "melody"
        else:
            lane = "melody" if pitch >= pivot_pitch else "bass"

        analyzed.append(
            {
                "pitch": pitch,
                "velocity": int(event["velocity"]),
                "start": float(event["start"]),
                "end": float(event["end"]),
                "lane": lane,
            }
        )

    analyzed.sort(key=lambda item: (float(item["start"]), int(item["pitch"])))
    return analyzed


def _note_identity(note: dict[str, int | float | str]) -> tuple[int, int, int, int]:
    return (
        int(note["pitch"]),
        int(round(float(note["start"]) * 1000)),
        int(round(float(note["end"]) * 1000)),
        int(note["velocity"]),
    )


def _strict_chord_only_notes(
    analyzed_notes: list[dict[str, int | float | str]],
) -> list[dict[str, int | float | str]]:
    chord_candidates = [
        note
        for note in analyzed_notes
        if str(note.get("lane", "")) == "chord" and _target_filter("chord", note)
    ]

    by_onset: dict[int, list[dict[str, int | float | str]]] = {}
    for note in chord_candidates:
        key = _quantized_onset(float(note["start"]), step=0.08)
        by_onset.setdefault(key, []).append(note)

    strict_notes: list[dict[str, int | float | str]] = []
    for group in by_onset.values():
        unique_pitches = sorted({int(note["pitch"]) for note in group})
        if len(unique_pitches) < 2:
            continue

        span = unique_pitches[-1] - unique_pitches[0]
        strong_triad_or_more = len(unique_pitches) >= 3 and span <= 24
        strong_dyad = len(unique_pitches) == 2 and 3 <= span <= 12
        if not (strong_triad_or_more or strong_dyad):
            continue

        for note in group:
            strict_notes.append(note)

    strict_notes.sort(key=lambda item: (float(item["start"]), int(item["pitch"])))
    return strict_notes


def _extract_stem_midis(
    analyzed_notes: list[dict[str, int | float | str]],
    output_dir: Path,
    targets: list[str],
) -> dict[str, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    strict_chord_keys = {
        _note_identity(note) for note in _strict_chord_only_notes(analyzed_notes)
    }

    stems: dict[str, pretty_midi.PrettyMIDI] = {}
    for target in targets:
        stem_midi = pretty_midi.PrettyMIDI()
        stem_midi.instruments.append(pretty_midi.Instrument(program=0, is_drum=False))
        stems[target] = stem_midi

    for note in analyzed_notes:
        lane = str(note["lane"])
        if lane not in stems:
            continue
        if not _target_filter(lane, note):
            continue
        if lane == "chord" and _note_identity(note) not in strict_chord_keys:
            continue
        stems[lane].instruments[0].notes.append(
            pretty_midi.Note(
                velocity=int(note["velocity"]),
                pitch=int(note["pitch"]),
                start=float(note["start"]),
                end=float(note["end"]),
            )
        )

    output_paths: dict[str, Path] = {}
    for target, midi in stems.items():
        output_path = output_dir / f"{target}.mid"
        midi.write(str(output_path))
        output_paths[target] = output_path

    return output_paths


def _collect_preview_notes(
    analyzed_notes: list[dict[str, int | float | str]],
    allowed_lanes: set[str],
    limit: int = 240,
) -> list[dict[str, int | float | str]]:
    strict_chord_keys = {
        _note_identity(note) for note in _strict_chord_only_notes(analyzed_notes)
    }

    filtered = [
        note
        for note in analyzed_notes
        if str(note.get("lane", "")) in allowed_lanes
        and _target_filter(str(note.get("lane", "")), note)
        and (
            str(note.get("lane", "")) != "chord"
            or _note_identity(note) in strict_chord_keys
        )
    ]
    filtered.sort(key=lambda item: float(item["start"]))
    return filtered[:limit]


def _preview_lane_for_pitch(
    pitch: int,
    is_drum: bool = False,
) -> Literal["melody", "chord", "bass", "drums"]:
    if is_drum:
        return "drums"
    if pitch < 52:
        return "bass"
    if pitch >= 72:
        return "melody"
    return "chord"


def _collect_exact_midi_preview_notes(
    midi_path: Path,
    allowed_lanes: set[str] | None = None,
    limit: int | None = None,
) -> list[dict[str, int | float | str]]:
    midi = pretty_midi.PrettyMIDI(str(midi_path))
    notes: list[dict[str, int | float | str]] = []

    for instrument in midi.instruments:
        for note in instrument.notes:
            lane = _preview_lane_for_pitch(int(note.pitch), instrument.is_drum)
            if allowed_lanes and lane not in allowed_lanes:
                continue
            notes.append(
                {
                    "pitch": int(note.pitch),
                    "velocity": int(note.velocity),
                    "start": float(note.start),
                    "end": float(note.end),
                    "lane": lane,
                }
            )

    notes.sort(key=lambda item: (float(item["start"]), int(item["pitch"])))
    if limit is None:
        return notes
    return notes[:limit]


_CHORD_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

_CHORD_TEMPLATES: list[tuple[str, tuple[int, ...], float, tuple[int, ...]]] = [
    ("", (0, 4, 7), 1.0, (11, 2, 9)),
    ("m", (0, 3, 7), 1.0, (10, 2, 9)),
    ("7", (0, 4, 7, 10), 1.04, (2, 9)),
    ("maj7", (0, 4, 7, 11), 1.06, (2, 9)),
    ("m7", (0, 3, 7, 10), 1.04, (2, 5, 9)),
    ("m(maj7)", (0, 3, 7, 11), 1.05, (2, 9)),
    ("m7b5", (0, 3, 6, 10), 1.08, (2, 8)),
    ("dim", (0, 3, 6), 1.02, (9,)),
    ("dim7", (0, 3, 6, 9), 1.08, ()),
    ("aug", (0, 4, 8), 1.03, (2, 10)),
    ("sus2", (0, 2, 7), 1.0, (9, 10)),
    ("sus4", (0, 5, 7), 1.0, (2, 9, 10)),
    ("6", (0, 4, 7, 9), 1.02, (2,)),
    ("m6", (0, 3, 7, 9), 1.02, (2, 10)),
]


def _midi_non_drum_notes(
    midi: pretty_midi.PrettyMIDI,
) -> list[pretty_midi.Note]:
    notes: list[pretty_midi.Note] = []
    for instrument in midi.instruments:
        if instrument.is_drum:
            continue
        notes.extend(instrument.notes)
    notes.sort(key=lambda note: (float(note.start), int(note.pitch)))
    return notes


def _pitch_class_energy_for_window(
    notes: list[pretty_midi.Note],
    start_sec: float,
    end_sec: float,
) -> np.ndarray:
    energy = np.zeros(12, dtype=np.float64)
    window_duration = max(1e-6, end_sec - start_sec)

    for note in notes:
        overlap_start = max(float(note.start), start_sec)
        overlap_end = min(float(note.end), end_sec)
        overlap = overlap_end - overlap_start
        if overlap <= 0:
            continue

        overlap_ratio = overlap / window_duration
        velocity_weight = max(0.18, float(note.velocity) / 127.0)
        duration_weight = max(0.05, overlap)
        energy[int(note.pitch) % 12] += overlap_ratio * velocity_weight * duration_weight

    return energy


def _detect_chord_from_energy(
    energy: np.ndarray,
) -> tuple[str | None, float]:
    total_energy = float(np.sum(energy))
    if total_energy <= 1e-9:
        return None, 0.0

    best_label: str | None = None
    best_score = -1e9
    second_score = -1e9

    for root in range(12):
        for suffix, intervals, template_weight, optional in _CHORD_TEMPLATES:
            template_pcs = {(root + interval) % 12 for interval in intervals}
            optional_pcs = {(root + interval) % 12 for interval in optional}

            template_hits = float(sum(float(energy[pc]) for pc in template_pcs))
            optional_hits = float(sum(float(energy[pc]) for pc in optional_pcs))
            non_template_hits = float(
                sum(
                    float(energy[pc])
                    for pc in range(12)
                    if pc not in template_pcs and pc not in optional_pcs
                )
            )

            coverage = template_hits / (total_energy + 1e-9)
            optional_coverage = optional_hits / (total_energy + 1e-9)
            spill = non_template_hits / (total_energy + 1e-9)

            score = (
                (coverage * 1.3)
                + (optional_coverage * 0.35)
                - (spill * 1.05)
                + (template_weight * 0.22)
            )

            root_energy = float(energy[root]) / (total_energy + 1e-9)
            score += root_energy * 0.25

            if score > best_score:
                second_score = best_score
                best_score = score
                best_label = f"{_CHORD_NAMES[root]}{suffix}"
            elif score > second_score:
                second_score = score

    if best_label is None:
        return None, 0.0

    confidence = max(0.0, min(1.0, 0.45 + (best_score - second_score) * 0.8))
    return best_label, float(confidence)


def _extract_chord_events_from_midi(
    midi_path: Path,
    max_events: int = 32,
) -> tuple[list[dict[str, float | str]], list[str]]:
    midi = pretty_midi.PrettyMIDI(str(midi_path))
    notes = _midi_non_drum_notes(midi)
    if not notes:
        return [], []

    last_note_end = max(float(note.end) for note in notes)
    if last_note_end <= 0:
        return [], []

    try:
        tempo = float(midi.estimate_tempo())
    except Exception:
        tempo = 120.0
    tempo = max(40.0, min(220.0, tempo))
    beat_sec = 60.0 / tempo
    min_event_len = max(0.18, beat_sec * 0.35)

    boundary_candidates = sorted({0.0, *(float(note.start) for note in notes), last_note_end})
    merged_boundaries: list[float] = []
    for boundary in boundary_candidates:
        if not merged_boundaries:
            merged_boundaries.append(boundary)
            continue
        if boundary - merged_boundaries[-1] < min_event_len * 0.7:
            continue
        merged_boundaries.append(boundary)

    if merged_boundaries[-1] < last_note_end:
        merged_boundaries.append(last_note_end)

    events: list[dict[str, float | str]] = []

    for index in range(len(merged_boundaries) - 1):
        start_sec = merged_boundaries[index]
        end_sec = merged_boundaries[index + 1]
        if end_sec - start_sec < min_event_len * 0.6:
            continue

        energy = _pitch_class_energy_for_window(notes, start_sec, end_sec)
        label, confidence = _detect_chord_from_energy(energy)
        if not label or confidence < 0.28:
            continue

        if events and events[-1]["label"] == label:
            events[-1]["end"] = round(end_sec, 3)
            events[-1]["confidence"] = round(
                max(float(events[-1]["confidence"]), confidence),
                3,
            )
            continue

        events.append(
            {
                "label": label,
                "start": round(start_sec, 3),
                "end": round(end_sec, 3),
                "confidence": round(confidence, 3),
            }
        )

        if len(events) >= max_events:
            break

    progression = [str(event["label"]) for event in events]
    return events, progression


def _estimate_midi_bpm_key(midi_path: Path) -> tuple[float, str, float, float]:
    note_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    major_intervals = (0, 2, 4, 5, 7, 9, 11)
    minor_intervals = (0, 2, 3, 5, 7, 8, 10)

    midi = pretty_midi.PrettyMIDI(str(midi_path))

    tempo_changes = midi.get_tempo_changes()[1]
    if len(tempo_changes) > 0:
        bpm = float(np.median(tempo_changes))
        bpm_confidence = 0.85
    else:
        try:
            bpm = float(midi.estimate_tempo())
            bpm_confidence = 0.6
        except Exception:
            bpm = 120.0
            bpm_confidence = 0.2
    bpm = float(max(40.0, min(260.0, bpm)))

    pitch_histogram = np.zeros(12, dtype=np.float64)
    total_weight = 0.0
    for instrument in midi.instruments:
        if instrument.is_drum:
            continue
        for note in instrument.notes:
            duration = max(0.05, float(note.end - note.start))
            weight = duration * max(0.2, float(note.velocity) / 127.0)
            pitch_histogram[int(note.pitch) % 12] += weight
            total_weight += weight

    if total_weight <= 0:
        return bpm, "C major", bpm_confidence, 0.2

    best_root = 0
    best_mode = "major"
    best_score = -1.0
    for root in range(12):
        major_score = float(sum(pitch_histogram[(root + interval) % 12] for interval in major_intervals))
        minor_score = float(sum(pitch_histogram[(root + interval) % 12] for interval in minor_intervals))
        if major_score > best_score:
            best_score = major_score
            best_root = root
            best_mode = "major"
        if minor_score > best_score:
            best_score = minor_score
            best_root = root
            best_mode = "minor"

    key_confidence = float(max(0.2, min(1.0, best_score / (total_weight + 1e-9))))
    return bpm, f"{note_names[best_root]} {best_mode}", bpm_confidence, key_confidence


async def process_project(
    project_id: str,
    user_id: str,
    file_name: str,
    raw_bytes: bytes,
    content_type: str,
    feature: Literal["extraction", "variation"],
    extract_targets: list[str],
    variation_target: Literal["melody", "chord", "bass", "full"],
    is_midi_input: bool,
) -> None:
    repository = Repository()
    storage = StorageService()
    repository.set_project_processing(project_id)
    repository.set_project_progress(project_id, 12, "Queued for processing")

    with tempfile.TemporaryDirectory(prefix="keytone_") as temp_dir:
        temp_path = Path(temp_dir)
        input_audio = temp_path / file_name
        input_audio.write_bytes(raw_bytes)

        try:
            should_analyze_audio = (feature == "variation") and (not is_midi_input)
            if should_analyze_audio:
                repository.set_project_progress(project_id, 20, "Analyzing audio")
                analysis = await asyncio.to_thread(estimate_bpm_and_key, str(input_audio))
                chord_suggestions = suggest_chords(analysis.key)
            elif feature == "variation" and is_midi_input:
                repository.set_project_progress(project_id, 20, "Analyzing MIDI")
                bpm, key, bpm_conf, key_conf = await asyncio.to_thread(_estimate_midi_bpm_key, input_audio)
                analysis = SimpleNamespace(
                    bpm=bpm,
                    key=key,
                    bpm_confidence=bpm_conf,
                    key_confidence=key_conf,
                )
                chord_suggestions = suggest_chords(key)
            else:
                analysis = None
                chord_suggestions = []
            separation_result: StemSeparationResult | None = None
            separated_stems: dict[str, Path] | None = None
            instrument_detection: InstrumentDetectionResult | None = None
            separation_error: str | None = None
            separation_skipped_reason: str | None = None
            transcribed_targets: dict[str, Path] = {}
            midi_confidence: dict[str, float] = {}
            target_quality: dict[str, dict[str, float | bool]] = {}
            should_separate = False
            if not is_midi_input:
                should_separate = feature == "extraction" or (feature == "variation" and variation_target != "full")
                if feature == "extraction":
                    requested_stems = {value.strip().lower() for value in extract_targets if value.strip()}
                    if requested_stems == {"other"}:
                        should_separate = False
                        separation_skipped_reason = "only_other_selected"

            if should_separate:
                repository.set_project_progress(project_id, 30, "Separating stems")
                try:
                    selected_model = _select_separation_model(feature, extract_targets)
                    separation_result = await asyncio.to_thread(
                        separate_audio_stems,
                        input_audio,
                        temp_path / "separated",
                        selected_model,
                        "cpu",
                    )
                    separated_stems = separation_result.stem_paths
                    if feature == "extraction" and extract_targets:
                        selected_stems = set(extract_targets)
                        filtered_stems = {
                            stem_name: stem_path
                            for stem_name, stem_path in separated_stems.items()
                            if stem_name in selected_stems
                        }
                        if filtered_stems:
                            separated_stems = filtered_stems
                            separation_result = StemSeparationResult(
                                model_name=separation_result.model_name,
                                requested_device=separation_result.requested_device,
                                used_device=separation_result.used_device,
                                stem_paths=filtered_stems,
                                stem_metadata={
                                    stem_name: metadata
                                    for stem_name, metadata in separation_result.stem_metadata.items()
                                    if stem_name in filtered_stems
                                },
                            )
                    if separated_stems and feature != "extraction":
                        repository.set_project_progress(project_id, 40, "Detecting instruments")
                        instrument_detection = await asyncio.to_thread(detect_instruments_from_stems, separated_stems)
                except Exception as exc:
                    separation_error = str(exc)
                    separation_result = None
                    separated_stems = None
                    instrument_detection = None
            elif not is_midi_input and feature == "variation" and variation_target == "full":
                separation_skipped_reason = "variation_full_target"

            if feature == "extraction":
                if not separated_stems:
                    separated_stems = {"other": input_audio}

                repository.set_project_progress(project_id, 45, "Exporting stems to MP3")
                stem_audio_urls: dict[str, str] = {}
                for stem_name, stem_path in separated_stems.items():
                    if stem_path.suffix.lower() == ".mp3":
                        mp3_path = stem_path
                    else:
                        mp3_path = await asyncio.to_thread(
                            _wav_to_mp3,
                            stem_path,
                            temp_path / "stems_mp3" / f"{stem_name}.mp3",
                        )
                    stem_audio_urls[stem_name] = storage.upload_audio(
                        f"{user_id}/{project_id}/stems/{stem_name}.mp3",
                        mp3_path,
                        "audio/mpeg",
                    )

                repository.set_project_progress(project_id, 70, "Saving stem metadata")
                source_audio_url = storage.upload_audio(
                    f"{user_id}/{project_id}/source/{file_name}",
                    input_audio,
                    content_type or "application/octet-stream",
                )

                analysis_payload = {
                    "bpm": analysis.bpm if analysis else 0.0,
                    "key": analysis.key if analysis else "Unknown",
                    "chord_suggestions": chord_suggestions,
                    "detected_instruments": instrument_detection.detected_instruments if instrument_detection else [],
                    "midi_confidence": {},
                    "target_quality": {},
                    "separation": {
                        "model": separation_result.model_name,
                        "requested_device": separation_result.requested_device,
                        "used_device": separation_result.used_device,
                        "stems": list(separation_result.stem_paths.keys()),
                        "metadata": separation_result.stem_metadata,
                    } if separation_result else {
                        "model": "skipped" if separation_skipped_reason else "fallback",
                        "requested_device": "cpu",
                        "used_device": "cpu" if separation_skipped_reason else "failed",
                        "stems": ["other"],
                        "metadata": {
                            "other": {
                                "path": str(input_audio),
                                "source_model": "fallback",
                                "requested_device": "cpu",
                                "used_device": "cpu" if separation_skipped_reason else "failed",
                                "error": separation_error or separation_skipped_reason or "unknown",
                            }
                        },
                    },
                    "confidence": {
                        "bpm": analysis.bpm_confidence if analysis else 0.0,
                        "key": analysis.key_confidence if analysis else 0.0,
                    },
                }

                analysis_json_url = storage.upload_analysis(
                    f"{user_id}/{project_id}/analysis/result.json",
                    analysis_payload,
                )

                assets_payload = {
                    "source_audio_url": source_audio_url,
                    "midi_base_url": None,
                    "midi_variation_urls": [],
                    "analysis_json_url": analysis_json_url,
                    "midi_stem_urls": {},
                    "midi_preview_notes": [],
                    "stem_audio_urls": stem_audio_urls,
                }

                repository.set_project_progress(project_id, 98, "Finalizing stems")
                repository.complete_project(project_id, analysis_payload, assets_payload)
                repository.set_project_progress(project_id, 100, "Stems ready")
                return

            midi_dir = temp_path / "midi"
            if is_midi_input:
                base_midi = midi_dir / "base.mid"
                base_midi.parent.mkdir(parents=True, exist_ok=True)
                base_midi.write_bytes(raw_bytes)
            elif feature == "extraction":
                for target in extract_targets:
                    repository.set_project_progress(project_id, 48, f"Transcribing {target}")
                    source_audio = _target_audio_with_detection(
                        target=target,
                        stems=separated_stems,
                        detection=instrument_detection,
                        fallback_audio=input_audio,
                        output_path=midi_dir / "extraction" / target / f"{Path(file_name).stem}_{target}_mix.wav",
                    )
                    if target == "chord":
                        source_audio = await asyncio.to_thread(
                            preprocess_harmonic_audio,
                            source_audio,
                            midi_dir / "extraction" / target / f"{Path(file_name).stem}_chord_harmonic.wav",
                        )
                    elif target == "melody":
                        source_audio = await asyncio.to_thread(
                            preprocess_harmonic_audio,
                            source_audio,
                            midi_dir / "extraction" / target / f"{Path(file_name).stem}_melody_harmonic.wav",
                        )
                    elif target in {"piano", "guitar"}:
                        source_audio = await asyncio.to_thread(
                            preprocess_harmonic_audio,
                            source_audio,
                            midi_dir / "extraction" / target / f"{Path(file_name).stem}_{target}_harmonic.wav",
                        )
                    raw_target_midi = await asyncio.to_thread(
                        transcribe_to_midi,
                        source_audio,
                        midi_dir / "extraction" / target / "raw",
                    )
                    transcription_confidence = await asyncio.to_thread(
                        evaluate_transcription_confidence,
                        raw_target_midi,
                    )

                    if target in {"piano", "guitar"}:
                        stem_metrics = await asyncio.to_thread(analyze_stem_audio_quality, source_audio)
                        quality = await asyncio.to_thread(
                            score_target_stem_quality,
                            stem_metrics,
                            transcription_confidence,
                        )
                        target_quality[target] = {
                            "rms_energy": quality.rms_energy,
                            "harmonic_ratio": quality.harmonic_ratio,
                            "onset_density": quality.onset_density,
                            "sustained_ratio": quality.sustained_ratio,
                            "quality_score": quality.quality_score,
                            "transcription_confidence": quality.transcription_confidence,
                            "passed": quality.passed,
                        }

                        if not quality.passed:
                            continue

                    if target == "chord":
                        target_midi = await asyncio.to_thread(
                            cleanup_chord_midi,
                            raw_target_midi,
                            midi_dir / "extraction" / target / "clean_chord.mid",
                        )
                    else:
                        target_midi = raw_target_midi
                    transcribed_targets[target] = target_midi
                    midi_confidence[target] = transcription_confidence

                if "chord" not in transcribed_targets:
                    chord_source = _target_audio_with_detection(
                        target="chord",
                        stems=separated_stems,
                        detection=instrument_detection,
                        fallback_audio=input_audio,
                        output_path=midi_dir / "extraction" / "chord" / f"{Path(file_name).stem}_chord_mix.wav",
                    )
                    chord_source = await asyncio.to_thread(
                        preprocess_harmonic_audio,
                        chord_source,
                        midi_dir / "extraction" / "chord" / f"{Path(file_name).stem}_chord_fallback_harmonic.wav",
                    )
                    chord_raw = await asyncio.to_thread(
                        transcribe_to_midi,
                        chord_source,
                        midi_dir / "extraction" / "chord" / "raw_fallback",
                    )
                    chord_clean = await asyncio.to_thread(
                        cleanup_chord_midi,
                        chord_raw,
                        midi_dir / "extraction" / "chord" / "clean_chord_fallback.mid",
                    )
                    transcribed_targets["chord"] = chord_clean
                    midi_confidence["chord"] = await asyncio.to_thread(
                        evaluate_transcription_confidence,
                        chord_clean,
                    )

                if not transcribed_targets:
                    raise RuntimeError("No extraction targets could be transcribed")

                preferred_order = ["melody", "chord", "piano", "guitar", "bass"]
                preferred_target = next((target for target in preferred_order if target in transcribed_targets), extract_targets[0])
                base_midi = transcribed_targets[preferred_target]
            else:
                repository.set_project_progress(project_id, 55, "Transcribing target")
                transcription_source = (
                    _target_audio_with_detection(
                        target=variation_target,
                        stems=separated_stems,
                        detection=instrument_detection,
                        fallback_audio=input_audio,
                        output_path=midi_dir / "variation" / f"{Path(file_name).stem}_{variation_target}_mix.wav",
                    )
                    if variation_target != "full"
                    else input_audio
                )
                if variation_target == "chord" and separated_stems:
                    transcription_source = await asyncio.to_thread(
                        preprocess_harmonic_audio,
                        transcription_source,
                        midi_dir / "variation" / f"{Path(file_name).stem}_chord_harmonic.wav",
                    )
                base_midi = await asyncio.to_thread(transcribe_to_midi, transcription_source, midi_dir)
                if variation_target == "chord":
                    base_midi = await asyncio.to_thread(
                        cleanup_chord_midi,
                        base_midi,
                        midi_dir / "variation" / "clean_chord.mid",
                    )
                midi_confidence[variation_target] = await asyncio.to_thread(
                    evaluate_transcription_confidence,
                    base_midi,
                )

            analysis_key_name = analysis.key if analysis else "C major"
            variation_paths: list[Path] = []
            if feature == "extraction":
                repository.set_project_progress(project_id, 70, "Generating variations")
                variation_paths = await asyncio.to_thread(
                    create_variations,
                    base_midi,
                    midi_dir / "variations",
                    analysis_key_name,
                    variation_target,
                )
            else:
                repository.set_project_progress(project_id, 70, "Preparing original MIDI")

            detected_chord_events: list[dict[str, float | str]] = []
            detected_chord_progression: list[str] = []
            if feature == "variation":
                detected_chord_events, detected_chord_progression = await asyncio.to_thread(
                    _extract_chord_events_from_midi,
                    base_midi,
                )

            analyzed_notes = await asyncio.to_thread(_analyze_midi_lanes, base_midi)

            stem_paths: dict[str, Path] = {}
            if feature == "extraction":
                repository.set_project_progress(project_id, 80, "Building output stems")
                if transcribed_targets:
                    stem_paths = {
                        target: path
                        for target, path in transcribed_targets.items()
                        if target in set(extract_targets) | {"chord"}
                    }
                else:
                    stem_paths = await asyncio.to_thread(_extract_stem_midis, analyzed_notes, midi_dir / "stems", extract_targets)

            if feature == "extraction":
                allowed_preview_lanes = set(extract_targets) | {"chord"}
            else:
                allowed_preview_lanes = {variation_target} if variation_target != "full" else {"melody", "chord", "bass"}

            if feature == "extraction" and stem_paths:
                preview_notes = await asyncio.to_thread(_collect_preview_notes_from_target_midis, stem_paths, allowed_preview_lanes)
            elif feature == "variation" and is_midi_input:
                preview_notes = await asyncio.to_thread(
                    _collect_exact_midi_preview_notes,
                    base_midi,
                    None,
                    None,
                )
            else:
                preview_notes = await asyncio.to_thread(_collect_preview_notes, analyzed_notes, allowed_preview_lanes)

            audio_key = f"{user_id}/{project_id}/source/{file_name}"
            base_midi_key = f"{user_id}/{project_id}/midi/base.mid"
            variation_keys = [f"{user_id}/{project_id}/midi/variation_{idx + 1}.mid" for idx in range(3)]
            analysis_key = f"{user_id}/{project_id}/analysis/result.json"

            source_audio_url = None
            stem_audio_urls: dict[str, str] | None = None
            if not is_midi_input:
                repository.set_project_progress(project_id, 88, "Uploading source audio")
                source_audio_url = storage.upload_audio(audio_key, input_audio, content_type or "application/octet-stream")
                if separation_result:
                    stem_audio_urls = {}
                    for stem_name, stem_path in separation_result.stem_paths.items():
                        stem_audio_urls[stem_name] = storage.upload_audio(
                            f"{user_id}/{project_id}/stems/{stem_name}.wav",
                            stem_path,
                            "audio/wav",
                        )
            repository.set_project_progress(project_id, 92, "Uploading MIDI outputs")
            midi_base_url = storage.upload_midi(base_midi_key, base_midi)
            variation_urls = [
                storage.upload_midi(key, path) for key, path in zip(variation_keys, variation_paths)
            ]

            stem_urls: dict[str, str] | None = None
            if stem_paths:
                stem_urls = {
                    target: storage.upload_midi(f"{user_id}/{project_id}/midi/stems/{target}.mid", path)
                    for target, path in stem_paths.items()
                }

            analysis_payload = {
                "bpm": analysis.bpm if analysis else 0.0,
                "key": analysis.key if analysis else "Unknown",
                "chord_suggestions": chord_suggestions,
                "detected_chord_events": detected_chord_events,
                "detected_chord_progression": detected_chord_progression,
                "altered_chord_events": [],
                "altered_chord_progression": [],
                "detected_instruments": instrument_detection.detected_instruments if instrument_detection else [],
                "midi_confidence": midi_confidence,
                "target_quality": target_quality,
                "separation": {
                    "model": separation_result.model_name,
                    "requested_device": separation_result.requested_device,
                    "used_device": separation_result.used_device,
                    "stems": list(separation_result.stem_paths.keys()),
                    "metadata": separation_result.stem_metadata,
                } if separation_result else None,
                "confidence": {
                    "bpm": analysis.bpm_confidence if analysis else 0.0,
                    "key": analysis.key_confidence if analysis else 0.0
                }
            }
            analysis_json_url = storage.upload_analysis(analysis_key, analysis_payload)

            assets_payload = {
                "source_audio_url": source_audio_url,
                "midi_base_url": midi_base_url,
                "altered_midi_url": None,
                "midi_variation_urls": variation_urls,
                "analysis_json_url": analysis_json_url,
                "midi_stem_urls": stem_urls,
                "midi_preview_notes": preview_notes,
                "original_midi_preview_notes": preview_notes if feature == "variation" else [],
                "altered_midi_preview_notes": [],
                "stem_audio_urls": stem_audio_urls,
            }

            repository.set_project_progress(project_id, 98, "Finalizing project")
            repository.complete_project(project_id, analysis_payload, assets_payload)
            repository.set_project_progress(project_id, 100, "Completed")
        except Exception as exc:
            repository.set_project_progress(project_id, 100, "Failed")
            repository.fail_project(project_id, str(exc))
            repository.refund_credit(user_id, "processing_failed")


async def generate_midi_from_stem(
    project_id: str,
    user_id: str,
    target: Literal["melody", "chord", "bass", "piano", "guitar"],
) -> None:
    repository = Repository()
    storage = StorageService()

    project = repository.get_project(project_id, user_id)
    if not project or not project.assets:
        raise RuntimeError("Project assets not found")

    stem_audio_urls = project.assets.stem_audio_urls or {}
    stem_map = {
        "bass": ["bass"],
        "melody": ["vocals", "other"],
        "chord": ["other", "piano", "guitar"],
        "piano": ["piano", "other"],
        "guitar": ["guitar", "other"],
    }

    source_url = next(
        (stem_audio_urls.get(stem_name) for stem_name in stem_map[target] if stem_audio_urls.get(stem_name)),
        None,
    )
    if not source_url:
        raise RuntimeError(f"No stem audio available for {target}")

    repository.set_project_processing(project_id)
    repository.set_project_progress(project_id, 45, f"Generating {target} MIDI")

    with tempfile.TemporaryDirectory(prefix="keytone_stem_midi_") as temp_dir:
        temp_path = Path(temp_dir)
        source_audio = await asyncio.to_thread(
            _download_file_to_path,
            source_url,
            temp_path / f"{target}_source.mp3",
        )

        if target in {"chord", "melody", "piano", "guitar"}:
            source_audio = await asyncio.to_thread(
                preprocess_harmonic_audio,
                source_audio,
                temp_path / f"{target}_harmonic.wav",
            )

        raw_midi = await asyncio.to_thread(
            transcribe_to_midi,
            source_audio,
            temp_path / "midi" / target / "raw",
        )

        if target == "chord":
            output_midi = await asyncio.to_thread(
                cleanup_chord_midi,
                raw_midi,
                temp_path / "midi" / target / "clean_chord.mid",
            )
        else:
            output_midi = raw_midi

        transcription_confidence = await asyncio.to_thread(
            evaluate_transcription_confidence,
            output_midi,
        )

        if target in {"piano", "guitar"}:
            stem_metrics = await asyncio.to_thread(analyze_stem_audio_quality, source_audio)
            quality = await asyncio.to_thread(score_target_stem_quality, stem_metrics, transcription_confidence)
            if not quality.passed:
                raise RuntimeError(f"{target} stem quality below threshold; skipped MIDI generation")

        repository.set_project_progress(project_id, 80, "Uploading generated MIDI")
        midi_url = storage.upload_midi(
            f"{user_id}/{project_id}/midi/stems_generated/{target}.mid",
            output_midi,
        )

        assets = project.assets.model_dump(mode="python")
        midi_stem_urls = dict(assets.get("midi_stem_urls") or {})
        midi_stem_urls[target] = midi_url
        assets["midi_stem_urls"] = midi_stem_urls

        generated_preview_notes = await asyncio.to_thread(
            _collect_preview_notes_from_target_midis,
            {target: output_midi},
            {target},
            240,
        )
        existing_preview_notes = [
            note
            for note in list(assets.get("midi_preview_notes") or [])
            if isinstance(note, dict) and str(note.get("lane", "")) != target
        ]
        merged_preview_notes = existing_preview_notes + generated_preview_notes
        merged_preview_notes.sort(key=lambda item: float(item.get("start", 0.0)))
        assets["midi_preview_notes"] = merged_preview_notes[:240]

        analysis = project.analysis.model_dump(mode="python") if project.analysis else {
            "bpm": 0.0,
            "key": "Unknown",
            "chord_suggestions": [],
            "detected_instruments": [],
            "midi_confidence": {},
            "target_quality": {},
            "separation": None,
            "confidence": {"bpm": 0.0, "key": 0.0},
        }
        midi_conf = dict(analysis.get("midi_confidence") or {})
        midi_conf[target] = float(transcription_confidence)
        analysis["midi_confidence"] = midi_conf

        repository.complete_project(project_id, analysis, assets)
        repository.set_project_progress(project_id, 100, f"{target} MIDI ready")


async def process_track_starter_project(
    project_id: str,
    user_id: str,
    genre: str,
    mood: str,
    bpm: float,
    key: str | None,
    complexity: Literal["simple", "medium", "complex"],
    bars: Literal[8, 16],
    reference_description: str,
    variant: Literal["safe", "fresh", "experimental"],
    seed: int | None = None,
) -> None:
    repository = Repository()
    storage = StorageService()

    repository.set_project_processing(project_id)
    repository.set_project_progress(project_id, 20, f"Composing {variant} idea")

    with tempfile.TemporaryDirectory(prefix="keytone_track_starter_") as temp_dir:
        temp_path = Path(temp_dir)
        try:
            render = await asyncio.to_thread(
                generate_track_starter_idea,
                output_dir=temp_path / "starter",
                genre=genre,
                mood=mood,
                bpm=bpm,
                key=key,
                complexity=complexity,
                bars=bars,
                reference_description=reference_description,
                variant=variant,
                seed=seed,
            )

            repository.set_project_progress(project_id, 72, "Uploading MIDI stems")
            paths = render["paths"]
            full_url = storage.upload_midi(
                f"{user_id}/{project_id}/starter/{variant}/idea.mid",
                paths["full"],
            )

            midi_stem_urls = {
                "chords": storage.upload_midi(
                    f"{user_id}/{project_id}/starter/{variant}/chords.mid",
                    paths["chords"],
                ),
            }

            repository.set_project_progress(project_id, 84, "Saving analysis")
            chord_labels = [str(item) for item in render["chord_labels"]]
            analysis_payload = {
                "bpm": float(render["bpm"]),
                "key": str(render["normalized_key"]),
                "chord_suggestions": chord_labels[:8],
                "detected_instruments": ["chords"],
                "midi_confidence": {
                    "chords": 0.98,
                },
                "target_quality": {},
                "separation": None,
                "confidence": {
                    "bpm": 1.0,
                    "key": 0.95,
                },
            }
            analysis_json_url = storage.upload_analysis(
                f"{user_id}/{project_id}/analysis/starter_{variant}.json",
                {
                    **analysis_payload,
                    "starter_explanation": render["explanation"],
                    "starter_variant": render["variant"],
                    "starter_genre": render["normalized_genre"],
                    "starter_mood": render["normalized_mood"],
                    "starter_complexity": render["complexity"],
                    "starter_bars": render["bars"],
                    "starter_instrument_target": render["instrument_target"],
                    "starter_generation_backend": render["generation_backend"],
                    "starter_candidate_summary": render["candidate_summary"],
                },
            )

            assets_payload = {
                "source_audio_url": None,
                "midi_base_url": full_url,
                "altered_midi_url": None,
                "midi_variation_urls": [],
                "analysis_json_url": analysis_json_url,
                "midi_stem_urls": midi_stem_urls,
                "midi_preview_notes": render["preview_notes"],
                "original_midi_preview_notes": render["preview_notes"],
                "altered_midi_preview_notes": [],
                "stem_audio_urls": None,
            }

            project = repository.get_project(project_id, user_id)
            options = dict(project.options or {}) if project else {}
            options["starter_genre"] = render["normalized_genre"]
            options["starter_mood"] = render["normalized_mood"]
            options["starter_complexity"] = render["complexity"]
            options["starter_bars"] = render["bars"]
            options["starter_variant"] = render["variant"]
            options["starter_explanation"] = render["explanation"]
            options["starter_instrument_target"] = render["instrument_target"]
            options["starter_generation_backend"] = render["generation_backend"]
            options["starter_candidate_summary"] = render["candidate_summary"]
            options["starter_reference_description"] = reference_description
            options["variation_key"] = render["normalized_key"]
            options["variation_bpm"] = float(render["bpm"])

            repository.set_project_progress(project_id, 97, "Finalizing starter")
            repository.complete_project(project_id, analysis_payload, assets_payload)
            repository.set_project_options(project_id, options)
            repository.set_project_progress(project_id, 100, "Track starter ready")
        except Exception as exc:
            repository.set_project_progress(project_id, 100, "Starter generation failed")
            repository.fail_project(project_id, str(exc))


async def alter_variation_midi(
    project_id: str,
    user_id: str,
    target: Literal["melody", "chord", "bass", "full"],
    key: str,
    bpm: float | None,
    intent: Literal[
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
    ] = "richer",
    variation_strength: float | None = None,
    preserve_identity: float | None = None,
    lane_move: str = "auto",
    style: Literal["auto", "lift", "groove", "cinematic"] = "auto",
    creativity: float | None = None,
) -> None:
    repository = Repository()
    storage = StorageService()

    project = repository.get_project(project_id, user_id)
    if not project or not project.assets:
        raise RuntimeError("Project assets not found")
    if project.feature != "variation":
        raise RuntimeError("Alter is only available for variation projects")

    base_midi_url = project.assets.midi_base_url
    if not base_midi_url:
        raise RuntimeError("Base MIDI not found for variation project")

    options = dict(project.options or {})
    raw_alter_count = options.get("variation_alter_count", 0)
    try:
        previous_alter_count = int(raw_alter_count)
    except (TypeError, ValueError):
        previous_alter_count = 0
    alter_count = max(0, previous_alter_count) + 1
    alter_seed = secrets.randbelow(2_147_483_647) + 1

    repository.set_project_processing(project_id)
    repository.set_project_progress(project_id, 45, f"Altering {target} MIDI ({intent})")

    with tempfile.TemporaryDirectory(prefix="keytone_variation_alter_") as temp_dir:
        temp_path = Path(temp_dir)
        base_midi_path = await asyncio.to_thread(
            _download_file_to_path,
            base_midi_url,
            temp_path / "base.mid",
        )

        alter_render = await asyncio.to_thread(
            alter_midi,
            base_midi_path,
            temp_path / "altered" / f"{target}.mid",
            key,
            target,
            bpm,
            alter_count,
            alter_seed,
            style,
            creativity,
            intent,
            variation_strength,
            preserve_identity,
            lane_move,
        )
        altered_midi_path = alter_render["best_path"]

        repository.set_project_progress(project_id, 80, "Uploading altered MIDI")
        altered_url = storage.upload_midi(
            f"{user_id}/{project_id}/midi/altered/{target}.mid",
            altered_midi_path,
        )

        candidate_urls: list[str] = []
        candidate_paths = list(alter_render.get("candidate_paths") or [])
        candidate_profiles = list(alter_render.get("candidate_profiles") or [])
        for idx, candidate_path in enumerate(candidate_paths):
            profile = (
                candidate_profiles[idx]
                if idx < len(candidate_profiles)
                else f"candidate_{idx + 1}"
            )
            candidate_urls.append(
                storage.upload_midi(
                    f"{user_id}/{project_id}/midi/altered/{target}_{idx + 1}_{profile}.mid",
                    Path(candidate_path),
                )
            )

        base_notes = await asyncio.to_thread(
            _collect_exact_midi_preview_notes,
            base_midi_path,
            None,
            None,
        )
        altered_notes = await asyncio.to_thread(
            _collect_exact_midi_preview_notes,
            altered_midi_path,
            None,
            None,
        )
        original_chord_events, original_chord_progression = await asyncio.to_thread(
            _extract_chord_events_from_midi,
            base_midi_path,
        )
        altered_chord_events, altered_chord_progression = await asyncio.to_thread(
            _extract_chord_events_from_midi,
            altered_midi_path,
        )

        assets = project.assets.model_dump(mode="python")
        assets["altered_midi_url"] = altered_url
        assets["midi_variation_urls"] = candidate_urls
        assets["original_midi_preview_notes"] = base_notes
        assets["altered_midi_preview_notes"] = altered_notes
        assets["midi_preview_notes"] = altered_notes

        analysis = project.analysis.model_dump(mode="python") if project.analysis else {
            "bpm": 0.0,
            "key": key,
            "chord_suggestions": [],
            "detected_chord_events": [],
            "detected_chord_progression": [],
            "altered_chord_events": [],
            "altered_chord_progression": [],
            "detected_instruments": [],
            "midi_confidence": {},
            "target_quality": {},
            "separation": None,
            "confidence": {"bpm": 0.0, "key": 0.0},
        }
        analysis["key"] = key
        if bpm is not None:
            analysis["bpm"] = float(bpm)
        analysis["detected_chord_events"] = original_chord_events
        analysis["detected_chord_progression"] = original_chord_progression
        analysis["altered_chord_events"] = altered_chord_events
        analysis["altered_chord_progression"] = altered_chord_progression

        options["variation_target"] = target
        options["variation_key"] = key
        options["variation_intent"] = intent
        if variation_strength is not None:
            options["variation_strength"] = float(variation_strength)
        if preserve_identity is not None:
            options["variation_preserve_identity"] = float(preserve_identity)
        options["variation_lane_move"] = lane_move
        options["variation_candidate_labels"] = list(alter_render.get("candidate_labels") or [])
        options["variation_candidate_scores"] = [
            float(score) for score in list(alter_render.get("candidate_scores") or [])
        ]
        options["variation_best_label"] = str(alter_render.get("best_label") or "")
        options["variation_style"] = style
        if creativity is not None:
            options["variation_creativity"] = float(creativity)
        options["variation_alter_count"] = alter_count
        options["variation_alter_seed"] = alter_seed
        if bpm is not None:
            options["variation_bpm"] = float(bpm)

        repository.complete_project(project_id, analysis, assets)
        repository.set_project_progress(project_id, 100, "Altered MIDI ready")
        repository.set_project_options(project_id, options)
