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
    min_cluster_notes: int = 2
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

    # Clusters that don't clear the full-chord bar (too few distinct pitches,
    # or too wide a span) still likely represent a real chord moment that the
    # transcriber only partially caught -- previously any cluster that didn't
    # qualify was dropped outright, silently deleting that beat from the
    # progression. Keep the strong notes from those instead of losing the
    # moment entirely, while still filtering out weak/spurious ones.
    selected_ids = {id(cluster) for cluster in selected_clusters}
    partial_clusters: list[list[pretty_midi.Note]] = []
    for cluster in clusters:
        if id(cluster) in selected_ids:
            continue
        strong_notes = [
            note
            for note in cluster
            if (note.end - note.start) >= config.fallback_min_duration_sec
            and int(note.velocity) >= config.fallback_min_velocity
        ]
        if strong_notes:
            partial_clusters.append(strong_notes)

    all_clusters = sorted(
        [*selected_clusters, *partial_clusters],
        key=lambda cluster: min(note.start for note in cluster),
    )

    if not all_clusters:
        output_midi_path.parent.mkdir(parents=True, exist_ok=True)
        pretty_midi.PrettyMIDI().write(str(output_midi_path))
        return output_midi_path

    return rebuild_chord_midi_from_clusters(all_clusters, output_midi_path)


def cleanup_melody_midi(
    raw_melody_midi_path: Path,
    output_midi_path: Path,
    config: ChordCleanupConfig = DEFAULT_CHORD_CLEANUP_CONFIG,
    min_melody_velocity: int = 55,
) -> Path:
    """Reduce a raw melody transcription to a single monophonic top line.

    Basic Pitch's raw output for the "melody" target transcribes everything
    present in the harmonic-separated mix -- chord tones and stray
    harmonics included -- with no isolation of an actual single melodic
    line. This applies the standard "skyline" heuristic: at any point in
    time where multiple notes overlap, only the highest-pitched one is kept
    as melody, trimming or dropping the lower notes underneath it.

    Basic Pitch also frequently emits weak, low-confidence "ghost" notes
    from octave/harmonic doubling that sit above the true melody note and
    would otherwise win that pitch comparison outright. These are reliably
    much quieter than genuine melody notes, so they're filtered out before
    the skyline pass runs (falling back to the unfiltered set if that
    leaves nothing at all, rather than producing silence).
    """
    midi = pretty_midi.PrettyMIDI(str(raw_melody_midi_path))
    notes = [
        note
        for instrument in midi.instruments
        if not instrument.is_drum
        for note in instrument.notes
    ]

    filtered = filter_transient_notes(notes, config)
    strong = [note for note in filtered if int(note.velocity) >= min_melody_velocity]
    candidates = strong if strong else filtered
    candidates.sort(key=lambda note: (note.start, -note.pitch))
    filtered = candidates

    melody: list[pretty_midi.Note] = []
    for note in filtered:
        start = float(note.start)
        end = float(note.end)
        keep = True

        while melody and start < melody[-1].end:
            top = melody[-1]
            if int(note.pitch) > int(top.pitch):
                if start <= top.start:
                    melody.pop()
                    continue
                top.end = start
                break
            keep = False
            break

        if not keep or end <= start:
            continue

        melody.append(
            pretty_midi.Note(
                velocity=int(note.velocity),
                pitch=int(note.pitch),
                start=start,
                end=end,
            )
        )

    output_midi_path.parent.mkdir(parents=True, exist_ok=True)
    result = pretty_midi.PrettyMIDI()
    if melody:
        instrument = pretty_midi.Instrument(program=0, is_drum=False)
        instrument.notes = melody
        result.instruments.append(instrument)
    result.write(str(output_midi_path))
    return output_midi_path
