from fastapi import APIRouter, HTTPException, status

from app.dependencies.auth import AuthUser, CurrentUser
from app.schemas.models import ContactRequest, ContactResponse
from app.services.email_service import EmailDeliveryError, send_contact_email

router = APIRouter(prefix="/v1/contact", tags=["contact"])


@router.post("", response_model=ContactResponse)
async def submit_contact_form(
    payload: ContactRequest,
    user: AuthUser = CurrentUser,
) -> ContactResponse:
    try:
        await send_contact_email(
            kind=payload.kind,
            subject=payload.subject,
            message=payload.message,
            sender_email=user.email,
        )
    except EmailDeliveryError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    return ContactResponse()
