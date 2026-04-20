import asyncio
import copy
import hashlib
import secrets
import tempfile
from collections import OrderedDict
from pathlib import Path
from typing import Any
from typing import Literal

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from app.core.errors import CreditExhaustedError
from app.dependencies.auth import AuthUser, CurrentUser
from app.schemas.models import ProjectResponse, UploadAcceptedResponse
from app.services.audio_analysis import analyze_track_insights
from app.services.audio_validation import validate_file_extension_for_allowed, validate_file_size
from app.services.jobs import (
    alter_variation_midi,
    cancel_project_task,
    generate_midi_from_stem,
    process_track_starter_project,
    process_project,
    start_project_task,
)
from app.services.repository import Repository
from app.services.similar_song_service import (
    find_similar_songs,
    get_selected_track_context,
)
from app.services.spotify_catalog import (
    SpotifyApiError,
    analyze_spotify_track_by_input,
    search_spotify_tracks,
)

router = APIRouter(prefix="/v1/projects", tags=["projects"])


DISCOVER_CACHE_MAX_ITEMS = 32
_discover_analysis_cache: "OrderedDict[str, dict[str, Any]]" = OrderedDict()


def _discover_cache_get(cache_key: str) -> dict[str, Any] | None:
    cached = _discover_analysis_cache.get(cache_key)
    if cached is None:
        return None
    _discover_analysis_cache.move_to_end(cache_key)
    return copy.deepcopy(cached)


def _discover_cache_set(cache_key: str, value: dict[str, Any]) -> None:
    _discover_analysis_cache[cache_key] = copy.deepcopy(value)
    _discover_analysis_cache.move_to_end(cache_key)
    while len(_discover_analysis_cache) > DISCOVER_CACHE_MAX_ITEMS:
        _discover_analysis_cache.popitem(last=False)


StarterVariant = Literal["safe", "fresh", "experimental"]


class SimilarTracksRequest(BaseModel):
    spotify_track_input: str | None = None
    song_title: str | None = None
    song_artist: str | None = None
    limit: int = Field(default=20, ge=1, le=60)


class SpotifyAnalyzeRequest(BaseModel):
    spotify_track_input: str = Field(min_length=4)


class SpotifyTrackContextRequest(BaseModel):
    spotify_track_input: str | None = None
    song_title: str | None = None
    song_artist: str | None = None


