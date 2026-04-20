from fastapi import APIRouter, Header, HTTPException, Request, status
from stripe import SignatureVerificationError

from app.dependencies.auth import AuthUser, CurrentUser
from app.schemas.models import CheckoutResponse
from app.services.repository import Repository
from app.services.stripe_service import create_checkout_session, handle_webhook

router = APIRouter(prefix="/v1/stripe", tags=["stripe"])


@router.post("/create-checkout-session", response_model=CheckoutResponse)
async def create_checkout(user: AuthUser = CurrentUser) -> CheckoutResponse:
    repository = Repository()
    repository.ensure_profile(user.id, user.email)
    profile = repository.get_profile(user.id)
    if profile.get("subscription_status") == "active":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have an active Pro subscription.",
        )

    checkout_url = create_checkout_session(user.id, user.email)
    return CheckoutResponse(checkout_url=checkout_url)


@router.post("/webhook")
async def stripe_webhook(request: Request, stripe_signature: str | None = Header(default=None, alias="Stripe-Signature")):
    if not stripe_signature:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing Stripe signature")

    payload = await request.body()
    try:
        handle_webhook(payload, stripe_signature)
    except SignatureVerificationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid signature: {exc}") from exc

    return {"ok": True}
