from __future__ import annotations

import asyncio
import copy
import re
import time
from collections import OrderedDict
from difflib import SequenceMatcher
from typing import Any

from app.services.lastfm_similarity import LastFmSimilarityProvider
from app.services.similarity_provider import (
    SimilarArtistCandidate,
    SimilarityCandidate,
    SimilarityProvider,
    TrackContext,
)
from app.services.spotify_catalog import (
    resolve_source_track,
    resolve_track_preview_url,
    search_spotify_tracks,
)


_SPOTIFY_MATCH_CACHE_MAX = 256
_LASTFM_TRACK_CACHE_MAX = 128
_LASTFM_ARTIST_CACHE_MAX = 128
_LASTFM_TRACK_CONTEXT_CACHE_MAX = 256
_SIMILAR_RESULT_CACHE_MAX = 96
_SIMILAR_RESULT_CACHE_TTL_SECONDS = 180
_SPOTIFY_MATCH_CONCURRENCY = 6
_SPOTIFY_MATCH_TIMEOUT_SECONDS = 4.0

_MOOD_HINTS = {
    "ambient",
    "atmospheric",
    "brooding",
    "calm",
    "chill",
    "chillout",
    "dark",
    "dreamy",
    "emotional",
    "energetic",
    "euphoric",
    "groovy",
    "happy",
    "melancholic",
    "moody",
    "sad",
    "smooth",
    "uplifting",
    "vibey",
}

_spotify_match_cache: OrderedDict[str, dict[str, Any] | None] = OrderedDict()
_lastfm_track_cache: OrderedDict[str, list[SimilarityCandidate]] = OrderedDict()
_lastfm_artist_cache: OrderedDict[str, list[SimilarArtistCandidate]] = OrderedDict()
_lastfm_track_context_cache: OrderedDict[str, TrackContext] = OrderedDict()
_similar_result_cache: OrderedDict[str, tuple[float, dict[str, Any]]] = OrderedDict()


def _cache_get(cache: OrderedDict[str, Any], key: str) -> Any:
    if key not in cache:
        return None
    cache.move_to_end(key)
    return cache[key]


def _cache_set(cache: OrderedDict[str, Any], key: str, value: Any, *, max_items: int) -> None:
    cache[key] = value
    cache.move_to_end(key)
    while len(cache) > max_items:
        cache.popitem(last=False)


def _candidate_key(title: str, artist: str) -> str:
    return f"{artist.strip().lower()}::{title.strip().lower()}"


def _normalize_text(value: str) -> str:
    lowered = value.strip().lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]", " ", lowered)).strip()


def _strip_mix_metadata(title: str) -> str:
    output = title
    output = re.sub(r"\([^)]*(remaster|live|mix|version|edit|mono|stereo)[^)]*\)", "", output, flags=re.IGNORECASE)
    output = re.sub(r"\[[^\]]*(remaster|live|mix|version|edit|mono|stereo)[^\]]*\]", "", output, flags=re.IGNORECASE)
    output = re.sub(r"\s+(feat\.?|ft\.?|featuring)\s+.*$", "", output, flags=re.IGNORECASE)
    output = re.sub(r"\s+", " ", output).strip(" -")
    return output.strip()


def _title_variants(title: str) -> list[str]:
    variants: list[str] = []

    def add_variant(value: str) -> None:
        clean = value.strip()
        if not clean:
            return
        if clean.lower() in {existing.lower() for existing in variants}:
            return
        variants.append(clean)

    add_variant(title)
    add_variant(_strip_mix_metadata(title))
    return variants


def _token_similarity(a: str, b: str) -> float:
    a_tokens = set(_normalize_text(a).split())
    b_tokens = set(_normalize_text(b).split())
    if not a_tokens or not b_tokens:
        return 0.0
    intersection = len(a_tokens & b_tokens)
    union = len(a_tokens | b_tokens)
    if union == 0:
        return 0.0
    return intersection / union


def _name_similarity(a: str, b: str) -> float:
    a_norm = _normalize_text(a)
    b_norm = _normalize_text(b)
    if not a_norm or not b_norm:
        return 0.0

    seq_ratio = SequenceMatcher(a=a_norm, b=b_norm).ratio()
    token_ratio = _token_similarity(a_norm, b_norm)
    return max(0.0, min(1.0, 0.7 * seq_ratio + 0.3 * token_ratio))


