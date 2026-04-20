from pathlib import Path
import sys
import inspect
import tempfile
import logging

import librosa
import pretty_midi
import soundfile as sf


def _count_midi_notes(midi_path: Path) -> int:
    midi = pretty_midi.PrettyMIDI(str(midi_path))
    return sum(len(instrument.notes) for instrument in midi.instruments if not instrument.is_drum)


def _prepare_harmonic_audio(audio_path: Path) -> Path:
    with tempfile.TemporaryDirectory(prefix="keytone_harmonic_") as temp_dir:
        temp_path = Path(temp_dir)
        y, sr = librosa.load(str(audio_path), sr=22050, mono=True)
        harmonic, _ = librosa.effects.hpss(y)
        harmonic_audio = temp_path / f"{audio_path.stem}_harmonic.wav"
        sf.write(str(harmonic_audio), harmonic, sr)

        persistent_path = audio_path.parent / f"{audio_path.stem}_harmonic.wav"
        persistent_path.write_bytes(harmonic_audio.read_bytes())
        return persistent_path


def _predict_midi(
    predict_and_save,
    audio_input: Path,
    output_dir: Path,
    model_path,
    midi_tempo: float,
    onset_threshold: float,
    frame_threshold: float,
    minimum_note_length: float,
) -> Path:
    predict_kwargs = {
        "audio_path_list": [str(audio_input)],
        "output_directory": str(output_dir),
        "save_midi": True,
        "sonify_midi": False,
        "save_model_outputs": False,
        "save_notes": False,
        "onset_threshold": onset_threshold,
        "frame_threshold": frame_threshold,
        "minimum_note_length": minimum_note_length,
        "minimum_frequency": 27.5,
        "maximum_frequency": 4186.0,
        "multiple_pitch_bends": False,
        "melodia_trick": True,
        "midi_tempo": midi_tempo,
    }

    signature = inspect.signature(predict_and_save)
    if "model_or_model_path" in signature.parameters:
        predict_kwargs["model_or_model_path"] = model_path

    predict_and_save(**predict_kwargs)

    midi_path = output_dir / f"{audio_input.stem}_basic_pitch.mid"
    if midi_path.exists():
        return midi_path

    fallback = list(output_dir.glob("*.mid"))
    if not fallback:
        raise RuntimeError("Basic Pitch did not produce MIDI output")
    return fallback[0]


def transcribe_to_midi(audio_path: Path, output_dir: Path) -> Path:
    root_logger = logging.getLogger()
    previous_level = root_logger.level
    root_logger.setLevel(max(previous_level, logging.ERROR))
    try:
        from basic_pitch.inference import ICASSP_2022_MODEL_PATH, predict_and_save
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            f"basic-pitch is not available in this Python runtime ({sys.executable}). Start API with Python 3.11 environment and install requirements there."
        ) from exc
    finally:
        root_logger.setLevel(previous_level)

    output_dir.mkdir(parents=True, exist_ok=True)

    harmonic_audio_path: Path | None = None
    try:
        harmonic_audio_path = _prepare_harmonic_audio(audio_path)
    except Exception:
        harmonic_audio_path = None

    try:
        original_output_dir = output_dir / "original"
        original_output_dir.mkdir(parents=True, exist_ok=True)

        original_midi = _predict_midi(
            predict_and_save=predict_and_save,
            audio_input=audio_path,
            output_dir=original_output_dir,
            model_path=ICASSP_2022_MODEL_PATH,
            midi_tempo=120,
            onset_threshold=0.5,
            frame_threshold=0.28,
            minimum_note_length=110.0,
        )

        selected_path = original_midi
        if harmonic_audio_path:
            harmonic_output_dir = output_dir / "harmonic"
            harmonic_output_dir.mkdir(parents=True, exist_ok=True)
            harmonic_midi = _predict_midi(
                predict_and_save=predict_and_save,
                audio_input=harmonic_audio_path,
                output_dir=harmonic_output_dir,
                model_path=ICASSP_2022_MODEL_PATH,
                midi_tempo=120,
                onset_threshold=0.42,
                frame_threshold=0.22,
                minimum_note_length=90.0,
            )

            harmonic_note_count = _count_midi_notes(harmonic_midi)
            original_note_count = _count_midi_notes(original_midi)
            selected_path = harmonic_midi if harmonic_note_count >= max(8, original_note_count // 2) else original_midi

        final_path = output_dir / f"{audio_path.stem}_most_accurate.mid"
        final_path.write_bytes(selected_path.read_bytes())
        return final_path
    finally:
        if harmonic_audio_path and harmonic_audio_path.exists():
            harmonic_audio_path.unlink(missing_ok=True)
