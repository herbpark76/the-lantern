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
  mode: "memoir" | "ghostwriter";
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
  kind: "interview" | "revise";
  target_doc: string | null;
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

// ── Words the server says, per interview language ───────────────────────

export function strings(subject: Subject, session?: Pick<Session, "kind"> | null) {
  const en = subject.language === "en";
  const name = subject.honorific || subject.display_name;
  const ghost = subject.mode === "ghostwriter";
  const revise = ghost && session?.kind === "revise";
  return {
    busy: en ? "Something went wrong for a moment. Please try again." : "잠깐 문제가 생겼어요. 조금 있다가 다시 눌러 주세요.",
    budget: en ? "This month's interview budget is used up." : "이번 달 이야기 시간을 다 썼어요. 아드님께 말씀해 주세요.",
    notHeard: en ? "I didn't catch that. Could you say it again?" : "잘 못 들었어요. 다시 한 번 말씀해 주시겠어요?",
    noAnswer: en ? "(no answer)" : "(말씀이 없으셨어요)",
    skipNote: en
      ? "(They'd like to skip this question. Move on to a different one without comment.)"
      : `(${name}께서 이 질문은 넘어가고 싶다고 하셨습니다. 다른, 가벼운 질문으로 넘어가 주세요.)`,
    start: (sessionNo: number) => {
      if (revise) {
        return `(Conversation start: a notes and revision session. Greet ${name} by name, say in one sentence that you've read what's written so far and you're here to hear what they'd like to change, deepen or add, then ask one open first question about their overall reaction.)`;
      }
      if (ghost) {
        return sessionNo === 1
          ? `(Conversation start, session 1. Greet ${name} warmly by name, say in one short sentence that you're their ghostwriter here to turn their idea into a story, then ask your first question.)`
          : `(Conversation start, session ${sessionNo}. Welcome ${name} back, recall one specific thing about the story from last time in a sentence, then ask your next question.)`;
      }
      if (en) {
        return sessionNo === 1
          ? `(Conversation start, session 1. Greet ${name} warmly, introduce yourself in one short sentence as an AI helper set up to hear their story, then ask your first question.)`
          : `(Conversation start, session ${sessionNo}. Welcome ${name} back, mention one thing from last time, then ask today's first question.)`;
      }
      return sessionNo === 1
        ? `(대화 시작. 이번이 첫 번째 이야기 시간입니다. ${name}께 따뜻하게 인사하고, 아드님이 ${name}의 이야기를 책으로 쓰려고 준비한 AI 도우미라고 아주 짧게 소개한 뒤, 오늘의 첫 질문을 해 주세요.)`
        : `(대화 시작. ${sessionNo}번째 이야기 시간입니다. ${name}께 반갑게 인사하고, 지난번 이야기를 한 가지 짧게 언급한 뒤, 오늘의 첫 질문을 해 주세요.)`;
    },
    closing: revise
      ? "(They're finishing. Don't ask a question. In one or two short sentences, thank them and say you'll update the story bible with their notes and write a revised version of the chapter, keeping the previous version, and it'll be ready in Studio under Book in a few minutes. If this session had no chapter, say only that you'll update the story bible.)"
      : ghost
      ? "(They're finishing for now. Don't ask a question. In one or two short sentences, thank them and say you'll now write up the story bible, outline and an opening chapter, which will be ready in Studio under Book in a few minutes.)"
      : en
        ? "(They'd like to stop for today. Don't ask a question. In one or two sentences, warmly thank them for what they shared and say you look forward to next time.)"
        : `(${name}께서 오늘은 여기까지 하자고 하셨습니다. 질문은 하지 말고, 오늘 들려주신 이야기에 따뜻하게 감사드리고, 다음에 또 이야기 나누자고 한두 문장으로 짧게 인사해 주세요.)`,
  };
}

// ── Ghostwriter prompt ───────────────────────────────────────────────────

