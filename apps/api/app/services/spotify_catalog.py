from __future__ import annotations

import asyncio
import base64
import copy
import tempfile
import time
from collections import OrderedDict
from pathlib import Path
from typing import Any

import httpx

from app.core.config import settings
from app.services.audio_analysis import analyze_track_insights


KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


class SpotifyApiError(RuntimeError):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code


def _is_invalid_limit_error(exc: SpotifyApiError) -> bool:
    return exc.status_code == 400 and "invalid limit" in str(exc).lower()


_SPOTIFY_TOKEN: str | None = None
_SPOTIFY_TOKEN_EXPIRES_AT: float = 0.0
_SPOTIFY_AUTH_CLIENT: httpx.AsyncClient | None = None
_SPOTIFY_API_CLIENT: httpx.AsyncClient | None = None
_SPOTIFY_SEARCH_CACHE_TTL_SECONDS = 120
_SPOTIFY_SEARCH_CACHE_MAX_ITEMS = 256
_spotify_search_cache: OrderedDict[str, tuple[float, list[dict[str, Any]]]] = OrderedDict()
_SPOTIFY_ARTIST_GENRE_CACHE_TTL_SECONDS = 10 * 60
_SPOTIFY_ARTIST_GENRE_CACHE_MAX_ITEMS = 512
_spotify_artist_genre_cache: OrderedDict[str, tuple[float, list[str]]] = OrderedDict()


def _ensure_spotify_configured() -> None:
    if not settings.spotify_client_id or not settings.spotify_client_secret:
        raise RuntimeError(
            "Spotify credentials are missing. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET."
        )


def _extract_track_id(value: str) -> str:
    raw = value.strip()
    if not raw:
        raise ValueError("Spotify track URL or ID is required")

    if raw.startswith("spotify:track:"):
        track_id = raw.split(":")[-1]
        if len(track_id) >= 20:
            return track_id

    marker = "/track/"
    if marker in raw:
        fragment = raw.split(marker, 1)[1]
        track_id = fragment.split("?", 1)[0].split("/", 1)[0].strip()
        if len(track_id) >= 20:
            return track_id

    if len(raw) >= 20 and "/" not in raw and " " not in raw:
        return raw

    raise ValueError("Could not parse Spotify track ID from input")


def _clip(value: float, low: float, high: float) -> float:
    return float(max(low, min(high, value)))


def _round(value: float, digits: int = 3) -> float:
    return float(round(float(value), digits))


def _format_key(key_index: int | None, mode: int | None) -> str:
    if key_index is None or key_index < 0 or key_index > 11:
        return "Unknown"
    scale = "major" if mode == 1 else "minor" if mode == 0 else ""
    return f"{KEY_NAMES[key_index]} {scale}".strip()


def _relative_key(key_index: int | None, mode: int | None) -> str:
    if key_index is None or mode not in {0, 1}:
        return "Unknown"
    if mode == 1:
        rel_root = (key_index + 9) % 12
        rel_mode = "minor"
    else:
        rel_root = (key_index + 3) % 12
        rel_mode = "major"
    return f"{KEY_NAMES[rel_root]} {rel_mode}"


def _estimate_mood(energy: float, valence: float, mode: int | None) -> str:
    if mode == 0:
        if energy >= 0.72:
            return "energetic"
        if energy >= 0.45:
            return "emotional"
        return "dark"
    if mode == 1:
        if energy >= 0.72:
            return "energetic"
        if valence >= 0.58:
            return "happy"
        return "calm"
    if energy >= 0.72:
        return "energetic"
    if valence >= 0.58:
        return "happy"
    return "emotional"


def _estimate_groove(danceability: float) -> str:
    if danceability >= 0.72:
        return "tight"
    if danceability >= 0.55:
        return "swing"
    return "humanized"


