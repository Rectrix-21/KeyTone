from __future__ import annotations

from typing import Any

import httpx

from app.core.config import settings
from app.services.similarity_provider import (
    SimilarArtistCandidate,
    SimilarityCandidate,
    SimilarityProvider,
    TrackContext,
)


class LastFmSimilarityProvider(SimilarityProvider):
    def __init__(self) -> None:
        self.base_url = settings.lastfm_base_url.rstrip("/")
        self.api_key = settings.lastfm_api_key.strip()

    async def get_similar_tracks(self, *, artist: str, title: str, limit: int) -> list[SimilarityCandidate]:
        if not self.api_key:
            raise RuntimeError("Last.fm API key is missing. Set LASTFM_API_KEY.")

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                self.base_url,
                params={
                    "method": "track.getSimilar",
                    "api_key": self.api_key,
                    "artist": artist,
                    "track": title,
                    "autocorrect": 1,
                    "limit": max(1, min(limit, 50)),
                    "format": "json",
                },
            )

        if response.status_code >= 400:
            raise RuntimeError(f"Last.fm request failed ({response.status_code}): {response.text}")

        payload = response.json()
        if isinstance(payload, dict) and payload.get("error"):
            code = payload.get("error")
            message = payload.get("message", "Last.fm API error")
            if str(code) in {"6", "17"}:
                return []
            raise RuntimeError(f"Last.fm API error ({code}): {message}")

        raw_tracks = ((payload.get("similartracks") or {}).get("track") or [])
        if isinstance(raw_tracks, dict):
            raw_tracks = [raw_tracks]

        candidates: list[SimilarityCandidate] = []
        for item in raw_tracks:
            if not isinstance(item, dict):
                continue

            track_name = str(item.get("name") or "").strip()
            raw_artist = item.get("artist") or {}
            if isinstance(raw_artist, dict):
                artist_name = str(raw_artist.get("name") or "").strip()
            else:
                artist_name = str(raw_artist).strip()

            if not track_name or not artist_name:
                continue

            candidates.append(
                SimilarityCandidate(
                    title=track_name,
                    artist=artist_name,
                    similarity=_normalize_similarity(item.get("match")),
                    provider_url=_read_provider_url(item),
                    image_url=_read_image_url(item),
                )
            )

        return candidates

    async def get_similar_artists(self, *, artist: str, limit: int) -> list[SimilarArtistCandidate]:
        if not self.api_key:
            raise RuntimeError("Last.fm API key is missing. Set LASTFM_API_KEY.")

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                self.base_url,
                params={
                    "method": "artist.getSimilar",
                    "api_key": self.api_key,
                    "artist": artist,
                    "autocorrect": 1,
                    "limit": max(1, min(limit, 50)),
                    "format": "json",
                },
            )

        if response.status_code >= 400:
            raise RuntimeError(f"Last.fm request failed ({response.status_code}): {response.text}")

        payload = response.json()
        if isinstance(payload, dict) and payload.get("error"):
            code = payload.get("error")
            message = payload.get("message", "Last.fm API error")
            if str(code) in {"6", "17"}:
                return []
            raise RuntimeError(f"Last.fm API error ({code}): {message}")

        raw_artists = ((payload.get("similarartists") or {}).get("artist") or [])
        if isinstance(raw_artists, dict):
            raw_artists = [raw_artists]

        candidates: list[SimilarArtistCandidate] = []
        for item in raw_artists:
            if not isinstance(item, dict):
                continue

            artist_name = str(item.get("name") or "").strip()
            if not artist_name:
                continue

            candidates.append(
                SimilarArtistCandidate(
                    name=artist_name,
                    similarity=_normalize_similarity(item.get("match")),
                )
            )

        return candidates

    async def get_track_context(self, *, artist: str, title: str, limit_tags: int = 8) -> TrackContext:
        if not self.api_key:
            raise RuntimeError("Last.fm API key is missing. Set LASTFM_API_KEY.")

        params = {
            "method": "track.getInfo",
            "api_key": self.api_key,
            "artist": artist,
            "track": title,
            "autocorrect": 1,
            "format": "json",
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(self.base_url, params=params)

        if response.status_code >= 400:
            raise RuntimeError(f"Last.fm request failed ({response.status_code}): {response.text}")

        payload = response.json()
        if isinstance(payload, dict) and payload.get("error"):
            code = str(payload.get("error"))
            if code in {"6", "17"}:
                return TrackContext(url=None, tags=[])
            message = payload.get("message", "Last.fm API error")
            raise RuntimeError(f"Last.fm API error ({code}): {message}")

        track = payload.get("track") if isinstance(payload, dict) else None
        if not isinstance(track, dict):
            return TrackContext(url=None, tags=[])

        url = _read_provider_url(track)
        tags = _extract_tag_names((track.get("toptags") or {}).get("tag"), limit=max(1, min(limit_tags, 12)))

        if not tags:
            tags = await self._fetch_track_top_tags(artist=artist, title=title, limit_tags=limit_tags)
        if not tags:
            tags = await self._fetch_artist_top_tags(artist=artist, limit_tags=limit_tags)

        return TrackContext(url=url, tags=tags)

    async def _fetch_track_top_tags(self, *, artist: str, title: str, limit_tags: int) -> list[str]:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                self.base_url,
                params={
                    "method": "track.getTopTags",
                    "api_key": self.api_key,
                    "artist": artist,
                    "track": title,
                    "autocorrect": 1,
                    "format": "json",
                },
            )

        if response.status_code >= 400:
            return []

        payload = response.json() if response.content else {}
        raw_tags = ((payload.get("toptags") or {}).get("tag") or []) if isinstance(payload, dict) else []
        return _extract_tag_names(raw_tags, limit=max(1, min(limit_tags, 12)))

    async def _fetch_artist_top_tags(self, *, artist: str, limit_tags: int) -> list[str]:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                self.base_url,
                params={
                    "method": "artist.getTopTags",
                    "api_key": self.api_key,
                    "artist": artist,
                    "autocorrect": 1,
                    "format": "json",
                },
            )

        if response.status_code >= 400:
            return []

        payload = response.json() if response.content else {}
        raw_tags = ((payload.get("toptags") or {}).get("tag") or []) if isinstance(payload, dict) else []
        return _extract_tag_names(raw_tags, limit=max(1, min(limit_tags, 12)))


def _normalize_similarity(value: Any) -> float:
    try:
        score = float(value)
    except (TypeError, ValueError):
        return 0.0

    if score > 1.0:
        score = score / 100.0

    if score < 0:
        return 0.0
    if score > 1:
        return 1.0
    return score


def _read_provider_url(item: dict[str, Any]) -> str | None:
    value = item.get("url")
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _read_image_url(item: dict[str, Any]) -> str | None:
    images = item.get("image") or []
    if not isinstance(images, list):
        return None

    for entry in reversed(images):
        if not isinstance(entry, dict):
            continue
        url = entry.get("#text")
        if isinstance(url, str) and url.strip():
            return url.strip()
    return None


def _extract_tag_names(raw_tags: Any, *, limit: int) -> list[str]:
    if isinstance(raw_tags, dict):
        tag_items = [raw_tags]
    elif isinstance(raw_tags, list):
        tag_items = raw_tags
    else:
        return []

    tags: list[str] = []
    seen: set[str] = set()
    for entry in tag_items:
        if not isinstance(entry, dict):
            continue
        name = str(entry.get("name") or "").strip()
        normalized = " ".join(name.lower().split())
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        tags.append(name)
        if len(tags) >= limit:
            break

    return tags
