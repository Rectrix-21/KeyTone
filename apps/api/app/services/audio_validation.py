from pathlib import Path

from app.core.config import settings
from app.core.errors import FileTooLargeError, UnsupportedAudioError


def validate_file_extension(file_name: str) -> None:
    extension = Path(file_name).suffix.lower().replace(".", "")
    allowed = {value.strip().lower() for value in settings.allowed_audio_extensions.split(",") if value.strip()}
    if extension not in allowed:
        raise UnsupportedAudioError()


def validate_file_extension_for_allowed(file_name: str, allowed_extensions: set[str]) -> str:
    extension = Path(file_name).suffix.lower().replace(".", "")
    normalized_allowed = {value.strip().lower() for value in allowed_extensions if value.strip()}
    if extension not in normalized_allowed:
        raise UnsupportedAudioError()
    return extension


def validate_file_size(size_bytes: int) -> None:
    if size_bytes > settings.max_upload_bytes:
        raise FileTooLargeError()
