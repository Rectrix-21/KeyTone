import json
from pathlib import Path

from app.core.config import settings
from app.services.supabase_client import get_supabase_service_client


class StorageService:
    def __init__(self) -> None:
        self.client = get_supabase_service_client()

    def upload_binary(self, bucket: str, key: str, file_path: Path, content_type: str) -> str:
        payload = file_path.read_bytes()
        self.client.storage.from_(bucket).upload(key, payload, {"content-type": content_type, "upsert": "true"})
        signed = self.client.storage.from_(bucket).create_signed_url(key, 60 * 60 * 24 * 7)
        return signed["signedURL"]

    def upload_json(self, bucket: str, key: str, data: dict) -> str:
        payload = json.dumps(data).encode("utf-8")
        self.client.storage.from_(bucket).upload(key, payload, {"content-type": "application/json", "upsert": "true"})
        signed = self.client.storage.from_(bucket).create_signed_url(key, 60 * 60 * 24 * 7)
        return signed["signedURL"]

    def upload_audio(self, key: str, file_path: Path, content_type: str) -> str:
        return self.upload_binary(settings.supabase_storage_bucket_audio, key, file_path, content_type)

    def upload_midi(self, key: str, file_path: Path) -> str:
        return self.upload_binary(settings.supabase_storage_bucket_midi, key, file_path, "audio/midi")

    def upload_analysis(self, key: str, data: dict) -> str:
        return self.upload_json(settings.supabase_storage_bucket_analysis, key, data)
