// Interview Mode: one conversational turn at a time.
//
// JSON actions (POST application/json):
//   { action: "state" }                 → subject + active session + current question
//   { action: "start" }                 → start a session (or return the active one)
//   { action: "answer_text", text }     → her answer as typed text (testing / fallback)
//   { action: "skip" }                  → she wants to skip the current question
//   { action: "redo" }                  → undo her last answer + the reply, re-ask
//   { action: "finish" }                → closing line, then summary runs in background
// Multipart action (POST multipart/form-data):
//   action=answer, audio=<file>, duration_ms=<number> → her spoken answer

import {
  admin, callClaude, cleanSpoken, corsHeaders, estimateCost, getCaller, interviewerSystemPrompt,
  json, jsonError, monthSpend, SERVICE_ROLE_KEY, signedUrl, speechToText, SUPABASE_URL, textToSpeech,
  BUCKET, type ClaudeMessage, type Session, type Subject, type Turn,
} from "../_shared/interview.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const IDLE_CLOSE_HOURS = 6;
const SKIP_NOTE = "(어머니께서 이 질문은 넘어가고 싶다고 하셨습니다. 다른, 가벼운 질문으로 넘어가 주세요.)";

const MSG = {
  busy: "잠깐 문제가 생겼어요. 조금 있다가 다시 눌러 주세요.",
  budget: "이번 달 이야기 시간을 다 썼어요. 아드님께 말씀해 주세요.",
  noSubject: "아직 준비가 안 됐어요. 아드님께 말씀해 주세요.",
  notHeard: "잘 못 들었어요. 다시 한 번 말씀해 주시겠어요?",
};

function startInstruction(subject: Subject, session: Session): string {
  const first = session.session_no === 1;
  return first
    ? `(대화 시작. 이번이 첫 번째 이야기 시간입니다. ${subject.honorific}께 따뜻하게 인사하고, 아드님이 ${subject.honorific}의 이야기를 책으로 쓰려고 준비한 AI 도우미라고 아주 짧게 소개한 뒤, 오늘의 첫 질문을 해 주세요.)`
    : `(대화 시작. ${session.session_no}번째 이야기 시간입니다. ${subject.honorific}께 반갑게 인사하고, 지난번 이야기를 한 가지 짧게 언급한 뒤, 오늘의 첫 질문을 해 주세요.)`;
}

function buildMessages(subject: Subject, session: Session, turns: Turn[], extraUser?: string): ClaudeMessage[] {
  const msgs: ClaudeMessage[] = [{ role: "user", content: startInstruction(subject, session) }];
  const push = (role: "user" | "assistant", content: string) => {
    const last = msgs[msgs.length - 1];
    if (last.role === role) last.content += `\n${content}`;
    else msgs.push({ role, content });
  };
  for (const t of turns) {
    if (t.speaker === "interviewer") push("assistant", t.text);
    else push("user", t.skipped ? SKIP_NOTE : (t.text || "(말씀이 없으셨어요)"));
  }
  if (extraUser) push("user", extraUser);
  return msgs;
}

async function loadSubject(db: SupabaseClient, userId: string): Promise<Subject | null> {
  const { data } = await db.from("interview_subjects").select("*").eq("user_id", userId).maybeSingle();
  return data as Subject | null;
}

async function activeSession(db: SupabaseClient, subjectId: string): Promise<Session | null> {
  const { data } = await db
    .from("interview_sessions")
    .select("*")
    .eq("subject_id", subjectId)
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as Session | null;
}

async function loadTurns(db: SupabaseClient, sessionId: string): Promise<Turn[]> {
  const { data } = await db.from("interview_turns").select("*").eq("session_id", sessionId).order("turn_no");
  return (data as Turn[]) ?? [];
}

async function earlierSessions(db: SupabaseClient, subjectId: string, beforeNo: number): Promise<Session[]> {
  const { data } = await db
    .from("interview_sessions")
    .select("*")
    .eq("subject_id", subjectId)
    .lt("session_no", beforeNo)
    .order("session_no");
  return (data as Session[]) ?? [];
}

function triggerFinish(sessionId: string) {
  const p = fetch(`${SUPABASE_URL}/functions/v1/interview-finish`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId }),
  }).catch((e) => console.error("[interview-turn] finish trigger failed", e));
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(p);
}

async function addUsage(db: SupabaseClient, session: Session, delta: { in?: number; out?: number; tts?: number; stt?: number }) {
  const input_tokens = session.input_tokens + (delta.in ?? 0);
  const output_tokens = session.output_tokens + (delta.out ?? 0);
  const update = {
    input_tokens,
    output_tokens,
    tts_chars: session.tts_chars + (delta.tts ?? 0),
    stt_seconds: Number(session.stt_seconds) + (delta.stt ?? 0),
    est_cost_usd: estimateCost(input_tokens, output_tokens),
    last_activity_at: new Date().toISOString(),
  };
  Object.assign(session, update);
  await db.from("interview_sessions").update(update).eq("id", session.id);
}

