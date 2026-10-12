// Interview Mode: turn a finished session into book material.
// POST { session_id }  — callable by the service role (from interview-turn), staff, or the subject.
// Produces an English translation, summary, scene notes and follow-ups, saves them,
// and commits a markdown file to GitHub at interviews/<story_slug>/session-NN.md.

import {
  admin, bookChapters, callClaude, chaptersForPrompt, corsHeaders, currentBible, docBody, docTitle, SUPABASE_URL, ERAS, estimateCost, getCaller, GITHUB_REPO, GITHUB_TOKEN,
  isStaffUser, json, jsonError, SERVICE_ROLE_KEY, type Session, type Subject, type Turn,
} from "../_shared/interview.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const TRANSLATE_SYSTEM = `You translate Korean interview transcripts into English for a novelist. The speaker is an elderly Korean woman from Daegu speaking in Gyeongsang dialect, transcribed by speech-to-text (expect small transcription errors; translate the evident meaning). Translate faithfully and completely, line by line, keeping each "Interviewer:" / speaker label. Preserve her voice, idioms and tone; when a Korean word or phrase carries meaning that English loses (dialect, food, kinship terms, sayings), keep it in romanized Korean with a short gloss in brackets. Output only the translation.`;

const NOTES_SYSTEM = `You help a novelist turn interview sessions with his mother into material for a family-saga novel (in the spirit of Toji, Pachinko, Ode to My Father). You receive a Korean transcript of one session (speech-to-text, may contain small errors) plus notes from earlier sessions. Be faithful: never invent facts; mark anything uncertain with "(unclear)".

Answer with exactly these four sections, each wrapped in its tag, and nothing else:

<summary>
English. A concise factual summary of what she told us this session — people (with relationships), places, years/ages, events — as markdown bullet points.
</summary>
<scene_notes>
English. Vivid material for scenes as markdown bullets: sensory details, objects, food, weather, gestures, and her own memorable phrasings quoted in Korean with English in brackets.
</scene_notes>
<followups>
3–8 specific follow-up questions for next time, as markdown bullets, each in Korean (gentle 존댓말) followed by English in brackets. Note any topics she seemed reluctant about so they can be handled with care.
</followups>
<summary_ko>
Korean, written for her to read herself: a warm, short summary (5–10 bullet points, gentle 존댓말, simple words) of what she shared today, so she can check it and correct anything — e.g. "• 토지를 태백산맥보다 조금 더 좋아하신다고 하셨어요." No analysis, no English.
</summary_ko>`;

function b64utf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function parseSections(text: string, tags = ["summary", "scene_notes", "followups", "summary_ko"]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const tag of tags) {
    const m = text.match(new RegExp(`<${tag}>([\\s\\S]*?)(?:</${tag}>|$)`));
    if (m) out[tag] = m[1].trim();
  }
  if (!out[tags[0]]) out[tags[0]] = text.trim();
  return out;
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

// ── Ghostwriter sessions: story bible + outline + opening chapter ─────────

const PLAN_SPEC = `<outline>
The structure of the whole book, in markdown:
## Format and length: the kind of book (novella, novel, short story…) and its target total length in words. Use what the author said; if they never said, plan a novella of about 30,000 words and mark it "(suggested)".
## Acts: Act I (setup, roughly the first quarter), Act II (confrontation, with the midpoint), Act III (climax and resolution), a short paragraph each.
## Major plot points: inciting incident, first plot point (end of Act I), midpoint, low point / second plot point (end of Act II), climax, resolution, each with the chapter it lands in.
## Chapter plan: every chapter of the finished book, as "### Chapter N: <working title> (Act X, ~W words)" followed by 2–4 short - bullets for its beats and one "- Job: …" bullet for its job in the story. The chapter targets must add up to the book's target length, with lengths that suit each chapter's weight. Chapters already written keep their number and title and are marked "(written)"; plan the rest so the whole book still lands its acts and plot points.
</outline>`;

const GW_NOTES_SYSTEM = `You are a story developer. You receive the current story bible (if any), notes from earlier sessions (including sessions where the author gave notes on the draft), and the transcript of a voice interview in which the author described the story they want written (speech-to-text; small errors are normal). Produce the complete, updated version of each section, keeping everything still true and folding in what's new. Build on everything known so far; where something was left open, make a clear, tasteful suggestion and mark it "(suggested)". Never contradict what the author said.

Answer with exactly these three sections, each wrapped in its tag. Markdown sections use ## subheadings, paragraphs and - bullets only; no tables.

<bible>
The story bible: working title (and 2–3 alternates), logline, genre and tone, comparable books/films, setting, the protagonist (want, need, flaw, voice), key supporting characters and the opposing force, central conflict and stakes, themes, the author's stated tastes and influences, and a short "## Author's standing notes" list of preferences that apply to every chapter.
</bible>
${PLAN_SPEC}
<open_questions>
4–8 specific questions to settle in the next session, as - bullets.
</open_questions>`;

/** Output budget for a chapter of about `words` words (prose is ~1.4 tokens per word), with headroom. */
function tokensFor(words: number): number {
  return Math.min(32000, Math.round(words * 1.6) + 3000);
}

function chapterSystem(subject: Subject, n: number, targetWords = 3000): string {
  const lang = subject.language === "ko" ? "Korean" : "English";
  const who = subject.honorific || subject.display_name;
  const task = n === 1
    ? "write the opening chapter of their story. Start in scene with a strong hook, establish the protagonist's voice and desire, and end the chapter on a turn that pulls the reader on."
    : `write Chapter ${n} of their story. Pick up where the previous chapter left off, keep continuity of names, facts and voice, and end on a turn that pulls the reader on.`;
  return `You are a skilled novelist ghostwriting a book for ${who}. From the story bible (which captures everything the author has told you, including their standing notes) and the chapters written so far, ${task} Follow the chapter's brief from the book plan exactly: cover its beats in order, land any plot points assigned to it, and don't run ahead into later chapters' beats. Write about ${targetWords.toLocaleString()} words (within 10%), in ${lang}, in the genre, tone and point of view they described. Let the craft of the authors they love inform yours (pacing, wit, texture), but never imitate or quote their text. Where details were left open, choose well and stay consistent with everything they said.

Output only the chapter in markdown: first line "# Chapter ${n}: <title>", then paragraphs. Use "### 1", "### 2" lines only for section breaks. No other headings, no notes.`;
}

