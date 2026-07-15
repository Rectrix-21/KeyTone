from datetime import UTC, datetime, timedelta
from typing import Any

from app.schemas.models import ProjectResponse
from app.services.supabase_client import get_supabase_service_client

FREE_PLAN_WEEKLY_CREDITS = 5
CREDIT_RESET_INTERVAL = timedelta(days=7)


def is_pro_tier(subscription_status: str, is_admin: bool) -> bool:
    return is_admin or subscription_status == "active"


def _normalize_email_for_credit_tracking(email: str) -> str:
    cleaned = email.strip().lower()
    if "@" not in cleaned:
        return cleaned

    local, _, domain = cleaned.partition("@")
    local = local.split("+", 1)[0]  # "+tag" aliases route to the same inbox everywhere

    if domain in {"gmail.com", "googlemail.com"}:
        local = local.replace(".", "")  # Gmail ignores dots in the local part
        domain = "gmail.com"  # googlemail.com is just an alias domain for gmail.com

    return f"{local}@{domain}"


class Repository:
    def __init__(self) -> None:
        self.client = get_supabase_service_client()

    def ensure_profile(self, user_id: str, email: str) -> dict[str, Any]:
        existing = self.client.table("profiles").select("*").eq("id", user_id).limit(1).execute()
        if existing.data:
            return self._apply_weekly_credit_reset(existing.data[0])

        initial_credits = FREE_PLAN_WEEKLY_CREDITS
        normalized_email = _normalize_email_for_credit_tracking(email)
        if normalized_email:
            claimed = (
                self.client.table("claimed_free_credits")
                .select("email")
                .eq("email", normalized_email)
                .limit(1)
                .execute()
            )
            if claimed.data:
                # This email already claimed free credits on a prior (now
                # deleted) account -- don't let delete-and-resignup reset it.
                initial_credits = 0
            else:
                self.client.table("claimed_free_credits").upsert(
                    {"email": normalized_email}, on_conflict="email", ignore_duplicates=True
                ).execute()

        profile_response = (
            self.client.table("profiles")
            .upsert(
                {"id": user_id, "email": email, "remaining_credits": initial_credits},
                on_conflict="id",
                ignore_duplicates=True,
            )
            .execute()
        )

        if profile_response.data:
            data = profile_response.data[0]
        else:
            # Upsert was a no-op (ON CONFLICT DO NOTHING) because a concurrent
            # request already created this profile -- fetch what it wrote.
            refetched = self.client.table("profiles").select("*").eq("id", user_id).limit(1).execute()
            data = refetched.data[0]
        return self._apply_weekly_credit_reset(data)

    def get_profile(self, user_id: str) -> dict[str, Any]:
        result = self.client.table("profiles").select("*").eq("id", user_id).limit(1).execute()
        return self._apply_weekly_credit_reset(result.data[0])

    def _apply_weekly_credit_reset(self, profile: dict[str, Any]) -> dict[str, Any]:
        if profile.get("subscription_status") == "active":
            return profile

        reset_at_raw = profile.get("credits_reset_at")
        if not reset_at_raw:
            return profile

        reset_at = datetime.fromisoformat(str(reset_at_raw).replace("Z", "+00:00"))
        now = datetime.now(UTC)
        if now - reset_at < CREDIT_RESET_INTERVAL:
            return profile

        updated = (
            self.client.table("profiles")
            .update(
                {
                    "remaining_credits": FREE_PLAN_WEEKLY_CREDITS,
                    "credits_reset_at": now.isoformat(),
                    "updated_at": now.isoformat(),
                }
            )
            .eq("id", profile["id"])
            .execute()
        )
        return updated.data[0]

    def consume_credit(self, user_id: str, is_admin: bool = False) -> bool:
        profile = self.get_profile(user_id)
        if is_admin:
            self.client.table("profiles").update(
                {
                    "total_conversions": int(profile.get("total_conversions", 0)) + 1,
                    "updated_at": datetime.now(UTC).isoformat()
                }
            ).eq("id", user_id).execute()
            return True

        if profile["remaining_credits"] <= 0:
            return False

        updated_remaining = max(0, int(profile["remaining_credits"]) - 1)
        self.client.table("profiles").update(
            {
                "remaining_credits": updated_remaining,
                "total_conversions": int(profile.get("total_conversions", 0)) + 1,
                "updated_at": datetime.now(UTC).isoformat()
            }
        ).eq("id", user_id).execute()

        self.client.table("credit_transactions").insert(
            {
                "user_id": user_id,
                "amount": -1,
                "reason": "conversion"
            }
        ).execute()
        return True

    def refund_credit(self, user_id: str, reason: str) -> None:
        profile = self.get_profile(user_id)
        updated_remaining = int(profile["remaining_credits"]) + 1
        self.client.table("profiles").update({"remaining_credits": updated_remaining}).eq("id", user_id).execute()
        self.client.table("credit_transactions").insert(
            {
                "user_id": user_id,
                "amount": 1,
                "reason": reason
            }
        ).execute()

    def create_project(
        self,
        user_id: str,
        file_name: str,
        feature: str,
        options: dict[str, Any],
    ) -> dict[str, Any]:
        response = (
            self.client.table("projects")
            .insert(
                {
                    "user_id": user_id,
                    "file_name": file_name,
                    "status": "pending",
                    "feature": feature,
                    "options": options,
                }
            )
            .execute()
        )
        return response.data[0]

    def set_project_processing(self, project_id: str) -> None:
        self.client.table("projects").update({"status": "processing"}).eq("id", project_id).execute()

    def set_project_progress(self, project_id: str, percent: float, label: str) -> None:
        options_result = (
            self.client.table("projects")
            .select("options")
            .eq("id", project_id)
            .limit(1)
            .execute()
        )
        existing_options = options_result.data[0].get("options") if options_result.data else {}
        options: dict[str, Any] = dict(existing_options or {})
        options["processing_progress"] = {
            "percent": float(max(0.0, min(100.0, percent))),
            "label": label,
            "updated_at": datetime.now(UTC).isoformat(),
        }
        self.client.table("projects").update({"options": options}).eq("id", project_id).execute()

    def set_project_options(self, project_id: str, options: dict[str, Any]) -> None:
        self.client.table("projects").update({"options": options}).eq("id", project_id).execute()

    def complete_project(self, project_id: str, analysis: dict[str, Any], assets: dict[str, Any]) -> None:
        self.client.table("projects").update({"status": "completed", "analysis": analysis, "assets": assets}).eq("id", project_id).execute()

    def fail_project(self, project_id: str, error_message: str) -> None:
        self.client.table("projects").update({"status": "failed", "error_message": error_message}).eq("id", project_id).execute()

    def list_projects(self, user_id: str) -> list[ProjectResponse]:
        response = self.client.table("projects").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
        return [ProjectResponse.model_validate(project) for project in response.data]

    def get_project(self, project_id: str, user_id: str) -> ProjectResponse | None:
        response = (
            self.client.table("projects")
            .select("*")
            .eq("id", project_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not response.data:
            return None
        return ProjectResponse.model_validate(response.data[0])

    def delete_project(self, project_id: str, user_id: str) -> bool:
        response = (
            self.client.table("projects")
            .delete()
            .eq("id", project_id)
            .eq("user_id", user_id)
            .execute()
        )
        return bool(response.data)

    def clear_projects(self, user_id: str, feature: str | None = None) -> int:
        query = self.client.table("projects").delete().eq("user_id", user_id)
        if feature:
            query = query.eq("feature", feature)
        response = query.execute()
        return len(response.data or [])

    def set_profile_subscription(
        self,
        user_id: str,
        status: str,
        credits: int,
        stripe_customer_id: str | None = None,
    ) -> None:
        payload: dict[str, Any] = {
            "subscription_status": status,
            "remaining_credits": credits,
            "updated_at": datetime.now(UTC).isoformat(),
        }
        if stripe_customer_id:
            payload["stripe_customer_id"] = stripe_customer_id
        self.client.table("profiles").update(payload).eq("id", user_id).execute()

    def get_profile_by_stripe_customer_id(self, customer_id: str) -> dict[str, Any] | None:
        result = (
            self.client.table("profiles")
            .select("*")
            .eq("stripe_customer_id", customer_id)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None