def _artist_similarity(candidate_artist: str, spotify_artists: list[str]) -> float:
    if not spotify_artists:
        return 0.0
    return max(_name_similarity(candidate_artist, artist_name) for artist_name in spotify_artists)


def _normalize_tag(tag: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]", " ", tag.strip().lower())).strip()


def _dedupe_tags(tags: list[str], *, limit: int) -> list[str]:
    output: list[str] = []
    seen: set[str] = set()
    for raw in tags:
        cleaned = " ".join(raw.strip().split())
        normalized = _normalize_tag(cleaned)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        output.append(cleaned)
        if len(output) >= limit:
            break
    return output


def _is_mood_tag(tag: str) -> bool:
    normalized = _normalize_tag(tag)
    if not normalized:
        return False
    tokens = set(normalized.split())
    if tokens & _MOOD_HINTS:
        return True
    return any(hint in normalized for hint in _MOOD_HINTS)


def _split_genre_and_mood_tags(*, spotify_genres: list[str], lastfm_tags: list[str]) -> tuple[list[str], list[str]]:
    merged = _dedupe_tags([*spotify_genres, *lastfm_tags], limit=16)
    genre: list[str] = []
    mood: list[str] = []

    for tag in merged:
        if _is_mood_tag(tag):
            mood.append(tag)
        else:
            genre.append(tag)

    if len(mood) < 2:
        for tag in lastfm_tags:
            if _is_mood_tag(tag):
                normalized = _normalize_tag(tag)
                if normalized and normalized not in {_normalize_tag(value) for value in mood}:
                    mood.append(tag)
                if len(mood) >= 5:
                    break

    return _dedupe_tags(genre, limit=5), _dedupe_tags(mood, limit=5)


def _shared_tags(source_tags: list[str], candidate_tags: list[str], *, limit: int) -> list[str]:
    source_index = {_normalize_tag(tag): tag for tag in source_tags}
    output: list[str] = []
    seen: set[str] = set()

    for tag in candidate_tags:
        normalized = _normalize_tag(tag)
        if not normalized or normalized in seen:
            continue
        source_tag = source_index.get(normalized)
        if not source_tag:
            continue
        seen.add(normalized)
        output.append(source_tag)
        if len(output) >= limit:
            break

    return output


def _build_similarity_explanation(*, shared: list[str], match_label: str) -> str:
    if shared:
        return f"Shared vibe tags: {', '.join(shared)}."

    if match_label == "Artist-based match (same artist)":
        return "Matched via the same artist profile and related listener tags."
    if match_label == "Artist-based match (similar artist)":
        return "Matched through similar artists with overlapping audience taste."
    if match_label == "low popularity match":
        return "Exploratory match surfaced from lower-popularity related tracks."

    return "Matched by Last.fm similarity with related genre and mood signals."


def _similar_result_cache_key(
    *,
    spotify_track_input: str | None,
    song_title: str | None,
    song_artist: str | None,
    limit: int,
) -> str:
    spotify_key = (spotify_track_input or "").strip().lower()
    title_key = _normalize_text(song_title or "")
    artist_key = _normalize_text(song_artist or "")
    return f"{spotify_key}::{title_key}::{artist_key}::{limit}"


def _similar_result_cache_get(cache_key: str) -> dict[str, Any] | None:
    cached = _similar_result_cache.get(cache_key)
    if cached is None:
        return None

    expires_at, payload = cached
    if time.time() >= expires_at:
        _similar_result_cache.pop(cache_key, None)
        return None

    _similar_result_cache.move_to_end(cache_key)
    return copy.deepcopy(payload)


def _similar_result_cache_set(cache_key: str, payload: dict[str, Any]) -> None:
    _similar_result_cache[cache_key] = (
        time.time() + _SIMILAR_RESULT_CACHE_TTL_SECONDS,
        copy.deepcopy(payload),
    )
    _similar_result_cache.move_to_end(cache_key)

    while len(_similar_result_cache) > _SIMILAR_RESULT_CACHE_MAX:
        _similar_result_cache.popitem(last=False)


