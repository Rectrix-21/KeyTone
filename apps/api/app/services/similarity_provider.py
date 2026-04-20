from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from typing import Protocol


@dataclass(slots=True)
class SimilarityCandidate:
    title: str
    artist: str
    similarity: float
    provider_url: str | None = None
    image_url: str | None = None
    spotify_track: dict[str, Any] | None = None
    match_label: str = "Direct match"


@dataclass(slots=True)
class SimilarArtistCandidate:
    name: str
    similarity: float


@dataclass(slots=True)
class TrackContext:
    url: str | None = None
    tags: list[str] | None = None


class SimilarityProvider(Protocol):
    async def get_similar_tracks(self, *, artist: str, title: str, limit: int) -> list[SimilarityCandidate]:
        ...

    async def get_similar_artists(self, *, artist: str, limit: int) -> list[SimilarArtistCandidate]:
        ...

    async def get_track_context(self, *, artist: str, title: str, limit_tags: int = 8) -> TrackContext:
        ...
