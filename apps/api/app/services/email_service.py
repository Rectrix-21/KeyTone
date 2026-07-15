import asyncio
import smtplib
from email.mime.text import MIMEText

from app.core.config import settings

_SMTP_HOST = "smtp.gmail.com"
_SMTP_PORT = 587


class EmailDeliveryError(RuntimeError):
    pass


def _send_via_gmail_smtp(*, subject: str, text_body: str, reply_to: str) -> None:
    message = MIMEText(text_body)
    message["Subject"] = subject
    message["From"] = settings.gmail_smtp_username
    message["To"] = settings.contact_recipient_email
    message["Reply-To"] = reply_to

    with smtplib.SMTP(_SMTP_HOST, _SMTP_PORT, timeout=15) as server:
        server.starttls()
        server.login(settings.gmail_smtp_username, settings.gmail_smtp_app_password)
        server.sendmail(
            settings.gmail_smtp_username,
            [settings.contact_recipient_email],
            message.as_string(),
        )


async def send_contact_email(
    *,
    kind: str,
    subject: str,
    message: str,
    sender_email: str,
) -> None:
    if not settings.gmail_smtp_username or not settings.gmail_smtp_app_password:
        raise EmailDeliveryError(
            "Email delivery is not configured. Set GMAIL_SMTP_USERNAME and GMAIL_SMTP_APP_PASSWORD."
        )

    label = "Bug Report" if kind == "bug" else "Feature Suggestion"
    full_subject = f"[KeyTone {label}] {subject.strip()}" if subject.strip() else f"[KeyTone {label}]"
    text_body = f"From: {sender_email}\n\n{message.strip()}"

    try:
        await asyncio.to_thread(
            _send_via_gmail_smtp,
            subject=full_subject,
            text_body=text_body,
            reply_to=sender_email,
        )
    except smtplib.SMTPException as exc:
        raise EmailDeliveryError(f"Email delivery failed: {exc}") from exc