async def _load_track_context(
    provider: SimilarityProvider,
    *,
    artist: str,
    title: str,
    limit_tags: int = 8,
) -> TrackContext:
    cache_key = _candidate_key(title, artist)
    cached = _cache_get(_lastfm_track_context_cache, cache_key)
    if cache_key in _lastfm_track_context_cache:
        return cached

    context = await provider.get_track_context(artist=artist, title=title, limit_tags=limit_tags)
    safe_context = TrackContext(
        url=context.url,
        tags=_dedupe_tags(context.tags or [], limit=max(1, min(limit_tags, 12))),
    )
    _cache_set(
        _lastfm_track_context_cache,
        cache_key,
        safe_context,
        max_items=_LASTFM_TRACK_CONTEXT_CACHE_MAX,
    )
    return safe_context


def _spotify_resolution_confidence(candidate: SimilarityCandidate, spotify_match: dict[str, Any] | None) -> float:
    if not spotify_match:
        return 0.0

    title_score = _name_similarity(candidate.title, str(spotify_match.get("name") or ""))
    artist_score = _artist_similarity(candidate.artist, spotify_match.get("artists") or [])
    return max(0.0, min(1.0, round(0.65 * title_score + 0.35 * artist_score, 3)))


def _duration_similarity(source_duration_ms: Any, candidate_duration_ms: Any) -> float:
    try:
        source_value = int(source_duration_ms)
        candidate_value = int(candidate_duration_ms)
    except (TypeError, ValueError):
        return 0.5

    if source_value <= 0 or candidate_value <= 0:
        return 0.5

    diff_ratio = abs(source_value - candidate_value) / max(source_value, 1)
    return max(0.0, min(1.0, 1.0 - min(diff_ratio, 1.0)))


def _score_item(
    *,
    base_similarity: float,
    resolution_confidence: float,
    duration_similarity: float,
    has_spotify_match: bool,
) -> float:
    if has_spotify_match:
        weighted = 0.72 * base_similarity + 0.23 * resolution_confidence + 0.05 * duration_similarity
    else:
        weighted = 0.92 * base_similarity + 0.08 * duration_similarity
    return max(0.0, min(1.0, round(weighted, 3)))


def _blend_similarity(raw_score: float, min_score: float, max_score: float) -> float:
    bounded_raw = max(0.0, min(1.0, raw_score))
    spread = max_score - min_score
    if spread <= 1e-9:
        normalized = bounded_raw
    else:
        normalized = (bounded_raw - min_score) / spread

    blended = 0.65 * bounded_raw + 0.35 * normalized
    return max(0.0, min(1.0, round(blended, 3)))


async def _spotify_match_for_candidate(title: str, artist: str) -> dict[str, Any] | None:
    cache_key = _candidate_key(title, artist)
    cached = _cache_get(_spotify_match_cache, cache_key)
    if cache_key in _spotify_match_cache:
        return cached

    candidate = SimilarityCandidate(title=title, artist=artist, similarity=0.0)
    strict_query = f'track:"{title}" artist:"{artist}"'
    try:
        strict_results = await search_spotify_tracks(strict_query, limit=4)
    except Exception:
        strict_results = []
    match = _pick_best_spotify_match(candidate, strict_results)

    strict_confidence = _spotify_resolution_confidence(candidate, match)
    if strict_confidence < 0.72:
        try:
            fallback_results = await search_spotify_tracks(f"{title} {artist}", limit=4)
        except Exception:
            fallback_results = []
        combined: list[dict[str, Any]] = []
        seen_ids: set[str] = set()

        for result in [*strict_results, *fallback_results]:
            result_id = str(result.get("id") or "").strip()
            if result_id and result_id in seen_ids:
                continue
            if result_id:
                seen_ids.add(result_id)
            combined.append(result)

        match = _pick_best_spotify_match(candidate, combined)

    _cache_set(_spotify_match_cache, cache_key, match, max_items=_SPOTIFY_MATCH_CACHE_MAX)
    return match


