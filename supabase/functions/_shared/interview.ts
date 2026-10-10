// Shared helpers for Interview Mode edge functions (interview-turn, interview-finish, interview-admin).
import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2.57.4";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
export const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
export const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY") ?? "";
export const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
export const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") ?? "";
export const GITHUB_REPO = Deno.env.get("GITHUB_REPO") ?? "";

// Default to the current Sonnet; override with the ANTHROPIC_MODEL secret.
const DEFAULT_MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5";

// Rough price list for the monthly budget guard (USD per million tokens).
const PRICE_IN = Number(Deno.env.get("ANTHROPIC_PRICE_IN") ?? "2");
const PRICE_OUT = Number(Deno.env.get("ANTHROPIC_PRICE_OUT") ?? "10");

export const BUCKET = "interviews";

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function jsonError(status: number, message: string, code?: string) {
  return json({ error: message, code }, status);
}

export function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

export async function getCaller(req: Request): Promise<User | null> {
  const authClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await authClient.auth.getUser();
  return user ?? null;
}

export async function isStaffUser(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await db.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = (data as { role?: string } | null)?.role;
  return role === "author" || role === "admin";
}

// ── Types ────────────────────────────────────────────────────────────────

export interface Subject {
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
}

export interface Session {
  id: string;
  subject_id: string;
  session_no: number;
  era: string;
  status: "active" | "finishing" | "finished";
  started_at: string;
  last_activity_at: string;
  ended_at: string | null;
  summary_en: string | null;
  followups: string | null;
  input_tokens: number;
  output_tokens: number;
  tts_chars: number;
  stt_seconds: number;
  est_cost_usd: number;
}

