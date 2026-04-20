from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path


API_ROOT = Path(__file__).resolve().parents[2]
ENV_PATH = API_ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(ENV_PATH), env_file_encoding="utf-8", extra="ignore")

    app_env: str = "development"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    api_cors_origins: str = "http://localhost:3000"

    max_upload_bytes: int = 25 * 1024 * 1024
    allowed_audio_extensions: str = "mp3,wav,m4a"
    demucs_model: str = "htdemucs_6s"
    musicvae_enabled: bool = True
    musicvae_checkpoint_path: str = ""
    musicvae_config_name: str = "cat-mel_2bar_big"

    stem_rms_min: float = 0.008
    stem_harmonic_ratio_min: float = 0.55
    stem_onset_density_max: float = 4.0
    stem_sustained_ratio_min: float = 0.25
    transcription_confidence_min: float = 0.45

    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    supabase_storage_bucket_audio: str = "audio"
    supabase_storage_bucket_midi: str = "midi"
    supabase_storage_bucket_analysis: str = "analysis"

    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_id: str = ""
    stripe_success_url: str = "http://localhost:3000/dashboard"
    stripe_cancel_url: str = "http://localhost:3000/pricing"
    admin_emails: str = ""

    spotify_client_id: str = ""
    spotify_client_secret: str = ""
    spotify_market: str = "US"
    lastfm_api_key: str = ""
    lastfm_base_url: str = "https://ws.audioscrobbler.com/2.0/"


settings = Settings()