def _pick_best_spotify_match(
    candidate: SimilarityCandidate,
    options: list[dict[str, Any]],
) -> dict[str, Any] | None:
    best_match: dict[str, Any] | None = None
    best_score = -1.0

    for option in options:
        title_score = _name_similarity(candidate.title, str(option.get("name") or ""))
        artist_score = _artist_similarity(candidate.artist, option.get("artists") or [])
        popularity = option.get("popularity")
        popularity_score = 0.0
        if isinstance(popularity, (int, float)):
            popularity_score = max(0.0, min(1.0, float(popularity) / 100.0))

        combined = 0.62 * title_score + 0.33 * artist_score + 0.05 * popularity_score
        if combined > best_score:
            best_score = combined
            best_match = option

    return best_match


async def _load_provider_track_candidates(
    provider: SimilarityProvider,
    *,
    source_artist: str,
    source_title: str,
    limit: int,
) -> list[SimilarityCandidate]:
    cache_key = _candidate_key(source_title, source_artist)
    cached = _cache_get(_lastfm_track_cache, cache_key)
    if cache_key in _lastfm_track_cache:
        return cached

    for title_variant in _title_variants(source_title):
        provider_candidates = await provider.get_similar_tracks(
            artist=source_artist,
            title=title_variant,
            limit=min(max(limit, 20), 35),
        )
        if provider_candidates:
            for candidate in provider_candidates:
                candidate.match_label = "Direct match"
            _cache_set(_lastfm_track_cache, cache_key, provider_candidates, max_items=_LASTFM_TRACK_CACHE_MAX)
            return provider_candidates

    _cache_set(_lastfm_track_cache, cache_key, [], max_items=_LASTFM_TRACK_CACHE_MAX)
    return []


async def _load_provider_artist_candidates(
    provider: SimilarityProvider,
    *,
    source_artist: str,
    limit: int,
) -> list[SimilarArtistCandidate]:
    cache_key = source_artist.strip().lower()
    cached = _cache_get(_lastfm_artist_cache, cache_key)
    if cache_key in _lastfm_artist_cache:
        return cached

    artist_candidates = await provider.get_similar_artists(
        artist=source_artist,
        limit=min(max(limit, 20), 30),
    )
    _cache_set(_lastfm_artist_cache, cache_key, artist_candidates, max_items=_LASTFM_ARTIST_CACHE_MAX)
    return artist_candidates


async def _build_artist_based_candidates(
    *,
    source_key: str,
    similar_artists: list[SimilarArtistCandidate],
    limit: int,
) -> list[SimilarityCandidate]:
    if not similar_artists:
        return []

    selected_artists = similar_artists[: min(len(similar_artists), 10)]

    async def fetch_artist_tracks(artist_candidate: SimilarArtistCandidate) -> tuple[SimilarArtistCandidate, list[dict[str, Any]]]:
        tracks = await search_spotify_tracks(f'artist:"{artist_candidate.name}"', limit=4)
        return artist_candidate, tracks

    fetched = await asyncio.gather(*(fetch_artist_tracks(candidate) for candidate in selected_artists))

    candidates: list[SimilarityCandidate] = []
    seen: set[str] = {source_key}

    for rank, (artist_candidate, tracks) in enumerate(fetched):
        rank_penalty = rank / max(1, len(fetched))
        for track in tracks:
            track_name = str(track.get("name") or "").strip()
            track_artists = track.get("artists") or []
            track_artist = str(track_artists[0] if track_artists else "").strip()
            if not track_name or not track_artist:
                continue

            key = _candidate_key(track_name, track_artist)
            if key in seen:
                continue
            seen.add(key)

            popularity = track.get("popularity")
            popularity_score = 0.0
            if isinstance(popularity, (int, float)):
                popularity_score = max(0.0, min(1.0, float(popularity) / 100.0))

            base_similarity = (
                0.46 * max(0.0, min(1.0, artist_candidate.similarity))
                + 0.34 * (1.0 - rank_penalty)
                + 0.20 * popularity_score
            )
            candidates.append(
                SimilarityCandidate(
                    title=track_name,
                    artist=track_artist,
                    similarity=max(0.2, min(0.78, round(base_similarity, 3))),
                    provider_url=track.get("externalUrl"),
                    image_url=track.get("imageUrl"),
                    spotify_track=track,
                    match_label="Artist-based match (similar artist)",
                )
            )

            if len(candidates) >= limit:
                return candidates

    return candidates


