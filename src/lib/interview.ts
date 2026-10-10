import { supabase } from "@/lib/supabase";

// ── Types shared by the /interview page and Studio > Interviews ──

export interface InterviewSubject {
  id: string;
  user_id: string;
  story_slug: string;
  display_name: string;
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
  status: "active" | "finishing" | "finished";
  started_at: string;
  last_activity_at: string;
  ended_at: string | null;
  transcript_ko: string | null;
  transcript_en: string | null;
  summary_en: string | null;
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

export interface InterviewState {
  subject: { id: string; display_name: string; honorific: string; language: string };
  session: { id: string; session_no: number; era: string; started_at: string } | null;
  question: Question | null;
  last_answer: string | null;
  answers_count: number;
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

export function eraLabel(key: string): string {
  return ERA_OPTIONS.find((e) => e.key === key)?.label ?? key;
}

// ── Calls ──

export class InterviewError extends Error {
  code?: string;
  status?: number;
  constructor(message: string, code?: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function invoke<T>(fn: string, body: Record<string, unknown> | FormData): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let message = "잠깐 문제가 생겼어요. 조금 있다가 다시 눌러 주세요.";
    let code: string | undefined;
    let status: number | undefined;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      status = ctx.status;
      try {
        const payload = await ctx.json();
        if (payload?.error) message = payload.error;
        code = payload?.code;
      } catch { /* keep default */ }
    }
    throw new InterviewError(message, code, status);
  }
  return data as T;
}

export const interviewApi = {
  state: () => invoke<InterviewState>("interview-turn", { action: "state" }),
  start: () => invoke<InterviewState>("interview-turn", { action: "start" }),
  answerAudio: (audio: Blob, durationMs: number) => {
    const form = new FormData();
    const ext = audio.type.includes("webm") ? "webm" : "m4a";
    form.append("action", "answer");
    form.append("audio", audio, `answer.${ext}`);
    form.append("duration_ms", String(Math.round(durationMs)));
    return invoke<AnswerResult>("interview-turn", form);
  },
  answerText: (text: string) => invoke<AnswerResult>("interview-turn", { action: "answer_text", text }),
  skip: () => invoke<AnswerResult>("interview-turn", { action: "skip" }),
  redo: () => invoke<InterviewState>("interview-turn", { action: "redo" }),
  finish: () => invoke<FinishResult>("interview-turn", { action: "finish" }),

  // Staff
  createSubject: (p: { email: string; password?: string; display_name: string; story_slug: string; honorific?: string }) =>
    invoke<{ subject: InterviewSubject; account_created: boolean }>("interview-admin", { action: "create_subject", ...p }),
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
