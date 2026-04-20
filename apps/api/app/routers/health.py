from fastapi import APIRouter
import sys

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check():
    return {"status": "ok"}


@router.get("/health/runtime")
async def health_runtime():
    basic_pitch_available = True
    import_error = None
    try:
        import basic_pitch.inference  # noqa: F401
    except Exception as exc:  # noqa: BLE001
        basic_pitch_available = False
        import_error = str(exc)

    return {
        "python_executable": sys.executable,
        "python_version": sys.version,
        "basic_pitch_available": basic_pitch_available,
        "basic_pitch_import_error": import_error,
    }
