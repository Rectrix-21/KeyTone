from datetime import datetime
from typing import Literal
from typing import Any

from pydantic import BaseModel, Field, field_validator


ProjectStatus = Literal["pending", "processing", "completed", "failed"]
ProjectFeature = Literal["extraction", "variation", "starter"]


class Confidence(BaseModel):
    bpm: float
    key: float


class AnalysisResult(BaseModel):
    bpm: float
    key: str
    chord_suggestions: list[str]
    detected_chord_events: list[dict[str, Any]] = Field(default_factory=list)
    detected_chord_progression: list[str] = Field(default_factory=list)
    altered_chord_events: list[dict[str, Any]] = Field(default_factory=list)
    altered_chord_progression: list[str] = Field(default_factory=list)
    detected_instruments: list[str] = Field(default_factory=list)
    midi_confidence: dict[str, float] = Field(default_factory=dict)
    target_quality: dict[str, dict[str, float | bool]] = Field(default_factory=dict)
    separation: dict[str, Any] | None = None
    confidence: Confidence


class MidiPreviewNote(BaseModel):
    pitch: int
    velocity: int
    start: float
    end: float
    lane: Literal["melody", "chord", "bass", "piano", "guitar", "drums"]


class AssetSet(BaseModel):
    source_audio_url: str | None = None
    midi_base_url: str | None = None
    altered_midi_url: str | None = None
    midi_variation_urls: list[str] = Field(default_factory=list)
    analysis_json_url: str | None = None
    midi_stem_urls: dict[str, str] | None = None
    midi_preview_notes: list[MidiPreviewNote] = Field(default_factory=list)
    original_midi_preview_notes: list[MidiPreviewNote] = Field(default_factory=list)
    altered_midi_preview_notes: list[MidiPreviewNote] = Field(default_factory=list)
    stem_audio_urls: dict[str, str] | None = None


class ProjectResponse(BaseModel):
    id: str
    created_at: datetime
    file_name: str
    status: ProjectStatus
    feature: ProjectFeature = "extraction"
    options: dict[str, Any] | None = None
    error_message: str | None = None
    analysis: AnalysisResult | None = None
    assets: AssetSet | None = None

    @field_validator("feature", mode="before")
    @classmethod
    def normalize_feature(cls, value: Any) -> ProjectFeature:
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"extraction", "variation", "starter"}:
                return normalized  # type: ignore[return-value]
            if normalized == "audio":
                return "extraction"
        return "extraction"


class UploadAcceptedResponse(BaseModel):
    project_id: str
    status: ProjectStatus = Field(default="pending")


class UserSummaryResponse(BaseModel):
    id: str
    email: str
    remaining_credits: int
    subscription_status: Literal["free", "active", "canceled"]
    is_admin: bool = False
    unlimited_credits: bool = False


class CheckoutResponse(BaseModel):
    checkout_url: str
