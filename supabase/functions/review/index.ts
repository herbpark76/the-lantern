// Reviewer access to a review round, by private link (no account needed).
// Every call carries the reviewer's token; this function checks it and works with the
// service role, so reviewers never read or write the tables directly.
//
//   { action: "open", token }                          → round, version, sections, my notes, answers
//   { action: "add_note", token, note }                → note (comment | suggest | reaction | pulse)
//   { action: "update_note", token, id, body?, replacement? }
//   { action: "delete_note", token, id }
//   { action: "answer", token, question_id, answer }
//   { action: "progress", token, section, done? }      → remember where they are
//   { action: "finish", token }                        → marks the review as sent

import { admin, corsHeaders, json, jsonError } from "../_shared/interview.ts";

const KINDS = ["comment", "suggest", "reaction", "pulse"];
const REACTIONS = ["loved", "slow", "confused", "unconvinced", "funny", "moved"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonError(405, "Method not allowed");
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const token = String(body.token ?? "");
    if (!/^[a-f0-9]{32,80}$/.test(token)) return jsonError(400, "Invalid link");
    const db = admin();

    const { data: rv } = await db.from("reviewers").select("*").eq("token", token).maybeSingle();
    if (!rv) return jsonError(404, "This review link isn't valid. Ask the author for a new one.");
    const reviewer = rv as { id: string; round_id: string; name: string; progress: Record<string, unknown>; started_at: string | null; finished_at: string | null };
    const { data: rd } = await db.from("review_rounds").select("*").eq("id", reviewer.round_id).single();
    const round = rd as { id: string; version_id: string; status: string; show_others: boolean; title: string; instructions: string; due_at: string | null; questions: unknown[] };
    const now = new Date().toISOString();
    const closed = round.status !== "open";

    if (body.action === "open") {
      await db.from("reviewers").update({ last_seen_at: now, started_at: reviewer.started_at ?? now }).eq("id", reviewer.id);
      const [{ data: version }, { data: sections }, { data: notes }, { data: answers }] = await Promise.all([
        db.from("work_versions").select("id, work_slug, format, label, lang").eq("id", round.version_id).single(),
        db.from("work_sections").select("id, position, title, body").eq("version_id", round.version_id).order("position"),
        round.show_others
          ? db.from("review_notes").select("*, reviewers(name)").eq("round_id", round.id).neq("kind", "pulse").order("created_at")
          : db.from("review_notes").select("*").eq("round_id", round.id).eq("reviewer_id", reviewer.id).order("created_at"),
        db.from("review_answers").select("question_id, answer").eq("reviewer_id", reviewer.id),
      ]);
      const { data: work } = await db.from("works").select("slug, title, accent_color").eq("slug", (version as { work_slug: string }).work_slug).single();
      // Only my pulse ratings, even when others' notes are shown.
      let mine = (notes as Array<Record<string, unknown>>) ?? [];
      if (round.show_others) {
        const { data: pulses } = await db.from("review_notes").select("*").eq("round_id", round.id).eq("reviewer_id", reviewer.id).eq("kind", "pulse");
        mine = [...mine, ...((pulses as Array<Record<string, unknown>>) ?? [])];
      }
      return json({
        reviewer: { id: reviewer.id, name: reviewer.name, progress: reviewer.progress, finished_at: reviewer.finished_at },
        round: { id: round.id, title: round.title, instructions: round.instructions, due_at: round.due_at, status: round.status, show_others: round.show_others, questions: round.questions },
        work, version, sections: sections ?? [],
        notes: mine.map((n) => ({ ...n, author_name: (n.reviewers as { name?: string } | null)?.name ?? null, reviewers: undefined, mine: n.reviewer_id === reviewer.id })),
        answers: answers ?? [],
      });
    }

    if (closed) return jsonError(409, "This review round is closed.");

    if (body.action === "add_note") {
      const n = (body.note ?? {}) as Record<string, unknown>;
      const kind = String(n.kind ?? "");
      if (!KINDS.includes(kind)) return jsonError(400, "Unknown note kind");
      const { data: sec } = await db.from("work_sections").select("id").eq("id", String(n.section_id ?? "")).eq("version_id", round.version_id).maybeSingle();
      if (!sec) return jsonError(400, "Unknown section");
      if (kind === "reaction" && !REACTIONS.includes(String(n.reaction))) return jsonError(400, "Unknown reaction");
      const intOrNull = (x: unknown) => (x === null || x === undefined || x === "" ? null : Math.max(0, Math.floor(Number(x))));
      const row = {
        round_id: round.id, reviewer_id: reviewer.id, section_id: (sec as { id: string }).id, kind,
        block: intOrNull(n.block), start_at: intOrNull(n.start_at), end_at: intOrNull(n.end_at),
        quote: String(n.quote ?? "").slice(0, 4000),
        body: String(n.body ?? "").slice(0, 8000),
        replacement: kind === "suggest" ? String(n.replacement ?? "").slice(0, 8000) : null,
        reaction: kind === "reaction" ? String(n.reaction) : null,
        score: kind === "pulse" ? Math.min(5, Math.max(1, Math.round(Number(n.score) || 3))) : null,
      };
      if (kind === "pulse") {
        // One pulse per reviewer per section: replace the old one.
        await db.from("review_notes").delete().eq("reviewer_id", reviewer.id).eq("section_id", row.section_id).eq("kind", "pulse");
      }
      const { data, error } = await db.from("review_notes").insert(row).select("*").single();
      if (error) throw new Error(error.message);
      await db.from("reviewers").update({ last_seen_at: now }).eq("id", reviewer.id);
      return json({ note: { ...(data as object), mine: true } });
    }

    if (body.action === "update_note" || body.action === "delete_note") {
      const id = String(body.id ?? "");
      const { data: own } = await db.from("review_notes").select("id, status").eq("id", id).eq("reviewer_id", reviewer.id).maybeSingle();
      if (!own) return jsonError(404, "Note not found");
      if (body.action === "delete_note") {
        await db.from("review_notes").delete().eq("id", id);
        return json({ ok: true });
      }
      const update: Record<string, unknown> = { updated_at: now };
      if (typeof body.body === "string") update.body = body.body.slice(0, 8000);
      if (typeof body.replacement === "string") update.replacement = body.replacement.slice(0, 8000);
      const { data } = await db.from("review_notes").update(update).eq("id", id).select("*").single();
      return json({ note: { ...(data as object), mine: true } });
    }

    if (body.action === "answer") {
      const qid = String(body.question_id ?? "");
      if (!qid) return jsonError(400, "question_id required");
      const { error } = await db.from("review_answers").upsert(
        { round_id: round.id, reviewer_id: reviewer.id, question_id: qid, answer: String(body.answer ?? "").slice(0, 8000), updated_at: now },
        { onConflict: "reviewer_id,question_id" },
      );
      if (error) throw new Error(error.message);
      return json({ ok: true });
    }

    if (body.action === "progress") {
      const p = { ...(reviewer.progress ?? {}) } as { last_section?: number; done?: number[] };
      const section = Number(body.section);
      if (Number.isFinite(section)) p.last_section = section;
      if (body.done && Number.isFinite(section)) p.done = Array.from(new Set([...(p.done ?? []), section])).sort((a, b) => a - b);
      await db.from("reviewers").update({ progress: p, last_seen_at: now }).eq("id", reviewer.id);
      return json({ progress: p });
    }

    if (body.action === "finish") {
      await db.from("reviewers").update({ finished_at: now, last_seen_at: now }).eq("id", reviewer.id);
      return json({ finished_at: now });
    }

    return jsonError(400, "Unknown action");
  } catch (e) {
    return jsonError(500, (e as Error).message);
  }
});