def _estimate_sections(duration_sec: float, energy_score: float) -> list[dict[str, Any]]:
    total = max(20.0, float(duration_sec))
    intro_end = min(max(4.0, total * 0.14), 18.0)
    verse_end = max(intro_end + 8.0, total * 0.45)
    chorus_end = max(verse_end + 8.0, total * 0.72)
    bridge_end = max(chorus_end + 5.0, total * 0.88)

    base = _clip(energy_score, 10.0, 100.0)
    sections = [
        {"label": "intro", "startSec": 0.0, "endSec": min(intro_end, total), "energy": _round(base * 0.72, 1)},
        {
            "label": "verse",
            "startSec": min(intro_end, total),
            "endSec": min(verse_end, total),
            "energy": _round(base * 0.88, 1),
        },
        {
            "label": "chorus",
            "startSec": min(verse_end, total),
            "endSec": min(chorus_end, total),
            "energy": _round(base, 1),
        },
        {
            "label": "bridge",
            "startSec": min(chorus_end, total),
            "endSec": min(bridge_end, total),
            "energy": _round(base * 0.8, 1),
        },
        {
            "label": "outro",
            "startSec": min(bridge_end, total),
            "endSec": total,
            "energy": _round(base * 0.65, 1),
        },
    ]

    return [section for section in sections if float(section["endSec"]) - float(section["startSec"]) >= 2.0]


def _downgrade_low_confidence_key(result: dict[str, Any], minimum_confidence: float = 0.72) -> dict[str, Any]:
    raw_confidence = result.get("keyConfidence")
    confidence = float(raw_confidence) if isinstance(raw_confidence, (int, float)) else 0.0
    if confidence >= minimum_confidence:
        return result

    output = dict(result)
    output["key"] = "Unknown"
    output["relativeKey"] = "Unknown"
    output["alternateKeys"] = []
    output["keyConfidence"] = _round(_clip(confidence, 0.0, 0.69), 3)
    return output


def _normalize_text(value: str) -> str:
    lowered = value.strip().lower()
    return "".join(char for char in lowered if char.isalnum() or char.isspace()).strip()


def _token_overlap_score(a: str, b: str) -> float:
    left = {token for token in _normalize_text(a).split() if token}
    right = {token for token in _normalize_text(b).split() if token}
    if not left or not right:
        return 0.0
    union = left | right
    if not union:
        return 0.0
    return len(left & right) / len(union)


async def _find_deezer_preview_url(
    *,
    track_name: str,
    artist_name: str,
    duration_sec: float | None,
    isrc: str | None,
) -> tuple[str | None, float, int | None]:
    clean_title = track_name.strip()
    clean_artist = artist_name.strip()
    if not clean_title:
        return None, 0.0, None

    query = f'track:"{clean_title}"'
    if clean_artist:
        query += f' artist:"{clean_artist}"'

    client = _get_spotify_api_client()
    response = await client.get(
        "https://api.deezer.com/search",
        params={"q": query, "limit": 8},
    )
    if response.status_code >= 400:
        return None, 0.0, None

    payload = response.json() if response.content else {}
    candidates = (payload.get("data") or []) if isinstance(payload, dict) else []
    if not isinstance(candidates, list):
        return None, 0.0, None

    spotify_isrc = (isrc or "").strip().upper()
    best_preview: str | None = None
    best_score = 0.0
    best_track_id: int | None = None

    for item in candidates:
        if not isinstance(item, dict):
            continue
        preview_url = str(item.get("preview") or "").strip()
        if not preview_url:
            continue

        score = 0.0
        deezer_isrc = str(item.get("isrc") or "").strip().upper()
        if spotify_isrc:
            if not deezer_isrc or deezer_isrc != spotify_isrc:
                continue
        if spotify_isrc and deezer_isrc and spotify_isrc == deezer_isrc:
            score += 1.0

        title_score = _token_overlap_score(clean_title, str(item.get("title") or ""))
        artist_score = _token_overlap_score(clean_artist, str((item.get("artist") or {}).get("name") or ""))
        score += title_score * 0.9
        score += artist_score * 0.9

        deezer_duration = item.get("duration")
        if isinstance(deezer_duration, (int, float)) and duration_sec and duration_sec > 0:
            duration_gap = abs(float(deezer_duration) - duration_sec)
            if duration_gap <= 2.0:
                score += 0.7
            elif duration_gap <= 5.0:
                score += 0.45
            elif duration_gap <= 9.0:
                score += 0.2

        if score > best_score:
            best_score = score
            best_preview = preview_url
            raw_track_id = item.get("id")
            best_track_id = int(raw_track_id) if isinstance(raw_track_id, (int, float)) else None

    return best_preview, best_score, best_track_id


