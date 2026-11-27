// Craft tools for the works repository (staff only). Each action starts a background job,
// stored in craft_runs, and returns its id at once; the page polls craft_runs for the result.
//
//   { action: "score",   version_id, model? }   red/yellow/green scorecard for a version
//   { action: "hub",     version_id, model? }   draft Story Hub (logline, acts, beats, characters)
//   { action: "summary", round_id,   model? }   what all the reviewers of a round agree on
//
// model: "sonnet" (default, ANTHROPIC_MODEL or claude-sonnet-5-5) or "opus" (claude-opus-5-5).

import { admin, corsHeaders, getCaller, isStaffUser, json, jsonError } from "../_shared/interview.ts";
import { claudeTool, rubricFor, screenplayPages, STC_BEATS, versionText, wordCount, type SectionRow } from "../_shared/craft.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const SONNET = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5";
const OPUS = Deno.env.get("ANTHROPIC_OPUS_MODEL") ?? "claude-opus-5-5";

interface Version { id: string; work_slug: string; format: string; label: string; lang: string; notes: string }
interface Work { slug: string; title: string; logline: string; hub: Record<string, unknown> }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonError(405, "Method not allowed");
  try {
    const user = await getCaller(req);
    if (!user) return jsonError(401, "Authentication required");
    const db = admin();
    if (!(await isStaffUser(db, user.id))) return jsonError(403, "Staff only");

    const body = await req.json().catch(() => ({})) as Record<string, string>;
    const model = body.model === "opus" ? OPUS : SONNET;

    let job: () => Promise<{ result: unknown; usage?: unknown }>;
    let row: Record<string, unknown>;

    if (body.action === "score" || body.action === "hub") {
      const { version, work, sections } = await loadVersion(db, body.version_id);
      row = { kind: body.action, work_slug: work.slug, version_id: version.id, model, created_by: user.id };
      job = body.action === "score" ? () => score(model, work, version, sections) : () => draftHub(model, work, version, sections);
    } else if (body.action === "summary") {
      const ctx = await loadRound(db, body.round_id);
      row = { kind: "summary", work_slug: ctx.work.slug, version_id: ctx.version.id, round_id: ctx.round.id, model, created_by: user.id };
      job = () => summarize(model, ctx);
    } else {
      return jsonError(400, "Unknown action");
    }

    const { data: run, error } = await db.from("craft_runs").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    const id = (run as { id: string }).id;

    const work = (async () => {
      try {
        const { result, usage } = await job();
        await db.from("craft_runs").update({ status: "done", result, usage, finished_at: new Date().toISOString() }).eq("id", id);
      } catch (e) {
        console.error("[craft]", e);
        await db.from("craft_runs").update({ status: "failed", error: String((e as Error).message ?? e).slice(0, 1000), finished_at: new Date().toISOString() }).eq("id", id);
      }
    })();
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work); else await work;

    return json({ run_id: id });
  } catch (e) {
    return jsonError(500, (e as Error).message);
  }
});

// ── Loading ────────────────────────────────────────────────────────────

async function loadVersion(db: SupabaseClient, versionId: string) {
  if (!versionId) throw new Error("version_id required");
  const { data: v } = await db.from("work_versions").select("*").eq("id", versionId).maybeSingle();
  if (!v) throw new Error("Version not found");
  const version = v as Version;
  const { data: w } = await db.from("works").select("slug, title, logline, hub").eq("slug", version.work_slug).single();
  const { data: s } = await db.from("work_sections").select("id, position, title, body").eq("version_id", versionId).order("position");
  const sections = (s as SectionRow[]) ?? [];
  if (!sections.length) throw new Error("This version has no text");
  return { version, work: w as Work, sections };
}

