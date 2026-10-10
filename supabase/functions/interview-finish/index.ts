// Interview Mode: turn a finished session into book material.
// POST { session_id }  — callable by the service role (from interview-turn), staff, or the subject.
// Produces an English translation, summary, scene notes and follow-ups, saves them,
// and commits a markdown file to GitHub at interviews/<story_slug>/session-NN.md.

import {
  admin, bookChapters, callClaude, chaptersForPrompt, corsHeaders, currentBible, docBody, docTitle, ERAS, estimateCost, getCaller, GITHUB_REPO, GITHUB_TOKEN,
  isStaffUser, json, jsonError, SERVICE_ROLE_KEY, type Session, type Subject, type Turn,
} from "../_shared/interview.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";

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
## Chapter plan: every chapter of the finished book, as "### Chapter N: <working title> (Act X, ~W words)" followed by - bullets for its beats and its job in the story. The chapter targets must add up to the book's target length, with lengths that suit each chapter's weight. Chapters already written keep their number and title and are marked "(written)"; plan the rest so the whole book still lands its acts and plot points.
</outline>
<plan_json>
The same structure as strict JSON (no comments, no trailing commas), exactly this shape:
{"format":"novella","target_words":30000,"acts":[{"act":1,"summary":"..."}],"plot_points":[{"name":"Inciting incident","chapter":1,"summary":"..."}],"chapters":[{"n":1,"title":"...","act":1,"target_words":2500,"purpose":"...","beats":["...","..."]}]}
</plan_json>`;

const GW_NOTES_SYSTEM = `You are a story developer. You receive the current story bible (if any), notes from earlier sessions (including sessions where the author gave notes on the draft), and the transcript of a voice interview in which the author described the story they want written (speech-to-text; small errors are normal). Produce the complete, updated version of each section, keeping everything still true and folding in what's new. Build on everything known so far; where something was left open, make a clear, tasteful suggestion and mark it "(suggested)". Never contradict what the author said.

Answer with exactly these four sections, each wrapped in its tag. Markdown sections use ## subheadings, paragraphs and - bullets only; no tables.

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

Answer with exactly these five sections, each wrapped in its tag. Markdown sections use ## subheadings, paragraphs and - bullets only; no tables.

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