async def _get_deezer_track_bpm(track_id: int) -> float | None:
    if track_id <= 0:
        return None

    client = _get_spotify_api_client()
    response = await client.get(f"https://api.deezer.com/track/{track_id}")
    if response.status_code >= 400 or not response.content:
        return None

    payload = response.json() if response.content else {}
    if not isinstance(payload, dict):
        return None
    bpm_raw = payload.get("bpm")
    if not isinstance(bpm_raw, (int, float)):
        return None
    bpm = float(bpm_raw)
    if bpm <= 0:
        return None
    return _clip(bpm, 40.0, 220.0)


async def resolve_track_preview_url(
    track: dict[str, Any],
    *,
    minimum_deezer_match: float = 1.1,
) -> str | None:
    spotify_preview = str(track.get("previewUrl") or "").strip()
    if spotify_preview:
        return spotify_preview

    track_name = str(track.get("name") or "").strip()
    artists = track.get("artists") if isinstance(track.get("artists"), list) else []
    artist_name = str(artists[0] if artists else "").strip()
    if not track_name:
        return None

    duration_ms_raw = track.get("durationMs")
    duration_sec = (
        float(duration_ms_raw) / 1000.0
        if isinstance(duration_ms_raw, (int, float)) and float(duration_ms_raw) > 0
        else None
    )
    isrc = str(track.get("isrc") or "").strip() or None

    try:
        deezer_preview_url, deezer_match_score, _ = await _find_deezer_preview_url(
            track_name=track_name,
            artist_name=artist_name,
            duration_sec=duration_sec,
            isrc=isrc,
        )
    except Exception:
        return None

    if deezer_preview_url and deezer_match_score >= minimum_deezer_match:
        return deezer_preview_url

    return None


async def _analyze_remote_preview(preview_url: str) -> dict[str, Any] | None:
    client = _get_spotify_api_client()
    response = await client.get(preview_url)
    if response.status_code >= 400 or not response.content:
        return None

    with tempfile.TemporaryDirectory(prefix="keytone_preview_") as temp_dir:
        preview_path = Path(temp_dir) / "preview.mp3"
        preview_path.write_bytes(response.content)
        return await asyncio.to_thread(analyze_track_insights, str(preview_path))


def _normalize_spotify_track(track: dict[str, Any]) -> dict[str, Any]:
    album = track.get("album") or {}
    images = album.get("images") or []
    raw_artists = track.get("artists")
    artist_payloads = raw_artists if isinstance(raw_artists, list) else []
    artists = [artist.get("name", "") for artist in artist_payloads if isinstance(artist, dict) and artist.get("name")]
    artist_ids = [artist.get("id", "") for artist in artist_payloads if isinstance(artist, dict) and artist.get("id")]
    genres = _normalize_genres(track.get("genres"), limit=8)

    return {
        "id": track.get("id", ""),
        "name": track.get("name", ""),
        "artists": artists,
        "artistIds": artist_ids,
        "genres": genres,
        "albumName": album.get("name", ""),
        "imageUrl": images[0].get("url") if images else None,
        "previewUrl": track.get("preview_url"),
        "externalUrl": (track.get("external_urls") or {}).get("spotify"),
        "isrc": (track.get("external_ids") or {}).get("isrc"),
        "durationMs": track.get("duration_ms"),
        "popularity": track.get("popularity"),
    }


