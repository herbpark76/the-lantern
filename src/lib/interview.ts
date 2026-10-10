import { supabase } from "@/lib/supabase";

export type InterviewMode = "memoir" | "ghostwriter";
export type SessionKind = "interview" | "revise";

export interface ElevenVoice {
  id: string;
  name: string;
  category: string;
  description: string;
  preview_url: string | null;
}

// ── Types shared by the /interview page and Studio > Interviews ──

export interface InterviewSubject {
  id: string;
  user_id: string;
  story_slug: string;
  display_name: string;
  mode: InterviewMode;
  language: string;
  honorific: string;
  tts_voice_id: string;
  tts_model_id: string;
  tts_speed: number;
  next_era: string;
  interviewer_notes: string;
  off_limits: string[];
  background: string;
  monthly_budget_usd: number;
  created_at: string;
}

export interface InterviewSession {
  id: string;
  subject_id: string;
  session_no: number;
  era: string;
  kind?: SessionKind;
  target_doc?: string | null;
  status: "active" | "finishing" | "finished";
  started_at: string;
  last_activity_at: string;
  ended_at: string | null;
  transcript_ko: string | null;
  transcript_en: string | null;
  summary_en: string | null;
  summary_ko: string | null;
  scene_notes: string | null;
  followups: string | null;
  github_path: string | null;
  github_error: string | null;
  input_tokens: number;
  output_tokens: number;
  tts_chars: number;
  stt_seconds: number;
  est_cost_usd: number;
}

export interface InterviewTurn {
  id: string;
  session_id: string;
  turn_no: number;
  speaker: "subject" | "interviewer";
  text: string;
  audio_path: string | null;
  duration_ms: number | null;
  skipped: boolean;
  created_at: string;
}

export interface Question {
  id: string;
  text: string;
  audio_url: string | null;
}

export interface InterviewChoice {
  story_slug: string;
  display_name: string;
  mode: InterviewMode;
  language: string;
}

export interface InterviewState {
  subject: { id: string; display_name: string; honorific: string; language: string; mode: InterviewMode; story_slug: string };
  session: {
    id: string; session_no: number; era: string; started_at: string;
    kind?: SessionKind; target_doc?: string | null; target_title?: string | null;
  } | null;
  /** Ghostwriter books: chapters written so far (for notes sessions). */
  chapters?: Array<{ id: string; title: string }>;
  question: Question | null;
  last_answer: string | null;
  answers_count: number;
  /** Set (and nothing else) when this account has several interviews and none was named. */
  choose?: InterviewChoice[];
}

export interface AnswerResult {
  her_text?: string;
  question?: Question;
  answers_count?: number;
  not_heard?: boolean;
  message?: string;
}

export interface FinishResult {
  finished: boolean;
  closing: { text: string; audio_url: string | null } | null;
}

export const ERA_OPTIONS: Array<{ key: string; label: string; ko: string }> = [
  { key: "books", label: "Warm-up: the books she loves", ko: "좋아하시는 책 이야기" },
  { key: "childhood", label: "Childhood and family (1950s)", ko: "어린 시절과 가족" },
  { key: "youth", label: "Growing up (1960s)", ko: "자라던 시절" },
  { key: "marriage", label: "The marriage (late 1960s–70s)", ko: "결혼" },
  { key: "leaving", label: "Leaving Korea", ko: "한국을 떠나던 때" },
  { key: "oklahoma", label: "Oklahoma (1980s–90s)", ko: "오클라호마 시절" },
  { key: "looking_back", label: "Looking back", ko: "돌아보며" },
  { key: "free", label: "Open conversation", ko: "자유롭게" },
];

// ElevenLabs text-to-speech models offered in Studio (interviewer voice and chapter narration).
export const TTS_MODELS: Array<{ id: string; label: string }> = [
  { id: "eleven_v4", label: "eleven_v4 (newest, most natural)" },
  { id: "eleven_v4_turbo", label: "eleven_v4_turbo (fast, real-time)" },
  { id: "eleven_v3", label: "eleven_v3 (expressive)" },
  { id: "eleven_v3_conversational", label: "eleven_v3_conversational (fast, conversational)" },
  { id: "eleven_flash_v2_5", label: "eleven_flash_v2_5 (fastest, half price)" },
  { id: "eleven_multilingual_v2", label: "eleven_multilingual_v2" },
];

