from dataclasses import dataclass
from pathlib import Path

import librosa
import pretty_midi
import soundfile as sf


@dataclass(frozen=True)
class ChordCleanupConfig:
    sample_rate: int = 22050
    min_note_duration_sec: float = 0.10
    min_note_velocity: int = 34
    onset_window_sec: float = 0.06
    min_cluster_notes: int = 3
    max_cluster_pitch_span: int = 24
    fallback_min_duration_sec: float = 0.25
    fallback_min_velocity: int = 45


DEFAULT_CHORD_CLEANUP_CONFIG = ChordCleanupConfig()


def preprocess_harmonic_audio(
    source_audio_path: Path,
    output_audio_path: Path,
    config: ChordCleanupConfig = DEFAULT_CHORD_CLEANUP_CONFIG,
) -> Path:
    y, sr = librosa.load(str(source_audio_path), sr=config.sample_rate, mono=True)
    harmonic = librosa.effects.harmonic(y)
    output_audio_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(output_audio_path), harmonic, sr)
    return output_audio_path


def filter_transient_notes(
    notes: list[pretty_midi.Note],
    config: ChordCleanupConfig = DEFAULT_CHORD_CLEANUP_CONFIG,
) -> list[pretty_midi.Note]:
    filtered: list[pretty_midi.Note] = []
    for note in notes:
        duration = float(note.end - note.start)
        if duration < config.min_note_duration_sec:
            continue
        if int(note.velocity) < config.min_note_velocity:
            continue
        filtered.append(note)

    filtered.sort(key=lambda note: (note.start, note.pitch))
    return filtered


def cluster_notes_by_onset(
    notes: list[pretty_midi.Note],
    config: ChordCleanupConfig = DEFAULT_CHORD_CLEANUP_CONFIG,
) -> list[list[pretty_midi.Note]]:
    if not notes:
        return []

    clusters_by_bucket: dict[int, list[pretty_midi.Note]] = {}
    for note in notes:
        bucket = int(round(note.start / config.onset_window_sec))
        clusters_by_bucket.setdefault(bucket, []).append(note)

    clusters: list[list[pretty_midi.Note]] = []
    for bucket in sorted(clusters_by_bucket):
        cluster = clusters_by_bucket[bucket]
        cluster.sort(key=lambda note: (note.start, note.pitch))
        clusters.append(cluster)

    return clusters


def select_harmonic_clusters(
    clusters: list[list[pretty_midi.Note]],
    config: ChordCleanupConfig = DEFAULT_CHORD_CLEANUP_CONFIG,
) -> list[list[pretty_midi.Note]]:
    selected: list[list[pretty_midi.Note]] = []
    for cluster in clusters:
        unique_pitches = sorted({int(note.pitch) for note in cluster})
        if len(unique_pitches) < config.min_cluster_notes:
            continue

        pitch_span = unique_pitches[-1] - unique_pitches[0]
        if pitch_span > config.max_cluster_pitch_span:
            continue

        selected.append(cluster)

    return selected


def rebuild_chord_midi_from_clusters(
    clusters: list[list[pretty_midi.Note]],
    output_midi_path: Path,
) -> Path:
    chord_midi = pretty_midi.PrettyMIDI()
    instrument = pretty_midi.Instrument(program=0, is_drum=False)

    for cluster in clusters:
        cluster_start = min(note.start for note in cluster)
        for note in cluster:
            instrument.notes.append(
                pretty_midi.Note(
                    velocity=int(note.velocity),
                    pitch=int(note.pitch),
                    start=float(cluster_start),
                    end=float(max(note.end, cluster_start + 0.08)),
                )
            )

    instrument.notes.sort(key=lambda note: (note.start, note.pitch))
    chord_midi.instruments.append(instrument)

    output_midi_path.parent.mkdir(parents=True, exist_ok=True)
    chord_midi.write(str(output_midi_path))
    return output_midi_path


def cleanup_chord_midi(
    raw_chord_midi_path: Path,
    output_midi_path: Path,
    config: ChordCleanupConfig = DEFAULT_CHORD_CLEANUP_CONFIG,
) -> Path:
    midi = pretty_midi.PrettyMIDI(str(raw_chord_midi_path))
    notes = [
        note
        for instrument in midi.instruments
        if not instrument.is_drum
        for note in instrument.notes
    ]

    filtered = filter_transient_notes(notes, config)
    clusters = cluster_notes_by_onset(filtered, config)
    selected_clusters = select_harmonic_clusters(clusters, config)

    if selected_clusters:
        return rebuild_chord_midi_from_clusters(selected_clusters, output_midi_path)

    fallback_notes = [
        note
        for note in filtered
        if (note.end - note.start) >= config.fallback_min_duration_sec
        and int(note.velocity) >= config.fallback_min_velocity
    ]

    if not fallback_notes:
        output_midi_path.parent.mkdir(parents=True, exist_ok=True)
        pretty_midi.PrettyMIDI().write(str(output_midi_path))
        return output_midi_path

    return rebuild_chord_midi_from_clusters([fallback_notes], output_midi_path)