async def _build_same_artist_candidates(
    *,
    source_artist: str,
    source_title: str,
    source_key: str,
    limit: int,
) -> list[SimilarityCandidate]:
    raw_queries = [
        f'artist:"{source_artist}" {_strip_mix_metadata(source_title)}',
        f'artist:"{source_artist}"',
        source_artist,
    ]

    queries: list[str] = []
    seen_queries: set[str] = set()
    for query in raw_queries:
        normalized = query.strip()
        if len(normalized) < 2:
            continue
        lowered = normalized.lower()
        if lowered in seen_queries:
            continue
        seen_queries.add(lowered)
        queries.append(normalized)

    candidates: list[SimilarityCandidate] = []
    seen: set[str] = {source_key}

    for query in queries:
        tracks = await search_spotify_tracks(query, limit=12)
        for track in tracks:
            track_name = str(track.get("name") or "").strip()
            track_artists = track.get("artists") or []
            track_artist = str(track_artists[0] if track_artists else "").strip()
            if not track_name or not track_artist:
                continue

            if _name_similarity(source_artist, track_artist) < 0.72:
                continue

            key = _candidate_key(track_name, track_artist)
            if key in seen:
                continue
            seen.add(key)

            popularity = track.get("popularity")
            popularity_score = 0.0
            if isinstance(popularity, (int, float)):
                popularity_score = max(0.0, min(1.0, float(popularity) / 100.0))

            title_affinity = _name_similarity(_strip_mix_metadata(source_title), _strip_mix_metadata(track_name))
            base_similarity = 0.56 + 0.22 * popularity_score + 0.22 * title_affinity
            candidates.append(
                SimilarityCandidate(
                    title=track_name,
                    artist=track_artist,
                    similarity=max(0.42, min(0.9, round(base_similarity, 3))),
                    provider_url=track.get("externalUrl"),
                    image_url=track.get("imageUrl"),
                    spotify_track=track,
                    match_label="Artist-based match (same artist)",
                )
            )

            if len(candidates) >= limit:
                return candidates

    return candidates


async def _build_low_popularity_candidates(
    *,
    source_track: dict[str, Any],
    source_artist: str,
    source_title: str,
    existing_keys: set[str],
    limit: int,
) -> list[SimilarityCandidate]:
    keyword_tokens = [token for token in _normalize_text(_strip_mix_metadata(source_title)).split() if len(token) >= 4]
    keyword_query = " ".join(keyword_tokens[:3]).strip()

    raw_queries = [
        f'artist:"{source_artist}"',
        source_artist,
        f"{source_artist} {_strip_mix_metadata(source_title)}",
        _strip_mix_metadata(source_title),
        keyword_query,
    ]

    queries: list[str] = []
    seen_queries: set[str] = set()
    for query in raw_queries:
        normalized = query.strip()
        if len(normalized) < 2:
            continue
        lowered = normalized.lower()
        if lowered in seen_queries:
            continue
        seen_queries.add(lowered)
        queries.append(normalized)

    collected: list[SimilarityCandidate] = []
    local_seen = set(existing_keys)

    for query in queries:
        tracks = await search_spotify_tracks(query, limit=12)
        for track in tracks:
            track_name = str(track.get("name") or "").strip()
            track_artists = track.get("artists") or []
            track_artist = str(track_artists[0] if track_artists else "").strip()
            if not track_name or not track_artist:
                continue

            key = _candidate_key(track_name, track_artist)
            if key in local_seen:
                continue
            local_seen.add(key)

            popularity = track.get("popularity")
            popularity_score = 0.0
            if isinstance(popularity, (int, float)):
                popularity_score = max(0.0, min(1.0, float(popularity) / 100.0))

            similarity = max(0.1, min(0.58, round(0.18 + 0.35 * popularity_score, 3)))
            collected.append(
                SimilarityCandidate(
                    title=track_name,
                    artist=track_artist,
                    similarity=similarity,
                    provider_url=track.get("externalUrl"),
                    image_url=track.get("imageUrl"),
                    spotify_track=track,
                    match_label="low popularity match",
                )
            )

            if len(collected) >= limit:
                return collected

    if not collected:
        source_artist_value = (source_track.get("artists") or [source_artist])[0]
        collected.append(
            SimilarityCandidate(
                title=str(source_track.get("name") or source_title),
                artist=str(source_artist_value or source_artist),
                similarity=0.1,
                provider_url=source_track.get("externalUrl"),
                image_url=source_track.get("imageUrl"),
                spotify_track=source_track,
                match_label="low popularity match",
            )
        )

    return collected