const REVISE_NOTES_SYSTEM = `You are a story editor. You receive the current story bible, possibly the text of one chapter, and the transcript of a voice session in which the author gave notes (speech-to-text; small errors are normal). Fold the author's notes into the bible faithfully. Keep everything in the bible that the notes don't change; where the notes change something, the notes win. Never invent preferences the author didn't express; you may mark tasteful fills "(suggested)".

Answer with exactly these four sections, each wrapped in its tag. Markdown sections use ## subheadings, paragraphs and - bullets only; no tables.

<revision_notes>
The author's notes from this session as clear, actionable - bullets, grouped under "## For this chapter" (only if a chapter was discussed) and "## For the story overall".
</revision_notes>
<bible>
The complete updated story bible: working title (and alternates), logline, genre and tone, comparable books/films, setting, protagonist (want, need, flaw, voice), key characters and the opposing force, central conflict and stakes, themes, the author's tastes and influences, and a short "## Author's standing notes" list of preferences that apply to all chapters.
</bible>
${PLAN_SPEC}
<open_questions>
4–8 questions still to settle, as - bullets.
</open_questions>`;

function rewriteSystem(subject: Subject): string {
  const lang = subject.language === "ko" ? "Korean" : "English";
  return `You are the novelist revising a chapter you ghostwrote for ${subject.honorific || subject.display_name}. Below are the story bible, the current chapter, and the transcript of a session in which the author gave notes on it. Write the revised chapter in ${lang}: apply every note the author gave about this chapter, keep what they liked, keep continuity with the bible, and otherwise preserve the chapter's strengths. Similar length unless the notes ask otherwise.

Output only the revised chapter in markdown with the same first-line heading format ("# Chapter N: <title>"; you may change the title if the notes call for it), then paragraphs. Use "### 1", "### 2" lines only for section breaks. No other headings, no notes.`;
}

function nn(n: number): string {
  return String(n).padStart(2, "0");
}

const STRUCTURE_HEADING = /^#\s*Structure and chapter plan\s*$/im;

