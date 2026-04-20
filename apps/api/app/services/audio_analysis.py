from dataclasses import dataclass
from typing import Any
from typing import Literal

import librosa
import numpy as np


KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

ANALYSIS_SAMPLE_RATE = 22050
FAST_ANALYSIS_DURATION_SEC = 75.0
KEY_REFINEMENT_THRESHOLD = 0.58

MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


@dataclass
class AudioAnalysis:
    bpm: float
    bpm_confidence: float
    key: str
    key_confidence: float


def _clip(value: float, low: float, high: float) -> float:
    return float(max(low, min(high, value)))


def _round(value: float, digits: int = 3) -> float:
    return float(round(float(value), digits))


def _safe_corr(a: np.ndarray, b: np.ndarray) -> float:
    if a.size == 0 or b.size == 0:
        return 0.0
    a_std = float(np.std(a))
    b_std = float(np.std(b))
    if a_std <= 1e-10 or b_std <= 1e-10:
        return 0.0
    return float(np.corrcoef(a, b)[0, 1])


def _format_key(root: int, mode: Literal["major", "minor"]) -> str:
    return f"{KEY_NAMES[root % 12]} {mode}"


def _relative_key(root: int, mode: Literal["major", "minor"]) -> tuple[int, Literal["major", "minor"]]:
    if mode == "major":
        return (root + 9) % 12, "minor"
    return (root + 3) % 12, "major"


def _key_relation(
    best_root: int,
    best_mode: Literal["major", "minor"],
    alt_root: int,
    alt_mode: Literal["major", "minor"],
    rel_root: int,
    rel_mode: Literal["major", "minor"],
) -> Literal["relative", "parallel", "neighbor", "other"]:
    if alt_root == rel_root and alt_mode == rel_mode:
        return "relative"
    if alt_root == best_root and alt_mode != best_mode:
        return "parallel"
    diff = min((alt_root - best_root) % 12, (best_root - alt_root) % 12)
    if diff <= 2:
        return "neighbor"
    return "other"


def _score_keys(chroma_avg: np.ndarray) -> list[dict[str, Any]]:
    scores: list[dict[str, Any]] = []
    for idx, _name in enumerate(KEY_NAMES):
        major_score = _safe_corr(np.roll(MAJOR_PROFILE, idx), chroma_avg)
        minor_score = _safe_corr(np.roll(MINOR_PROFILE, idx), chroma_avg)
        scores.append(
            {
                "root": idx,
                "mode": "major",
                "score": float(major_score),
                "key": _format_key(idx, "major"),
            }
        )
        scores.append(
            {
                "root": idx,
                "mode": "minor",
                "score": float(minor_score),
                "key": _format_key(idx, "minor"),
            }
        )

    scores.sort(key=lambda item: float(item["score"]), reverse=True)
    return scores


def _estimate_bpm(onset_env: np.ndarray, sr: int, hop_length: int) -> tuple[float, float, np.ndarray, np.ndarray]:
    tempo_candidates = librosa.beat.tempo(onset_envelope=onset_env, sr=sr, hop_length=hop_length, aggregate=None)
    candidate_pool = [float(value) for value in tempo_candidates if 60 <= float(value) <= 190]
    start_bpm = float(np.median(candidate_pool)) if candidate_pool else 120.0

    tempo, beat_frames = librosa.beat.beat_track(
        onset_envelope=onset_env,
        sr=sr,
        hop_length=hop_length,
        start_bpm=start_bpm,
        tightness=110,
    )

    bpm = float(tempo)
    while bpm < 68:
        bpm *= 2
    while bpm > 190:
        bpm *= 0.5

    beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=hop_length)
    if beat_times.size < 3:
        return _round(bpm, 2), 0.15, beat_frames, beat_times

    intervals = np.diff(beat_times)
    median_interval = float(np.median(intervals)) if intervals.size else 0.0
    spread = float(np.std(intervals)) if intervals.size else 0.0
    regularity = _clip(1.0 - (spread / (median_interval + 1e-9)), 0.0, 1.0)

    max_onset = float(np.max(onset_env)) if onset_env.size else 0.0
    pulse_strength = 0.0
    if max_onset > 1e-8 and beat_frames.size > 0:
        pulse_strength = float(np.mean(onset_env[beat_frames])) / max_onset

    confidence = _clip(0.25 + 0.45 * regularity + 0.3 * pulse_strength, 0.05, 1.0)
    return _round(bpm, 2), _round(confidence, 3), beat_frames, beat_times