def _get_spotify_auth_client() -> httpx.AsyncClient:
    global _SPOTIFY_AUTH_CLIENT
    if _SPOTIFY_AUTH_CLIENT is None:
        _SPOTIFY_AUTH_CLIENT = httpx.AsyncClient(
            timeout=15.0,
            http2=True,
            limits=httpx.Limits(max_connections=30, max_keepalive_connections=10),
        )
    return _SPOTIFY_AUTH_CLIENT


def _get_spotify_api_client() -> httpx.AsyncClient:
    global _SPOTIFY_API_CLIENT
    if _SPOTIFY_API_CLIENT is None:
        _SPOTIFY_API_CLIENT = httpx.AsyncClient(
            timeout=15.0,
            http2=True,
            limits=httpx.Limits(max_connections=50, max_keepalive_connections=20),
        )
    return _SPOTIFY_API_CLIENT


def _search_cache_key(query: str, limit: int) -> str:
    return f"{settings.spotify_market.lower()}::{limit}::{query.strip().lower()}"


def _search_cache_get(cache_key: str) -> list[dict[str, Any]] | None:
    cached = _spotify_search_cache.get(cache_key)
    if cached is None:
        return None

    expires_at, tracks = cached
    now = time.time()
    if now >= expires_at:
        _spotify_search_cache.pop(cache_key, None)
        return None

    _spotify_search_cache.move_to_end(cache_key)
    return copy.deepcopy(tracks)


def _search_cache_set(cache_key: str, tracks: list[dict[str, Any]]) -> None:
    expires_at = time.time() + _SPOTIFY_SEARCH_CACHE_TTL_SECONDS
    _spotify_search_cache[cache_key] = (expires_at, copy.deepcopy(tracks))
    _spotify_search_cache.move_to_end(cache_key)

    while len(_spotify_search_cache) > _SPOTIFY_SEARCH_CACHE_MAX_ITEMS:
        _spotify_search_cache.popitem(last=False)


def _normalize_genres(values: Any, *, limit: int = 8) -> list[str]:
    if not isinstance(values, (list, tuple)):
        return []

    output: list[str] = []
    seen: set[str] = set()
    for value in values:
        if not isinstance(value, str):
            continue
        cleaned = " ".join(value.strip().split())
        key = cleaned.lower()
        if not key or key in seen:
            continue
        seen.add(key)
        output.append(cleaned)
        if len(output) >= limit:
            break

    return output


def _artist_genre_cache_get(artist_id: str) -> list[str] | None:
    cached = _spotify_artist_genre_cache.get(artist_id)
    if cached is None:
        return None

    expires_at, genres = cached
    if time.time() >= expires_at:
        _spotify_artist_genre_cache.pop(artist_id, None)
        return None

    _spotify_artist_genre_cache.move_to_end(artist_id)
    return list(genres)


def _artist_genre_cache_set(artist_id: str, genres: list[str]) -> None:
    _spotify_artist_genre_cache[artist_id] = (
        time.time() + _SPOTIFY_ARTIST_GENRE_CACHE_TTL_SECONDS,
        list(genres),
    )
    _spotify_artist_genre_cache.move_to_end(artist_id)

    while len(_spotify_artist_genre_cache) > _SPOTIFY_ARTIST_GENRE_CACHE_MAX_ITEMS:
        _spotify_artist_genre_cache.popitem(last=False)


