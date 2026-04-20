export type ProjectStatus = "pending" | "processing" | "completed" | "failed";
export type ProjectFeature = "extraction" | "variation" | "starter";
export type VariationTarget = "melody" | "chord" | "bass" | "full";
export type VariationAlterTarget = "melody" | "chord" | "bass" | "full";
export type VariationStyle = "auto" | "lift" | "groove" | "cinematic";
export type VariationIntent =
  | "catchier"
  | "richer"
  | "smoother"
  | "emotional"
  | "rhythmic"
  | "modern"
  | "sparse"
  | "soulful"
  | "cinematic"
  | "aggressive"
  | "premium";
export type VariationProducerMove =
  | "auto"
  | "hook_lift"
  | "pocket_rewrite"
  | "emotional_resolve"
  | "call_response"
  | "simplify_phrase"
  | "top_line_focus"
  | "neo_soul_upgrade"
  | "wide_cinema_voicing"
  | "smooth_voice_leading"
  | "bounce_comping"
  | "airy_top_voice"
  | "locked_groove"
  | "octave_motion"
  | "minimal_pocket"
  | "approach_note_movement"
  | "groove_tightening";
export type StarterComplexity = "simple" | "medium" | "complex";
export type StarterVariant = "safe" | "fresh" | "experimental";
export type ExtractionTarget = "melody" | "chord" | "bass" | "piano" | "guitar";
export type ExtractionStem =
  | "bass"
  | "drums"
  | "other"
  | "piano"
  | "guitar"
  | "vocals";

export interface AnalysisResult {
  bpm: number;
  key: string;
  chord_suggestions: string[];
  detected_chord_events?: Array<{
    label: string;
    start: number;
    end: number;
    confidence: number;
  }>;
  detected_chord_progression?: string[];
  altered_chord_events?: Array<{
    label: string;
    start: number;
    end: number;
    confidence: number;
  }>;
  altered_chord_progression?: string[];
  detected_instruments?: string[];
  midi_confidence?: Record<string, number>;
  target_quality?: Record<string, Record<string, number | boolean>>;
  separation?: Record<string, unknown> | null;
  confidence: {
    bpm: number;
    key: number;
  };
}

export interface AlternateKeyInsight {
  key: string;
  confidence: number;
  relation: "relative" | "parallel" | "neighbor" | "other";
}

export interface AnalyzerSection {
  label: "intro" | "verse" | "chorus" | "bridge" | "outro";
  startSec: number;
  endSec: number;
  energy: number;
}

export interface TrackAnalyzerResult {
  bpm: number;
  bpmConfidence: number;
  tempoStability?: number;
  key: string;
  keyConfidence: number;
  relativeKey: string;
  alternateKeys: AlternateKeyInsight[];
  energyScore: number;
  mood: "dark" | "happy" | "emotional" | "energetic" | "calm";
  groove: "tight" | "swing" | "humanized";
  chordProgression: string[];
  sections: AnalyzerSection[];
  analysisJson: Record<string, unknown>;
}

export interface SpotifyTrackSummary {
  id: string;
  name: string;
  artists: string[];
  artistIds?: string[];
  genres?: string[];
  albumName: string;
  imageUrl?: string | null;
  previewUrl?: string | null;
  externalUrl?: string | null;
  durationMs?: number;
  popularity?: number;
}

export interface SimilarSongItem {
  title: string;
  artist: string;
  similarityScore: number;
  matchLabel:
    | "Direct match"
    | "Artist-based match (same artist)"
    | "Artist-based match (similar artist)"
    | "low popularity match";
  artworkUrl?: string | null;
  previewUrl?: string | null;
  externalUrl?: string | null;
  providerUrl?: string | null;
  provider: "lastfm";
  spotifyTrack?: SpotifyTrackSummary | null;
  sharedTags?: string[];
  genreTags?: string[];
  moodTags?: string[];
  similarityExplanation?: string | null;
}

export interface SimilarSongFinderResponse {
  source: {
    type: "spotify";
    track: SpotifyTrackSummary | null;
    genreTags?: string[];
    moodTags?: string[];
    lastfmUrl?: string | null;
  };
  similarSongs: SimilarSongItem[];
  count: number;
  provider: "lastfm";
  hasMore?: boolean;
}

export interface DiscoverSpotifyTrackContextResponse {
  source: {
    type: "spotify";
    track: SpotifyTrackSummary | null;
    genreTags?: string[];
    moodTags?: string[];
    lastfmUrl?: string | null;
  };
  provider: "lastfm";
}

export interface SimilarSongFinderRequest {
  spotify_track_input?: string;
  song_title?: string;
  song_artist?: string;
  limit?: number;
}

export interface AssetSet {
  source_audio_url: string | null;
  midi_base_url?: string | null;
  altered_midi_url?: string | null;
  midi_variation_urls: string[];
  analysis_json_url?: string | null;
  midi_stem_urls?: Record<string, string> | null;
  midi_preview_notes?: MidiPreviewNote[];
  original_midi_preview_notes?: MidiPreviewNote[];
  altered_midi_preview_notes?: MidiPreviewNote[];
  stem_audio_urls?: Record<string, string> | null;
}

export interface MidiPreviewNote {
  pitch: number;
  velocity: number;
  start: number;
  end: number;
  lane: "melody" | "chord" | "bass" | "piano" | "guitar" | "drums";
}

export interface ProjectOptions {
  extract_stems?: ExtractionStem[];
  extract_targets?: string[];
  variation_target?: VariationTarget;
  variation_key?: string;
  variation_bpm?: number;
  variation_style?: VariationStyle;
  variation_creativity?: number;
  variation_intent?: VariationIntent;
  variation_strength?: number;
  variation_preserve_identity?: number;
  variation_lane_move?: VariationProducerMove;
  starter_genre?: string;
  starter_mood?: string;
  starter_complexity?: StarterComplexity;
  starter_variant?: StarterVariant;
  starter_bars?: number;
  starter_explanation?: string;
  starter_reference_description?: string;
  input_kind?: "audio" | "midi" | "generated";
  processing_progress?: {
    percent: number;
    label: string;
    updated_at?: string;
  };
}

export interface Project {
  id: string;
  created_at: string;
  file_name: string;
  status: ProjectStatus;
  feature: ProjectFeature;
  options?: ProjectOptions | null;
  error_message?: string | null;
  analysis: AnalysisResult | null;
  assets: AssetSet | null;
}

export interface UploadAcceptedResponse {
  project_id: string;
  status: ProjectStatus;
}

export interface UploadProjectOptions {
  feature: "extraction" | "variation";
  extractStems?: ExtractionStem[];
  variationTarget?: VariationTarget;
}

export interface StarterGeneratorRequest {
  genre: string;
  mood: string;
  bpm: number;
  key?: string;
  complexity: StarterComplexity;
  bars: 8 | 16;
  referenceDescription?: string;
}

export interface StarterGeneratorResponse {
  status: string;
  count: number;
  message: string;
  project_ids: string[];
}

export interface UserSummary {
  id: string;
  email: string;
  remaining_credits: number;
  subscription_status: "free" | "active" | "canceled";
  is_admin: boolean;
  unlimited_credits: boolean;
}
