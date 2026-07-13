"use client";

import { useEffect, useRef, useState } from "react";
import { UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { CurrentUserMetadata, CurrentUserState } from "@/lib/hooks/useCurrentUser";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

interface ProfileMenuProps {
  userId: string | null;
  email: string | null;
  userMetadata: CurrentUserMetadata | null;
  updateProfile: CurrentUserState["updateProfile"];
  deleteAccount: CurrentUserState["deleteAccount"];
  onLogout: () => Promise<void>;
  onAccountDeleted: () => Promise<void>;
}

function resolveInitial(
  userMetadata: CurrentUserMetadata | null,
  email: string | null,
): string | null {
  const source = userMetadata?.full_name ?? userMetadata?.name ?? email;
  return source ? source.trim().charAt(0).toUpperCase() || null : null;
}

export function ProfileMenu({
  userId,
  email,
  userMetadata,
  updateProfile,
  deleteAccount,
  onLogout,
  onAccountDeleted,
}: ProfileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState(
    userMetadata?.full_name ?? userMetadata?.name ?? "",
  );
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(userMetadata?.full_name ?? userMetadata?.name ?? "");
  }, [userMetadata?.full_name, userMetadata?.name]);

  useEffect(() => {
    if (!isOpen) {
      setDeleteConfirming(false);
      setDeleteError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const avatarUrl = userMetadata?.avatar_url ?? userMetadata?.picture ?? null;
  const initial = resolveInitial(userMetadata, email);

  const onSaveName = async () => {
    setNameError(null);
    setNameSaving(true);
    const { error } = await updateProfile({ full_name: name.trim() });
    setNameSaving(false);
    if (error) {
      setNameError(error);
    }
  };

  const onPickPhoto = () => {
    fileInputRef.current?.click();
  };

  const onPhotoSelected = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !userId) return;

    setPhotoError(null);

    if (!file.type.startsWith("image/")) {
      setPhotoError("Please choose an image file");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setPhotoError("Image must be under 5MB");
      return;
    }

    setPhotoUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() ?? "png";
      const path = `${userId}/avatar-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, {
          upsert: true,
          cacheControl: "3600",
          contentType: file.type,
        });

      if (uploadError) {
        setPhotoError(uploadError.message);
        return;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(path);

      const { error: updateError } = await updateProfile({
        avatar_url: publicUrl,
      });
      if (updateError) {
        setPhotoError(updateError);
      }
    } finally {
      setPhotoUploading(false);
    }
  };

  const onLogoutClick = async () => {
    setIsOpen(false);
    await onLogout();
  };

  const onConfirmDelete = async () => {
    setDeleteError(null);
    setDeleting(true);
    const { error } = await deleteAccount();
    setDeleting(false);

    if (error) {
      setDeleteError(error);
      return;
    }

    setIsOpen(false);
    await onAccountDeleted();
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-cyan-400/30 bg-cyan-500/15 text-xs font-semibold text-cyan-100"
        aria-label="Open profile menu"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : initial ? (
          initial
        ) : (
          <UserRound className="h-4 w-4" />
        )}
      </button>

      {isOpen ? (
        <div className="glass animate-fade-in absolute right-0 top-full z-50 mt-2 w-72 origin-top-right space-y-4 rounded-xl p-4 text-sm shadow-2xl shadow-black/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-cyan-400/30 bg-cyan-500/15 text-sm font-semibold text-cyan-100">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : initial ? (
                initial
              ) : (
                <UserRound className="h-5 w-5" />
              )}
            </div>
            <span className="truncate text-cyan-100/80">{email}</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wide text-cyan-200/70">
              Display name
            </label>
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
                className="w-full rounded-md border border-cyan-500/25 bg-black/35 px-2.5 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={onSaveName}
                disabled={nameSaving}
                className="cyber-btn whitespace-nowrap px-2.5 py-1.5 text-xs"
              >
                {nameSaving ? "..." : "Save"}
              </button>
            </div>
            {nameError ? (
              <p className="text-xs text-danger">{nameError}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onPhotoSelected}
            />
            <button
              type="button"
              onClick={onPickPhoto}
              disabled={photoUploading}
              className="cyber-btn w-full px-2.5 py-1.5 text-xs"
            >
              {photoUploading ? "Uploading..." : "Change photo"}
            </button>
            {photoError ? (
              <p className="text-xs text-danger">{photoError}</p>
            ) : null}
          </div>

          <div className="h-px w-full bg-cyan-500/20" />

          <button
            type="button"
            onClick={onLogoutClick}
            className="w-full text-left text-sm font-medium text-danger hover:opacity-80"
          >
            Logout
          </button>

          {deleteConfirming ? (
            <div className="space-y-2 rounded-lg border border-danger/40 bg-danger/10 p-3">
              <p className="text-xs text-danger">
                This permanently deletes your account and all your data. This
                can&apos;t be undone.
              </p>
              {deleteError ? (
                <p className="text-xs text-danger">{deleteError}</p>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onConfirmDelete}
                  disabled={deleting}
                  className="flex-1 rounded-md border border-danger bg-danger/20 px-2.5 py-1.5 text-xs font-medium text-danger hover:bg-danger/30"
                >
                  {deleting ? "Deleting..." : "Yes, delete"}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirming(false)}
                  disabled={deleting}
                  className="cyber-btn flex-1 px-2.5 py-1.5 text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setDeleteConfirming(true)}
              className="w-full text-left text-xs font-medium text-danger/80 hover:text-danger"
            >
              Delete account
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