export function ghostwriterSystemPrompt(subject: Subject, session: Session, earlier: Session[]): string {
  const name = subject.honorific || subject.display_name;
  const earlierText = earlier.length
    ? earlier.map((s) => `Session ${s.session_no}:\n${s.summary_en ?? "(no notes)"}${s.followups ? `\nOpen questions left: ${s.followups}` : ""}`).join("\n\n")
    : "This is the first session. You know nothing about the story or their tastes yet.";

  return `You are a warm, sharp ghostwriter and story developer. You are interviewing ${name} by voice to develop a story they want written. Everything you write is spoken aloud by a text-to-speech voice; their answers reach you as speech-to-text transcripts (small errors are normal; infer the meaning, never mention them).

# How to speak
- Speak ${subject.language === "ko" ? "Korean, in natural 존댓말" : "English"}, casually and warmly, like a collaborator who is genuinely into the idea.
- ONE question per turn, 1–3 short sentences (4 at most when you pitch a "what if", and always under 80 words). No lists, headings, emojis, stage directions, brackets or parentheses. Always finish with the question.
- If they say they want to stop, pause or take a break, don't ask anything new: say in one sentence that they can tap Pause to take a break, or Finish to have the story written up from what you have.
- Briefly react to what they said (a specific reaction, not generic praise), then ask.
- Now and then offer one quick "what if…" possibility and ask whether it fits, but the story is theirs: follow their instincts, never push yours.
- Never write the story itself here.

# What to find out (over the conversation, not as a checklist)
1. Their taste: books, authors, films or shows they love, and what exactly they love about them.
2. The seed: what the story is about, and the image, question or feeling that sparked it.
3. Genre, tone, setting in time and place, and the kind of book (length, format, who it's for).
4. The protagonist: what they want, what they need, their flaw, how they talk.
5. Other key characters, and the opposing force.
6. The central conflict and the stakes; what makes it urgent.
7. Scenes they can already picture.
8. How it ends, or what they want the reader to feel at the end.
9. Title ideas.
Follow their energy and dig into anything vivid, but keep track of what's still missing and steer there.

# When you have enough
When you have enough for a strong story bible, a three-act outline and an opening chapter (usually after 15–25 answers, sooner if they are detailed), say so in one or two sentences: they can tap Finish to have it written now, or keep going to add more. If they ask you to write it, tell them to tap Finish.

# Notes from the author for you
${subject.interviewer_notes?.trim() || "(none)"}

# Never ask about
${subject.off_limits?.length ? subject.off_limits.map((t) => `- ${t}`).join("\n") : "(nothing)"}

# What earlier sessions already established (build on it, don't re-ask)
${earlierText}

# Background
${subject.background?.trim() || "(none)"}

This is session ${session.session_no}.`;
}

export interface RevisionContext {
  bible: string;
  chapterTitle: string | null;
  chapter: string | null;
  chapterList: string[];
}

export function systemPromptFor(subject: Subject, session: Session, earlier: Session[], rev?: RevisionContext | null): string {
  if (subject.mode === "ghostwriter" && session.kind === "revise") return revisionSystemPrompt(subject, session, rev ?? null);
  return subject.mode === "ghostwriter"
    ? ghostwriterSystemPrompt(subject, session, earlier)
    : interviewerSystemPrompt(subject, session, earlier);
}

// ── Revision ("notes") prompt: an editor hearing what the author wants changed ──

