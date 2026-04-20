from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers.health import router as health_router
from app.routers.projects import router as projects_router
from app.routers.stripe import router as stripe_router
from app.routers.users import router as users_router


def create_app() -> FastAPI:
    app = FastAPI(title="KeyTone API", version="0.1.0")

    origins = [origin.strip() for origin in settings.api_cors_origins.split(",") if origin.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health_router)
    app.include_router(users_router)
    app.include_router(projects_router)
    app.include_router(stripe_router)
    return app


app = create_app()