// Generate the interviewer's next line, speak it, store it. Returns the saved turn + audio URL.
async function interviewerSpeaks(
  db: SupabaseClient, subject: Subject, session: Session, turns: Turn[], extraUser?: string,
): Promise<{ turn: Turn; audio_url: string | null }> {
  const earlier = await earlierSessions(db, subject.id, session.session_no);
  const system = interviewerSystemPrompt(subject, session, earlier);
  const result = await callClaude(system, buildMessages(subject, session, turns, extraUser), 400);
  const text = cleanSpoken(result.text) || "그 얘기 조금 더 해 주시겠어요?";

  const turnNo = (turns[turns.length - 1]?.turn_no ?? 0) + 1;
  let audioPath: string | null = null;
  let ttsChars = 0;
  try {
    const audio = await textToSpeech(subject, text);
    audioPath = `${subject.id}/${session.id}/${String(turnNo).padStart(3, "0")}-interviewer.mp3`;
    const { error } = await db.storage.from(BUCKET).upload(audioPath, audio, { contentType: "audio/mpeg", upsert: true });
    if (error) { console.error("[interview-turn] upload failed", error.message); audioPath = null; }
    ttsChars = text.length;
  } catch (e) {
    // Text still works if speech fails; the page shows the words.
    console.error("[interview-turn] TTS failed", e);
  }

  const { data: saved, error: insErr } = await db
    .from("interview_turns")
    .insert({ session_id: session.id, turn_no: turnNo, speaker: "interviewer", text, audio_path: audioPath })
    .select()
    .single();
  if (insErr) throw new Error(insErr.message);

  await addUsage(db, session, { in: result.input_tokens, out: result.output_tokens, tts: ttsChars });
  return { turn: saved as Turn, audio_url: await signedUrl(db, audioPath) };
}

function publicSubject(s: Subject) {
  return { id: s.id, display_name: s.display_name, honorific: s.honorific, language: s.language };
}