export interface Turn {
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

// ── Era guide (from claude/mother-story-interview-guide.md) ──────────────

export const ERAS: Record<string, { label: string; questions: string[] }> = {
  books: {
    label: "Warm-up: the books she loves (Toji, Taebaek Sanmaek)",
    questions: [
      "토지랑 태백산맥 중에 어느 게 더 좋으셨어요? 왜요?",
      "토지에서 제일 마음에 남는 사람은 누구예요? 서희요, 아니면 다른 사람?",
      "책 읽으시면서 어릴 때나 집 생각이 난 적 있으세요?",
      "어머니 이야기가 그런 책처럼 된다면, 어디서부터 시작하면 좋겠어요?",
    ],
  },
  childhood: {
    label: "Childhood and family (1950s)",
    questions: [
      "어디서, 언제 태어나셨어요? 전쟁 때 이야기 들으신 거 있으세요?",
      "어릴 때 살던 집은 어땠어요? 방은 몇 개였고, 누가 어디서 잤어요?",
      "형제가 몇 명이었어요? 순서대로 한 분씩 어떤 사람이었는지요.",
      "밥 먹을 때 누가 먼저 먹었어요? 아들들이랑 딸들이 먹는 게 달랐어요?",
      "어머니의 어머니는 어떤 분이셨어요?",
      "아버지는 어떤 분이셨어요?",
      "딸이라서 서러웠던 기억이 있으세요?",
      "그래도 어릴 때 행복했던 순간은 언제였어요?",
    ],
  },
  youth: {
    label: "Growing up (1960s)",
    questions: [
      "학교는 어디까지 다니셨어요? 더 다니고 싶으셨어요?",
      "오빠나 남동생 학비 때문에 포기하신 게 있으세요?",
      "집에서 맡으셨던 일은 뭐였어요? 하루가 어떻게 지나갔어요?",
      "결혼 전에 일하셨어요? 어디서, 무슨 일을? 돈은 누가 가져갔어요?",
      "그때 꿈이 뭐였어요?",
      "친한 친구가 있었어요? 그 친구는 어떻게 됐어요?",
      "그 시절 동네, 시장, 노래, 영화 중에 기억나는 거 있으세요?",
    ],
  },
  marriage: {
    label: "The marriage (late 1960s–1970s)",
    questions: [
      "남편 되실 분은 어떻게 처음 만나셨어요? 중매였어요?",
      "처음 선 보던 날 기억나세요? 뭐 입으셨어요?",
      "결혼식 날은 어땠어요?",
      "시댁 생활은 어땠어요? 시어머니는 어떤 분이셨어요?",
      "첫 아이 낳으셨을 때 기억나는 거 있으세요?",
      "그 시절 버티게 해준 게 뭐였어요?",
    ],
  },
  leaving: {
    label: "Leaving Korea",
    questions: [
      "미국 가자는 얘기는 누가 먼저 꺼냈어요? 왜 가셨어요?",
      "가족들은 뭐라고 했어요? 떠나는 날 누가 배웅 나왔어요?",
      "가방에 뭘 챙겨 가셨어요? 꼭 가져가고 싶었던 물건이 있었어요?",
      "비행기 탔을 때 기분이 어땠어요? 처음 미국 땅 밟았을 때는요?",
      "왜 오클라호마 노먼이었어요? 처음 봤을 때 어땠어요?",
    ],
  },
  oklahoma: {
    label: "Oklahoma (1980s–1990s)",
    questions: [
      "미국에서 처음 하신 일은 뭐였어요? 해보신 일들 다 말씀해 주세요.",
      "제일 힘들었던 일은 뭐였어요? 몸이 어디가 제일 아팠어요?",
      "영어 때문에 서러웠던 일 있으세요?",
      "한인 교회나 한인들이 도와줬어요? 친구는 누구였어요?",
      "한국 음식 재료는 어떻게 구하셨어요? 김치는 어떻게 담그셨어요?",
      "아이들 키우면서 제일 걱정됐던 건 뭐였어요?",
      "한국에 돌아가고 싶으셨던 적 있어요?",
    ],
  },
  looking_back: {
    label: "Looking back",
    questions: [
      "형제들이랑은 지금 어떤 사이세요?",
      "어머니의 어머니께 하고 싶었던 말이 있으세요?",
      "다시 그 시절로 돌아가면 다르게 하고 싶은 게 있으세요?",
      "인생에서 제일 자랑스러운 건 뭐예요?",
      "이 이야기가 책이 된다면, 사람들이 뭘 알았으면 좋겠어요?",
    ],
  },
  free: {
    label: "Open conversation (follow her lead)",
    questions: [],
  },
};

// ── Interviewer prompt ───────────────────────────────────────────────────

export function interviewerSystemPrompt(subject: Subject, session: Session, earlier: Session[]): string {
  const era = ERAS[session.era] ?? ERAS.free;
  const h = subject.honorific || "어머니";
  const earlierText = earlier.length
    ? earlier
        .map((s) => `Session ${s.session_no} (${ERAS[s.era]?.label ?? s.era}):\n${s.summary_en ?? "(no summary)"}${s.followups ? `\nSuggested follow-ups: ${s.followups}` : ""}`)
        .join("\n\n")
    : "This is the first session. You know nothing about her life yet.";

  return `You are a warm, patient interviewer helping ${h}'s son write a book about her life. You are talking with her by voice: everything you write is spoken aloud by a text-to-speech voice, and her answers come to you as speech-to-text transcripts (which may contain small transcription errors — infer the meaning kindly, never point them out).

If she asks who you are: you are an AI helper her son set up to listen to her story, and her son will read and listen to everything she shares.

# How to speak
- Speak ONLY in Korean, in gentle, natural spoken 존댓말 (e.g. ~요, ~세요, ~셨어요). Address her as "${h}".
- ONE question per turn. Keep each turn to 1–3 short sentences. No lists, no headings, no emojis, no stage directions, no brackets, no English.
- Often begin by briefly reflecting what she just said in a sentence (e.g. "아, 큰오빠가 먼저 서울로 가셨군요."), then ask your question.
- Never lecture, never summarize at length, never flatter or praise excessively, never give advice.
- Never invent facts about her life and never correct her memories.

# How to interview
- Follow her lead first: ask about what she just mentioned before returning to the plan.
- Ask for concrete, sensory details a novelist needs: who was there, names, what the place looked like, sounds, smells, food, clothes, the weather, what people actually said.
- When she mentions a person, gently learn who they were to her and what they were like.
- Gently steer toward today's topic, but if she is talking happily about something else, stay with her.
- If she hesitates, answers very briefly, or sounds sad or upset about something, do not press. Say something kind (e.g. "말씀하시기 힘든 얘기는 안 하셔도 괜찮아요.") and move to something lighter. Never return to the same painful subject in the same session.
- If a user message says she wants to skip the question, move on to a different, lighter question without comment.
- Never ask about any topic in the "off limits" list below, even if she brings it close; if she raises it herself, listen briefly and kindly, but do not ask follow-up questions about it.
- After about 25–30 minutes or 30 of her answers, gently suggest stopping for today.

# Today's session
Session ${session.session_no}. Topic: ${era.label}.
${era.questions.length ? `Example questions for this topic (adapt freely, don't read them like a list):\n${era.questions.map((q) => `- ${q}`).join("\n")}` : "No fixed topic — follow her lead."}

# Notes from her son for the interviewer
${subject.interviewer_notes?.trim() || "(none)"}

# Off limits (never ask about these)
${subject.off_limits?.length ? subject.off_limits.map((t) => `- ${t}`).join("\n") : "(none)"}

# What we already know from earlier sessions (don't re-ask these; build on them)
${earlierText}

# Background on the book
${subject.background?.trim() || "A family saga novel about her life: girlhood in Korea in the 1950s–60s, an arranged marriage, emigrating to Norman, Oklahoma, and hard years of manual work raising two children. She loves the Korean saga novels Toji and Taebaek Sanmaek."}`;
}

// ── Claude API ───────────────────────────────────────────────────────────

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ClaudeResult {
  text: string;
  input_tokens: number;
  output_tokens: number;
}

let resolvedModel: string | null = null;

async function pickFallbackModel(): Promise<string | null> {
  const resp = await fetch("https://api.anthropic.com/v1/models?limit=100", {
    headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
  });
  if (!resp.ok) return null;
  const data = await resp.json() as { data?: Array<{ id: string }> };
  const sonnet = (data.data ?? []).find((m) => m.id.includes("sonnet"));
  return sonnet?.id ?? data.data?.[0]?.id ?? null;
}

export async function callClaude(system: string, messages: ClaudeMessage[], maxTokens = 400): Promise<ClaudeResult> {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");
  const model = resolvedModel ?? DEFAULT_MODEL;

  const send = (m: string) =>
    fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: m,
        max_tokens: maxTokens,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages,
      }),
    });

  let resp = await send(model);
  if (resp.status === 404 && !resolvedModel) {
    // Model id not found — discover a current one and retry once.
    const fallback = await pickFallbackModel();
    if (fallback && fallback !== model) {
      console.warn(`[interview] model ${model} not found; using ${fallback}`);
      resolvedModel = fallback;
      resp = await send(fallback);
    }
  } else if (resp.ok) {
    resolvedModel = model;
  }

  if (!resp.ok) {
    const errText = await resp.text();
    console.error(`[interview] Claude API error ${resp.status}`, errText);
    throw new Error(`Claude API error ${resp.status}`);
  }

  const data = await resp.json() as {
    content: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
  };
  const text = data.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
  const u = data.usage ?? {};
  return {
    text,
    input_tokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    output_tokens: u.output_tokens ?? 0,
  };
}

export function estimateCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens * PRICE_IN + outputTokens * PRICE_OUT) / 1_000_000;
}

// Strip anything that shouldn't be spoken (stage directions, markdown).
export function cleanSpoken(text: string): string {
  return text
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[*_#>`]/g, "")
    .replace(/ {2,}/g, " ")
    .replace(/ +([.,?!])/g, "$1")
    .replace(/\s+\n/g, "\n")
    .trim();
}