async def get_selected_track_context(
    *,
    spotify_track_input: str | None,
    song_title: str | None,
    song_artist: str | None,
    provider: SimilarityProvider | None = None,
) -> dict[str, Any]:
    similarity_provider = provider or LastFmSimilarityProvider()

    source_track = await resolve_source_track(
        spotify_track_input=spotify_track_input,
        song_title=song_title,
        song_artist=song_artist,
    )
    if not str(source_track.get("previewUrl") or "").strip():
        source_track["previewUrl"] = await resolve_track_preview_url(source_track)

    source_title = str(source_track.get("name") or "").strip()
    source_artists = source_track.get("artists") or []
    source_artist = str(source_artists[0] if source_artists else "").strip()

    if not source_title or not source_artist:
        raise RuntimeError("Could not resolve source track metadata for Last.fm tag lookup.")

    try:
        source_track_context = await _load_track_context(
            similarity_provider,
            artist=source_artist,
            title=source_title,
            limit_tags=10,
        )
    except Exception:
        source_track_context = TrackContext(url=None, tags=[])

    source_lastfm_tags = _dedupe_tags(source_track_context.tags or [], limit=10)
    source_genre_tags, source_mood_tags = _split_genre_and_mood_tags(
        spotify_genres=[],
        lastfm_tags=source_lastfm_tags,
    )

    return {
        "source": {
            "type": "spotify",
            "track": source_track,
            "genreTags": source_genre_tags,
            "moodTags": source_mood_tags,
            "lastfmUrl": source_track_context.url,
        },
        "provider": "lastfm",
    }