async def _fetch_artist_genres(artist_ids: list[str]) -> dict[str, list[str]]:
    unique_artist_ids: list[str] = []
    seen_ids: set[str] = set()
    for artist_id in artist_ids:
        normalized = artist_id.strip()
        if not normalized or normalized in seen_ids:
            continue
        seen_ids.add(normalized)
        unique_artist_ids.append(normalized)

    if not unique_artist_ids:
        return {}

    output: dict[str, list[str]] = {}
    missing_ids: list[str] = []

    for artist_id in unique_artist_ids:
        cached = _artist_genre_cache_get(artist_id)
        if cached is None:
            missing_ids.append(artist_id)
        else:
            output[artist_id] = cached

    for index in range(0, len(missing_ids), 50):
        chunk = missing_ids[index : index + 50]
        payload = await _spotify_get("/artists", params={"ids": ",".join(chunk)})
        artists_payload = payload.get("artists") if isinstance(payload, dict) else None
        if not isinstance(artists_payload, list):
            continue

        for artist_payload in artists_payload:
            if not isinstance(artist_payload, dict):
                continue
            artist_id = str(artist_payload.get("id") or "").strip()
            if not artist_id:
                continue

            genres = _normalize_genres(artist_payload.get("genres"), limit=6)
            output[artist_id] = genres
            _artist_genre_cache_set(artist_id, genres)

    for artist_id in missing_ids:
        if artist_id not in output:
            output[artist_id] = []
            _artist_genre_cache_set(artist_id, [])

    return output


