from __future__ import annotations

import base64
import time
from typing import Any

import httpx

from app.core.config import settings

KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
FLAT_TO_SHARP = {
    "DB": "C#",
    "EB": "D#",
    "GB": "F#",
    "AB": "G#",
    "BB": "A#",
    "CB": "B",
    "FB": "E",
}


def _clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(max_value, value))


def _round(value: float, places: int = 3) -> float:
    factor = 10**places
    return round(value * factor) / factor


def _normalize_key_name(key_text: str) -> str:
    cleaned = (
        key_text.strip().upper().replace("♯", "#").replace("♭", "B").replace("MIN", "MINOR")
    )
    token = cleaned.split()[0] if cleaned else ""
    return FLAT_TO_SHARP.get(token, token)


def _key_name_to_index(key_text: str | None) -> int | None:
    if not key_text:
        return None
    key_name = _normalize_key_name(key_text)
    try:
        return KEY_NAMES.index(key_name)
    except ValueError:
        return None


def _format_key(key_index: int | None, mode: int | None) -> str:
    if key_index is None or key_index < 0 or key_index > 11:
        return "Unknown"
    scale = "major" if mode == 1 else "minor" if mode == 0 else ""
    return f"{KEY_NAMES[key_index]} {scale}".strip()


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


def _tempo_similarity(source: float, candidate: float) -> float:
    if source <= 0 or candidate <= 0:
        return 0.5
    diff = abs(source - candidate)
    return _clamp(1 - diff / 45.0, 0.0, 1.0)


def _cyclic_key_distance(a: int, b: int) -> int:
    direct = abs(a - b)
    return min(direct, 12 - direct)


def _harmonic_similarity(
    source_key: int | None,
    source_mode: int | None,
    candidate_key: int | None,
    candidate_mode: int | None,
) -> float:
    if source_key is None or candidate_key is None:
        return 0.55

    if source_key == candidate_key and source_mode == candidate_mode:
        return 1.0

    if source_key == candidate_key and source_mode != candidate_mode:
        return 0.84

    distance = _cyclic_key_distance(source_key, candidate_key)
    base = _clamp(1 - distance / 6.0, 0.15, 0.92)

    is_relative = (
        source_mode is not None
        and candidate_mode is not None
        and source_mode != candidate_mode
        and distance in {3, 9}
    )
    if is_relative:
        return max(base, 0.8)

    if source_mode is not None and candidate_mode is not None and source_mode != candidate_mode:
        return base * 0.9

    return base


def _energy_similarity(source: float, candidate: float) -> float:
    return _clamp(1 - abs(source - candidate), 0.0, 1.0)


def _dance_similarity(source: float, candidate: float) -> float:
    return _clamp(1 - abs(source - candidate), 0.0, 1.0)


def _valence_similarity(source: float, candidate: float) -> float:
    return _clamp(1 - abs(source - candidate), 0.0, 1.0)


def _producer_insights(
    harmonic_score: float,
    groove_score: float,
    energy_score: float,
    energy_delta: float,
) -> dict[str, Any]:
    if harmonic_score >= 0.9:
        harmonic_text = "Strong harmonic match with near-identical key center."
    elif harmonic_score >= 0.75:
        harmonic_text = "Harmonic movement is compatible for flip/remix workflows."
    else:
        harmonic_text = "Harmonic profile differs, useful for contrast references."

    if groove_score >= 0.86:
        groove_text = "Groove pocket is very close in tempo and dance feel."
    elif groove_score >= 0.68:
        groove_text = "Groove feel is related with moderate pocket differences."
    else:
        groove_text = "Groove contrast is higher; good for alternate bounce ideas."

    if abs(energy_delta) <= 0.08:
        energy_text = "Energy contour is closely matched across sections."
    elif energy_delta > 0:
        energy_text = "Candidate runs hotter in energy; useful as an intensity reference."
    else:
        energy_text = "Candidate is calmer in energy; useful for dynamic contrast."

    return {
        "harmonicSimilarity": {
            "score": _round(harmonic_score),
            "summary": harmonic_text,
        },
        "grooveSimilarity": {
            "score": _round(groove_score),
            "summary": groove_text,
        },
        "energyComparison": {
            "delta": _round(energy_delta),
            "summary": energy_text,
        },
    }