export function eraLabel(key: string): string {
  return ERA_OPTIONS.find((e) => e.key === key)?.label ?? key;
}

// ── Calls ──

export class InterviewError extends Error {
  code?: string;
  status?: number;
  detail?: string;
  constructor(message: string, code?: string, status?: number, detail?: string) {
    super(message);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

async function invoke<T>(fn: string, body: Record<string, unknown> | FormData): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let message = "잠깐 문제가 생겼어요. 조금 있다가 다시 눌러 주세요.";
    let code: string | undefined;
    let status: number | undefined;
    let detail: string | undefined;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      status = ctx.status;
      try {
        const payload = await ctx.json();
        if (payload?.error) message = payload.error;
        code = payload?.code;
        detail = payload?.detail;
      } catch { /* keep default */ }
    }
    throw new InterviewError(message, code, status, detail);
  }
  return data as T;
}

// Which interview the /interview page is talking to (one account can have several).
// Set by the page from the URL (/interview/<slug>); empty means "my only one".
let currentSlug = "";
export function setInterviewSlug(slug: string | undefined) { currentSlug = slug ?? ""; }

function turn<T>(action: string, extra: Record<string, unknown> = {}) {
  return invoke<T>("interview-turn", { action, ...extra, ...(currentSlug ? { story_slug: currentSlug } : {}) });
}

export const interviewApi = {
  state: () => turn<InterviewState>("state"),
  start: (opts?: { kind?: SessionKind; target_doc?: string | null }) =>
    turn<InterviewState>("start", opts?.kind === "revise" ? { kind: "revise", target_doc: opts.target_doc ?? null } : {}),
  answerAudio: (audio: Blob, durationMs: number) => {
    const form = new FormData();
    const ext = audio.type.includes("webm") ? "webm" : "m4a";
    form.append("action", "answer");
    form.append("audio", audio, `answer.${ext}`);
    form.append("duration_ms", String(Math.round(durationMs)));
    if (currentSlug) form.append("story_slug", currentSlug);
    return invoke<AnswerResult>("interview-turn", form);
  },
  answerText: (text: string) => turn<AnswerResult>("answer_text", { text }),
  skip: () => turn<AnswerResult>("skip"),
  redo: () => turn<InterviewState>("redo"),
  finish: () => turn<FinishResult>("finish"),

  // Staff
  createSubject: (p: { email: string; password?: string; display_name: string; story_slug: string; honorific?: string; mode?: InterviewMode; language?: string }) =>
    invoke<{ subject: InterviewSubject; account_created: boolean }>("interview-admin", { action: "create_subject", ...p }),
  publishBook: (p: { story_slug: string; title: string; blurb: string; chapter_ids: string[] }) =>
    invoke<{ ok: boolean; status: string }>("interview-admin", { action: "publish_book", ...p }),
  unpublishBook: (story_slug: string) =>
    invoke<{ ok: boolean; status: string }>("interview-admin", { action: "unpublish_book", story_slug }),
  writeChapter: (story_slug: string, chapter_id?: string) =>
    invoke<{ chapter_id: string }>("interview-admin", { action: "write_chapter", story_slug, ...(chapter_id ? { chapter_id } : {}) }),
  replan: (story_slug: string) =>
    invoke<{ ok: boolean; bible_id: string }>("interview-admin", { action: "replan", story_slug }),
  listVoices: () => invoke<{ voices: ElevenVoice[] }>("interview-admin", { action: "list_voices" }),
  voiceTest: (p: { voice_id: string; model_id: string; speed: number; language: string; honorific?: string }) =>
    invoke<{ audio: string; text: string }>("interview-admin", { action: "voice_test", ...p }),
  setPassword: (subject_id: string, password: string) =>
    invoke<{ ok: boolean }>("interview-admin", { action: "set_password", subject_id, password }),
  sessionAudio: (session_id: string) =>
    invoke<{ urls: Record<string, string> }>("interview-admin", { action: "session_audio", session_id }),
  deleteSession: (session_id: string) =>
    invoke<{ ok: boolean }>("interview-admin", { action: "delete_session", session_id }),
  regenerate: (session_id: string) =>
    invoke<{ ok: boolean; github_path: string | null; github_error: string | null }>("interview-finish", { session_id }),
};

// A tiny silent WAV, played inside the first tap so iOS Safari lets us play audio later.
export const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

export function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  return candidates.find((m) => MediaRecorder.isTypeSupported?.(m));
}