function describe(work: Work, version: Version, sections: SectionRow[]): string {
  const words = sections.reduce((n, s) => n + wordCount(s.body), 0);
  const size = version.format === "screenplay" ? `about ${screenplayPages(sections)} pages (estimated)` : `${words.toLocaleString("en-US")} words`;
  const hub = work.hub ?? {};
  return [
    `WORK: ${work.title}`,
    work.logline ? `LOGLINE: ${work.logline}` : "",
    hub.genre ? `GENRE: ${hub.genre}` : "",
    hub.theme ? `THEME: ${hub.theme}` : "",
    hub.premise ? `PREMISE: ${hub.premise}` : "",
    `FORMAT: ${version.format}. VERSION: ${version.label}. LENGTH: ${size}, ${sections.length} ${version.format === "screenplay" ? "sections" : "chapters"}.`,
    version.notes ? `AUTHOR'S NOTE ON THIS VERSION: ${version.notes}` : "",
  ].filter(Boolean).join("\n");
}

const EDITOR = `You are a senior developmental editor and script consultant. You judge work against the established craft books, honestly and specifically, the way a paid professional reader would. You never flatter. Green means a professional reader would not flag it. Yellow means it works but a reader would flag it. Red means it is a real problem that would hurt the book or script with agents, competitions or readers.
Always cite evidence: name the chapter/section and quote a few words (under 15 words) from the text. Fixes must be concrete and doable ("cut the second half of Leo's speech in Ch 4"), not generic advice. Paraphrase the craft books; never quote them.`;

// ── Scorecard ──────────────────────────────────────────────────────────

async function score(model: string, work: Work, version: Version, sections: SectionRow[]) {
  const rubric = rubricFor(version.format);
  const header = describe(work, version, sections);
  const text = versionText(sections, version.format);
  const unit = version.format === "screenplay" ? "section" : "chapter";

  const criteriaCall = claudeTool<{
    overall: { rating: string; headline: string; strengths: string[]; priorities: string[] };
    items: Array<{ id: string; rating: string; summary: string; evidence: Array<{ where: string; quote: string }>; fix: string }>;
  }>({
    model, maxTokens: 9000, system: EDITOR,
    toolName: "scorecard", toolDescription: "Record the red/yellow/green rating for every criterion.",
    user: `${header}

Rate this ${version.format} on each criterion below. Rate every criterion, in this order:
${rubric.map((c) => `- ${c.id} | ${c.label} (${c.source}): ${c.test}`).join("\n")}

Then give an overall rating, a one-sentence headline verdict, the top 3 strengths and the top 3 priorities to fix, most important first.

THE TEXT:
${text}`,
    schema: {
      type: "object", required: ["overall", "items"],
      properties: {
        overall: {
          type: "object", required: ["rating", "headline", "strengths", "priorities"],
          properties: {
            rating: { type: "string", enum: ["green", "yellow", "red"] },
            headline: { type: "string" },
            strengths: { type: "array", items: { type: "string" } },
            priorities: { type: "array", items: { type: "string" } },
          },
        },
        items: {
          type: "array",
          items: {
            type: "object", required: ["id", "rating", "summary", "evidence", "fix"],
            properties: {
              id: { type: "string", enum: rubric.map((c) => c.id) },
              rating: { type: "string", enum: ["green", "yellow", "red"] },
              summary: { type: "string", description: "Two or three sentences: what works and what doesn't." },
              evidence: { type: "array", items: { type: "object", required: ["where", "quote"], properties: { where: { type: "string" }, quote: { type: "string" } } } },
              fix: { type: "string", description: "The most useful concrete change. Empty if green." },
            },
          },
        },
      },
    },
  });

  const sectionCall = claudeTool<{
    sections: Array<{ position: number; rating: string; tension: number; turn: string; note: string }>;
    beats: Array<{ key: string; where: string; pct: number; status: string; note: string }>;
  }>({
    model, maxTokens: 7000, system: EDITOR,
    toolName: "section_map", toolDescription: "Rate every chapter/section and locate the structural beats.",
    user: `${header}

1. For EVERY ${unit} (by its number), give: a red/yellow/green rating of how well it works as a unit; tension 1-5 (how much a reader needs to turn the page); the value turn in a few words ("hope → dread"; "none" if it doesn't turn); and one sentence of note (the main problem if yellow/red).
2. Locate each Save the Cat beat in this ${version.format}: where it happens (${unit} number${version.format === "screenplay" ? " and estimated page" : ""}), its position as a percent of the whole, and status: "on time", "early", "late", "weak" or "missing". Expected positions: ${STC_BEATS.map((b) => `${b.key} ~${b.pct}%`).join(", ")}.

THE TEXT:
${text}`,
    schema: {
      type: "object", required: ["sections", "beats"],
      properties: {
        sections: {
          type: "array",
          items: {
            type: "object", required: ["position", "rating", "tension", "turn", "note"],
            properties: {
              position: { type: "integer" },
              rating: { type: "string", enum: ["green", "yellow", "red"] },
              tension: { type: "integer", minimum: 1, maximum: 5 },
              turn: { type: "string" },
              note: { type: "string" },
            },
          },
        },
        beats: {
          type: "array",
          items: {
            type: "object", required: ["key", "where", "pct", "status", "note"],
            properties: {
              key: { type: "string", enum: STC_BEATS.map((b) => b.key) },
              where: { type: "string" },
              pct: { type: "number" },
              status: { type: "string", enum: ["on time", "early", "late", "weak", "missing"] },
              note: { type: "string" },
            },
          },
        },
      },
    },
  });

  const [a, b] = await Promise.all([criteriaCall, sectionCall]);
  const byId = new Map(rubric.map((c) => [c.id, c]));
  return {
    result: {
      format: version.format,
      overall: a.input.overall,
      items: a.input.items.map((it) => ({ ...it, label: byId.get(it.id)?.label ?? it.id, source: byId.get(it.id)?.source ?? "", group: byId.get(it.id)?.group ?? "" })),
      sections: b.input.sections,
      beats: b.input.beats,
    },
    usage: { criteria: a.usage, sections: b.usage, model: a.model },
  };
}

