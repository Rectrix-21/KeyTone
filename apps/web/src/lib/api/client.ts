import {
  ExtractionTarget,
  Project,
  SimilarSongFinderRequest,
  SimilarSongFinderResponse,
  DiscoverSpotifyTrackContextResponse,
  SpotifyTrackSummary,
  StarterGeneratorRequest,
  StarterGeneratorResponse,
  TrackAnalyzerResult,
  VariationAlterTarget,
  VariationIntent,
  VariationProducerMove,
  VariationStyle,
  UploadAcceptedResponse,
  UploadProjectOptions,
  UserSummary,
} from "@/types/api";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

function detailToMessage(detail: unknown): string | null {
  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => detailToMessage(item))
      .filter((value): value is string => Boolean(value));
    if (parts.length > 0) {
      return parts.join("; ");
    }
    return null;
  }

  if (detail && typeof detail === "object") {
    const record = detail as Record<string, unknown>;
    const preferred =
      detailToMessage(record.msg) ??
      detailToMessage(record.message) ??
      detailToMessage(record.detail) ??
      detailToMessage(record.error);
    if (preferred) {
      return preferred;
    }

    try {
      return JSON.stringify(record);
    } catch {
      return null;
    }
  }

  if (detail === null || detail === undefined) {
    return null;
  }
  return String(detail);
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  accessToken?: string,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const fallback = `Request failed: ${response.status}`;
    let errorMessage = fallback;
    try {
      const data = (await response.json()) as {
        detail?: unknown;
        message?: unknown;
        error?: unknown;
      };
      errorMessage =
        detailToMessage(data.detail) ??
        detailToMessage(data.message) ??
        detailToMessage(data.error) ??
        fallback;
    } catch {
      errorMessage = fallback;
    }
    throw new Error(errorMessage);
  }

  return (await response.json()) as T;
}

export async function getMe(accessToken: string) {
  return request<UserSummary>("/v1/users/me", {}, accessToken);
}

export async function listProjects(accessToken: string) {
  return request<Project[]>("/v1/projects", {}, accessToken);
}

export async function getProject(projectId: string, accessToken: string) {
  return request<Project>(`/v1/projects/${projectId}`, {}, accessToken);
}

export async function createCheckout(accessToken: string) {
  return request<{ checkout_url: string }>(
    "/v1/stripe/create-checkout-session",
    {
      method: "POST",
    },
    accessToken,
  );
}

export async function uploadProject(
  file: File,
  accessToken: string,
  options: UploadProjectOptions,
) {
  const data = new FormData();
  data.append("file", file);
  data.append("feature", options.feature);
  if (options.extractStems?.length) {
    data.append("extract_stems", options.extractStems.join(","));
  }
  if (options.variationTarget) {
    data.append("variation_target", options.variationTarget);
  }
  return request<UploadAcceptedResponse>(
    "/v1/projects/upload",
    {
      method: "POST",
      body: data,
    },
    accessToken,
  );
}

export async function generateStemMidi(
  projectId: string,
  target: ExtractionTarget,
  accessToken: string,
) {
  const data = new FormData();
  data.append("target", target);
  return request<{ status: string; target: string }>(
    `/v1/projects/${projectId}/generate-midi`,
    {
      method: "POST",
      body: data,
    },
    accessToken,
  );
}