@router.get("", response_model=list[ProjectResponse])
async def list_user_projects(user: AuthUser = CurrentUser) -> list[ProjectResponse]:
    repository = Repository()
    repository.ensure_profile(user.id, user.email)
    return repository.list_projects(user.id)


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str, user: AuthUser = CurrentUser) -> ProjectResponse:
    repository = Repository()
    project = repository.get_project(project_id, user.id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.post("/upload", response_model=UploadAcceptedResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_project(
    file: UploadFile = File(...),
    feature: Literal["extraction", "variation"] = Form(default="extraction"),
    extract_stems: str = Form(default="bass,drums,other,piano,guitar,vocals"),
    variation_target: Literal["melody", "chord", "bass", "full"] = Form(default="full"),
    user: AuthUser = CurrentUser,
) -> UploadAcceptedResponse:
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing file name")

    payload = await file.read()

    audio_extensions = {"mp3", "wav", "m4a"}
    midi_extensions = {"mid", "midi"}
    allowed_extensions = audio_extensions if feature == "extraction" else (audio_extensions | midi_extensions)
    extension = validate_file_extension_for_allowed(file.filename, allowed_extensions)
    validate_file_size(len(payload))

    is_midi_input = extension in midi_extensions
    if feature == "extraction" and is_midi_input:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MIDI input is not supported for extraction")

    stems = [part.strip().lower() for part in extract_stems.split(",") if part.strip()]
    allowed_stems = {"bass", "drums", "other", "piano", "guitar", "vocals"}
    if not stems:
        stems = ["bass", "drums", "other", "piano", "guitar", "vocals"]
    invalid_stems = [stem for stem in stems if stem not in allowed_stems]
    if invalid_stems:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid extract targets")

    repository = Repository()
    repository.ensure_profile(user.id, user.email)
    consumed = repository.consume_credit(user.id, is_admin=user.is_admin)
    if not consumed:
        raise CreditExhaustedError()

    project_options = {
        "extract_stems": stems,
        "variation_target": variation_target,
        "input_kind": "midi" if is_midi_input else "audio",
    }
    project = repository.create_project(user.id, file.filename, feature=feature, options=project_options)

    start_project_task(
        project["id"],
        process_project(
            project_id=project["id"],
            user_id=user.id,
            file_name=file.filename,
            raw_bytes=payload,
            content_type=file.content_type or "application/octet-stream",
            feature=feature,
            extract_targets=stems,
            variation_target=variation_target,
            is_midi_input=is_midi_input,
        )
    )

    return UploadAcceptedResponse(project_id=project["id"], status="pending")


@router.post("/discover/analyze", status_code=status.HTTP_200_OK)
async def analyze_discover_track(
    file: UploadFile = File(...),
    user: AuthUser = CurrentUser,
) -> dict[str, Any]:
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing file name")

    payload = await file.read()
    validate_file_extension_for_allowed(file.filename, {"mp3", "wav", "m4a"})
    validate_file_size(len(payload))

    cache_key = hashlib.sha1(payload).hexdigest()
    cached = _discover_cache_get(cache_key)
    if cached is not None:
        return cached

    repository = Repository()
    repository.ensure_profile(user.id, user.email)

    with tempfile.TemporaryDirectory(prefix="keytone_discover_") as temp_dir:
        input_audio = Path(temp_dir) / file.filename
        input_audio.write_bytes(payload)
        try:
            result = await asyncio.to_thread(analyze_track_insights, str(input_audio))
            _discover_cache_set(cache_key, result)
            return result
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Track analysis failed: {exc}",
            ) from exc


@router.get("/discover/spotify/search", status_code=status.HTTP_200_OK)
async def search_discover_spotify_tracks(
    q: str,
    limit: int = 8,
    user: AuthUser = CurrentUser,
) -> dict[str, Any]:
    repository = Repository()
    repository.ensure_profile(user.id, user.email)

    def _map_spotify_status(status_code: int) -> int:
        if status_code == 400:
            return status.HTTP_400_BAD_REQUEST
        if status_code in {401, 403, 429, 500, 502, 503, 504}:
            return status.HTTP_503_SERVICE_UNAVAILABLE
        return status.HTTP_502_BAD_GATEWAY

    try:
        tracks = await search_spotify_tracks(q, limit=max(1, min(limit, 20)))
        return {"tracks": tracks}
    except SpotifyApiError as exc:
        raise HTTPException(
            status_code=_map_spotify_status(exc.status_code),
            detail=str(exc),
        ) from exc
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Spotify search failed: {exc}",
        ) from exc


@router.post("/discover/spotify/analyze", status_code=status.HTTP_200_OK)
async def analyze_discover_spotify_track(
    payload: SpotifyAnalyzeRequest,
    user: AuthUser = CurrentUser,
) -> dict[str, Any]:
    repository = Repository()
    repository.ensure_profile(user.id, user.email)

    def _map_spotify_status(status_code: int) -> int:
        if status_code == 400:
            return status.HTTP_400_BAD_REQUEST
        if status_code in {401, 403, 429, 500, 502, 503, 504}:
            return status.HTTP_503_SERVICE_UNAVAILABLE
        return status.HTTP_502_BAD_GATEWAY

    try:
        return await analyze_spotify_track_by_input(payload.spotify_track_input)
    except SpotifyApiError as exc:
        raise HTTPException(
            status_code=_map_spotify_status(exc.status_code),
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Spotify track analysis failed: {exc}",
        ) from exc


@router.post("/discover/spotify/similar", status_code=status.HTTP_200_OK)
async def discover_similar_tracks(
    payload: SimilarTracksRequest,
    user: AuthUser = CurrentUser,
) -> dict[str, Any]:
    repository = Repository()
    repository.ensure_profile(user.id, user.email)

    def _map_spotify_status(status_code: int) -> int:
        if status_code == 400:
            return status.HTTP_400_BAD_REQUEST
        if status_code in {401, 403, 429, 500, 502, 503, 504}:
            return status.HTTP_503_SERVICE_UNAVAILABLE
        return status.HTTP_502_BAD_GATEWAY

    spotify_input = (payload.spotify_track_input or "").strip() or None
    song_title = (payload.song_title or "").strip() or None
    song_artist = (payload.song_artist or "").strip() or None

    if not spotify_input and not (song_title and song_artist):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide a Spotify track URL/ID, or both song title and artist.",
        )

    try:
        result = await find_similar_songs(
            spotify_track_input=spotify_input,
            song_title=song_title,
            song_artist=song_artist,
            limit=payload.limit,
        )
        return result
    except SpotifyApiError as exc:
        raise HTTPException(
            status_code=_map_spotify_status(exc.status_code),
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Similar track lookup failed: {exc}",
        ) from exc