def _estimate_groove(
    onset_times: np.ndarray,
    bpm: float,
) -> Literal["tight", "swing", "humanized"]:
    if onset_times.size < 8 or bpm <= 0:
        return "humanized"

    beat_sec = 60.0 / bpm
    subdivisions = onset_times / beat_sec
    nearest_eighth = np.round(subdivisions * 2.0) / 2.0
    quant_error_sec = np.abs(subdivisions - nearest_eighth) * beat_sec
    mean_quant_error = float(np.mean(quant_error_sec)) if quant_error_sec.size else 0.0

    offbeat_mask = np.abs((subdivisions % 1.0) - 0.5) <= 0.2
    if np.any(offbeat_mask):
        offbeat_delay = float(np.mean(((subdivisions % 1.0)[offbeat_mask] - 0.5) * beat_sec))
    else:
        offbeat_delay = 0.0

    if offbeat_delay > beat_sec * 0.06 and mean_quant_error < beat_sec * 0.09:
        return "swing"
    if mean_quant_error < beat_sec * 0.03:
        return "tight"
    return "humanized"


def _estimate_energy_score(rms: np.ndarray) -> float:
    if rms.size == 0:
        return 0.0
    mean_rms = float(np.mean(rms))
    p95 = float(np.quantile(rms, 0.95))
    return _round(_clip((mean_rms * 2.5 + p95 * 1.9) * 100.0, 0.0, 100.0), 1)


def _classify_mood(mode: Literal["major", "minor"], energy_score: float) -> Literal["dark", "happy", "emotional", "energetic", "calm"]:
    if mode == "minor":
        if energy_score >= 72:
            return "energetic"
        if energy_score >= 45:
            return "emotional"
        return "dark"
    if energy_score >= 72:
        return "energetic"
    if energy_score >= 45:
        return "happy"
    return "calm"


def _best_chord_for_chroma(chroma_slice: np.ndarray) -> tuple[str, float]:
    best_label = "C"
    best_score = -1.0
    for root in range(12):
        major_score = (
            float(chroma_slice[root])
            + float(chroma_slice[(root + 4) % 12]) * 0.86
            + float(chroma_slice[(root + 7) % 12]) * 0.78
            + float(chroma_slice[(root + 11) % 12]) * 0.18
        )
        if major_score > best_score:
            best_score = major_score
            best_label = KEY_NAMES[root]

        minor_score = (
            float(chroma_slice[root])
            + float(chroma_slice[(root + 3) % 12]) * 0.86
            + float(chroma_slice[(root + 7) % 12]) * 0.78
            + float(chroma_slice[(root + 10) % 12]) * 0.18
        )
        if minor_score > best_score:
            best_score = minor_score
            best_label = f"{KEY_NAMES[root]}m"

    return best_label, float(best_score)


def _estimate_chord_progression(
    chroma_frames: np.ndarray,
    frame_times: np.ndarray,
    bpm: float,
    duration_sec: float,
) -> list[str]:
    if chroma_frames.size == 0 or bpm <= 0:
        return []

    bar_sec = (60.0 / bpm) * 4.0
    max_bars = max(1, min(16, int(duration_sec / bar_sec)))

    progression: list[str] = []
    for bar in range(max_bars):
        bar_start = bar * bar_sec
        bar_end = bar_start + bar_sec
        mask = (frame_times >= bar_start) & (frame_times < bar_end)
        if not np.any(mask):
            continue

        bar_chroma = np.mean(chroma_frames[:, mask], axis=1)
        chord, score = _best_chord_for_chroma(bar_chroma)
        if score < 0.23:
            continue
        if not progression or progression[-1] != chord:
            progression.append(chord)

    return progression[:8]