def _build_similarity_explanation(
    tempo_score: float,
    harmonic_score: float,
    groove_score: float,
    energy_score: float,
    valence_score: float,
) -> str:
    dimensions = [
        ("tempo pocket", tempo_score),
        ("harmonic center", harmonic_score),
        ("groove feel", groove_score),
        ("energy curve", energy_score),
        ("emotion/valence", valence_score),
    ]
    top = sorted(dimensions, key=lambda item: item[1], reverse=True)[:2]
    return (
        f"Closest match on {top[0][0]} and {top[1][0]}, with producer-usable alignment for arrangement references."
    )


def _normalize_source_features(source_features: dict[str, Any]) -> dict[str, Any]:
    tempo = float(source_features.get("tempo", 120.0))
    energy = _clamp(float(source_features.get("energy", 0.55)), 0.0, 1.0)

    danceability_raw = source_features.get("danceability")
    if danceability_raw is None:
        danceability = _clamp(0.45 + (0.08 if 95 <= tempo <= 130 else 0.0), 0.0, 1.0)
    else:
        danceability = _clamp(float(danceability_raw), 0.0, 1.0)

    valence_raw = source_features.get("valence")
    if valence_raw is None:
        valence = _clamp(0.38 + energy * 0.35, 0.0, 1.0)
    else:
        valence = _clamp(float(valence_raw), 0.0, 1.0)

    key_index: int | None = None
    mode: int | None = None

    key_value = source_features.get("key")
    if isinstance(key_value, (int, float)):
        key_index = int(_clamp(float(key_value), 0, 11))
    elif isinstance(key_value, str):
        key_index = _key_name_to_index(key_value)

    mode_value = source_features.get("mode")
    if isinstance(mode_value, (int, float)):
        mode = int(_clamp(float(mode_value), 0, 1))
    elif isinstance(mode_value, str):
        lowered = mode_value.lower()
        if "maj" in lowered:
            mode = 1
        elif "min" in lowered:
            mode = 0

    if mode is None and isinstance(key_value, str):
        lowered_key = key_value.lower()
        if "maj" in lowered_key:
            mode = 1
        elif "min" in lowered_key:
            mode = 0

    return {
        "tempo": _clamp(tempo, 40.0, 220.0),
        "key": key_index,
        "mode": mode,
        "energy": energy,
        "danceability": danceability,
        "valence": valence,
    }


def _estimate_features_from_track(track: dict[str, Any]) -> dict[str, Any]:
    popularity = float(track.get("popularity") or 50) / 100.0
    duration_ms = float(track.get("durationMs") or 180000)

    tempo_from_duration = 88.0 + _clamp((220000.0 - duration_ms) / 6000.0, -10.0, 18.0)
    tempo = _clamp(tempo_from_duration + popularity * 20.0, 72.0, 168.0)

    return {
        "tempo": _round(tempo, 2),
        "key": None,
        "mode": None,
        "energy": _round(_clamp(0.36 + popularity * 0.5, 0.2, 0.95), 3),
        "danceability": _round(_clamp(0.4 + popularity * 0.42, 0.22, 0.95), 3),
        "valence": _round(_clamp(0.35 + popularity * 0.32, 0.12, 0.92), 3),
    }