export function revisionSystemPrompt(subject: Subject, session: Session, rev: RevisionContext | null): string {
  const name = subject.honorific || subject.display_name;
  const focus = rev?.chapter
    ? `This session is about "${rev.chapterTitle}". Its full text is below. Their notes will be used to rewrite it, and anything general goes into the story bible.`
    : "This session is for general notes on the story: anything they say goes into the story bible (characters, plot, tone, world, ending, ideas for later chapters).";
  return `You are a warm, perceptive book editor working with ${name}, the author, by voice. You and a ghostwriter have been building their story together. ${focus}

Everything you write is spoken aloud by a text-to-speech voice; their answers reach you as speech-to-text transcripts (small errors are normal; infer the meaning, never mention them).

# How to speak
- ONE question per turn, 1–3 short sentences, always under 70 words. No lists, headings, emojis, brackets or parentheses. Always finish with the question.
- Start broad (overall reaction, what landed, what didn't), then get specific: scenes, characters, dialogue, voice, pacing, what's missing, what should be cut, how it should feel.
- When they give a note, make sure you understand it well enough to act on it: ask what it should be instead, or offer a quick concrete option ("so instead of telling us, we'd see him…?") and ask if that's it.
- Refer to specifics from the text so they know you've read it. Quote at most a few words.
- They're the author: don't defend the draft or argue; you may briefly suggest an idea when they're unsure.
- Now and then, briefly play back the notes so far in one sentence so they can correct you.
- When you have clear, actionable notes (usually 6–15 answers), say in one or two sentences that they can tap Finish to have the ${rev?.chapter ? "chapter rewritten and the bible updated" : "bible updated"}, or keep going. If they want to stop or take a break, say they can tap Pause, or Finish to apply what you have.
- Never rewrite the text here.

# Story bible (current)
${rev?.bible?.trim() || "(no bible yet)"}

# Chapters written so far
${rev?.chapterList.length ? rev.chapterList.map((t) => `- ${t}`).join("\n") : "(none)"}
${rev?.chapter ? `\n# The chapter under review: ${rev.chapterTitle}\n\n${rev.chapter}` : ""}

# Notes from the author for you
${subject.interviewer_notes?.trim() || "(none)"}

This is session ${session.session_no}.`;
}

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
    stop_reason?: string;
    usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
  };
  let text = data.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
  if (data.stop_reason === "max_tokens") {
    // Ran out of room mid-sentence: keep only whole sentences so nothing is spoken half-finished.
    console.warn(`[interview] reply hit max_tokens (${maxTokens}); trimming to the last full sentence`);
    const m = text.match(/^[\s\S]*[.!?。…](["'”’)]*)/);
    if (m) text = m[0].trim();
  }
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
    const err = await resp.text();
    console.error("[interview] TTS error", resp.status, err);
    let reason = err;
    try { const j = JSON.parse(err); reason = j?.detail?.message ?? j?.detail?.status ?? (typeof j?.detail === "string" ? j.detail : err); } catch { /* raw */ }
    throw new Error(`TTS error ${resp.status}: ${String(reason).slice(0, 200)}`);
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

// ── Books (book_docs): chapters and the living story bible ──────────────

export interface ChapterRow {
  id: string;
  position: number;
  title_en: string;
  title_ko: string;
  body_en: string;
  body_ko: string;
}

export function docTitle(d: { title_en: string; title_ko: string; id: string }, lang: string): string {
  return (lang === "ko" ? d.title_ko || d.title_en : d.title_en || d.title_ko) || d.id;
}

export function docBody(d: { body_en: string; body_ko: string }, lang: string): string {
  return lang === "ko" ? d.body_ko || d.body_en : d.body_en || d.body_ko;
}

export async function bookChapters(db: SupabaseClient, slug: string): Promise<ChapterRow[]> {
  const { data } = await db.from("book_docs")
    .select("id, position, title_en, title_ko, body_en, body_ko")
    .eq("story_slug", slug).eq("kind", "sample").order("position");
  return (data as ChapterRow[]) ?? [];
}

/** The living bible (<slug>/bible), or else the newest per-session bible. */
export async function currentBible(db: SupabaseClient, slug: string, lang: string): Promise<string> {
  const { data } = await db.from("book_docs")
    .select("id, position, body_en, body_ko, updated_at")
    .eq("story_slug", slug).eq("kind", "summary")
    .order("updated_at", { ascending: false });
  const rows = (data as Array<{ id: string; body_en: string; body_ko: string }>) ?? [];
  const living = rows.find((r) => r.id === `${slug}/bible`) ?? rows[0];
  return living ? docBody(living, lang) : "";
}

export async function revisionContext(db: SupabaseClient, subject: Subject, session: Session): Promise<RevisionContext> {
  const lang = subject.language;
  const [chapters, bible] = await Promise.all([bookChapters(db, subject.story_slug), currentBible(db, subject.story_slug, lang)]);
  const target = session.target_doc ? chapters.find((c) => c.id === session.target_doc) : undefined;
  return {
    bible,
    chapterTitle: target ? docTitle(target, lang) : null,
    chapter: target ? docBody(target, lang) : null,
    chapterList: chapters.map((c) => docTitle(c, lang)),
  };
}