/** The bible part of a composed bible document: everything before its structure section, without "# Story Bible" headings. */
function bibleBodyOf(md: string): string {
  const m = md.match(STRUCTURE_HEADING);
  const body = m?.index !== undefined ? md.slice(0, m.index) : md;
  return body.replace(/^#\s*Story Bible\s*$/gim, "").trim();
}

/** The "## Still to decide" list at the end of a bible document. */
function openQuestionsOf(md: string): string {
  const lists = md.split("## Still to decide").slice(1).map((s) => s.split(STRUCTURE_HEADING)[0].trim());
  return [...lists].reverse().find(Boolean) ?? "";
}

const hasChapters = (outline: string) => /^###\s*Chapter\s+\d+/im.test(outline);

/**
 * Assemble the bible document. `previous` is the bible being replaced: any part the model left
 * out (or that came back empty) is kept from it, so a short or cut-off reply can never wipe the
 * chapter plan or nest the old document inside the new one.
 */
function composeBible(bible: string, outline: string, open: string, previous = ""): string {
  const body = bibleBodyOf(bible) || bibleBodyOf(previous);
  let plan = outline.replace(STRUCTURE_HEADING, "").replace(/^##\s*Still to decide[\s\S]*$/im, "").trim();
  if (!hasChapters(plan) && previous) plan = outlineOf(previous).replace(STRUCTURE_HEADING, "").trim() || plan;
  const questions = open.trim() || openQuestionsOf(previous);
  return `# Story Bible\n\n${body}\n\n# Structure and chapter plan\n\n${plan}\n\n## Still to decide\n\n${questions}`;
}

/** Refuse to save a bible from a reply that ran out of room: it would be missing its later sections. */
function assertComplete(out: { stop_reason?: string; text?: string; output_tokens?: number }, what = "The bible update", needTag = ""): void {
  if (out.stop_reason !== "max_tokens") return;
  // Ran out of room, but the section we actually need was finished: keep it.
  if (needTag && (out.text ?? "").includes(`</${needTag}>`)) return;
  const text = out.text ?? "";
  const chapters = (text.match(/^###\s*Chapter\s+\d+/gim) ?? []).length;
  const tail = text.slice(-90).replace(/\s+/g, " ");
  console.error(`[interview-finish] ${what} cut off at ${out.output_tokens} tokens; ${chapters} chapter headings; tail: ${text.slice(-2000)}`);
  throw new Error(`${what} was too long and got cut off (${out.output_tokens ?? "?"} tokens, ${chapters} chapters written, ends "…${tail}"), so nothing was changed.`);
}

function personFolder(subject: Subject): string {
  return (subject.display_name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || subject.id.slice(0, 8);
}

function chapterHeading(md: string, n: number): string {
  const t = md.trim();
  return t.startsWith("# ") ? t : `# Chapter ${n}\n\n${t}`;
}

/** Save a doc's current text as a version before it is overwritten. */
async function snapshot(db: SupabaseClient, docId: string, note: string): Promise<void> {
  const { data } = await db.from("book_docs").select("title_en, title_ko, body_en, body_ko").eq("id", docId).maybeSingle();
  const d = data as { title_en: string; title_ko: string; body_en: string; body_ko: string } | null;
  if (!d || !(d.body_en || d.body_ko)) return;
  const { error } = await db.from("book_doc_versions").insert({ doc_id: docId, ...d, note });
  if (error) console.error("[interview-finish] version save failed", error.message);
}

function transcriptOf(subject: Subject, turns: Turn[], label: string): string {
  const name = subject.display_name || subject.honorific;
  return turns
    .map((t) => t.speaker === "interviewer" ? `${label}: ${t.text}` : `${name}: ${t.skipped ? "(skipped)" : t.text}`)
    .join("\n\n");
}

export interface ChapterPlan { n: number; title?: string; act?: number; target_words?: number; purpose?: string; beats?: string[] }
export interface BookPlan {
  format?: string; target_words?: number;
  acts?: Array<{ act: number; summary?: string }>;
  plot_points?: Array<{ name: string; chapter?: number; summary?: string }>;
  chapters?: ChapterPlan[];
}

function parsePlan(raw: string | undefined): BookPlan | null {
  if (!raw) return null;
  let text = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const m = text.match(/\{[\s\S]*\}/);
  if (m) text = m[0];
  for (const candidate of [text, text.replace(/,\s*([}\]])/g, "$1").replace(/[“”]/g, '"')]) {
    try {
      const p = JSON.parse(candidate) as BookPlan;
      if (Array.isArray(p?.chapters) && p.chapters.length) return p;
    } catch { /* try the next */ }
  }
  return null;
}

const PLAN_JSON_SYSTEM = `Convert a book's structure (written in markdown) into strict JSON. Output ONLY the JSON object, no prose, no code fences, no comments, no trailing commas, exactly this shape:
{"format":"novel","target_words":60000,"acts":[{"act":1,"summary":"..."}],"plot_points":[{"name":"Inciting incident","chapter":1,"summary":"..."}],"chapters":[{"n":1,"title":"...","act":1,"target_words":3000,"purpose":"...","beats":["...","..."]}]}
Include every chapter listed. Keep each beat to one short sentence. Use English.`;

/** The "# Structure and chapter plan" part of a bible document. */
function outlineOf(bibleMd: string): string {
  // A bible that was saved badly in the past can hold more than one structure section; use the
  // last one that actually lists chapters.
  const sections: string[] = [];
  let at = bibleMd.indexOf("# Structure and chapter plan");
  if (at < 0) return bibleMd;
  while (at >= 0) {
    const next = bibleMd.indexOf("# Structure and chapter plan", at + 1);
    let chunk = bibleMd.slice(at, next > at ? next : undefined);
    const end = chunk.indexOf("## Still to decide");
    if (end > 0) chunk = chunk.slice(0, end);
    sections.push(chunk);
    at = next;
  }
  return [...sections].reverse().find(hasChapters) ?? sections[sections.length - 1];
}

/** Mark the bible as busy and convert its outline to the JSON plan in a separate background call. */
async function queuePlan(db: SupabaseClient, slug: string): Promise<void> {
  await db.from("book_docs").update({ generating: true, gen_started_at: new Date().toISOString(), gen_error: null }).eq("id", `${slug}/bible`);
  startBackground("make_plan", { story_slug: slug });
}

async function makePlan(db: SupabaseClient, slug: string): Promise<void> {
  const id = `${slug}/bible`;
  try {
    const { data } = await db.from("book_docs").select("body_en, body_ko").eq("id", id).maybeSingle();
    const row = data as { body_en: string; body_ko: string } | null;
    const outline = outlineOf(row?.body_en || row?.body_ko || "");
    if (!outline.trim()) throw new Error("The bible has no structure section yet");
    if (!hasChapters(outline)) throw new Error("The bible's chapter plan section is empty. Try Rebuild chapter plan.");
    const out = await callClaude(PLAN_JSON_SYSTEM, [{ role: "user", content: outline }], 12000);
    const plan = parsePlan(out.text);
    await db.from("book_docs").update({
      ...(plan ? { plan } : {}), generating: false,
      gen_error: plan ? null : "The chapter plan couldn't be read; try Rebuild chapter plan.",
    }).eq("id", id);
  } catch (e) {
    await db.from("book_docs").update({ generating: false, gen_error: String((e as Error).message ?? e).slice(0, 300) }).eq("id", id);
  }
}

async function currentPlan(db: SupabaseClient, slug: string): Promise<BookPlan | null> {
  const { data } = await db.from("book_docs").select("plan").eq("id", `${slug}/bible`).maybeSingle();
  return ((data as { plan?: BookPlan | null } | null)?.plan) ?? null;
}

/** The brief for chapter n: its place in the acts, plot points that land in it, beats, target length. */
function chapterBrief(plan: BookPlan | null, n: number): { text: string; targetWords: number } {
  const ch = plan?.chapters?.find((c) => Number(c.n) === n);
  const total = plan?.chapters?.length ?? 0;
  const targetWords = Math.max(800, Math.min(12000, Number(ch?.target_words) || 3000));
  if (!plan || !ch) return { text: `No chapter plan yet: write about ${targetWords.toLocaleString()} words, following the outline in the bible.`, targetWords };
  const points = (plan.plot_points ?? []).filter((p) => Number(p.chapter) === n);
  const act = plan.acts?.find((a) => a.act === ch.act);
  const next = plan.chapters?.find((c) => Number(c.n) === n + 1);
  return {
    targetWords,
    text: [
      `Book: ${plan.format ?? "book"}, about ${(plan.target_words ?? 0).toLocaleString()} words in ${total} chapters.`,
      `This is Chapter ${n} of ${total}${ch.title ? `: "${ch.title}"` : ""}, in Act ${ch.act ?? "?"}${act?.summary ? ` (${act.summary})` : ""}.`,
      ch.purpose ? `Its job in the story: ${ch.purpose}` : "",
      ch.beats?.length ? `Beats to cover, in order:\n${ch.beats.map((b) => `- ${b}`).join("\n")}` : "",
      points.length ? `Major plot points that land in this chapter:\n${points.map((p) => `- ${p.name}: ${p.summary ?? ""}`).join("\n")}` : "",
      next ? `Set up, but do not reach, what comes next (Chapter ${n + 1}${next.title ? `: "${next.title}"` : ""}).` : "This is the final chapter: resolve the story.",
      `Target length: about ${targetWords.toLocaleString()} words (stay within 10%).`,
    ].filter(Boolean).join("\n\n"),
  };
}

async function saveBible(db: SupabaseClient, subject: Subject, md: string, note: string, plan?: BookPlan | null, langOverride?: "en" | "ko"): Promise<void> {
  const id = `${subject.story_slug}/bible`;
  await snapshot(db, id, note);
  const lang = langOverride ?? (subject.language === "ko" ? "ko" : "en");
  const { error } = await db.from("book_docs").upsert({
    id, story_slug: subject.story_slug, kind: "summary", position: 0,
    [`title_${lang}`]: "Story Bible", [`body_${lang}`]: md, [`voice_${lang}`]: subject.tts_voice_id,
    model_id: subject.tts_model_id, speed: Number(subject.tts_speed) || 1, updated_at: new Date().toISOString(),
    ...(plan ? { plan } : {}),
  }, { onConflict: "id" });
  if (error) console.error("[interview-finish] bible upsert failed", error.message);
}

async function saveChapter(db: SupabaseClient, subject: Subject, id: string, n: number, md: string, note: string): Promise<void> {
  await snapshot(db, id, note);
  const lang = subject.language === "ko" ? "ko" : "en";
  const title = md.split("\n")[0].replace(/^#\s*/, "");
  const { error } = await db.from("book_docs").upsert({
    id, story_slug: subject.story_slug, kind: "sample", position: n,
    [`title_${lang}`]: title, [`body_${lang}`]: md, [`voice_${lang}`]: subject.tts_voice_id,
    model_id: subject.tts_model_id, speed: Number(subject.tts_speed) || 1, updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) console.error("[interview-finish] chapter upsert failed", error.message);
}

// Interview session: fold what was said into the living bible. Chapters are written on demand
// from Studio > Book ("Create next chapter"), see writeChapter below.
async function finishGhostwriter(
  db: SupabaseClient, subject: Subject, session: Session, turns: Turn[], skipGithub: boolean,
): Promise<Response> {
  const lang = subject.language;
  const transcript = transcriptOf(subject, turns, "Ghostwriter");
  const chapters = await bookChapters(db, subject.story_slug);

  const { data: earlierRows } = await db
    .from("interview_sessions").select("session_no, kind, summary_en, followups")
    .eq("subject_id", subject.id).lt("session_no", session.session_no).order("session_no");
  const earlier = ((earlierRows as Array<{ session_no: number; kind: string; summary_en: string | null; followups: string | null }>) ?? [])
    .map((s) => `Session ${s.session_no}${s.kind === "revise" ? " (author's notes)" : ""}:\n${s.summary_en ?? ""}`)
    .join("\n\n---\n\n") || "(none — this is the first session)";
  const bible = await loadBible(db, subject.story_slug, lang);
  const book = chaptersForPrompt(chapters, lang, 120_000);

  const input = [
    `Current story bible:\n${bible || "(none yet)"}`,
    `The book so far:\n${book || "(no chapters yet)"}`,
    `Earlier sessions:\n${earlier}`,
    `This session (#${session.session_no}) transcript:\n\n${transcript}`,
  ].join("\n\n=====\n\n");

  const notes = await callClaude(GW_NOTES_SYSTEM, [{ role: "user", content: input }], 16000);
  const parsed = parseSections(notes.text, ["bible", "outline", "open_questions"]);
  if (notes.stop_reason === "max_tokens") {
    // Cut off: never save a half-written section; composeBible keeps the previous one instead.
    if (!notes.text.includes("</bible>")) delete parsed.bible;
    if (!notes.text.includes("</outline>")) delete parsed.outline;
  }
  const bibleMd = composeBible(parsed.bible ?? "", parsed.outline ?? "", parsed.open_questions ?? "", bible);
  await saveBible(db, subject, bibleMd, `Before session ${session.session_no}`);
  await queuePlan(db, subject.story_slug);

  const input_tokens = session.input_tokens + notes.input_tokens;
  const output_tokens = session.output_tokens + notes.output_tokens;
  const update: Record<string, unknown> = {
    status: "finished",
    ended_at: session.ended_at ?? new Date().toISOString(),
    transcript_ko: transcript,
    transcript_en: transcript,
    summary_en: parsed.bible ?? "",
    scene_notes: parsed.outline ?? "",
    followups: parsed.open_questions ?? "",
    input_tokens,
    output_tokens,
    est_cost_usd: estimateCost(input_tokens, output_tokens),
    github_error: null,
  };

  if (!skipGithub) {
    const path = `interviews/${subject.story_slug}/${personFolder(subject)}/session-${nn(session.session_no)}.md`;
    const md = `${bibleMd}\n\n---\n\n## Transcript\n\n${transcript}\n`;
    try {
      await commitToGitHub(path, md, `Ghostwriter session ${nn(session.session_no)} (${subject.story_slug})`);
      update.github_path = path;
    } catch (e) {
      update.github_error = String((e as Error).message ?? e);
    }
  }

  await db.from("interview_sessions").update(update).eq("id", session.id);
  return json({ ok: true, github_path: update.github_path ?? null, github_error: update.github_error ?? null, book: true });
}

// ── Memoir books (e.g. red-earth): bible, plan and chapters built from the interview sessions ──

const MEMOIR_PLAN_SYSTEM = `You are the developmental editor of a family-saga novel drawn from interviews with the author's mother, in the spirit of Toji, Taebaek Sanmaek, Pachinko and Ode to My Father: fictionalized, but true at heart. You receive the notes from her interview sessions (summaries, scene notes, follow-ups, in English, with her own phrases quoted in Korean), the current bible if any, and the chapters written so far. Be faithful: never contradict what she said; where the story needs invention (scenes, dialogue, connective tissue), say so and mark it "(invented)".

Be concise so the whole answer fits: the bible in about 2,000 words, the structure in about 2,500.

Answer in English with exactly these three sections, each wrapped in its tag. Markdown sections use ## subheadings, paragraphs and - bullets only; no tables.

<bible>
The story bible: working title (Korean and English), logline, the novel's point of view and frame (present day and flashbacks), tone and style notes (the Toji/Taebaek Sanmaek register: period texture, Gyeongsang dialect in dialogue, food, seasons, objects), timeline by era with years and ages, the people (with relationships, what she said about them), places, recurring motifs and her own memorable phrasings, themes, what is known vs. invented, and a short "## Standing notes" list that applies to every chapter (e.g. sensitivities, things never to invent).
</bible>
${PLAN_SPEC.replace("plan a novella of about 30,000 words", "plan a novel of about 60,000 words")}
<open_questions>
6–10 things to ask her in the next interview that the coming chapters need, as - bullets, each in gentle Korean 존댓말 followed by English in brackets.
</open_questions>`;

function memoirChapterSystem(subject: Subject, n: number, targetWords: number): string {
  const chars = Math.round(targetWords * 6 / 500) * 500;
  return `You are a Korean novelist writing Chapter ${n} of a family-saga novel based on the life of ${subject.display_name === "Mom" ? "the author's mother" : subject.display_name}, born 1951 in Daegu, from her own interviews. Write in Korean, in the literary register of Park Kyung-ni's Toji and Jo Jung-rae's Taebaek Sanmaek (dense period texture, the seasons, food and objects, the omniscient narrator's long view, Gyeongsang dialect in dialogue), but never imitate or quote their text. Third person. Fictionalized, true at heart: keep every fact she gave (names, places, years, relationships, events) and invent only texture, scenes and dialogue that fit them.

Follow the chapter's brief from the book plan exactly: cover its beats in order, land any plot points assigned to it, and don't run ahead into later chapters. Keep continuity with the chapters before it. Length: about ${chars.toLocaleString()} Korean characters (the equivalent of about ${targetWords.toLocaleString()} English words).

Output only the chapter in markdown: first line "# 제${n}장 <title>", then paragraphs. Use "### 1", "### 2" lines only for section breaks. No other headings, no notes.`;
}

const MEMOIR_TRANSLATE_SYSTEM = `You translate a chapter of a Korean literary novel into English for the author's son, who will read it alongside the Korean. Translate faithfully and completely, keeping the period texture and the narrator's voice; render dialect as natural, slightly rustic English rather than explaining it; keep Korean words for food, kinship terms and objects when English loses them (romanized, italicized, no glosses unless essential). Keep the markdown: the first line becomes "# Chapter N: <English title>", and keep the "### 1" section breaks. Output only the translation.`;

async function bookSubject(db: SupabaseClient, slug: string): Promise<Subject | null> {
  const { data } = await db.from("interview_subjects").select("*").eq("story_slug", slug).order("created_at");
  const rows = (data as Subject[]) ?? [];
  return rows.find((s) => s.mode === "ghostwriter") ?? rows[0] ?? null;
}

/** All of a memoir subject's interview notes (and English transcripts, newest first, within a budget). */
async function memoirMaterial(db: SupabaseClient, subject: Subject, transcriptBudget = 80_000): Promise<string> {
  const { data } = await db.from("interview_sessions")
    .select("session_no, era, summary_en, scene_notes, followups, transcript_en")
    .eq("subject_id", subject.id).eq("status", "finished").order("session_no");
  const rows = (data as Array<{ session_no: number; era: string; summary_en: string | null; scene_notes: string | null; followups: string | null; transcript_en: string | null }>) ?? [];
  const notes = rows.map((r) => `## Session ${r.session_no} (${ERAS[r.era]?.label ?? r.era})\n\n### Summary\n${r.summary_en ?? ""}\n\n### Scene notes\n${r.scene_notes ?? ""}\n\n### Follow-ups\n${r.followups ?? ""}`).join("\n\n");
  let used = 0;
  const transcripts: string[] = [];
  for (const r of [...rows].reverse()) {
    const t = (r.transcript_en ?? "").trim();
    if (!t || used + t.length > transcriptBudget) continue;
    transcripts.unshift(`## Session ${r.session_no} transcript (English)\n\n${t}`);
    used += t.length;
  }
  return `# Interview notes\n\n${notes || "(no finished sessions)"}${transcripts.length ? `\n\n# Transcripts\n\n${transcripts.join("\n\n")}` : ""}`;
}

// The bible text and the chapter plan are now produced by two separate, smaller calls, so
// neither reply runs long enough to get cut off.
const REVISE_BIBLE_SYSTEM = `You are a story editor. You receive the current story bible, possibly the text of one chapter, and the author's notes (typed, or a speech-to-text transcript; small errors are normal). Fold the author's notes into the bible faithfully. Keep everything in the bible that the notes don't change; where the notes change something, the notes win. Never invent preferences the author didn't express; you may mark tasteful fills "(suggested)". Do NOT include the structure, acts or chapter plan: those are updated separately.

Answer with exactly these two sections, each wrapped in its tag. Markdown sections use ## subheadings, paragraphs and - bullets only; no tables.

<revision_notes>
The author's notes as clear, actionable - bullets, grouped under "## For this chapter" (only if a chapter was discussed) and "## For the story overall".
</revision_notes>
<bible>
The complete updated story bible: working title (and alternates), logline, genre and tone, comparable books/films, setting, protagonist (want, need, flaw, voice), key characters and the opposing force, central conflict and stakes, themes, the author's tastes and influences, and a short "## Author's standing notes" list of preferences that apply to all chapters. Keep any other sections the bible already has (for example style rules or a continuity ledger).
</bible>`;

const OUTLINE_SYSTEM = `You are a story developer. You receive the story bible (with its current structure and chapter plan), possibly the chapters written so far, and possibly new notes from the author. Produce the updated structure and chapter plan only. Keep everything the author has already decided; where new notes change the structure, the notes win. Be compact: short bullets, and the whole answer under about 2,500 words. Don't repeat the bible.

Answer with exactly these two sections, each wrapped in its tag. Markdown sections use ## subheadings, paragraphs and - bullets only; no tables.

${PLAN_SPEC}
<open_questions>
4–8 questions still to settle, as - bullets.
</open_questions>`;

/** A bible document cleaned of any duplicated sections from earlier bad saves. */
async function loadBible(db: SupabaseClient, slug: string, lang: string): Promise<string> {
  const md = await currentBible(db, slug, lang);
  return md.trim() ? composeBible(bibleBodyOf(md), outlineOf(md), openQuestionsOf(md)) : "";
}

/** Fold notes into the bible text and the chapter plan with two parallel calls; returns the new bible document. */
async function reviseBibleAndPlan(bible: string, chapterBlock: string, notesBlock: string): Promise<{ md: string; revisionNotes: string }> {
  const input = [`Current story bible:\n${bible || "(none yet)"}`, chapterBlock, notesBlock].filter(Boolean).join("\n\n=====\n\n");
  const [b, o] = await Promise.all([
    callClaude(REVISE_BIBLE_SYSTEM, [{ role: "user", content: input }], 16000),
    callClaude(OUTLINE_SYSTEM, [{ role: "user", content: input }], 16000),
  ]);
  assertComplete(b, "The bible update", "bible");
  assertComplete(o, "The chapter plan update", "outline");
  const pb = parseSections(b.text, ["revision_notes", "bible"]);
  const po = parseSections(o.text, ["outline", "open_questions"]);
  return { md: composeBible(pb.bible ?? "", po.outline ?? "", po.open_questions ?? "", bible), revisionNotes: pb.revision_notes ?? "" };
}

async function replanMemoir(db: SupabaseClient, subject: Subject, slug: string): Promise<void> {
  const [bible, chapters, material] = await Promise.all([
    loadBible(db, slug, "en"), bookChapters(db, slug), memoirMaterial(db, subject, 60_000),
  ]);
  const input = [
    `Current bible (may be just a session summary):\n${bible || "(none yet)"}`,
    `Chapters written so far (English):\n${chaptersForPrompt(chapters, "en", 80_000) || "(none yet)"}`,
    material,
  ].join("\n\n=====\n\n");
  const notes = await callClaude(MEMOIR_PLAN_SYSTEM, [{ role: "user", content: input }], 16000);
  assertComplete(notes);
  const parsed = parseSections(notes.text, ["bible", "outline", "open_questions"]);
  await saveBible(db, subject, composeBible(parsed.bible ?? "", parsed.outline ?? "", parsed.open_questions ?? "", bible), "Before rebuilding the plan", null, "en");
}

// Korean chapter first, then the English translation as a separate background job.
async function writeMemoirChapter(db: SupabaseClient, subject: Subject, doc: { id: string; story_slug: string; position: number }, guidance = ""): Promise<void> {
  const chapters = await bookChapters(db, doc.story_slug);
  const before = chapters.filter((c) => c.position < doc.position);
  const [bible, plan, material] = await Promise.all([
    currentBible(db, doc.story_slug, "en"), currentPlan(db, doc.story_slug), memoirMaterial(db, subject),
  ]);
  const brief = chapterBrief(plan, doc.position);
  const input = [
    `Story bible (English):\n${bible || "(none yet)"}`,
    material,
    before.length ? `The novel so far (Korean):\n\n${chaptersForPrompt(before, "ko", 120_000)}` : "No chapters yet: this is the opening chapter.",
    `YOUR BRIEF FOR THIS CHAPTER:\n${brief.text}`,
    guidance ? `THE AUTHOR'S GUIDANCE FOR THIS CHAPTER (written in English; it overrides the brief where they differ):\n${guidance}` : "",
  ].filter(Boolean).join("\n\n=====\n\n");
  const out = await callClaude(memoirChapterSystem(subject, doc.position, brief.targetWords), [{ role: "user", content: input }],
    Math.min(32000, Math.round(brief.targetWords * 6 * 1.1) + 3000));
  let md = out.text.trim();
  if (!md.startsWith("# ")) md = `# 제${doc.position}장\n\n${md}`;
  await snapshot(db, doc.id, "Before rewrite");
  const title = md.split("\n")[0].replace(/^#\s*/, "");
  // body_en is cleared so the old English never sits beside the new Korean; translation fills it.
  await db.from("book_docs").update({
    title_ko: title, body_ko: md, body_en: "", voice_ko: subject.tts_voice_id,
    model_id: subject.tts_model_id, speed: Number(subject.tts_speed) || 0.92, updated_at: new Date().toISOString(),
  }).eq("id", doc.id);
}

async function translateChapter(db: SupabaseClient, chapterId: string): Promise<void> {
  try {
    const { data } = await db.from("book_docs").select("id, story_slug, position, body_ko").eq("id", chapterId).maybeSingle();
    const doc = data as { id: string; story_slug: string; position: number; body_ko: string } | null;
    if (!doc?.body_ko) throw new Error("No Korean text to translate");
    const out = await callClaude(MEMOIR_TRANSLATE_SYSTEM, [{ role: "user", content: doc.body_ko }], 16000);
    const md = chapterHeading(out.text, doc.position);
    await db.from("book_docs").update({
      title_en: md.split("\n")[0].replace(/^#\s*/, ""), body_en: md, generating: false, gen_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", chapterId);
    try {
      await commitToGitHub(`books/${doc.story_slug}/chapter-${nn(doc.position)}.ko.md`, `${doc.body_ko}\n`, `Chapter ${doc.position} (${doc.story_slug}, Korean)`);
      await commitToGitHub(`books/${doc.story_slug}/chapter-${nn(doc.position)}.en.md`, `${md}\n`, `Chapter ${doc.position} (${doc.story_slug}, English)`);
    } catch (e) { console.error("[interview-finish] chapter GitHub commit failed", e); }
  } catch (e) {
    await db.from("book_docs").update({ generating: false, gen_error: `English translation failed: ${String((e as Error).message ?? e).slice(0, 200)}` }).eq("id", chapterId);
  }
}

function startBackground(action: string, extra: Record<string, unknown>) {
  const p = fetch(`${SUPABASE_URL}/functions/v1/interview-finish`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...extra }),
  }).catch((e) => console.error(`[interview-finish] ${action} trigger failed`, e));
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(p);
}

// ── Notes from Studio (typed or dictated), for any book ───────────────────

function memoirRewriteSystem(subject: Subject, n: number, targetWords: number): string {
  return `${memoirChapterSystem(subject, n, targetWords)}

You are REVISING the existing chapter given below, not starting over: apply every note from the author (written in English, about the English translation; apply them to the Korean original), keep what the notes don't touch, and keep the chapter's strengths and continuity with the rest of the novel.`;
}

/** Fold the author's notes into the bible (and plan), and rewrite chapterId if given. */
async function reviseFromNotes(db: SupabaseClient, slug: string, chapterId: string | null, notesText: string): Promise<void> {
  const subject = await bookSubject(db, slug);
  if (!subject) throw new Error("No interview for this book");
  const memoir = subject.mode === "memoir";
  const chapters = await bookChapters(db, slug);
  const target = chapterId ? chapters.find((c) => c.id === chapterId) : undefined;
  const bibleLang = memoir ? "en" : subject.language;
  const bible = await loadBible(db, slug, bibleLang);
  const plan = await currentPlan(db, slug);
  const notesBlock = `The author's notes${target ? ` on ${docTitle(target, "en")}` : " on the story"}:\n\n${notesText}`;

  // 1. Bible + plan, with the notes folded in.
  const bibleJob = (async () => {
    if (memoir) {
      const material = await memoirMaterial(db, subject, 40_000);
      const input = [
        `Current bible:\n${bible || "(none yet)"}`,
        `Chapters written so far (English):\n${chaptersForPrompt(chapters, "en", 60_000) || "(none yet)"}`,
        material,
        `${notesBlock}\n\nFold these notes into the bible and plan; where they change something, the notes win.`,
      ].join("\n\n=====\n\n");
      const out = await callClaude(MEMOIR_PLAN_SYSTEM, [{ role: "user", content: input }], 16000);
      assertComplete(out);
      const p = parseSections(out.text, ["bible", "outline", "open_questions"]);
      await saveBible(db, subject, composeBible(p.bible ?? "", p.outline ?? "", p.open_questions ?? "", bible), "Before notes from Studio", null, "en");
    } else {
      const { md } = await reviseBibleAndPlan(
        bible,
        target ? `Chapter discussed: ${docTitle(target, subject.language)}\n\n${docBody(target, subject.language)}` : "No specific chapter: general notes on the story.",
        `Notes (typed in Studio rather than spoken):\n\n${notesText}`,
      );
      await saveBible(db, subject, md, "Before notes from Studio");
    }
  })();

  // 2. The chapter rewrite.
  const chapterJob = (async () => {
    if (!target) return;
    const brief = chapterBrief(plan, target.position);
    if (memoir) {
      const input = [
        `Story bible (English):\n${bible || "(none yet)"}`,
        await memoirMaterial(db, subject),
        `This chapter's brief from the book plan:\n${brief.text}`,
        `The current chapter (Korean):\n\n${docBody(target, "ko")}`,
        notesBlock,
      ].join("\n\n=====\n\n");
      const out = await callClaude(memoirRewriteSystem(subject, target.position, brief.targetWords), [{ role: "user", content: input }],
        Math.min(32000, Math.round(brief.targetWords * 6 * 1.1) + 3000));
      let md = out.text.trim();
      if (!md.startsWith("# ")) md = `# 제${target.position}장\n\n${md}`;
      await snapshot(db, target.id, "Before notes from Studio");
      await db.from("book_docs").update({
        title_ko: md.split("\n")[0].replace(/^#\s*/, ""), body_ko: md, body_en: "", updated_at: new Date().toISOString(),
      }).eq("id", target.id);
    } else {
      const input = [
        `Story bible:\n${bible || "(none yet)"}`,
        `This chapter's brief from the book plan (follow it unless the notes say otherwise):\n${brief.text}`,
        `Current chapter:\n\n${docBody(target, subject.language)}`,
        `Notes from the author (typed in Studio):\n\n${notesText}`,
      ].join("\n\n=====\n\n");
      const out = await callClaude(rewriteSystem(subject), [{ role: "user", content: input }], tokensFor(brief.targetWords));
      await saveChapter(db, subject, target.id, target.position, chapterHeading(out.text, target.position), "Before notes from Studio");
    }
  })();

  await Promise.all([bibleJob, chapterJob]);
  if (target && memoir) {
    startBackground("translate_chapter", { chapter_id: target.id }); // English follows; stays "generating" until then
  } else if (target) {
    await db.from("book_docs").update({ generating: false, gen_error: null }).eq("id", target.id);
  }
  await queuePlan(db, slug); // refresh the JSON plan from the updated outline (clears the bible's "generating")
}

// "Build the chapter plan": restructure the existing bible (and what's written) into the full
// plan without a new interview. interview-admin sets generating = true on the bible row first.
async function replan(db: SupabaseClient, slug: string): Promise<Response> {
  const bibleId = `${slug}/bible`;
  const subject = await bookSubject(db, slug);
  if (!subject) return jsonError(404, "No interview for this book");
  try {
    if (subject.mode === "memoir") {
      await replanMemoir(db, subject, slug);
      await queuePlan(db, slug); // the JSON plan is its own short background step
      return json({ ok: true });
    }
    const lang = subject.language;
    const [bible, chapters] = await Promise.all([loadBible(db, slug, lang), bookChapters(db, slug)]);
    const input = [
      `Current story bible:\n${bible || "(none yet)"}`,
      `The book so far:\n${chaptersForPrompt(chapters, lang, 120_000) || "(no chapters yet)"}`,
      "There is no new interview this time. Rebuild the structure and complete chapter plan from the material above, keeping everything the author has decided.",
    ].join("\n\n=====\n\n");
    const notes = await callClaude(OUTLINE_SYSTEM, [{ role: "user", content: input }], 16000);
    assertComplete(notes, "The chapter plan rebuild", "outline");
    const parsed = parseSections(notes.text, ["outline", "open_questions"]);
    await saveBible(db, subject, composeBible("", parsed.outline ?? "", parsed.open_questions ?? "", bible), "Before rebuilding the plan");
    await queuePlan(db, slug);
    return json({ ok: true });
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 300);
    await db.from("book_docs").update({ generating: false, gen_error: msg }).eq("id", bibleId);
    return jsonError(500, msg);
  }
}

// "Create next chapter" (or "Try again"): write chapter chapterId from the bible and the chapters
// before it. interview-admin creates the placeholder row (generating = true) and calls this.
async function writeChapter(db: SupabaseClient, chapterId: string, guidance = ""): Promise<Response> {
  const { data: docRow } = await db.from("book_docs").select("id, story_slug, position").eq("id", chapterId).maybeSingle();
  const doc = docRow as { id: string; story_slug: string; position: number } | null;
  if (!doc) return jsonError(404, "Chapter not found");
  const subject = await bookSubject(db, doc.story_slug);
  if (!subject) {
    await db.from("book_docs").update({ generating: false, gen_error: "No interview for this book" }).eq("id", chapterId);
    return jsonError(404, "No interview for this book");
  }
  const lang = subject.language;
  if (subject.mode === "memoir") {
    try {
      await writeMemoirChapter(db, subject, doc, guidance);
      startBackground("translate_chapter", { chapter_id: chapterId }); // stays "generating" until English is in
      return json({ ok: true, chapter: chapterId, translating: true });
    } catch (e) {
      const msg = String((e as Error).message ?? e).slice(0, 300);
      await db.from("book_docs").update({ generating: false, gen_error: msg }).eq("id", chapterId);
      return jsonError(500, msg);
    }
  }
  try {
    const chapters = await bookChapters(db, doc.story_slug);
    const before = chapters.filter((c) => c.position < doc.position);
    const bible = await loadBible(db, doc.story_slug, lang);
    const brief = chapterBrief(await currentPlan(db, doc.story_slug), doc.position);
    const input = [
      `Story bible (including the structure, chapter plan and the author's standing notes):\n${bible || "(none yet)"}`,
      before.length ? `The book so far:\n\n${chaptersForPrompt(before, lang, 160_000)}` : "No chapters yet: this is the opening chapter.",
      `YOUR BRIEF FOR THIS CHAPTER:\n${brief.text}`,
      guidance ? `THE AUTHOR'S GUIDANCE FOR THIS CHAPTER (it overrides the brief where they differ):\n${guidance}` : "",
    ].filter(Boolean).join("\n\n=====\n\n");
    const chapter = await callClaude(chapterSystem(subject, doc.position, brief.targetWords), [{ role: "user", content: input }], tokensFor(brief.targetWords));
    const md = chapterHeading(chapter.text, doc.position);
    await saveChapter(db, subject, chapterId, doc.position, md, "Before rewrite");
    await db.from("book_docs").update({ generating: false, gen_error: null }).eq("id", chapterId);
    try {
      await commitToGitHub(`interviews/${doc.story_slug}/chapters/chapter-${nn(doc.position)}.md`, `${md}\n`, `Chapter ${doc.position} (${doc.story_slug})`);
    } catch (e) {
      console.error("[interview-finish] chapter GitHub commit failed", e);
    }
    return json({ ok: true, chapter: chapterId });
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 300);
    await db.from("book_docs").update({ generating: false, gen_error: msg }).eq("id", chapterId);
    return jsonError(500, msg);
  }
}

// Notes session: fold the author's notes into the bible and rewrite the chapter (old one kept).
async function finishRevision(
  db: SupabaseClient, subject: Subject, session: Session, turns: Turn[], skipGithub: boolean,
): Promise<Response> {
  const lang = subject.language;
  const transcript = transcriptOf(subject, turns, "Editor");
  const chapters = await bookChapters(db, subject.story_slug);
  const target = session.target_doc ? chapters.find((c) => c.id === session.target_doc) : undefined;
  const bible = await loadBible(db, subject.story_slug, lang);
  const chapterText = target ? docBody(target, lang) : "";

  const brief = target ? chapterBrief(await currentPlan(db, subject.story_slug), target.position) : null;
  const rewriteInput = [
    `Story bible:\n${bible || "(none yet)"}`,
    brief ? `This chapter's brief from the book plan (follow it unless the author's notes say otherwise):\n${brief.text}` : "",
    `Current chapter:\n\n${chapterText}`,
    `Notes session transcript:\n\n${transcript}`,
  ].join("\n\n=====\n\n");

  const [revised, rewrite] = await Promise.all([
    // A cut-off reply would be missing its later sections: keep the current bible instead.
    reviseBibleAndPlan(
      bible,
      target ? `Chapter discussed: ${docTitle(target, lang)}\n\n${chapterText}` : "No specific chapter: general notes on the story.",
      `Notes session transcript:\n\n${transcript}`,
    ).catch((e) => { console.error("[interview-finish] bible update skipped:", (e as Error).message); return { md: bible, revisionNotes: "" }; }),
    target ? callClaude(rewriteSystem(subject), [{ role: "user", content: rewriteInput }], tokensFor(brief?.targetWords ?? 3500)) : Promise.resolve(null),
  ]);
  const parsed: Record<string, string> = { revision_notes: revised.revisionNotes };
  const bibleMd = revised.md;

  await saveBible(db, subject, bibleMd, `Before notes session ${session.session_no}`);
  await queuePlan(db, subject.story_slug);
  let chapterMd = "";
  if (target && rewrite?.text.trim()) {
    chapterMd = chapterHeading(rewrite.text, target.position);
    await saveChapter(db, subject, target.id, target.position, chapterMd, `Before notes session ${session.session_no}`);
  }

  const input_tokens = session.input_tokens + notes.input_tokens + (rewrite?.input_tokens ?? 0);
  const output_tokens = session.output_tokens + notes.output_tokens + (rewrite?.output_tokens ?? 0);
  const update: Record<string, unknown> = {
    status: "finished",
    ended_at: session.ended_at ?? new Date().toISOString(),
    transcript_ko: transcript,
    transcript_en: transcript,
    summary_en: parsed.revision_notes ?? "",
    scene_notes: outlineOf(bibleMd),
    followups: openQuestionsOf(bibleMd),
    input_tokens,
    output_tokens,
    est_cost_usd: estimateCost(input_tokens, output_tokens),
    github_error: null,
  };

  if (!skipGithub) {
    const path = `interviews/${subject.story_slug}/${personFolder(subject)}/session-${nn(session.session_no)}-notes.md`;
    const md = `# Notes session ${nn(session.session_no)}${target ? `: ${docTitle(target, lang)}` : ""}\n\n${parsed.revision_notes ?? ""}\n\n---\n\n${bibleMd}${chapterMd ? `\n\n---\n\n${chapterMd}` : ""}\n\n---\n\n## Transcript\n\n${transcript}\n`;
    try {
      await commitToGitHub(path, md, `Notes session ${nn(session.session_no)} (${subject.story_slug})`);
      update.github_path = path;
    } catch (e) {
      update.github_error = String((e as Error).message ?? e);
    }
  }

  await db.from("interview_sessions").update(update).eq("id", session.id);
  return json({ ok: true, github_path: update.github_path ?? null, github_error: update.github_error ?? null, book: true, chapter: target?.id ?? null });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonError(405, "Method not allowed");

  try {
    const db = admin();
    const { session_id, skip_github, action, chapter_id, story_slug, notes: notesParam } = await req.json().catch(() => ({}));

    // Background jobs started by interview-admin (service role only).
    if (action === "write_chapter" || action === "replan" || action === "translate_chapter" || action === "revise_notes" || action === "make_plan") {
      const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
      if (bearer !== SERVICE_ROLE_KEY) return jsonError(403, "Forbidden");
      if (action === "revise_notes") {
        const slug = String(story_slug ?? "");
        const cid = chapter_id ? String(chapter_id) : null;
        try {
          await reviseFromNotes(db, slug, cid, String(notesParam ?? ""));
          return json({ ok: true });
        } catch (e) {
          const msg = String((e as Error).message ?? e).slice(0, 300);
          await db.from("book_docs").update({ generating: false, gen_error: msg }).in("id", [cid ?? "", `${slug}/bible`]);
          return jsonError(500, msg);
        }
      }
      if (action === "make_plan") {
        const job = makePlan(db, String(story_slug ?? ""));
        if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(job); else await job;
        return json({ accepted: true });
      }
      if (action === "translate_chapter") {
        // Answer right away and translate in the background, so the caller isn't held open.
        const job = translateChapter(db, String(chapter_id ?? ""));
        if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(job); else await job;
        return json({ accepted: true });
      }
      return action === "replan"
        ? await replan(db, String(story_slug ?? ""))
        : await writeChapter(db, String(chapter_id ?? ""), String(notesParam ?? ""));
    }
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

    if (subject.mode === "ghostwriter") {
      return session.kind === "revise"
        ? await finishRevision(db, subject, session, turns, !!skip_github)
        : await finishGhostwriter(db, subject, session, turns, !!skip_github);
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
      }], 8000),
    ]);

    const parsed = parseSections(notes.text);

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
      summary_ko: parsed.summary_ko ?? "",
      input_tokens,
      output_tokens,
      est_cost_usd: estimateCost(input_tokens, output_tokens),
      github_error: null,
    };

    if (!skip_github) {
      const nn = String(session.session_no).padStart(2, "0");
      // One folder per person, so a test person never overwrites the real interviews.
      const person = (subject.display_name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || subject.id.slice(0, 8);
      const path = `interviews/${subject.story_slug}/${person}/session-${nn}.md`;
      const date = new Date(session.started_at).toISOString().slice(0, 10);
      const minutes = Math.round((new Date(String(update.ended_at)).getTime() - new Date(session.started_at).getTime()) / 60000);
      const md = `# Interview session ${nn}: ${ERAS[session.era]?.label ?? session.era}

- **Subject:** ${name}
- **Date:** ${date} (${minutes} min, ${turns.filter((t) => t.speaker === "subject").length} answers)
- **Story:** ${subject.story_slug}

## Summary
${update.summary_en}

## 요약 (for her to read)
${update.summary_ko}

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

    // Memoir books with a story bible: fold this session into the bible and chapter plan right away,
    // so "Create next chapter" works from what she just told us.
    const bibleId = `${subject.story_slug}/bible`;
    const { data: bibleRow } = await db.from("book_docs").select("id, generating").eq("id", bibleId).maybeSingle();
    if (bibleRow && !(bibleRow as { generating?: boolean }).generating) {
      await db.from("book_docs").update({ generating: true, gen_started_at: new Date().toISOString(), gen_error: null }).eq("id", bibleId);
      startBackground("replan", { story_slug: subject.story_slug });
    }
    return json({ ok: true, github_path: update.github_path ?? null, github_error: update.github_error ?? null, bible_updating: !!bibleRow });
  } catch (err) {
    console.error("[interview-finish] error", err);
    return jsonError(500, String((err as Error).message ?? err));
  }
});