async def find_similar_songs(
    *,
    spotify_track_input: str | None,
    song_title: str | None,
    song_artist: str | None,
    limit: int = 20,
    provider: SimilarityProvider | None = None,
) -> dict[str, Any]:
    normalized_limit = max(1, min(limit, 60))
    candidate_budget = max(24, min(72, normalized_limit * 2))

    cache_key = _similar_result_cache_key(
        spotify_track_input=spotify_track_input,
        song_title=song_title,
        song_artist=song_artist,
        limit=normalized_limit,
    )
    cached_result = _similar_result_cache_get(cache_key)
    if cached_result is not None:
        return cached_result

    similarity_provider = provider or LastFmSimilarityProvider()

    source_track: dict[str, Any] | None = None
    if spotify_track_input:
        try:
            source_track = await resolve_source_track(
                spotify_track_input=spotify_track_input,
                song_title=None,
                song_artist=None,
            )
        except Exception:
            source_track = None

    if source_track is None:
        source_track = await resolve_source_track(
            spotify_track_input=None,
            song_title=song_title,
            song_artist=song_artist,
        )
    if not str(source_track.get("previewUrl") or "").strip():
        source_track["previewUrl"] = await resolve_track_preview_url(source_track)

    source_title = str(source_track.get("name") or "").strip()
    source_artists = source_track.get("artists") or []
    source_artist = str(source_artists[0] if source_artists else "").strip()
    source_duration_ms = source_track.get("durationMs")
    source_spotify_genres = [
        str(value).strip()
        for value in (source_track.get("genres") or [])
        if isinstance(value, str) and value.strip()
    ]

    if not source_title or not source_artist:
        raise RuntimeError("Could not resolve source track metadata for similarity lookup.")

    try:
        source_track_context = await _load_track_context(
            similarity_provider,
            artist=source_artist,
            title=source_title,
            limit_tags=10,
        )
    except Exception:
        source_track_context = TrackContext(url=None, tags=[])
    source_lastfm_tags = _dedupe_tags(source_track_context.tags or [], limit=10)
    source_genre_tags, source_mood_tags = _split_genre_and_mood_tags(
        spotify_genres=source_spotify_genres,
        lastfm_tags=source_lastfm_tags,
    )
    source_tag_pool = _dedupe_tags([*source_genre_tags, *source_mood_tags], limit=12)

    source_key = _candidate_key(source_title, source_artist)

    try:
        collected_candidates = await _load_provider_track_candidates(
            similarity_provider,
            source_artist=source_artist,
            source_title=source_title,
            limit=candidate_budget,
        )
    except Exception:
        collected_candidates = []

    deduped: list[SimilarityCandidate] = []
    seen: set[str] = {source_key}

    for candidate in collected_candidates:
        key = _candidate_key(candidate.title, candidate.artist)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(candidate)

    if not deduped:
        stage_two_limit = max(normalized_limit * 2, 30)
        same_artist_tracks = await _build_same_artist_candidates(
            source_artist=source_artist,
            source_title=source_title,
            source_key=source_key,
            limit=stage_two_limit,
        )

        for candidate in same_artist_tracks:
            key = _candidate_key(candidate.title, candidate.artist)
            if key in seen:
                continue
            seen.add(key)
            deduped.append(candidate)

    if not deduped or len(deduped) < max(normalized_limit, 20):
        try:
            artist_candidates = await _load_provider_artist_candidates(
                similarity_provider,
                source_artist=source_artist,
                limit=candidate_budget,
            )
        except Exception:
            artist_candidates = []

        remaining_for_stage_two = max(1, max(normalized_limit * 2, 30) - len(deduped))
        artist_based_tracks = await _build_artist_based_candidates(
            source_key=source_key,
            similar_artists=artist_candidates,
            limit=remaining_for_stage_two,
        )

        for candidate in artist_based_tracks:
            key = _candidate_key(candidate.title, candidate.artist)
            if key in seen:
                continue
            seen.add(key)
            deduped.append(candidate)

    if not deduped:
        low_popularity_tracks = await _build_low_popularity_candidates(
            source_track=source_track,
            source_artist=source_artist,
            source_title=source_title,
            existing_keys=seen,
            limit=max(normalized_limit * 2, 30),
        )

        for candidate in low_popularity_tracks:
            key = _candidate_key(candidate.title, candidate.artist)
            if key in seen:
                continue
            seen.add(key)
            deduped.append(candidate)

    if not deduped:
        deduped.append(
            SimilarityCandidate(
                title=source_title,
                artist=source_artist,
                similarity=0.1,
                provider_url=source_track.get("externalUrl"),
                image_url=source_track.get("imageUrl"),
                spotify_track=source_track,
                match_label="low popularity match",
            )
        )

    ranked_candidates = sorted(
        deduped,
        key=lambda candidate: max(0.0, min(1.0, candidate.similarity)),
        reverse=True,
    )
    processing_limit = min(
        len(ranked_candidates),
        max(normalized_limit * 2, 32),
    )
    processing_candidates = ranked_candidates[:processing_limit]

    raw_scores = [
        max(0.0, min(1.0, candidate.similarity))
        for candidate in processing_candidates
    ]
    min_score = min(raw_scores)
    max_score = max(raw_scores)
    spotify_match_semaphore = asyncio.Semaphore(_SPOTIFY_MATCH_CONCURRENCY)

    async def build_item(candidate: SimilarityCandidate) -> dict[str, Any]:
        spotify_match = candidate.spotify_track
        if spotify_match is None:
            try:
                async with spotify_match_semaphore:
                    spotify_match = await asyncio.wait_for(
                        _spotify_match_for_candidate(candidate.title, candidate.artist),
                        timeout=_SPOTIFY_MATCH_TIMEOUT_SECONDS,
                    )
            except Exception:
                spotify_match = None
        base_score = _blend_similarity(candidate.similarity, min_score, max_score)
        resolution_confidence = _spotify_resolution_confidence(candidate, spotify_match)
        duration_score = _duration_similarity(
            source_duration_ms,
            spotify_match.get("durationMs") if spotify_match else None,
        )

        score = _score_item(
            base_similarity=base_score,
            resolution_confidence=resolution_confidence,
            duration_similarity=duration_score,
            has_spotify_match=spotify_match is not None,
        )

        if candidate.match_label == "low popularity match":
            score = min(score, 0.6)

        return {
            "title": candidate.title,
            "artist": candidate.artist,
            "similarityScore": round(score, 3),
            "artworkUrl": (
                spotify_match.get("imageUrl") if spotify_match else None
            )
            or candidate.image_url,
            "previewUrl": spotify_match.get("previewUrl") if spotify_match else None,
            "externalUrl": (
                spotify_match.get("externalUrl") if spotify_match else None
            )
            or candidate.provider_url,
            "spotifyTrack": spotify_match,
            "providerUrl": candidate.provider_url,
            "provider": "lastfm",
            "resolutionConfidence": round(resolution_confidence, 3),
            "matchLabel": candidate.match_label,
        }

    similar_items = await asyncio.gather(
        *(build_item(candidate) for candidate in processing_candidates)
    )
    similar_items.sort(key=lambda item: item.get("similarityScore", 0.0), reverse=True)

    sliced = similar_items[:normalized_limit]
    tag_enrichment_semaphore = asyncio.Semaphore(4)

    async def enrich_item_tags(item: dict[str, Any]) -> dict[str, Any]:
        item_artist = str(item.get("artist") or "").strip()
        item_title = str(item.get("title") or "").strip()
        if not item_artist or not item_title:
            item["sharedTags"] = []
            item["genreTags"] = []
            item["moodTags"] = []
            item["similarityExplanation"] = _build_similarity_explanation(
                shared=[],
                match_label=str(item.get("matchLabel") or "Direct match"),
            )
            return item

        try:
            async with tag_enrichment_semaphore:
                context = await _load_track_context(
                    similarity_provider,
                    artist=item_artist,
                    title=item_title,
                    limit_tags=8,
                )
        except Exception:
            context = TrackContext(url=None, tags=[])
        item_lastfm_tags = _dedupe_tags(context.tags or [], limit=8)
        raw_spotify_track = item.get("spotifyTrack")
        spotify_track = raw_spotify_track if isinstance(raw_spotify_track, dict) else {}
        spotify_genres = [
            str(value).strip()
            for value in (spotify_track.get("genres") or [])
            if isinstance(value, str) and value.strip()
        ]
        item_genre_tags, item_mood_tags = _split_genre_and_mood_tags(
            spotify_genres=spotify_genres,
            lastfm_tags=item_lastfm_tags,
        )

        if not item_genre_tags:
            item_genre_tags = _dedupe_tags([*spotify_genres, *source_genre_tags], limit=5)

        if not item_mood_tags:
            mood_fallback = [tag for tag in item_lastfm_tags if _is_mood_tag(tag)]
            item_mood_tags = _dedupe_tags([*mood_fallback, *source_mood_tags], limit=5)

        shared = _shared_tags(source_tag_pool, [*item_genre_tags, *item_mood_tags, *item_lastfm_tags], limit=3)

        item["sharedTags"] = shared
        item["genreTags"] = item_genre_tags
        item["moodTags"] = item_mood_tags
        item["similarityExplanation"] = _build_similarity_explanation(
            shared=shared,
            match_label=str(item.get("matchLabel") or "Direct match"),
        )

        preview_url = str(item.get("previewUrl") or "").strip()
        if not preview_url:
            preview_source = (
                spotify_track
                if spotify_track
                else {
                    "name": item_title,
                    "artists": [item_artist],
                }
            )
            item["previewUrl"] = await resolve_track_preview_url(preview_source)

        return item

    sliced = await asyncio.gather(*(enrich_item_tags(item) for item in sliced))

    response_payload = {
        "source": {
            "type": "spotify",
            "track": source_track,
            "genreTags": source_genre_tags,
            "moodTags": source_mood_tags,
            "lastfmUrl": source_track_context.url,
        },
        "similarSongs": sliced,
        "count": len(sliced),
        "provider": "lastfm",
        "hasMore": len(deduped) > len(sliced),
    }

    _similar_result_cache_set(cache_key, response_payload)
    return response_payload
