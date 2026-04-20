from fastapi import APIRouter

from app.dependencies.auth import AuthUser, CurrentUser
from app.schemas.models import UserSummaryResponse
from app.services.repository import Repository

router = APIRouter(prefix="/v1/users", tags=["users"])


@router.get("/me", response_model=UserSummaryResponse)
async def get_me(user: AuthUser = CurrentUser) -> UserSummaryResponse:
    repository = Repository()
    repository.ensure_profile(user.id, user.email)
    profile = repository.get_profile(user.id)
    return UserSummaryResponse(
        id=profile["id"],
        email=profile["email"],
        remaining_credits=profile["remaining_credits"],
        subscription_status=profile["subscription_status"],
        is_admin=user.is_admin,
        unlimited_credits=user.is_admin
    )