function composeBible(bible: string, outline: string, open: string): string {
  return `# Story Bible\n\n${bible}\n\n# Structure and chapter plan\n\n${outline}\n\n## Still to decide\n\n${open}`;
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
  const text = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    const p = JSON.parse(text) as BookPlan;
    return Array.isArray(p?.chapters) ? p : null;
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    try { const p = m ? JSON.parse(m[0]) as BookPlan : null; return p && Array.isArray(p.chapters) ? p : null; } catch { return null; }
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

async function saveBible(db: SupabaseClient, subject: Subject, md: string, note: string, plan?: BookPlan | null): Promise<void> {
  const id = `${subject.story_slug}/bible`;
  await snapshot(db, id, note);
  const lang = subject.language === "ko" ? "ko" : "en";
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
  const bible = await currentBible(db, subject.story_slug, lang);
  const book = chaptersForPrompt(chapters, lang, 120_000);

  const input = [
    `Current story bible:\n${bible || "(none yet)"}`,
    `The book so far:\n${book || "(no chapters yet)"}`,
    `Earlier sessions:\n${earlier}`,
    `This session (#${session.session_no}) transcript:\n\n${transcript}`,
  ].join("\n\n=====\n\n");

  const notes = await callClaude(GW_NOTES_SYSTEM, [{ role: "user", content: input }], 16000);
  const parsed = parseSections(notes.text, ["bible", "outline", "plan_json", "open_questions"]);
  const bibleMd = composeBible(parsed.bible ?? "", parsed.outline ?? "", parsed.open_questions ?? "");
  await saveBible(db, subject, bibleMd, `Before session ${session.session_no}`, parsePlan(parsed.plan_json));

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

// "Build the chapter plan": restructure the existing bible (and what's written) into the full
// plan without a new interview. interview-admin sets generating = true on the bible row first.
async function replan(db: SupabaseClient, slug: string): Promise<Response> {
  const bibleId = `${slug}/bible`;
  const { data: subjRow } = await db.from("interview_subjects").select("*")
    .eq("story_slug", slug).eq("mode", "ghostwriter").order("created_at").limit(1).maybeSingle();
  const subject = subjRow as Subject | null;
  if (!subject) return jsonError(404, "No ghostwriter interview for this book");
  try {
    const lang = subject.language;
    const [bible, chapters] = await Promise.all([currentBible(db, slug, lang), bookChapters(db, slug)]);
    const input = [
      `Current story bible:\n${bible || "(none yet)"}`,
      `The book so far:\n${chaptersForPrompt(chapters, lang, 120_000) || "(no chapters yet)"}`,
      "There is no new interview this time. Rebuild the complete bible, structure and chapter plan from the material above, keeping everything the author has decided.",
    ].join("\n\n=====\n\n");
    const notes = await callClaude(GW_NOTES_SYSTEM, [{ role: "user", content: input }], 16000);
    const parsed = parseSections(notes.text, ["bible", "outline", "plan_json", "open_questions"]);
    const plan = parsePlan(parsed.plan_json);
    await saveBible(db, subject, composeBible(parsed.bible ?? bible, parsed.outline ?? "", parsed.open_questions ?? ""), "Before rebuilding the plan", plan);
    await db.from("book_docs").update({ generating: false, gen_error: plan ? null : "The plan came back unreadable; the bible text was still updated." }).eq("id", bibleId);
    return json({ ok: true, plan: !!plan });
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 300);
    await db.from("book_docs").update({ generating: false, gen_error: msg }).eq("id", bibleId);
    return jsonError(500, msg);
  }
}

// "Create next chapter" (or "Try again"): write chapter chapterId from the bible and the chapters
// before it. interview-admin creates the placeholder row (generating = true) and calls this.
async function writeChapter(db: SupabaseClient, chapterId: string): Promise<Response> {
  const { data: docRow } = await db.from("book_docs").select("id, story_slug, position").eq("id", chapterId).maybeSingle();
  const doc = docRow as { id: string; story_slug: string; position: number } | null;
  if (!doc) return jsonError(404, "Chapter not found");
  const { data: subjRow } = await db.from("interview_subjects").select("*")
    .eq("story_slug", doc.story_slug).eq("mode", "ghostwriter").order("created_at").limit(1).maybeSingle();
  const subject = subjRow as Subject | null;
  if (!subject) {
    await db.from("book_docs").update({ generating: false, gen_error: "No ghostwriter interview for this book" }).eq("id", chapterId);
    return jsonError(404, "No ghostwriter interview for this book");
  }
  const lang = subject.language;
  try {
    const chapters = await bookChapters(db, doc.story_slug);
    const before = chapters.filter((c) => c.position < doc.position);
    const bible = await currentBible(db, doc.story_slug, lang);
    const brief = chapterBrief(await currentPlan(db, doc.story_slug), doc.position);
    const input = [
      `Story bible (including the structure, chapter plan and the author's standing notes):\n${bible || "(none yet)"}`,
      before.length ? `The book so far:\n\n${chaptersForPrompt(before, lang, 160_000)}` : "No chapters yet: this is the opening chapter.",
      `YOUR BRIEF FOR THIS CHAPTER:\n${brief.text}`,
    ].join("\n\n=====\n\n");
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
  const bible = await currentBible(db, subject.story_slug, lang);
  const chapterText = target ? docBody(target, lang) : "";

  const notesInput = [
    `Current story bible:\n${bible || "(none yet)"}`,
    target ? `Chapter discussed: ${docTitle(target, lang)}\n\n${chapterText}` : "No specific chapter: general notes on the story.",
    `Notes session transcript:\n\n${transcript}`,
  ].join("\n\n=====\n\n");
  const brief = target ? chapterBrief(await currentPlan(db, subject.story_slug), target.position) : null;
  const rewriteInput = [
    `Story bible:\n${bible || "(none yet)"}`,
    brief ? `This chapter's brief from the book plan (follow it unless the author's notes say otherwise):\n${brief.text}` : "",
    `Current chapter:\n\n${chapterText}`,
    `Notes session transcript:\n\n${transcript}`,
  ].join("\n\n=====\n\n");

  const [notes, rewrite] = await Promise.all([
    callClaude(REVISE_NOTES_SYSTEM, [{ role: "user", content: notesInput }], 16000),
    target ? callClaude(rewriteSystem(subject), [{ role: "user", content: rewriteInput }], tokensFor(brief?.targetWords ?? 3500)) : Promise.resolve(null),
  ]);
  const parsed = parseSections(notes.text, ["revision_notes", "bible", "outline", "plan_json", "open_questions"]);
  const bibleMd = composeBible(parsed.bible ?? bible, parsed.outline ?? "", parsed.open_questions ?? "");

  await saveBible(db, subject, bibleMd, `Before notes session ${session.session_no}`, parsePlan(parsed.plan_json));
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
    scene_notes: parsed.outline ?? "",
    followups: parsed.open_questions ?? "",
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
    const { session_id, skip_github, action, chapter_id, story_slug } = await req.json().catch(() => ({}));

    // Background jobs started by interview-admin (service role only).
    if (action === "write_chapter" || action === "replan") {
      const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
      if (bearer !== SERVICE_ROLE_KEY) return jsonError(403, "Forbidden");
      return action === "replan"
        ? await replan(db, String(story_slug ?? ""))
        : await writeChapter(db, String(chapter_id ?? ""));
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
    return json({ ok: true, github_path: update.github_path ?? null, github_error: update.github_error ?? null });
  } catch (err) {
    console.error("[interview-finish] error", err);
    return jsonError(500, String((err as Error).message ?? err));
  }
});
