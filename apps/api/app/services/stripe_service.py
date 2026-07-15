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
        metadata=metadata,
        # Checkout Session metadata does NOT propagate to the Subscription it
        # creates -- without this, every subsequent invoice/subscription
        # webhook event (renewals, cancellations) has no way to identify the
        # user, since those events carry the Subscription/Invoice object, not
        # the Checkout Session.
        subscription_data={"metadata": metadata},
    )
    return session.url


def create_portal_session(customer_id: str) -> str:
    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=settings.stripe_success_url,
    )
    return session.url


def _resolve_user_id(repository: Repository, data: dict) -> str | None:
    user_id = data.get("metadata", {}).get("user_id")
    if user_id:
        return user_id

    # Fallback for subscriptions/invoices created before subscription_data
    # metadata was added, or if metadata is ever stripped by Stripe: match
    # the event's customer id against the customer id we stored on a
    # previous successful payment for this user.
    customer_id = data.get("customer")
    if not customer_id:
        return None

    profile = repository.get_profile_by_stripe_customer_id(customer_id)
    return str(profile["id"]) if profile else None


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
        user_id = _resolve_user_id(repository, data)
        customer_id = data.get("customer")
        if user_id:
            repository.set_profile_subscription(
                user_id, "active", 100, stripe_customer_id=customer_id
            )
    elif event_type in {"customer.subscription.deleted", "customer.subscription.updated"}:
        data = event["data"]["object"]
        status = data.get("status")
        user_id = _resolve_user_id(repository, data)
        customer_id = data.get("customer")
        if user_id:
            if status == "active":
                repository.set_profile_subscription(
                    user_id, "active", 100, stripe_customer_id=customer_id
                )
            else:
                repository.set_profile_subscription(
                    user_id, "canceled", 0, stripe_customer_id=customer_id
                )

    repository.client.table("stripe_events").update({"processed": True}).eq("stripe_event_id", event_id).execute()
