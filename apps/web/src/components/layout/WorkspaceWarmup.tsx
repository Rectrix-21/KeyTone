"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getMe, listProjects } from "@/lib/api/client";
import { createClient, getSupabaseEnvError } from "@/lib/supabase/client";
import { Project, ProjectFeature, UserSummary } from "@/types/api";

const FEATURE_CLEAR_CUTOFF_STORAGE_KEY = "dashboard.featureClearCutoffs.v1";
const WORKSPACE_BOOTSTRAP_CACHE_KEY = "dashboard.workspaceBootstrap.v1";
const WORKSPACE_BOOTSTRAP_CACHE_TTL_MS = 3 * 60 * 1000;
const MAX_HISTORY_ITEMS = 10;

type FeatureClearCutoffs = Partial<Record<ProjectFeature, string>>;

type WorkspaceBootstrapCache = {
  token: string;
  me: UserSummary;
  projects: Project[];
  featureClearCutoffs: FeatureClearCutoffs;
  cachedAt: number;
};

const WORKSPACE_ROUTES = [
  "/dashboard",
  "/analyzer",
  "/similar",
  "/bpm",
  "/extract",
  "/chords",
  "/generator",
] as const;

function limitProjectHistory(projects: Project[]): Project[] {
  const perFeatureCount = new Map<string, number>();
  const limited: Project[] = [];

  for (const project of projects) {
    const feature = String(project.feature ?? "unknown");
    const count = perFeatureCount.get(feature) ?? 0;
    if (count >= MAX_HISTORY_ITEMS) {
      continue;
    }

    perFeatureCount.set(feature, count + 1);
    limited.push(project);
  }

  return limited;
}

function readFeatureClearCutoffs(): FeatureClearCutoffs {
  try {
    const raw = window.localStorage.getItem(FEATURE_CLEAR_CUTOFF_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const output: FeatureClearCutoffs = {};
    for (const feature of ["extraction", "variation", "starter"] as const) {
      const value = (parsed as Record<string, unknown>)[feature];
      if (typeof value === "string" && value.trim().length > 0) {
        output[feature] = value;
      }
    }

    return output;
  } catch {
    return {};
  }
}

function applyProjectHistoryPolicy(
  projects: Project[],
  cutoffs: FeatureClearCutoffs,
): Project[] {
  const filtered = projects.filter((project) => {
    const cutoffRaw = cutoffs[project.feature];
    if (!cutoffRaw) {
      return true;
    }

    const cutoffMs = Date.parse(cutoffRaw);
    const createdMs = Date.parse(project.created_at);
    if (!Number.isFinite(cutoffMs) || !Number.isFinite(createdMs)) {
      return true;
    }

    return createdMs > cutoffMs;
  });

  return limitProjectHistory(filtered);
}

function isFreshBootstrapCache(): boolean {
  try {
    const raw = window.sessionStorage.getItem(WORKSPACE_BOOTSTRAP_CACHE_KEY);
    if (!raw) {
      return false;
    }

    const parsed = JSON.parse(raw) as { cachedAt?: number };
    if (typeof parsed.cachedAt !== "number") {
      return false;
    }

    return Date.now() - parsed.cachedAt <= WORKSPACE_BOOTSTRAP_CACHE_TTL_MS;
  } catch {
    return false;
  }
}

function writeBootstrapCache(cache: WorkspaceBootstrapCache): void {
  try {
    window.sessionStorage.setItem(
      WORKSPACE_BOOTSTRAP_CACHE_KEY,
      JSON.stringify(cache),
    );
  } catch {
    // Ignore storage quota/privacy mode issues.
  }
}

export function WorkspaceWarmup() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (getSupabaseEnvError()) {
      return;
    }

    let cancelled = false;

    const prefetchIfAuthenticated = async () => {
      // Prefetching these protected routes unconditionally would have
      // Next.js cache a middleware "redirect to /login" response for them
      // while the visitor is still signed out. That stale cache entry can
      // then get served after they log in, sending "Enter Studio" straight
      // back to /login even though the session is valid.
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      if (cancelled || !data.session) {
        return;
      }

      for (const route of WORKSPACE_ROUTES) {
        router.prefetch(route);
      }
    };

    void prefetchIfAuthenticated();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (isFreshBootstrapCache()) {
      return;
    }

    const envError = getSupabaseEnvError();
    if (envError) {
      return;
    }

    let cancelled = false;

    const warmup = async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;

      if (!accessToken || cancelled) {
        return;
      }

      try {
        const [projectsData, meData] = await Promise.all([
          listProjects(accessToken),
          getMe(accessToken),
        ]);

        if (cancelled) {
          return;
        }

        const clearCutoffs = readFeatureClearCutoffs();
        const filteredProjects = applyProjectHistoryPolicy(
          projectsData,
          clearCutoffs,
        );

        writeBootstrapCache({
          token: accessToken,
          me: meData,
          projects: filteredProjects,
          featureClearCutoffs: clearCutoffs,
          cachedAt: Date.now(),
        });
      } catch {
        // Best-effort warmup only.
      }
    };

    void warmup();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