// ── Story Hub draft ────────────────────────────────────────────────────

async function draftHub(model: string, work: Work, version: Version, sections: SectionRow[]) {
  const unit = version.format === "screenplay" ? "section (with estimated page)" : "chapter";
  const r = await claudeTool<Record<string, unknown>>({
    model, maxTokens: 8000,
    system: "You are a story analyst building a story bible for the author. Describe what is actually on the page, not what you would change. Be concrete and brief.",
    toolName: "story_hub", toolDescription: "Record the story's structure.",
    user: `${describe(work, version, sections)}

Build the story hub for this ${version.format}: a one-sentence logline; the premise; the theme; the genre; a summary of each of the three acts with the ${unit} range it covers; each of the 15 Save the Cat beats (${STC_BEATS.map((b) => b.label).join(", ")}) with what happens, where (${unit}), and whether it is "set", "weak" or "missing"; and the main characters with their want, need and arc.

THE TEXT:
${versionText(sections, version.format)}`,
    schema: {
      type: "object", required: ["logline", "premise", "theme", "genre", "acts", "beats", "characters"],
      properties: {
        logline: { type: "string" }, premise: { type: "string" }, theme: { type: "string" }, genre: { type: "string" },
        acts: { type: "array", items: { type: "object", required: ["act", "summary", "where"], properties: { act: { type: "integer" }, summary: { type: "string" }, where: { type: "string" } } } },
        beats: { type: "array", items: { type: "object", required: ["key", "summary", "where", "status"], properties: {
          key: { type: "string", enum: STC_BEATS.map((b) => b.key) }, summary: { type: "string" }, where: { type: "string" },
          status: { type: "string", enum: ["set", "weak", "missing"] },
        } } },
        characters: { type: "array", items: { type: "object", required: ["name", "role", "want", "need", "arc"], properties: {
          name: { type: "string" }, role: { type: "string" }, want: { type: "string" }, need: { type: "string" }, arc: { type: "string" },
        } } },
      },
    },
  });
  return { result: { ...r.input, format: version.format, version_label: version.label }, usage: { ...r.usage, model: r.model } };
}

// ── Review summary ─────────────────────────────────────────────────────