def _estimate_sections(
    rms: np.ndarray,
    duration_sec: float,
    sr: int,
    hop_length: int,
) -> list[dict[str, Any]]:
    if rms.size == 0 or duration_sec <= 1:
        return []

    frame_sec = float(hop_length) / float(sr)
    window_sec = 8.0
    window_frames = max(1, int(window_sec / frame_sec))

    window_energy: list[float] = []
    for start in range(0, int(rms.size), window_frames):
        window_energy.append(float(np.mean(rms[start : start + window_frames])))

    peak_window = int(np.argmax(window_energy)) if window_energy else 0
    peak_center_ratio = _clip(((peak_window + 0.5) * window_sec) / max(duration_sec, 1e-6), 0.4, 0.82)

    chorus_start = _clip(peak_center_ratio - 0.12, 0.38, 0.78) * duration_sec
    intro_end = min(duration_sec * 0.18, chorus_start * 0.55)
    verse_end = max(intro_end + duration_sec * 0.22, chorus_start)
    outro_start = max(chorus_start + duration_sec * 0.22, duration_sec * 0.84)

    sections: list[dict[str, Any]] = []

    def add_section(label: str, start_sec: float, end_sec: float) -> None:
        if end_sec - start_sec < 2:
            return
        start_idx = max(0, min(int((start_sec / duration_sec) * rms.size), int(rms.size) - 1))
        end_idx = max(start_idx + 1, min(int((end_sec / duration_sec) * rms.size), int(rms.size)))
        local_energy = float(np.mean(rms[start_idx:end_idx]))
        sections.append(
            {
                "label": label,
                "startSec": _round(start_sec, 2),
                "endSec": _round(end_sec, 2),
                "energy": _round(_clip(local_energy * 300.0, 0.0, 100.0), 1),
            }
        )

    add_section("intro", 0.0, intro_end)
    add_section("verse", intro_end, verse_end)
    add_section("chorus", verse_end, outro_start)

    if duration_sec - outro_start > 8 and duration_sec > 70:
        bridge_end = min(duration_sec - 6.0, outro_start + (duration_sec - outro_start) * 0.45)
        add_section("bridge", outro_start, bridge_end)
        add_section("outro", bridge_end, duration_sec)
    else:
        add_section("outro", outro_start, duration_sec)

    return sections


