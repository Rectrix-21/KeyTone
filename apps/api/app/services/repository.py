from datetime import UTC, datetime
from typing import Any

from app.schemas.models import ProjectResponse
from app.services.supabase_client import get_supabase_service_client


class Repository:
    def __init__(self) -> None:
        self.client = get_supabase_service_client()

    def ensure_profile(self, user_id: str, email: str) -> dict[str, Any]:
        profile_response = (
            self.client.table("profiles")
            .upsert({"id": user_id, "email": email}, on_conflict="id", ignore_duplicates=False)
            .execute()
        )

        data = profile_response.data[0]
        return data

    def get_profile(self, user_id: str) -> dict[str, Any]:
        result = self.client.table("profiles").select("*").eq("id", user_id).limit(1).execute()
        return result.data[0]

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

    def set_profile_subscription(self, user_id: str, status: str, credits: int) -> None:
        self.client.table("profiles").update(
            {
                "subscription_status": status,
                "remaining_credits": credits,
                "updated_at": datetime.now(UTC).isoformat()
            }
        ).eq("id", user_id).execute()