async def _attach_artist_genres_to_tracks(tracks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not tracks:
        return tracks

    artist_ids: list[str] = []
    for track in tracks:
        track_artist_ids = track.get("artistIds")
        if not isinstance(track_artist_ids, list):
            continue
        for artist_id in track_artist_ids:
            if isinstance(artist_id, str):
                artist_ids.append(artist_id)

    try:
        genres_by_artist = await _fetch_artist_genres(artist_ids)
    except (SpotifyApiError, RuntimeError):
        # Genre enrichment is optional; keep base Spotify results working if
        # artist genre lookups are blocked by quota/policy (e.g., 403).
        return tracks

    if not genres_by_artist:
        return tracks

    output: list[dict[str, Any]] = []
    for track in tracks:
        merged_genres: list[str] = []
        seen_genres: set[str] = set()
        track_artist_ids = track.get("artistIds")
        if isinstance(track_artist_ids, list):
            for artist_id in track_artist_ids:
                if not isinstance(artist_id, str):
                    continue
                for genre in genres_by_artist.get(artist_id, []):
                    key = genre.lower()
                    if key in seen_genres:
                        continue
                    seen_genres.add(key)
                    merged_genres.append(genre)
                    if len(merged_genres) >= 8:
                        break
                if len(merged_genres) >= 8:
                    break

        next_track = dict(track)
        next_track["genres"] = merged_genres
        output.append(next_track)

    return output


async def _get_spotify_token() -> str:
    global _SPOTIFY_TOKEN, _SPOTIFY_TOKEN_EXPIRES_AT

    _ensure_spotify_configured()

    now = time.time()
    if _SPOTIFY_TOKEN and now < _SPOTIFY_TOKEN_EXPIRES_AT:
        return _SPOTIFY_TOKEN

    credentials = f"{settings.spotify_client_id}:{settings.spotify_client_secret}".encode("utf-8")
    auth_header = base64.b64encode(credentials).decode("ascii")

    client = _get_spotify_auth_client()
    response = await client.post(
        "https://accounts.spotify.com/api/token",
        headers={
            "Authorization": f"Basic {auth_header}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data={"grant_type": "client_credentials"},
    )

    if response.status_code >= 400:
        raise RuntimeError(f"Spotify auth failed ({response.status_code}): {response.text}")

    payload = response.json()
    access_token = payload.get("access_token")
    expires_in = int(payload.get("expires_in", 3600))
    if not access_token:
        raise RuntimeError("Spotify auth did not return an access token")

    _SPOTIFY_TOKEN = access_token
    _SPOTIFY_TOKEN_EXPIRES_AT = now + max(60, expires_in - 30)
    return access_token


async def _spotify_get(path: str, *, params: dict[str, Any] | None = None) -> dict[str, Any]:
    token = await _get_spotify_token()

    client = _get_spotify_api_client()
    response = await client.get(
        f"https://api.spotify.com/v1{path}",
        headers={"Authorization": f"Bearer {token}"},
        params=params,
    )

    if response.status_code >= 400:
        raise SpotifyApiError(
            response.status_code,
            f"Spotify API request failed ({response.status_code}): {response.text}",
        )

    return response.json()


async def search_spotify_tracks(query: str, limit: int = 8) -> list[dict[str, Any]]:
    clean_query = query.strip()
    if len(clean_query) < 2:
        return []

    normalized_limit = max(1, min(limit, 20))
    cache_key = _search_cache_key(clean_query, normalized_limit)
    cached = _search_cache_get(cache_key)
    if cached is not None:
        return cached

    attempt_limits: list[int] = [normalized_limit]
    for fallback_limit in (10, 5, 1):
        if fallback_limit < normalized_limit and fallback_limit not in attempt_limits:
            attempt_limits.append(fallback_limit)

    payload: dict[str, Any] | None = None
    last_error: SpotifyApiError | None = None

    for attempt_limit in attempt_limits:
        try:
            payload = await _spotify_get(
                "/search",
                params={
                    "q": clean_query,
                    "type": "track",
                    "limit": attempt_limit,
                    "market": settings.spotify_market,
                },
            )
            break
        except SpotifyApiError as exc:
            last_error = exc
            if _is_invalid_limit_error(exc) and attempt_limit != attempt_limits[-1]:
                continue
            raise

    if payload is None:
        if last_error is not None:
            raise last_error
        raise RuntimeError("Spotify search failed with an unknown error")

    items = ((payload.get("tracks") or {}).get("items") or [])
    tracks = [_normalize_spotify_track(item) for item in items]
    tracks = await _attach_artist_genres_to_tracks(tracks)
    _search_cache_set(cache_key, tracks)
    return tracks


async def get_spotify_track_by_input(value: str) -> dict[str, Any]:
    track_id = _extract_track_id(value)

    try:
        payload = await _spotify_get(
            f"/tracks/{track_id}",
            params={"market": settings.spotify_market},
        )
    except SpotifyApiError as exc:
        if exc.status_code == 404:
            raise ValueError("Spotify track not found for the provided URL/ID.") from exc
        raise

    normalized = _normalize_spotify_track(payload)
    enriched = await _attach_artist_genres_to_tracks([normalized])
    return enriched[0] if enriched else normalized


async def resolve_source_track(
    *,
    spotify_track_input: str | None,
    song_title: str | None,
    song_artist: str | None,
) -> dict[str, Any]:
    if spotify_track_input and spotify_track_input.strip():
        return await get_spotify_track_by_input(spotify_track_input)

    title = (song_title or "").strip()
    artist = (song_artist or "").strip()

    if not title or not artist:
        raise ValueError("Provide both song title and artist, or provide a Spotify track URL/ID.")

    strict_query = f'track:"{title}" artist:"{artist}"'
    strict_results = await search_spotify_tracks(strict_query, limit=1)
    if strict_results:
        return strict_results[0]

    fallback_results = await search_spotify_tracks(f"{title} {artist}", limit=1)
    if fallback_results:
        return fallback_results[0]

    raise ValueError("No matching Spotify track was found for the provided title and artist.")


async def analyze_spotify_track_by_input(value: str) -> dict[str, Any]:
    track = await get_spotify_track_by_input(value)
    track_id = str(track.get("id") or "").strip()
    if not track_id:
        raise ValueError("Spotify track ID could not be resolved.")

    spotify_preview_url = str(track.get("previewUrl") or "").strip()
    if spotify_preview_url:
        spotify_preview_analysis = await _analyze_remote_preview(spotify_preview_url)
        if spotify_preview_analysis is not None:
            spotify_preview_analysis = _downgrade_low_confidence_key(spotify_preview_analysis)
            spotify_preview_analysis["analysisJson"] = {
                **(spotify_preview_analysis.get("analysisJson") or {}),
                "analysisMode": "spotify_preview_audio",
                "source": "spotify_preview",
                "track": {
                    "id": track.get("id"),
                    "name": track.get("name"),
                    "artists": track.get("artists"),
                    "externalUrl": track.get("externalUrl"),
                    "previewAvailable": True,
                    "durationMs": track.get("durationMs"),
                    "popularity": track.get("popularity"),
                },
                "featuresAvailable": False,
                "deezerPreviewUsed": False,
            }
            return spotify_preview_analysis

    features: dict[str, Any] | None = None
    try:
        raw_features = await _spotify_get(f"/audio-features/{track_id}")
        if isinstance(raw_features, dict) and raw_features.get("id"):
            features = raw_features
    except SpotifyApiError as exc:
        if exc.status_code not in {403, 404}:
            raise

    deezer_preview_url: str | None = None
    deezer_match_score = 0.0
    deezer_track_id: int | None = None
    if features is None:
        artists = track.get("artists") or []
        primary_artist = str(artists[0]).strip() if isinstance(artists, list) and artists else ""
        track_duration_ms = track.get("durationMs")
        duration_sec = float(track_duration_ms / 1000.0) if isinstance(track_duration_ms, (int, float)) else None
        deezer_preview_url, deezer_match_score, deezer_track_id = await _find_deezer_preview_url(
            track_name=str(track.get("name") or ""),
            artist_name=primary_artist,
            duration_sec=duration_sec,
            isrc=str(track.get("isrc") or ""),
        )
        if deezer_preview_url and deezer_match_score >= 1.45:
            deezer_analysis = await _analyze_remote_preview(deezer_preview_url)
            if deezer_analysis is not None:
                deezer_analysis = _downgrade_low_confidence_key(deezer_analysis)
                deezer_bpm = (
                    await _get_deezer_track_bpm(deezer_track_id)
                    if isinstance(deezer_track_id, int) and deezer_track_id > 0
                    else None
                )
                if deezer_bpm is not None:
                    analyzed_bpm_raw = deezer_analysis.get("bpm")
                    analyzed_bpm = float(analyzed_bpm_raw) if isinstance(analyzed_bpm_raw, (int, float)) else deezer_bpm
                    bpm_candidates = [
                        _clip(analyzed_bpm, 40.0, 220.0),
                        _clip(analyzed_bpm / 2.0, 40.0, 220.0),
                        _clip(analyzed_bpm * 2.0, 40.0, 220.0),
                    ]
                    corrected_bpm = min(bpm_candidates, key=lambda candidate: abs(candidate - deezer_bpm))
                    if abs(corrected_bpm - deezer_bpm) > 6.0:
                        corrected_bpm = deezer_bpm

                    deezer_analysis["bpm"] = _round(corrected_bpm, 2)
                    current_bpm_confidence_raw = deezer_analysis.get("bpmConfidence")
                    current_bpm_confidence = (
                        float(current_bpm_confidence_raw)
                        if isinstance(current_bpm_confidence_raw, (int, float))
                        else 0.5
                    )
                    boosted_confidence = 0.86 if abs(corrected_bpm - deezer_bpm) <= 2.0 else 0.74
                    deezer_analysis["bpmConfidence"] = _round(
                        _clip(max(current_bpm_confidence, boosted_confidence), 0.05, 0.99),
                        3,
                    )

                deezer_analysis["analysisJson"] = {
                    **(deezer_analysis.get("analysisJson") or {}),
                    "analysisMode": "deezer_preview_audio",
                    "source": "deezer_preview_fallback",
                    "track": {
                        "id": track.get("id"),
                        "name": track.get("name"),
                        "artists": track.get("artists"),
                        "externalUrl": track.get("externalUrl"),
                        "previewAvailable": bool(track.get("previewUrl")),
                        "durationMs": track.get("durationMs"),
                        "popularity": track.get("popularity"),
                    },
                    "featuresAvailable": False,
                    "deezerPreviewUsed": True,
                    "deezerMatchScore": _round(deezer_match_score, 3),
                    "deezerTrackId": deezer_track_id,
                    "deezerCatalogBpm": deezer_bpm,
                }
                return deezer_analysis
        raise ValueError(
            "Could not find a reliable preview for this Spotify track. Upload audio for accurate BPM and key analysis."
        )

    duration_ms = int(track.get("durationMs") or 0)
    duration_sec = float(duration_ms / 1000.0) if duration_ms > 0 else 180.0

    tempo = _clip(float((features or {}).get("tempo") or 120.0), 40.0, 220.0)
    key_index_raw = (features or {}).get("key")
    key_index = int(key_index_raw) if isinstance(key_index_raw, (int, float)) and int(key_index_raw) >= 0 else None
    mode_raw = (features or {}).get("mode")
    mode = int(mode_raw) if isinstance(mode_raw, (int, float)) and int(mode_raw) in {0, 1} else None

    danceability = _clip(float((features or {}).get("danceability") or 0.5), 0.0, 1.0)
    energy = _clip(float((features or {}).get("energy") or 0.5), 0.0, 1.0)
    valence = _clip(float((features or {}).get("valence") or 0.5), 0.0, 1.0)

    bpm_confidence = 0.8 if features is not None else 0.32
    key_confidence = 0.72 if key_index is not None else 0.2
    tempo_stability = _clip(0.5 + danceability * 0.45, 0.0, 1.0)
    key_text = _format_key(key_index, mode)
    relative_key = _relative_key(key_index, mode)

    alternate_keys: list[dict[str, Any]] = []
    if key_index is not None:
        if mode in {0, 1}:
            alternate_keys.append(
                {
                    "key": _format_key(key_index, 1 - mode),
                    "confidence": _round(_clip(key_confidence - 0.2, 0.15, 0.85), 3),
                    "relation": "parallel",
                }
            )
            if mode == 1:
                rel_root = (key_index + 9) % 12
            else:
                rel_root = (key_index + 3) % 12
            alternate_keys.append(
                {
                    "key": _format_key(rel_root, 1 - mode),
                    "confidence": _round(_clip(key_confidence - 0.25, 0.15, 0.82), 3),
                    "relation": "relative",
                }
            )

        alternate_keys.append(
            {
                "key": _format_key((key_index + 2) % 12, mode if mode in {0, 1} else 1),
                "confidence": _round(_clip(key_confidence - 0.32, 0.1, 0.75), 3),
                "relation": "neighbor",
            }
        )

    energy_score = _round(energy * 100.0, 1)
    mood = _estimate_mood(energy, valence, mode)
    groove = _estimate_groove(danceability)
    sections = _estimate_sections(duration_sec, energy_score)

    result: dict[str, Any] = {
        "bpm": _round(tempo, 2),
        "bpmConfidence": _round(bpm_confidence, 3),
        "tempoStability": _round(tempo_stability, 3),
        "key": key_text,
        "keyConfidence": _round(key_confidence, 3),
        "relativeKey": relative_key,
        "alternateKeys": alternate_keys[:3],
        "energyScore": energy_score,
        "mood": mood,
        "groove": groove,
        "chordProgression": [],
        "sections": sections,
    }

    result["analysisJson"] = {
        "bpm": result["bpm"],
        "bpmConfidence": result["bpmConfidence"],
        "tempoStability": result["tempoStability"],
        "key": result["key"],
        "keyConfidence": result["keyConfidence"],
        "relativeKey": result["relativeKey"],
        "alternateKeys": result["alternateKeys"],
        "energyScore": result["energyScore"],
        "mood": result["mood"],
        "groove": result["groove"],
        "chordProgression": result["chordProgression"],
        "sections": result["sections"],
        "analysisMode": "spotify_features_estimate",
        "source": "spotify",
        "track": {
            "id": track.get("id"),
            "name": track.get("name"),
            "artists": track.get("artists"),
            "externalUrl": track.get("externalUrl"),
            "previewAvailable": bool(track.get("previewUrl")),
            "isrc": track.get("isrc"),
            "durationMs": track.get("durationMs"),
            "popularity": track.get("popularity"),
        },
        "featuresAvailable": features is not None,
        "deezerPreviewUsed": False,
        "deezerPreviewFound": bool(deezer_preview_url),
    }

    return result