async function loadRound(db: SupabaseClient, roundId: string) {
  if (!roundId) throw new Error("round_id required");
  const { data: round } = await db.from("review_rounds").select("*").eq("id", roundId).maybeSingle();
  if (!round) throw new Error("Round not found");
  const { version, work, sections } = await loadVersion(db, (round as { version_id: string }).version_id);
  const [{ data: reviewers }, { data: notes }, { data: answers }] = await Promise.all([
    db.from("reviewers").select("id, name").eq("round_id", roundId),
    db.from("review_notes").select("*").eq("round_id", roundId).order("created_at"),
    db.from("review_answers").select("*").eq("round_id", roundId),
  ]);
  return {
    round: round as { id: string; title: string; questions: Array<{ id: string; text: string; section: number | null }> },
    version, work, sections,
    reviewers: (reviewers as Array<{ id: string; name: string }>) ?? [],
    notes: (notes as Array<Record<string, unknown>>) ?? [],
    answers: (answers as Array<{ reviewer_id: string; question_id: string; answer: string }>) ?? [],
  };
}

async function summarize(model: string, ctx: Awaited<ReturnType<typeof loadRound>>) {
  const name = new Map(ctx.reviewers.map((r) => [r.id, r.name]));
  const pos = new Map(ctx.sections.map((s) => [s.id, s]));
  const unit = ctx.version.format === "screenplay" ? "Section" : "Ch";
  const lines: string[] = [];
  for (const n of ctx.notes) {
    const s = pos.get(String(n.section_id));
    const who = name.get(String(n.reviewer_id)) ?? "Author";
    const where = `${unit} ${s?.position ?? "?"}`;
    if (n.kind === "pulse") lines.push(`[${where}] ${who} rated the chapter ${n.score}/5${n.body ? `: ${n.body}` : ""}`);
    else if (n.kind === "reaction") lines.push(`[${where}] ${who} reacted "${n.reaction}" at: "${String(n.quote).slice(0, 120)}"`);
    else if (n.kind === "suggest") lines.push(`[${where}] ${who} suggested replacing "${String(n.quote).slice(0, 200)}" with "${String(n.replacement ?? "").slice(0, 200)}"${n.body ? ` because: ${n.body}` : ""}`);
    else lines.push(`[${where}] ${who} commented on "${String(n.quote).slice(0, 160)}": ${n.body}`);
  }
  const q = new Map(ctx.round.questions.map((x) => [x.id, x.text]));
  for (const a of ctx.answers) lines.push(`[Question] "${q.get(a.question_id) ?? a.question_id}" ${name.get(a.reviewer_id) ?? "?"} answered: ${a.answer}`);
  if (!lines.length) throw new Error("No feedback in this round yet");

  const r = await claudeTool<Record<string, unknown>>({
    model, maxTokens: 5000,
    system: "You summarize reader feedback for an author. Separate what several readers agree on from one-off opinions. Be honest and specific; name chapters. Don't soften criticism, don't invent feedback.",
    toolName: "review_summary", toolDescription: "Record the summary of all reader feedback.",
    user: `${describe(ctx.work, ctx.version, ctx.sections)}
Review round: ${ctx.round.title}. Readers: ${ctx.reviewers.map((r) => r.name).join(", ")}.

ALL FEEDBACK:
${lines.join("\n")}`,
    schema: {
      type: "object", required: ["headline", "consensus", "split", "fixes", "praise"],
      properties: {
        headline: { type: "string", description: "One or two sentences: the overall reader verdict." },
        consensus: { type: "array", items: { type: "object", required: ["point", "readers", "where"], properties: { point: { type: "string" }, readers: { type: "integer" }, where: { type: "string" } } } },
        split: { type: "array", description: "Where readers disagreed.", items: { type: "string" } },
        fixes: { type: "array", description: "Suggested next changes, most important first.", items: { type: "string" } },
        praise: { type: "array", items: { type: "string" } },
      },
    },
  });
  return { result: r.input, usage: { ...r.usage, model: r.model } };
}