async function stateResponse(db: SupabaseClient, subject: Subject, session: Session | null, turns: Turn[]) {
  const lastInterviewer = [...turns].reverse().find((t) => t.speaker === "interviewer") ?? null;
  const lastSubject = [...turns].reverse().find((t) => t.speaker === "subject" && !t.skipped) ?? null;
  return json({
    subject: publicSubject(subject),
    session: session ? { id: session.id, session_no: session.session_no, era: session.era, started_at: session.started_at } : null,
    question: lastInterviewer ? { id: lastInterviewer.id, text: lastInterviewer.text, audio_url: await signedUrl(db, lastInterviewer.audio_path) } : null,
    last_answer: lastSubject && lastInterviewer && lastSubject.turn_no < lastInterviewer.turn_no ? lastSubject.text : null,
    answers_count: turns.filter((t) => t.speaker === "subject").length,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonError(405, "Method not allowed");

  try {
    const user = await getCaller(req);
    if (!user) return jsonError(401, "Authentication required");
    const db = admin();

    const subject = await loadSubject(db, user.id);
    if (!subject) return jsonError(404, MSG.noSubject, "no_subject");

    const contentType = req.headers.get("content-type") ?? "";
    let action = "";
    let body: Record<string, unknown> = {};
    let form: FormData | null = null;
    if (contentType.includes("multipart/form-data")) {
      form = await req.formData();
      action = String(form.get("action") ?? "answer");
    } else {
      body = await req.json().catch(() => ({}));
      action = String(body.action ?? "state");
    }

    let session = await activeSession(db, subject.id);

    // Auto-close a session that's been idle too long.
    if (session && Date.now() - new Date(session.last_activity_at).getTime() > IDLE_CLOSE_HOURS * 3600_000) {
      await db.from("interview_sessions").update({ status: "finishing", ended_at: session.last_activity_at }).eq("id", session.id);
      triggerFinish(session.id);
      session = null;
    }

    // ── state ──
    if (action === "state") {
      const turns = session ? await loadTurns(db, session.id) : [];
      return await stateResponse(db, subject, session, turns);
    }

    // ── start ──
    if (action === "start") {
      if (session) {
        const turns = await loadTurns(db, session.id);
        if (turns.length) return await stateResponse(db, subject, session, turns);
      } else {
        if ((await monthSpend(db, subject.id)) >= Number(subject.monthly_budget_usd)) {
          return jsonError(402, MSG.budget, "budget");
        }
        const { data: last } = await db
          .from("interview_sessions").select("session_no").eq("subject_id", subject.id)
          .order("session_no", { ascending: false }).limit(1).maybeSingle();
        const { data: created, error } = await db
          .from("interview_sessions")
          .insert({ subject_id: subject.id, session_no: ((last as { session_no?: number } | null)?.session_no ?? 0) + 1, era: subject.next_era || "free" })
          .select().single();
        if (error) throw new Error(error.message);
        session = created as Session;
      }
      const { turn, audio_url } = await interviewerSpeaks(db, subject, session!, []);
      return json({
        subject: publicSubject(subject),
        session: { id: session!.id, session_no: session!.session_no, era: session!.era, started_at: session!.started_at },
        question: { id: turn.id, text: turn.text, audio_url },
        last_answer: null,
        answers_count: 0,
      });
    }

    if (!session) return jsonError(409, "No active session", "no_session");
    const turns = await loadTurns(db, session.id);

    // ── answer (audio) / answer_text / skip ──
    if (action === "answer" || action === "answer_text" || action === "skip") {
      if ((await monthSpend(db, subject.id)) >= Number(subject.monthly_budget_usd)) {
        return jsonError(402, MSG.budget, "budget");
      }
      const turnNo = (turns[turns.length - 1]?.turn_no ?? 0) + 1;
      let text = "";
      let audioPath: string | null = null;
      let durationMs: number | null = null;

      if (action === "answer") {
        const audio = form?.get("audio");
        if (!(audio instanceof Blob)) return jsonError(400, "audio file required");
        durationMs = Number(form?.get("duration_ms") ?? 0) || null;
        const mime = (audio as Blob).type || "audio/mp4";
        const ext = mime.includes("webm") ? "webm" : mime.includes("ogg") ? "ogg" : mime.includes("wav") ? "wav" : "m4a";
        audioPath = `${subject.id}/${session.id}/${String(turnNo).padStart(3, "0")}-subject.${ext}`;
        const bytes = await (audio as Blob).arrayBuffer();
        const { error: upErr } = await db.storage.from(BUCKET).upload(audioPath, bytes, { contentType: mime, upsert: true });
        if (upErr) console.error("[interview-turn] subject audio upload failed", upErr.message);
        text = await speechToText(new Blob([bytes], { type: mime }), `answer.${ext}`, subject.language);
        if (!text) {
          await db.storage.from(BUCKET).remove([audioPath]);
          return json({ not_heard: true, message: MSG.notHeard });
        }
      } else if (action === "answer_text") {
        text = String(body.text ?? "").trim();
        if (!text) return jsonError(400, "text required");
      }

      const { data: subjTurn, error: subjErr } = await db
        .from("interview_turns")
        .insert({
          session_id: session.id, turn_no: turnNo, speaker: "subject", text,
          audio_path: audioPath, duration_ms: durationMs, skipped: action === "skip",
        })
        .select().single();
      if (subjErr) throw new Error(subjErr.message);
      if (durationMs) await addUsage(db, session, { stt: durationMs / 1000 });

      const { turn, audio_url } = await interviewerSpeaks(db, subject, session, [...turns, subjTurn as Turn]);
      return json({
        her_text: text,
        question: { id: turn.id, text: turn.text, audio_url },
        answers_count: turns.filter((t) => t.speaker === "subject").length + 1,
      });
    }

    // ── redo: remove her last answer and the reply to it ──
    if (action === "redo") {
      const last = turns[turns.length - 1];
      const prev = turns[turns.length - 2];
      if (last?.speaker === "interviewer" && prev?.speaker === "subject") {
        await db.from("interview_turns").delete().in("id", [last.id, prev.id]);
        const paths = [last.audio_path, prev.audio_path].filter(Boolean) as string[];
        if (paths.length) await db.storage.from(BUCKET).remove(paths);
        const remaining = turns.slice(0, -2);
        return await stateResponse(db, subject, session, remaining);
      }
      return await stateResponse(db, subject, session, turns);
    }

    // ── finish ──
    if (action === "finish") {
      let closing: { text: string; audio_url: string | null } | null = null;
      if (turns.some((t) => t.speaker === "subject")) {
        try {
          const { turn, audio_url } = await interviewerSpeaks(
            db, subject, session, turns,
            `(${subject.honorific}께서 오늘은 여기까지 하자고 하셨습니다. 질문은 하지 말고, 오늘 들려주신 이야기에 따뜻하게 감사드리고, 다음에 또 이야기 나누자고 한두 문장으로 짧게 인사해 주세요.)`,
          );
          closing = { text: turn.text, audio_url };
        } catch (e) {
          console.error("[interview-turn] closing line failed", e);
        }
      }
      await db.from("interview_sessions")
        .update({ status: "finishing", ended_at: new Date().toISOString() })
        .eq("id", session.id);
      if (turns.some((t) => t.speaker === "subject")) triggerFinish(session.id);
      else await db.from("interview_sessions").update({ status: "finished" }).eq("id", session.id);
      return json({ finished: true, closing });
    }

    return jsonError(400, `Unknown action: ${action}`);
  } catch (err) {
    console.error("[interview-turn] error", err);
    return jsonError(500, MSG.busy, "server");
  }
});