@router.post("/discover/spotify/context", status_code=status.HTTP_200_OK)
async def discover_spotify_track_context(
    payload: SpotifyTrackContextRequest,
    user: AuthUser = CurrentUser,
) -> dict[str, Any]:
    repository = Repository()
    repository.ensure_profile(user.id, user.email)

    def _map_spotify_status(status_code: int) -> int:
        if status_code == 400:
            return status.HTTP_400_BAD_REQUEST
        if status_code in {401, 403, 429, 500, 502, 503, 504}:
            return status.HTTP_503_SERVICE_UNAVAILABLE
        return status.HTTP_502_BAD_GATEWAY

    spotify_input = (payload.spotify_track_input or "").strip() or None
    song_title = (payload.song_title or "").strip() or None
    song_artist = (payload.song_artist or "").strip() or None

    if not spotify_input and not (song_title and song_artist):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide a Spotify track URL/ID, or both song title and artist.",
        )

    try:
        return await get_selected_track_context(
            spotify_track_input=spotify_input,
            song_title=song_title,
            song_artist=song_artist,
        )
    except SpotifyApiError as exc:
        raise HTTPException(
            status_code=_map_spotify_status(exc.status_code),
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Track context lookup failed: {exc}",
        ) from exc


@router.post("/{project_id}/generate-midi", status_code=status.HTTP_202_ACCEPTED)
async def generate_project_stem_midi(
    project_id: str,
    target: Literal["melody", "chord", "bass", "piano", "guitar"] = Form(...),
    user: AuthUser = CurrentUser,
) -> dict[str, str]:
    repository = Repository()
    project = repository.get_project(project_id, user.id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    selected_stems = []
    if project.options and isinstance(project.options.get("extract_stems"), list):
        selected_stems = [str(value) for value in project.options["extract_stems"]]

    target_to_stem = {
        "bass": "bass",
        "melody": "vocals",
        "chord": "other",
        "piano": "piano",
        "guitar": "guitar",
    }
    required_stem = target_to_stem[target]
    if selected_stems and required_stem not in selected_stems:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Stem was not selected at upload time")

    start_project_task(
        project_id,
        generate_midi_from_stem(project_id=project_id, user_id=user.id, target=target),
    )
    return {"status": "processing", "target": target}


@router.post("/starter/generate", status_code=status.HTTP_202_ACCEPTED)
async def generate_track_starter(
    genre: str = Form(default="rnb"),
    mood: str = Form(default="emotional"),
    bpm: float = Form(default=118.0),
    key: str | None = Form(default=None),
    complexity: Literal["simple", "medium", "complex"] = Form(default="medium"),
    bars: int = Form(default=8),
    reference_description: str = Form(default=""),
    user: AuthUser = CurrentUser,
) -> dict[str, str | list[str] | int]:
    repository = Repository()
    repository.ensure_profile(user.id, user.email)

    consumed = repository.consume_credit(user.id, is_admin=user.is_admin)
    if not consumed:
        raise CreditExhaustedError()

    normalized_genre = genre.strip().lower() or "rnb"
    normalized_mood = mood.strip().lower() or "emotional"
    normalized_key = key.strip() if key and key.strip() else None
    normalized_bpm = max(68.0, min(178.0, float(bpm)))
    if bars not in {8, 16}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bars must be 8 or 16")
    bars_value: Literal[8, 16] = 16 if bars == 16 else 8
    variants: tuple[StarterVariant, ...] = ("safe", "fresh", "experimental")
    base_seed = secrets.randbelow(2_147_483_647) + 1

    project_ids: list[str] = []
    for variant_index, variant in enumerate(variants):
        starter_file_name = f"starter_{normalized_genre}_{normalized_mood}_{variant}.mid"
        project_options = {
            "input_kind": "generated",
            "starter_genre": normalized_genre,
            "starter_mood": normalized_mood,
            "starter_complexity": complexity,
            "starter_bars": int(bars_value),
            "starter_variant": variant,
            "starter_reference_description": reference_description,
            "variation_key": normalized_key,
            "variation_bpm": normalized_bpm,
        }
        project = repository.create_project(
            user.id,
            starter_file_name,
            feature="starter",
            options=project_options,
        )
        project_ids.append(str(project["id"]))

        start_project_task(
            str(project["id"]),
            process_track_starter_project(
                project_id=str(project["id"]),
                user_id=user.id,
                genre=normalized_genre,
                mood=normalized_mood,
                bpm=normalized_bpm,
                key=normalized_key,
                complexity=complexity,
                bars=bars_value,
                reference_description=reference_description,
                variant=variant,
                seed=base_seed + (variant_index * 1009),
            ),
        )

    return {
        "status": "pending",
        "count": len(project_ids),
        "project_ids": project_ids,
        "message": "Generated safe, fresh, and experimental starter ideas",
    }


@router.post("/{project_id}/alter", status_code=status.HTTP_202_ACCEPTED)
async def alter_project_variation(
    project_id: str,
    target: Literal["melody", "chord", "bass", "full"] = Form(...),
    key: str = Form(default="C major"),
    bpm: float | None = Form(default=None),
    intent: Literal[
        "catchier",
        "richer",
        "smoother",
        "emotional",
        "rhythmic",
        "modern",
        "sparse",
        "soulful",
        "cinematic",
        "aggressive",
        "premium",
    ] = Form(default="richer"),
    variation_strength: float | None = Form(default=None),
    preserve_identity: float | None = Form(default=None),
    lane_move: str = Form(default="auto"),
    style: Literal["auto", "lift", "groove", "cinematic"] = Form(default="auto"),
    creativity: float | None = Form(default=None),
    user: AuthUser = CurrentUser,
) -> dict[str, str | float | None]:
    repository = Repository()
    project = repository.get_project(project_id, user.id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.feature != "variation":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Alter is only available for variation projects")

    normalized_key = key.strip() or "C major"
    start_project_task(
        project_id,
        alter_variation_midi(
            project_id=project_id,
            user_id=user.id,
            target=target,
            key=normalized_key,
            bpm=bpm,
            intent=intent,
            variation_strength=variation_strength,
            preserve_identity=preserve_identity,
            lane_move=lane_move,
            style=style,
            creativity=creativity,
        ),
    )
    return {
        "status": "processing",
        "target": target,
        "key": normalized_key,
        "bpm": bpm,
        "intent": intent,
        "variation_strength": variation_strength,
        "preserve_identity": preserve_identity,
        "lane_move": lane_move,
        "style": style,
        "creativity": creativity,
    }


@router.post("/{project_id}/cancel")
async def cancel_project(project_id: str, user: AuthUser = CurrentUser) -> dict[str, str]:
    repository = Repository()
    project = repository.get_project(project_id, user.id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    if project.status not in {"pending", "processing"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project is not running")

    cancel_project_task(project_id)
    repository.set_project_progress(project_id, 100, "Cancelled")
    repository.fail_project(project_id, "Cancelled by user")
    if not user.is_admin:
        repository.refund_credit(user.id, "cancelled")

    return {"status": "cancelled"}


@router.delete("/{project_id}", status_code=status.HTTP_200_OK)
async def delete_project(project_id: str, user: AuthUser = CurrentUser) -> dict[str, str]:
    repository = Repository()
    project = repository.get_project(project_id, user.id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    cancel_project_task(project_id)
    deleted = repository.delete_project(project_id, user.id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return {"status": "deleted"}


@router.delete("", status_code=status.HTTP_200_OK)
async def clear_project_history(
    feature: Literal["extraction", "variation", "starter"] | None = None,
    user: AuthUser = CurrentUser,
) -> dict[str, int | str]:
    repository = Repository()
    for project in repository.list_projects(user.id):
        if feature and project.feature != feature:
            continue
        cancel_project_task(project.id)

    deleted_count = repository.clear_projects(user.id, feature=feature)
    return {"status": "cleared", "deleted_count": deleted_count}
