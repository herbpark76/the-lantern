// Interview Mode: turn a finished session into book material.
// POST { session_id }  — callable by the service role (from interview-turn), staff, or the subject.
// Produces an English translation, summary, scene notes and follow-ups, saves them,
// and commits a markdown file to GitHub at interviews/<story_slug>/session-NN.md.

import {
  admin, callClaude, corsHeaders, ERAS, estimateCost, getCaller, GITHUB_REPO, GITHUB_TOKEN,
  isStaffUser, json, jsonError, SERVICE_ROLE_KEY, type Session, type Subject, type Turn,
} from "../_shared/interview.ts";

const TRANSLATE_SYSTEM = `You translate Korean interview transcripts into English for a novelist. The speaker is an elderly Korean woman from Daegu speaking in Gyeongsang dialect, transcribed by speech-to-text (expect small transcription errors; translate the evident meaning). Translate faithfully and completely, line by line, keeping each "Interviewer:" / speaker label. Preserve her voice, idioms and tone; when a Korean word or phrase carries meaning that English loses (dialect, food, kinship terms, sayings), keep it in romanized Korean with a short gloss in brackets. Output only the translation.`;

const NOTES_SYSTEM = `You help a novelist turn interview sessions with his mother into material for a family-saga novel (in the spirit of Toji, Pachinko, Ode to My Father). You receive a Korean transcript of one session (speech-to-text, may contain small errors) plus notes from earlier sessions. Write in English. Be faithful: never invent facts; mark anything uncertain with "(unclear)".

Return ONLY a JSON object with these string fields:
- "summary": a concise factual summary of what she told us this session — people (with relationships), places, years/ages, events — as markdown bullet points.
- "scene_notes": vivid material for scenes as markdown bullets: sensory details, objects, food, weather, gestures, and her own memorable phrasings quoted in Korean with English in brackets.
- "followups": 3–8 specific follow-up questions for next time, as markdown bullets, each in Korean (gentle 존댓말) followed by English in brackets. Note any topics she seemed reluctant about so they can be handled with care.`;

function b64utf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function parseJsonObject(text: string): Record<string, string> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("No JSON in response");
  return JSON.parse(text.slice(start, end + 1));
}

async function commitToGitHub(path: string, content: string, message: string): Promise<void> {
  if (!GITHUB_TOKEN || !GITHUB_REPO) throw new Error("GITHUB_TOKEN / GITHUB_REPO not configured");
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`;
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
  let sha: string | undefined;
  const existing = await fetch(url, { headers });
  if (existing.ok) sha = ((await existing.json()) as { sha?: string }).sha;
  const resp = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify({ message, content: b64utf8(content), ...(sha ? { sha } : {}) }),
  });
  if (!resp.ok) throw new Error(`GitHub ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonError(405, "Method not allowed");

  try {
    const db = admin();
    const { session_id, skip_github } = await req.json().catch(() => ({}));
    if (!session_id) return jsonError(400, "session_id required");

    const { data: sessionRow } = await db.from("interview_sessions").select("*").eq("id", session_id).maybeSingle();
    if (!sessionRow) return jsonError(404, "Session not found");
    const session = sessionRow as Session & { transcript_ko?: string };
    const { data: subjectRow } = await db.from("interview_subjects").select("*").eq("id", session.subject_id).single();
    const subject = subjectRow as Subject;

    // Auth: service role, staff, or the subject themselves.
    const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (bearer !== SERVICE_ROLE_KEY) {
      const user = await getCaller(req);
      if (!user) return jsonError(401, "Authentication required");
      if (user.id !== subject.user_id && !(await isStaffUser(db, user.id))) return jsonError(403, "Forbidden");
    }

    const { data: turnRows } = await db.from("interview_turns").select("*").eq("session_id", session.id).order("turn_no");
    const turns = (turnRows as Turn[]) ?? [];
    if (!turns.some((t) => t.speaker === "subject" && !t.skipped)) {
      await db.from("interview_sessions").update({ status: "finished" }).eq("id", session.id);
      return json({ ok: true, empty: true });
    }

    const name = subject.display_name || subject.honorific;
    const transcriptKo = turns
      .map((t) => t.speaker === "interviewer"
        ? `인터뷰어: ${t.text}`
        : `${name}: ${t.skipped ? "(이 질문은 넘어감)" : t.text}`)
      .join("\n\n");

    const { data: earlierRows } = await db
      .from("interview_sessions").select("session_no, era, summary_en")
      .eq("subject_id", subject.id).lt("session_no", session.session_no).order("session_no");
    const earlier = ((earlierRows as Array<{ session_no: number; era: string; summary_en: string | null }>) ?? [])
      .map((s) => `Session ${s.session_no} (${ERAS[s.era]?.label ?? s.era}):\n${s.summary_en ?? "(no summary)"}`)
      .join("\n\n") || "(none — this is the first session)";

    const [translation, notes] = await Promise.all([
      callClaude(TRANSLATE_SYSTEM, [{ role: "user", content: transcriptKo }], 16000),
      callClaude(NOTES_SYSTEM, [{
        role: "user",
        content: `Earlier sessions:\n${earlier}\n\nThis session (#${session.session_no}, topic: ${ERAS[session.era]?.label ?? session.era}):\n\n${transcriptKo}`,
      }], 4000),
    ]);

    let parsed: Record<string, string>;
    try { parsed = parseJsonObject(notes.text); }
    catch { parsed = { summary: notes.text, scene_notes: "", followups: "" }; }

    const input_tokens = session.input_tokens + translation.input_tokens + notes.input_tokens;
    const output_tokens = session.output_tokens + translation.output_tokens + notes.output_tokens;

    const update: Record<string, unknown> = {
      status: "finished",
      ended_at: session.ended_at ?? new Date().toISOString(),
      transcript_ko: transcriptKo,
      transcript_en: translation.text,
      summary_en: parsed.summary ?? "",
      scene_notes: parsed.scene_notes ?? "",
      followups: parsed.followups ?? "",
      input_tokens,
      output_tokens,
      est_cost_usd: estimateCost(input_tokens, output_tokens),
      github_error: null,
    };

    if (!skip_github) {
      const nn = String(session.session_no).padStart(2, "0");
      const path = `interviews/${subject.story_slug}/session-${nn}.md`;
      const date = new Date(session.started_at).toISOString().slice(0, 10);
      const minutes = Math.round((new Date(String(update.ended_at)).getTime() - new Date(session.started_at).getTime()) / 60000);
      const md = `# Interview session ${nn}: ${ERAS[session.era]?.label ?? session.era}

- **Subject:** ${name}
- **Date:** ${date} (${minutes} min, ${turns.filter((t) => t.speaker === "subject").length} answers)
- **Story:** ${subject.story_slug}

## Summary
${update.summary_en}

## Scene notes
${update.scene_notes}

## Follow-ups for next time
${update.followups}

## Transcript (English)
${update.transcript_en}

## Transcript (Korean, speech-to-text)
${transcriptKo}
`;
      try {
        await commitToGitHub(path, md, `Interview session ${nn} (${subject.story_slug})`);
        update.github_path = path;
      } catch (e) {
        console.error("[interview-finish] GitHub commit failed", e);
        update.github_error = String((e as Error).message ?? e);
      }
    }

    await db.from("interview_sessions").update(update).eq("id", session.id);
    return json({ ok: true, github_path: update.github_path ?? null, github_error: update.github_error ?? null });
  } catch (err) {
    console.error("[interview-finish] error", err);
    return jsonError(500, String((err as Error).message ?? err));
  }
});
