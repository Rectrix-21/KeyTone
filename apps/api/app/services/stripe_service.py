import stripe

from app.core.config import settings
from app.services.repository import Repository

stripe.api_key = settings.stripe_secret_key


def create_checkout_session(user_id: str, email: str) -> str:
    metadata = {"user_id": user_id, "email": email}
    session = stripe.checkout.Session.create(
        mode="subscription",
        line_items=[{"price": settings.stripe_price_id, "quantity": 1}],
        success_url=settings.stripe_success_url,
        cancel_url=settings.stripe_cancel_url,
        customer_email=email,
        metadata=metadata
    )
    return session.url


def handle_webhook(payload: bytes, sig_header: str) -> None:
    event = stripe.Webhook.construct_event(payload=payload, sig_header=sig_header, secret=settings.stripe_webhook_secret)

    repository = Repository()
    event_id = event.get("id")
    event_type = event.get("type")

    repository.client.table("stripe_events").upsert(
        {
            "stripe_event_id": event_id,
            "event_type": event_type,
            "raw_event": event,
            "processed": False
        },
        on_conflict="stripe_event_id",
        ignore_duplicates=True
    ).execute()

    if event_type in {"checkout.session.completed", "invoice.payment_succeeded"}:
        data = event["data"]["object"]
        user_id = data.get("metadata", {}).get("user_id")
        if user_id:
            repository.set_profile_subscription(user_id, "active", 100)
    elif event_type in {"customer.subscription.deleted", "customer.subscription.updated"}:
        data = event["data"]["object"]
        status = data.get("status")
        user_id = data.get("metadata", {}).get("user_id")
        if user_id:
            if status == "active":
                repository.set_profile_subscription(user_id, "active", 100)
            else:
                repository.set_profile_subscription(user_id, "canceled", 0)

    repository.client.table("stripe_events").update({"processed": True}).eq("stripe_event_id", event_id).execute()