def analyze_track_insights(audio_path: str) -> dict[str, Any]:
    source_duration_sec = float(librosa.get_duration(path=audio_path))
    load_duration = min(source_duration_sec, FAST_ANALYSIS_DURATION_SEC)
    y, sr = librosa.load(
        audio_path,
        sr=ANALYSIS_SAMPLE_RATE,
        mono=True,
        duration=load_duration,
    )
    if y.size == 0:
        raise ValueError("Audio is empty")

    hop_length = 512

    onset_env = librosa.onset.onset_strength(
        y=y,
        sr=sr,
        hop_length=hop_length,
        aggregate=np.median,
    )
    bpm, bpm_confidence, _beat_frames, beat_times = _estimate_bpm(onset_env, sr, hop_length)

    y_harmonic = librosa.effects.harmonic(y, margin=4.0)
    chroma_cens = librosa.feature.chroma_cens(y=y_harmonic, sr=sr, hop_length=hop_length)
    chroma_stft = librosa.feature.chroma_stft(y=y_harmonic, sr=sr, hop_length=hop_length, n_fft=4096)
    frame_count = min(chroma_cens.shape[1], chroma_stft.shape[1])
    chroma_frames = (0.65 * chroma_cens[:, :frame_count]) + (0.35 * chroma_stft[:, :frame_count])
    chroma_avg = np.mean(chroma_frames, axis=1)
    key_scores = _score_keys(chroma_avg)

    best_key = key_scores[0]
    second_key = key_scores[1] if len(key_scores) > 1 else key_scores[0]
    best_root = int(best_key["root"])
    best_mode = str(best_key["mode"])

    key_confidence = _round(_clip(0.5 + (float(best_key["score"]) - float(second_key["score"])) * 0.75, 0.05, 1.0), 3)

    if key_confidence < KEY_REFINEMENT_THRESHOLD:
        chroma_cqt = librosa.feature.chroma_cqt(y=y_harmonic, sr=sr, hop_length=hop_length)
        refined_count = min(chroma_frames.shape[1], chroma_cqt.shape[1])
        refined_frames = (0.55 * chroma_frames[:, :refined_count]) + (0.45 * chroma_cqt[:, :refined_count])
        refined_avg = np.mean(refined_frames, axis=1)
        refined_scores = _score_keys(refined_avg)
        refined_best = refined_scores[0]
        refined_second = refined_scores[1] if len(refined_scores) > 1 else refined_scores[0]
        refined_confidence = _round(
            _clip(0.5 + (float(refined_best["score"]) - float(refined_second["score"])) * 0.75, 0.05, 1.0),
            3,
        )
        if refined_confidence >= key_confidence:
            key_scores = refined_scores
            best_key = refined_best
            second_key = refined_second
            best_root = int(best_key["root"])
            best_mode = str(best_key["mode"])
            key_confidence = refined_confidence

    rel_root, rel_mode = _relative_key(best_root, "major" if best_mode == "major" else "minor")
    relative_key = _format_key(rel_root, rel_mode)

    alternate_keys: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in key_scores[1:]:
        alt_key = str(item["key"])
        if alt_key in seen:
            continue
        seen.add(alt_key)
        alt_root = int(item["root"])
        alt_mode = "major" if str(item["mode"]) == "major" else "minor"
        alternate_keys.append(
            {
                "key": alt_key,
                "confidence": _round(_clip((float(item["score"]) + 1.0) / 2.0, 0.0, 1.0), 3),
                "relation": _key_relation(
                    best_root,
                    "major" if best_mode == "major" else "minor",
                    alt_root,
                    alt_mode,
                    rel_root,
                    rel_mode,
                ),
            }
        )
        if len(alternate_keys) >= 3:
            break

    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=hop_length)[0]
    energy_score = _estimate_energy_score(rms)
    mood = _classify_mood("major" if best_mode == "major" else "minor", energy_score)

    onset_frames = librosa.onset.onset_detect(
        onset_envelope=onset_env,
        sr=sr,
        hop_length=hop_length,
        units="frames",
    )
    onset_times = librosa.frames_to_time(onset_frames, sr=sr, hop_length=hop_length)
    groove = _estimate_groove(onset_times, bpm)

    duration_sec = float(librosa.get_duration(y=y, sr=sr))
    frame_times = librosa.times_like(chroma_frames, sr=sr, hop_length=hop_length)
    chord_progression = _estimate_chord_progression(chroma_frames, frame_times, bpm, duration_sec)
    sections = _estimate_sections(rms, duration_sec, sr, hop_length)

    result: dict[str, Any] = {
        "bpm": _round(bpm, 2),
        "bpmConfidence": _round(bpm_confidence, 3),
        "key": str(best_key["key"]),
        "keyConfidence": key_confidence,
        "relativeKey": relative_key,
        "alternateKeys": alternate_keys,
        "energyScore": _round(energy_score, 1),
        "mood": mood,
        "groove": groove,
        "chordProgression": chord_progression,
        "sections": sections,
    }

    result["analysisJson"] = {
        "bpm": result["bpm"],
        "bpmConfidence": result["bpmConfidence"],
        "key": result["key"],
        "keyConfidence": result["keyConfidence"],
        "relativeKey": result["relativeKey"],
        "alternateKeys": result["alternateKeys"],
        "energyScore": result["energyScore"],
        "mood": result["mood"],
        "groove": result["groove"],
        "chordProgression": result["chordProgression"],
        "sections": result["sections"],
        "sourceDurationSec": _round(source_duration_sec, 2),
        "analyzedDurationSec": _round(duration_sec, 2),
        "beatEvents": int(beat_times.size),
        "analysisMode": "balanced_fast",
        "sampleRate": sr,
    }

    return result


def estimate_bpm_and_key(audio_path: str) -> AudioAnalysis:
    insights = analyze_track_insights(audio_path)
    return AudioAnalysis(
        bpm=float(insights["bpm"]),
        bpm_confidence=float(insights["bpmConfidence"]),
        key=str(insights["key"]),
        key_confidence=float(insights["keyConfidence"]),
    )


def suggest_chords(key: str) -> list[str]:
    major_map = {
        "C": ["C", "Dm", "Em", "F", "G", "Am"],
        "C#": ["C#", "D#m", "Fm", "F#", "G#", "A#m"],
        "D": ["D", "Em", "F#m", "G", "A", "Bm"],
        "D#": ["D#", "Fm", "Gm", "G#", "A#", "Cm"],
        "E": ["E", "F#m", "G#m", "A", "B", "C#m"],
        "F": ["F", "Gm", "Am", "A#", "C", "Dm"],
        "F#": ["F#", "G#m", "A#m", "B", "C#", "D#m"],
        "G": ["G", "Am", "Bm", "C", "D", "Em"],
        "G#": ["G#", "A#m", "Cm", "C#", "D#", "Fm"],
        "A": ["A", "Bm", "C#m", "D", "E", "F#m"],
        "A#": ["A#", "Cm", "Dm", "D#", "F", "Gm"],
        "B": ["B", "C#m", "D#m", "E", "F#", "G#m"]
    }
    tonic = key.split(" ")[0]
    return major_map.get(tonic, ["C", "Dm", "Em", "F", "G", "Am"])
