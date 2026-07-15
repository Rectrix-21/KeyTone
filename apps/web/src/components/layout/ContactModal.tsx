"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { submitContactForm } from "@/lib/api/client";

type ContactFormKind = "bug" | "feature";

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ContactModal({ isOpen, onClose }: ContactModalProps) {
  const [activeForm, setActiveForm] = useState<ContactFormKind>("bug");
  const [bugSubject, setBugSubject] = useState("");
  const [bugMessage, setBugMessage] = useState("");
  const [featureSubject, setFeatureSubject] = useState("");
  const [featureMessage, setFeatureMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    const handleClickOutside = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setSent(false);
      setSending(false);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const submit = async (
    kind: ContactFormKind,
    subject: string,
    message: string,
  ) => {
    setError(null);
    setSending(true);
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        setError("Please sign in to send a message.");
        return;
      }

      await submitContactForm(accessToken, { kind, subject, message });
      setSent(true);
      if (kind === "bug") {
        setBugSubject("");
        setBugMessage("");
      } else {
        setFeatureSubject("");
        setFeatureMessage("");
      }
      window.setTimeout(() => {
        onClose();
      }, 1400);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to send. Please try again.",
      );
    } finally {
      setSending(false);
    }
  };

  const onSubmitBug = (event: FormEvent) => {
    event.preventDefault();
    if (!bugMessage.trim()) return;
    void submit("bug", bugSubject, bugMessage);
  };

  const onSubmitFeature = (event: FormEvent) => {
    event.preventDefault();
    if (!featureMessage.trim()) return;
    void submit("feature", featureSubject, featureMessage);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        ref={panelRef}
        className="glass animate-fade-in w-full max-w-lg rounded-xl p-5 shadow-2xl shadow-black/50"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-cyan-200/80">
              Contact Me
            </p>
            <h2 className="mt-1 text-lg font-semibold text-cyan-100">
              Send a bug report or feature idea
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close contact form"
            className="rounded-md border border-cyan-700/40 bg-black/30 px-2.5 py-1 text-xs text-foreground/70 hover:border-cyan-300/50 hover:text-cyan-100"
          >
            Close
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveForm("bug");
              setError(null);
              setSent(false);
            }}
            className={`flex-1 rounded-lg border px-3 py-2 text-xs uppercase tracking-wide transition ${
              activeForm === "bug"
                ? "border-cyan-300/55 bg-cyan-500/16 text-cyan-100"
                : "border-cyan-700/40 bg-black/30 text-foreground/70 hover:border-cyan-500/45 hover:text-cyan-100"
            }`}
          >
            Report a Bug
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveForm("feature");
              setError(null);
              setSent(false);
            }}
            className={`flex-1 rounded-lg border px-3 py-2 text-xs uppercase tracking-wide transition ${
              activeForm === "feature"
                ? "border-fuchsia-300/55 bg-fuchsia-500/16 text-fuchsia-100"
                : "border-cyan-700/40 bg-black/30 text-foreground/70 hover:border-fuchsia-500/45 hover:text-fuchsia-100"
            }`}
          >
            Suggest a Feature
          </button>
        </div>

        {activeForm === "bug" ? (
          <form onSubmit={onSubmitBug} className="mt-4 space-y-3">
            <p className="text-xs text-foreground/65">
              Sent directly to me &mdash; no email app needed.
            </p>
            <div>
              <label className="text-xs text-foreground/60">
                Subject (optional)
              </label>
              <input
                value={bugSubject}
                onChange={(event) => setBugSubject(event.target.value)}
                placeholder="Short summary of the issue"
                disabled={sending}
                className="mt-1 w-full rounded-md border border-cyan-700/40 bg-black/30 px-3 py-2 text-sm text-cyan-100 outline-none focus:border-cyan-300/50 disabled:opacity-60"
              />
            </div>
            <div>
              <label className="text-xs text-foreground/60">
                What went wrong?
              </label>
              <textarea
                value={bugMessage}
                onChange={(event) => setBugMessage(event.target.value)}
                placeholder="Describe the bug and, if you can, the steps to reproduce it."
                rows={5}
                required
                disabled={sending}
                className="mt-1 w-full resize-none rounded-md border border-cyan-700/40 bg-black/30 px-3 py-2 text-sm text-cyan-100 outline-none focus:border-cyan-300/50 disabled:opacity-60"
              />
            </div>
            {error ? <p className="text-xs text-danger">{error}</p> : null}
            {sent ? (
              <p className="text-xs text-cyan-200/90">
                Sent! Thanks for the report.
              </p>
            ) : null}
            <button
              type="submit"
              disabled={sending}
              className="cyber-btn-primary w-full rounded-xl px-4 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-70"
            >
              {sending ? "Sending..." : "Send Bug Report"}
            </button>
          </form>
        ) : (
          <form onSubmit={onSubmitFeature} className="mt-4 space-y-3">
            <p className="text-xs text-foreground/65">
              Sent directly to me &mdash; no email app needed.
            </p>
            <div>
              <label className="text-xs text-foreground/60">
                Subject (optional)
              </label>
              <input
                value={featureSubject}
                onChange={(event) => setFeatureSubject(event.target.value)}
                placeholder="Short summary of your idea"
                disabled={sending}
                className="mt-1 w-full rounded-md border border-cyan-700/40 bg-black/30 px-3 py-2 text-sm text-cyan-100 outline-none focus:border-cyan-300/50 disabled:opacity-60"
              />
            </div>
            <div>
              <label className="text-xs text-foreground/60">
                What would you like to see?
              </label>
              <textarea
                value={featureMessage}
                onChange={(event) => setFeatureMessage(event.target.value)}
                placeholder="Describe the feature or change you'd like added."
                rows={5}
                required
                disabled={sending}
                className="mt-1 w-full resize-none rounded-md border border-cyan-700/40 bg-black/30 px-3 py-2 text-sm text-cyan-100 outline-none focus:border-cyan-300/50 disabled:opacity-60"
              />
            </div>
            {error ? <p className="text-xs text-danger">{error}</p> : null}
            {sent ? (
              <p className="text-xs text-cyan-200/90">
                Sent! Thanks for the suggestion.
              </p>
            ) : null}
            <button
              type="submit"
              disabled={sending}
              className="cyber-btn-primary w-full rounded-xl px-4 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-70"
            >
              {sending ? "Sending..." : "Send Suggestion"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
