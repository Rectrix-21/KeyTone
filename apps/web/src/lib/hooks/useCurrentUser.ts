"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient, getSupabaseEnvError } from "@/lib/supabase/client";
import { getMe } from "@/lib/api/client";
import { UserSummary } from "@/types/api";

export interface CurrentUserMetadata {
  full_name?: string;
  name?: string;
  avatar_url?: string;
  picture?: string;
}

export interface CurrentUserState {
  ready: boolean;
  isAuthenticated: boolean;
  userId: string | null;
  email: string | null;
  userMetadata: CurrentUserMetadata | null;
  me: UserSummary | null;
  meLoading: boolean;
  refetchMe: () => Promise<void>;
  updateProfile: (patch: {
    full_name?: string;
    avatar_url?: string;
  }) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<{ error: string | null }>;
}

export function useCurrentUser(): CurrentUserState {
  const [ready, setReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [userMetadata, setUserMetadata] =
    useState<CurrentUserMetadata | null>(null);
  const [me, setMe] = useState<UserSummary | null>(null);
  const [meLoading, setMeLoading] = useState(false);
  const accessTokenRef = useRef<string | null>(null);

  const fetchMe = useCallback(async () => {
    const accessToken = accessTokenRef.current;
    if (!accessToken) {
      setMe(null);
      return;
    }

    setMeLoading(true);
    try {
      const meData = await getMe(accessToken);
      setMe(meData);
    } catch {
      setMe(null);
    } finally {
      setMeLoading(false);
    }
  }, []);

  useEffect(() => {
    const envError = getSupabaseEnvError();
    if (envError) {
      setReady(true);
      setIsAuthenticated(false);
      return;
    }

    const supabase = createClient();

    const applySession = (session: {
      access_token: string;
      user: {
        id: string;
        email?: string;
        user_metadata?: CurrentUserMetadata;
      };
    } | null) => {
      accessTokenRef.current = session?.access_token ?? null;
      setIsAuthenticated(Boolean(session));
      setUserId(session?.user.id ?? null);
      setEmail(session?.user.email ?? null);
      setUserMetadata(session?.user.user_metadata ?? null);
    };

    void supabase.auth.getSession().then(({ data }) => {
      applySession(data.session);
      setReady(true);
      void fetchMe();
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
      void fetchMe();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchMe]);

  const updateProfile = useCallback(
    async (patch: { full_name?: string; avatar_url?: string }) => {
      const supabase = createClient();
      const { data, error } = await supabase.auth.updateUser({
        data: patch,
      });

      if (error) {
        return { error: error.message };
      }

      setUserMetadata(
        (data.user?.user_metadata as CurrentUserMetadata) ?? null,
      );
      return { error: null };
    },
    [],
  );

  const signOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    accessTokenRef.current = null;
    setIsAuthenticated(false);
    setUserId(null);
    setEmail(null);
    setUserMetadata(null);
    setMe(null);
  }, []);

  const deleteAccount = useCallback(async () => {
    const response = await fetch("/api/auth/delete-account", {
      method: "POST",
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      return { error: body?.error ?? "Failed to delete account" };
    }

    accessTokenRef.current = null;
    setIsAuthenticated(false);
    setUserId(null);
    setEmail(null);
    setUserMetadata(null);
    setMe(null);
    return { error: null };
  }, []);

  return {
    ready,
    isAuthenticated,
    userId,
    email,
    userMetadata,
    me,
    meLoading,
    refetchMe: fetchMe,
    updateProfile,
    signOut,
    deleteAccount,
  };
}
