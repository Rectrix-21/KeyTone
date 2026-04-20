from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, status
from gotrue.errors import AuthApiError

from app.core.config import settings
from app.services.supabase_client import get_supabase_anon_client


@dataclass
class AuthUser:
    id: str
    email: str
    is_admin: bool


def _admin_email_set() -> set[str]:
    return {
        email.strip().lower()
        for email in settings.admin_emails.split(",")
        if email.strip()
    }


async def require_auth(authorization: str | None = Header(default=None)) -> AuthUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing access token")

    token = authorization.replace("Bearer ", "", 1).strip()
    client = get_supabase_anon_client()
    try:
        user_result = client.auth.get_user(token)
    except AuthApiError as exc:
        message = str(exc).lower()
        if "expired" in message:
            detail = "Access token expired"
        else:
            detail = "Invalid access token"
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail) from exc
    user = user_result.user
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid access token")

    user_email = user.email or ""
    is_admin = user_email.strip().lower() in _admin_email_set()
    return AuthUser(id=user.id, email=user_email, is_admin=is_admin)


CurrentUser = Depends(require_auth)
