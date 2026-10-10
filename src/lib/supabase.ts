import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export type NarrationSettings = {
  voice_id: string;
  voice_name: string;
  model_id: string;
  manifest?: string;
};

export interface ChapterDef {
  letter: string;
  title: string;
  start_scene?: string;
  scenes?: string[];
}

export type StorySettings = {
  timelines: boolean;
  crowd_split: boolean;
  map: "fog" | "full" | "off";
  accent_color: string;
  narration?: NarrationSettings;
  chapters?: ChapterDef[];
  /** "book" = a linear book published from Studio > Book (read at /book/<slug>). */
  kind?: "book";
};

export type StoryStatus = "draft" | "published";
export type UserRole = "reader" | "author" | "admin";

export interface Story {
  slug: string;
  title: string;
  blurb: string;
  author_id: string | null;
  status: StoryStatus;
  settings: StorySettings;
  start_scene: string | null;
  synced_commit: string | null;
  synced_at: string | null;
}

export interface Scene {
  story_slug: string;
  key: string;
  title: string;
  act: number;
  slug: string | null;
  is_bottleneck: boolean;
  is_ending: boolean;
  reads_flags: string[];
  map_x: number | null;
  map_y: number | null;
}

export interface Chapter {
  story_slug: string;
  scene_key: string;
  position: number;
  title: string;
  body: string;
  when: Record<string, unknown>;
}

export interface Variant {
  story_slug: string;
  scene_key: string;
  slot: string;
  when: Record<string, unknown>;
  text: string;
  priority: number;
}

export interface Choice {
  story_slug: string;
  scene_key: string;
  key: string;
  label: string;
  to_scene_key: string;
  position: number;
  sets: Record<string, unknown>;
  requires: Record<string, unknown>;
}

export interface Flag {
  story_slug: string;
  key: string;
  type: "choice" | "boolean" | "number";
  allowed_values: string[];
  description: string;
}

export interface BibleEntry {
  story_slug: string;
  kind: "character" | "place" | "object" | "rule" | "plant";
  key: string;
  name: string;
  body: string;
}

export interface SyncRun {
  id: string;
  story_slug: string;
  commit_sha: string | null;
  ran_at: string;
  ran_by: string | null;
  result: "ok" | "failed";
  errors: string[];
}

export interface ReaderSettings {
  textSize: number;
  lineSpacing: number;
  width: "narrow" | "normal" | "wide";
}

export interface Profile {
  id: string;
  display_name: string;
  role: UserRole;
  joined_at: string;
  reader_settings: ReaderSettings | null;
}

export function isStaff(profile: Profile | null): boolean {
  return profile?.role === "author" || profile?.role === "admin";
}

export interface Playthrough {
  id: string;
  member_id: string;
  story_slug: string;
  timeline: number;
  current_scene_key: string;
  flags: Record<string, unknown>;
  started_at: string;
  completed_at: string | null;
  ending_scene_key: string | null;
  is_preview: boolean;
}

export interface PlaythroughStep {
  id: string;
  playthrough_id: string;
  step_no: number;
  scene_key: string;
  choice_key: string | null;
  timeline: number;
  chosen_at: string;
}

export interface Edition {
  id: string;
  story_slug: string;
  kind: "peoples_cut" | "directors_cut" | "your_story" | "anthology";
  path: string[];
  member_id: string;
  title: string;
  text: string;
  audio_url: string | null;
  status: "draft" | "published";
  created_at: string;
}

export interface ChoiceTally {
  story_slug: string;
  scene_key: string;
  choice_key: string;
  total_count: number;
  completed_count: number;
}

export interface NarrationClip {
  story_slug: string;
  text_hash: string;
  chars: number;
  created_at: string;
  created_by: string | null;
}