// ── ElevenLabs ───────────────────────────────────────────────────────────

export async function textToSpeech(subject: Subject, text: string): Promise<ArrayBuffer> {
  if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY is not configured");
  const resp = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${subject.tts_voice_id}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": ELEVENLABS_API_KEY },
      body: JSON.stringify({
        text,
        model_id: subject.tts_model_id,
        voice_settings: { stability: 0.6, similarity_boost: 0.8, style: 0.2, speed: Number(subject.tts_speed) || 1 },
      }),
    },
  );
  if (!resp.ok) {
    console.error("[interview] TTS error", resp.status, await resp.text());
    throw new Error(`TTS error ${resp.status}`);
  }
  return await resp.arrayBuffer();
}

export async function speechToText(file: Blob, filename: string, language: string): Promise<string> {
  if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY is not configured");
  const send = (model: string) => {
    const form = new FormData();
    form.append("model_id", model);
    form.append("language_code", language || "ko");
    form.append("tag_audio_events", "false");
    form.append("file", file, filename);
    return fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
      body: form,
    });
  };
  const primary = Deno.env.get("ELEVENLABS_STT_MODEL") ?? "scribe_v2";
  let resp = await send(primary);
  if (!resp.ok && (resp.status === 400 || resp.status === 422) && primary !== "scribe_v1") {
    console.warn("[interview] STT model rejected, retrying with scribe_v1:", resp.status, await resp.text());
    resp = await send("scribe_v1");
  }
  if (!resp.ok) {
    const body = await resp.text();
    console.error("[interview] STT error", resp.status, body);
    let reason = body;
    try { reason = JSON.parse(body)?.detail?.message ?? body; } catch { /* keep raw */ }
    throw new Error(`Speech-to-text ${resp.status}: ${String(reason).slice(0, 160)}`);
  }
  const data = await resp.json() as { text?: string };
  return (data.text ?? "").trim();
}

// ── Storage ──────────────────────────────────────────────────────────────

export async function signedUrl(db: SupabaseClient, path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await db.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 6);
  return data?.signedUrl ?? null;
}

export async function monthSpend(db: SupabaseClient, subjectId: string): Promise<number> {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const { data } = await db
    .from("interview_sessions")
    .select("est_cost_usd")
    .eq("subject_id", subjectId)
    .gte("started_at", since.toISOString());
  return (data ?? []).reduce((sum: number, s: { est_cost_usd: number }) => sum + Number(s.est_cost_usd || 0), 0);
}