export async function alterVariationMidi(
  projectId: string,
  target: VariationAlterTarget,
  key: string,
  bpm: number | null,
  intent: VariationIntent,
  strength: number | null,
  preserveIdentity: number | null,
  laneMove: VariationProducerMove,
  style: VariationStyle,
  creativity: number | null,
  accessToken: string,
) {
  const data = new FormData();
  data.append("target", target);
  data.append("key", key);
  if (typeof bpm === "number" && Number.isFinite(bpm)) {
    data.append("bpm", String(bpm));
  }
  data.append("style", style);
  data.append("intent", intent);
  data.append("lane_move", laneMove);
  if (typeof strength === "number" && Number.isFinite(strength)) {
    data.append("variation_strength", String(strength));
  }
  if (
    typeof preserveIdentity === "number" &&
    Number.isFinite(preserveIdentity)
  ) {
    data.append("preserve_identity", String(preserveIdentity));
  }
  if (typeof creativity === "number" && Number.isFinite(creativity)) {
    data.append("creativity", String(creativity));
  }
  return request<{
    status: string;
    target: string;
    key: string;
    bpm: number | null;
    intent: VariationIntent;
    variation_strength: number | null;
    preserve_identity: number | null;
    lane_move: VariationProducerMove;
    style: VariationStyle;
    creativity: number | null;
  }>(
    `/v1/projects/${projectId}/alter`,
    {
      method: "POST",
      body: data,
    },
    accessToken,
  );
}

export async function cancelProject(projectId: string, accessToken: string) {
  return request<{ status: string }>(
    `/v1/projects/${projectId}/cancel`,
    {
      method: "POST",
    },
    accessToken,
  );
}

export async function deleteProject(projectId: string, accessToken: string) {
  return request<{ status: string }>(
    `/v1/projects/${projectId}`,
    {
      method: "DELETE",
    },
    accessToken,
  );
}

export async function clearProjectHistory(
  accessToken: string,
  feature?: "extraction" | "variation" | "starter",
) {
  const query = feature ? `?feature=${feature}` : "";
  return request<{ status: string; deleted_count: number }>(
    `/v1/projects${query}`,
    {
      method: "DELETE",
    },
    accessToken,
  );
}

export async function generateTrackStarterIdeas(
  accessToken: string,
  requestPayload: StarterGeneratorRequest,
) {
  const data = new FormData();
  data.append("genre", requestPayload.genre);
  data.append("mood", requestPayload.mood);
  data.append("bpm", String(requestPayload.bpm));
  data.append("complexity", requestPayload.complexity);
  data.append("bars", String(requestPayload.bars));
  if (requestPayload.key?.trim()) {
    data.append("key", requestPayload.key.trim());
  }
  if (requestPayload.referenceDescription?.trim()) {
    data.append(
      "reference_description",
      requestPayload.referenceDescription.trim(),
    );
  }

  return request<StarterGeneratorResponse>(
    "/v1/projects/starter/generate",
    {
      method: "POST",
      body: data,
    },
    accessToken,
  );
}

export async function analyzeDiscoverTrack(accessToken: string, file: File) {
  const data = new FormData();
  data.append("file", file);

  return request<TrackAnalyzerResult>(
    "/v1/projects/discover/analyze",
    {
      method: "POST",
      body: data,
    },
    accessToken,
  );
}

export async function analyzeDiscoverSpotifyTrack(
  accessToken: string,
  spotifyTrackInput: string,
) {
  return request<TrackAnalyzerResult>(
    "/v1/projects/discover/spotify/analyze",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        spotify_track_input: spotifyTrackInput,
      }),
    },
    accessToken,
  );
}

export async function searchDiscoverSpotifyTracks(
  accessToken: string,
  query: string,
  limit = 8,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
  });

  const response = await request<{ tracks: SpotifyTrackSummary[] }>(
    `/v1/projects/discover/spotify/search?${params.toString()}`,
    { signal },
    accessToken,
  );
  return response.tracks;
}

export async function findSimilarDiscoverTracks(
  accessToken: string,
  payload: SimilarSongFinderRequest,
) {
  return request<SimilarSongFinderResponse>(
    "/v1/projects/discover/spotify/similar",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    accessToken,
  );
}

export async function fetchDiscoverSpotifyTrackContext(
  accessToken: string,
  payload: {
    spotify_track_input?: string;
    song_title?: string;
    song_artist?: string;
  },
) {
  return request<DiscoverSpotifyTrackContextResponse>(
    "/v1/projects/discover/spotify/context",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    accessToken,
  );
}