def _dedupe_tracks(tracks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    unique: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for track in tracks:
        track_id = str(track.get("id") or "")
        if not track_id or track_id in seen_ids:
            continue
        seen_ids.add(track_id)
        unique.append(track)
    return unique


class SpotifyClient:
    def __init__(self) -> None:
        self._client_id = settings.spotify_client_id.strip()
        self._client_secret = settings.spotify_client_secret.strip()
        self._market = settings.spotify_market.strip() or "US"

        if not self._client_id or not self._client_secret:
            raise RuntimeError(
                "Spotify API is not configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET."
            )

        self._access_token: str | None = None
        self._access_token_expiry = 0.0

    async def _get_access_token(self) -> str:
        now = time.time()
        if self._access_token and now < self._access_token_expiry - 20:
            return self._access_token

        basic = base64.b64encode(f"{self._client_id}:{self._client_secret}".encode("utf-8")).decode("utf-8")

        async with httpx.AsyncClient(timeout=12.0) as client:
            response = await client.post(
                "https://accounts.spotify.com/api/token",
                data={"grant_type": "client_credentials"},
                headers={"Authorization": f"Basic {basic}"},
            )

        if response.status_code >= 400:
            raise RuntimeError("Failed to authorize with Spotify API")

        payload = response.json()
        token = str(payload.get("access_token", ""))
        if not token:
            raise RuntimeError("Spotify API did not return an access token")

        expires_in = float(payload.get("expires_in", 3600))
        self._access_token = token
        self._access_token_expiry = now + max(60.0, expires_in)
        return token

    async def _api_get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        token = await self._get_access_token()
        headers = {"Authorization": f"Bearer {token}"}

        async with httpx.AsyncClient(timeout=16.0) as client:
            response = await client.get(
                f"https://api.spotify.com/v1{path}",
                params=params or {},
                headers=headers,
            )

        if response.status_code >= 400:
            detail = response.text
            raise RuntimeError(
                f"Spotify API request failed: {response.status_code} (path={path}) {detail}"
            )

        return response.json()

    async def search_tracks(self, query: str, limit: int = 8) -> list[dict[str, Any]]:
        payload = await self._api_get(
            "/search",
            {
                "q": query,
                "type": "track",
                "limit": max(1, min(limit, 20)),
                "market": self._market,
            },
        )
        items = payload.get("tracks", {}).get("items", [])
        return [self._normalize_track(item) for item in items]

    async def get_track(self, track_id: str) -> dict[str, Any]:
        payload = await self._api_get(f"/tracks/{track_id}", {"market": self._market})
        return self._normalize_track(payload)

    async def get_audio_features(self, track_ids: list[str]) -> dict[str, dict[str, Any]]:
        ids = [track_id for track_id in track_ids if track_id]
        if not ids:
            return {}

        try:
            payload = await self._api_get("/audio-features", {"ids": ",".join(ids[:100])})
        except RuntimeError as exc:
            if "403" in str(exc) or "404" in str(exc):
                return {}
            raise

        output: dict[str, dict[str, Any]] = {}
        for item in payload.get("audio_features", []) or []:
            if not item:
                continue
            track_id = str(item.get("id") or "")
            if not track_id:
                continue
            output[track_id] = {
                "tempo": _clamp(float(item.get("tempo") or 120.0), 40.0, 220.0),
                "key": int(item.get("key")) if item.get("key") is not None else None,
                "mode": int(item.get("mode")) if item.get("mode") is not None else None,
                "energy": _clamp(float(item.get("energy") or 0.5), 0.0, 1.0),
                "danceability": _clamp(float(item.get("danceability") or 0.5), 0.0, 1.0),
                "valence": _clamp(float(item.get("valence") or 0.5), 0.0, 1.0),
            }
        return output

    async def get_artist_top_tracks(self, artist_id: str, limit: int = 10) -> list[dict[str, Any]]:
        payload = await self._api_get(f"/artists/{artist_id}/top-tracks", {"market": self._market})
        items = payload.get("tracks", []) or []
        normalized = [self._normalize_track(item) for item in items]
        return normalized[: max(1, min(limit, 20))]

    async def get_recommendations(
        self,
        *,
        seed_tracks: list[str] | None = None,
        seed_genres: list[str] | None = None,
        target_features: dict[str, Any],
        limit: int,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "limit": max(1, min(limit, 50)),
            "market": self._market,
            "target_tempo": _round(float(target_features["tempo"]), 2),
            "target_energy": _round(float(target_features["energy"]), 3),
            "target_danceability": _round(float(target_features["danceability"]), 3),
            "target_valence": _round(float(target_features["valence"]), 3),
            "min_energy": _round(_clamp(float(target_features["energy"]) - 0.22, 0.0, 1.0), 3),
            "max_energy": _round(_clamp(float(target_features["energy"]) + 0.22, 0.0, 1.0), 3),
            "min_danceability": _round(
                _clamp(float(target_features["danceability"]) - 0.22, 0.0, 1.0), 3
            ),
            "max_danceability": _round(
                _clamp(float(target_features["danceability"]) + 0.22, 0.0, 1.0), 3
            ),
            "min_valence": _round(_clamp(float(target_features["valence"]) - 0.22, 0.0, 1.0), 3),
            "max_valence": _round(_clamp(float(target_features["valence"]) + 0.22, 0.0, 1.0), 3),
        }

        if target_features.get("key") is not None:
            params["target_key"] = int(target_features["key"])
        if target_features.get("mode") is not None:
            params["target_mode"] = int(target_features["mode"])

        if seed_tracks:
            params["seed_tracks"] = ",".join(seed_tracks[:5])
        elif seed_genres:
            params["seed_genres"] = ",".join(seed_genres[:5])
        else:
            params["seed_genres"] = "pop,electronic,hip-hop"

        payload = await self._api_get("/recommendations", params)
        return [self._normalize_track(item) for item in payload.get("tracks", [])]

    def _normalize_track(self, track_payload: dict[str, Any]) -> dict[str, Any]:
        images = track_payload.get("album", {}).get("images", []) or []
        image_url = images[1].get("url") if len(images) > 1 else images[0].get("url") if images else None
        artists = [artist for artist in track_payload.get("artists", []) if artist]
        return {
            "id": str(track_payload.get("id") or ""),
            "name": str(track_payload.get("name") or "Unknown"),
            "artists": [str(artist.get("name") or "") for artist in artists],
            "artistIds": [str(artist.get("id") or "") for artist in artists if artist.get("id")],
            "albumName": str(track_payload.get("album", {}).get("name") or ""),
            "imageUrl": image_url,
            "previewUrl": track_payload.get("preview_url"),
            "externalUrl": track_payload.get("external_urls", {}).get("spotify"),
            "durationMs": int(track_payload.get("duration_ms") or 0),
            "popularity": int(track_payload.get("popularity") or 0),
        }


async def _fallback_candidates_from_search(
    client: SpotifyClient,
    *,
    source_track: dict[str, Any] | None,
    seed_genres: list[str] | None,
    limit: int,
) -> list[dict[str, Any]]:
    gathered: list[dict[str, Any]] = []

    if source_track:
        track_name = str(source_track.get("name") or "").strip()
        artists = [str(name).strip() for name in source_track.get("artists", []) if str(name).strip()]
        artist_ids = [str(artist_id).strip() for artist_id in source_track.get("artistIds", []) if str(artist_id).strip()]

        queries: list[str] = []
        if track_name and artists:
            queries.append(f'track:"{track_name}" artist:"{artists[0]}"')
        if track_name:
            queries.append(track_name)
        if artists:
            queries.append(artists[0])

        for query in queries[:3]:
            try:
                gathered.extend(await client.search_tracks(query, limit=max(limit * 2, 12)))
            except Exception:
                continue

        for artist_id in artist_ids[:2]:
            try:
                gathered.extend(await client.get_artist_top_tracks(artist_id, limit=max(limit * 2, 10)))
            except Exception:
                continue
    else:
        terms = seed_genres or ["pop", "electronic", "hip-hop"]
        for term in terms[:4]:
            try:
                gathered.extend(await client.search_tracks(term, limit=max(limit * 3, 12)))
            except Exception:
                continue

    return _dedupe_tracks(gathered)[: max(limit * 4, 24)]


async def search_spotify_tracks(query: str, limit: int = 8) -> list[dict[str, Any]]:
    normalized_query = query.strip()
    if len(normalized_query) < 2:
        return []

    client = SpotifyClient()
    return await client.search_tracks(normalized_query, limit=limit)


async def find_similar_tracks(
    *,
    spotify_track_input: str | None,
    source_features: dict[str, Any] | None,
    limit: int = 8,
) -> dict[str, Any]:
    client = SpotifyClient()

    source_type: str
    source_track: dict[str, Any] | None = None
    normalized_source: dict[str, Any]
    recommendation_seed_tracks: list[str] | None = None
    recommendation_seed_genres: list[str] | None = None

    if spotify_track_input:
        source_track_id = _extract_track_id(spotify_track_input)
        source_track = await client.get_track(source_track_id)
        source_features_map = await client.get_audio_features([source_track_id])
        source_raw = source_features_map.get(source_track_id)
        if not source_raw:
            source_raw = _estimate_features_from_track(source_track)

        normalized_source = _normalize_source_features(source_raw)
        source_type = "spotify"
        recommendation_seed_tracks = [source_track_id]
    elif source_features:
        normalized_source = _normalize_source_features(source_features)
        source_type = "audio"

        if normalized_source["danceability"] >= 0.66:
            recommendation_seed_genres = ["dance", "house", "pop"]
        elif normalized_source["energy"] >= 0.65:
            recommendation_seed_genres = ["hip-hop", "edm", "trap"]
        else:
            recommendation_seed_genres = ["r-n-b", "indie", "soul"]
    else:
        raise ValueError("Provide either spotify_track_input or source_features")

    try:
        candidates = await client.get_recommendations(
            seed_tracks=recommendation_seed_tracks,
            seed_genres=recommendation_seed_genres,
            target_features=normalized_source,
            limit=max(limit * 3, 18),
        )
    except RuntimeError as exc:
        # New Spotify apps can receive 403/404 for recommendations. Use a search-based fallback pool.
        if "403" not in str(exc) and "404" not in str(exc):
            raise

        candidates = await _fallback_candidates_from_search(
            client,
            source_track=source_track,
            seed_genres=recommendation_seed_genres,
            limit=max(limit, 8),
        )

    source_track_id = source_track["id"] if source_track else None
    candidate_ids = [
        track["id"]
        for track in candidates
        if track.get("id") and track.get("id") != source_track_id
    ]
    features_map = await client.get_audio_features(candidate_ids)

    scored_items: list[dict[str, Any]] = []
    for track in candidates:
        track_id = track.get("id")
        if not track_id or track_id == source_track_id:
            continue

        features = features_map.get(track_id) or _estimate_features_from_track(track)

        tempo_score = _tempo_similarity(normalized_source["tempo"], features["tempo"])
        harmonic_score = _harmonic_similarity(
            normalized_source.get("key"),
            normalized_source.get("mode"),
            features.get("key"),
            features.get("mode"),
        )
        energy_score = _energy_similarity(normalized_source["energy"], features["energy"])
        dance_score = _dance_similarity(
            normalized_source["danceability"],
            features["danceability"],
        )
        valence_score = _valence_similarity(normalized_source["valence"], features["valence"])

        groove_score = _clamp(tempo_score * 0.45 + dance_score * 0.55, 0.0, 1.0)
        overall_score = _clamp(
            tempo_score * 0.28
            + harmonic_score * 0.24
            + energy_score * 0.2
            + dance_score * 0.18
            + valence_score * 0.1,
            0.0,
            1.0,
        )

        energy_delta = float(features["energy"] - normalized_source["energy"])

        scored_items.append(
            {
                "track": track,
                "features": {
                    "tempo": _round(features["tempo"], 2),
                    "key": _format_key(features.get("key"), features.get("mode")),
                    "keyIndex": features.get("key"),
                    "mode": features.get("mode"),
                    "energy": _round(features["energy"], 3),
                    "danceability": _round(features["danceability"], 3),
                    "valence": _round(features["valence"], 3),
                },
                "similarityScore": _round(overall_score, 3),
                "explanation": _build_similarity_explanation(
                    tempo_score,
                    harmonic_score,
                    groove_score,
                    energy_score,
                    valence_score,
                ),
                "producerInsights": _producer_insights(
                    harmonic_score,
                    groove_score,
                    energy_score,
                    energy_delta,
                ),
            }
        )

    scored_items.sort(key=lambda item: item["similarityScore"], reverse=True)

    limited = scored_items[: max(1, min(limit, 20))]

    return {
        "source": {
            "type": source_type,
            "track": source_track,
            "features": {
                "tempo": _round(normalized_source["tempo"], 2),
                "key": _format_key(normalized_source.get("key"), normalized_source.get("mode")),
                "keyIndex": normalized_source.get("key"),
                "mode": normalized_source.get("mode"),
                "energy": _round(normalized_source["energy"], 3),
                "danceability": _round(normalized_source["danceability"], 3),
                "valence": _round(normalized_source["valence"], 3),
            },
        },
        "similarTracks": limited,
        "count": len(limited),
    }
