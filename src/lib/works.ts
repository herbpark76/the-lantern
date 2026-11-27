// Works repository: types, text parsing (prose and screenplay), and API helpers.
import { supabase } from "@/lib/supabase";

// ── Types ──────────────────────────────────────────────────────────────

export type Format = "novel" | "novella" | "screenplay" | "short" | "treatment" | "webtoon" | "other";
export const FORMAT_LABEL: Record<string, string> = {
  novel: "Novel", novella: "Novella", screenplay: "Screenplay", short: "Short story", treatment: "Treatment",
  webtoon: "Webtoon", other: "Other", interactive: "Interactive", listening: "Listening edition",
};
export const isProse = (f: string) => f !== "screenplay";

export type Rating = "green" | "yellow" | "red";

export interface HubBeat {
  key: string; label: string; act: number; pct: number;
  summary: string; prose: string; screen: string;
  status: "set" | "weak" | "missing" | "";
}
export interface HubAct { act: number; summary: string; prose?: string; screen?: string; novella?: string; screenplay?: string }
export interface HubCharacter { name: string; role: string; want: string; need: string; arc: string; notes: string }
export interface HubPoint { kind: "decision" | "continuity" | "style" | "open" | "note"; text: string }
export interface Hub {
  genre?: string; theme?: string; premise?: string;
  acts?: HubAct[]; beats?: HubBeat[]; characters?: HubCharacter[]; points?: HubPoint[];
}
export interface WorkLink { format: string; label: string; href: string }

export interface Work {
  slug: string; title: string; logline: string; blurb: string; accent_color: string;
  visibility: "private" | "public"; position: number; hub: Hub; links: WorkLink[];
  created_at: string; updated_at: string;
}

export interface Version {
  id: string; work_slug: string; format: Format; label: string; notes: string;
  status: "draft" | "current" | "archived"; lang: string; public: boolean; source: string;
  parent_id: string | null; word_count: number; files: Array<{ name: string; path: string }>; created_at: string;
}

export interface Section { id: string; version_id?: string; position: number; title: string; body: string }

export interface Question { id: string; text: string; section: number | null }
export interface Round {
  id: string; version_id: string; title: string; instructions: string; due_at: string | null;
  status: "open" | "closed"; show_others: boolean; questions: Question[]; created_at: string;
}
export interface Reviewer {
  id: string; round_id: string; name: string; email: string; token: string;
  progress: { last_section?: number; done?: number[] }; started_at: string | null; last_seen_at: string | null;
  finished_at: string | null; created_at: string;
}
export type NoteKind = "comment" | "suggest" | "reaction" | "pulse";
export type ReactionKey = "loved" | "slow" | "confused" | "unconvinced" | "funny" | "moved";
export interface Note {
  id: string; round_id: string; reviewer_id: string | null; section_id: string;
  block: number | null; start_at: number | null; end_at: number | null; quote: string;
  kind: NoteKind; body: string; replacement: string | null; reaction: ReactionKey | null; score: number | null;
  status: "open" | "accepted" | "rejected" | "resolved"; author_reply: string; created_at: string;
  mine?: boolean; author_name?: string | null;
}

export const REACTIONS: Array<{ key: ReactionKey; emoji: string; label: string }> = [
  { key: "loved", emoji: "❤️", label: "Loved this" },
  { key: "moved", emoji: "🥹", label: "Moved me" },
  { key: "funny", emoji: "😄", label: "Funny" },
  { key: "slow", emoji: "😴", label: "Dragging" },
  { key: "confused", emoji: "🤔", label: "Confused" },
  { key: "unconvinced", emoji: "🙄", label: "Didn't buy it" },
];
export const reactionOf = (k: string | null) => REACTIONS.find((r) => r.key === k);

export interface CraftRun {
  id: string; kind: "score" | "hub" | "summary"; work_slug: string | null; version_id: string | null; round_id: string | null;
  model: string; status: "running" | "done" | "failed"; result: any; error: string | null; created_at: string; finished_at: string | null; // eslint-disable-line @typescript-eslint/no-explicit-any
}

// The 15 Save the Cat beats with their usual position (percent of the whole).
export const STC_BEATS: Array<{ key: string; label: string; act: number; pct: number; hint: string }> = [
  { key: "opening_image", label: "Opening Image", act: 1, pct: 0, hint: "A snapshot of the hero's world before the story" },
  { key: "theme_stated", label: "Theme Stated", act: 1, pct: 5, hint: "Someone states what the story is really about" },
  { key: "setup", label: "Set-Up", act: 1, pct: 5, hint: "Hero, world, flaws, what's missing" },
  { key: "catalyst", label: "Catalyst", act: 1, pct: 10, hint: "The event that knocks life off course" },
  { key: "debate", label: "Debate", act: 1, pct: 15, hint: "Should I go? Can I?" },
  { key: "break_into_two", label: "Break Into Two", act: 2, pct: 20, hint: "Hero chooses to enter the new world" },
  { key: "b_story", label: "B Story", act: 2, pct: 22, hint: "The relationship that carries the theme" },
  { key: "fun_and_games", label: "Fun and Games", act: 2, pct: 30, hint: "The promise of the premise" },
  { key: "midpoint", label: "Midpoint", act: 2, pct: 50, hint: "False victory or false defeat; stakes rise" },
  { key: "bad_guys_close_in", label: "Bad Guys Close In", act: 2, pct: 62, hint: "Outer and inner pressure mounts" },
  { key: "all_is_lost", label: "All Is Lost", act: 2, pct: 75, hint: "The lowest point; a whiff of death" },
  { key: "dark_night", label: "Dark Night of the Soul", act: 2, pct: 78, hint: "Hero wallows, then finds the truth" },
  { key: "break_into_three", label: "Break Into Three", act: 3, pct: 80, hint: "A new idea: A and B stories meet" },
  { key: "finale", label: "Finale", act: 3, pct: 88, hint: "Hero applies the lesson; the world changes" },
  { key: "final_image", label: "Final Image", act: 3, pct: 100, hint: "Mirror of the opening image" },
];

export function hubBeats(hub: Hub): HubBeat[] {
  return STC_BEATS.map((b) => {
    const have = hub.beats?.find((x) => x.key === b.key);
    return { key: b.key, label: b.label, act: b.act, pct: b.pct, summary: "", prose: "", screen: "", status: "", ...(have ?? {}) };
  });
}

// ── Text parsing ───────────────────────────────────────────────────────
// A section's text is split into blocks (paragraphs, headings, screenplay elements).
// Each block has a plain-text form; review notes anchor to (block, start, end) in it.

export interface Seg { text: string; em?: boolean; strong?: boolean; start: number }
export type BlockType =
  | "h1" | "h2" | "h3" | "sep" | "p" | "li" | "quote"
  | "act" | "scene" | "action" | "shot" | "character" | "paren" | "dialogue" | "transition" | "centered";
export interface Block { i: number; type: BlockType; raw: string; plain: string; segs: Seg[] }

export function inlineSegs(s: string): Seg[] {
  const out: Seg[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0; let pos = 0; let m: RegExpExecArray | null;
  const push = (text: string, f: Partial<Seg> = {}) => { if (!text) return; out.push({ text, start: pos, ...f }); pos += text.length; };
  while ((m = re.exec(s))) {
    push(s.slice(last, m.index));
    if (m[1] !== undefined) push(m[1], { strong: true }); else push(m[2], { em: true });
    last = m.index + m[0].length;
  }
  push(s.slice(last));
  return out;
}

function mk(i: number, type: BlockType, raw: string, text: string): Block {
  const segs = inlineSegs(text);
  return { i, type, raw, plain: segs.map((s) => s.text).join(""), segs };
}

export function parseProse(text: string): Block[] {
  const chunks = text.replace(/\r\n/g, "\n").trim().replace(/^(#{1,6} .*)$/gm, "\n$1\n").split(/\n\s*\n/).filter((b) => b.trim());
  const out: Block[] = [];
  for (const c of chunks) {
    const t = c.trim();
    if (t.startsWith("# ")) { out.push(mk(out.length, "h1", t, t.slice(2))); continue; }
    if (/^#{2,6}\s/.test(t)) {
      const label = t.replace(/^#{2,6}\s*/, "");
      out.push(mk(out.length, /^\d+$/.test(label) || /^[*·•\s]+$/.test(label) ? "sep" : "h3", t, label));
      continue;
    }
    if (/^(\*\s*){3,}$|^-{3,}$/.test(t)) { out.push(mk(out.length, "sep", t, "* * *")); continue; }
    const lines = t.split("\n");
    if (lines.every((l) => /^[-*]\s/.test(l.trim()))) {
      for (const l of lines) out.push(mk(out.length, "li", l, l.trim().replace(/^[-*]\s/, "")));
      continue;
    }
    if (lines.every((l) => l.startsWith(">"))) { out.push(mk(out.length, "quote", t, lines.map((l) => l.replace(/^>\s?/, "")).join(" "))); continue; }
    out.push(mk(out.length, "p", t, t.replace(/\n/g, " ")));
  }
  return out;
}

const SCENE_RE = /^(\.(?=[A-Z])|(INT|EXT|EST|INT\.?\/EXT|I\/E)[.\s])/i;
const isCaps = (l: string) => /[A-Z]/.test(l) && l === l.toUpperCase();
const isCue = (l: string) => isCaps(l) && !/^[(>]/.test(l) && !/TO:$/.test(l) && l.replace(/\(.*?\)/g, "").trim().length <= 38 && !SCENE_RE.test(l) || /^@/.test(l);

export function parseScreenplay(text: string): Block[] {
  const groups = text.replace(/\r\n/g, "\n").replace(/\t/g, "    ").split(/\n\s*\n/).map((g) => g.split("\n").map((l) => l.trimEnd())).filter((g) => g.some((l) => l.trim()));
  const out: Block[] = [];
  const add = (type: BlockType, raw: string, t: string) => out.push(mk(out.length, type, raw, t));
  for (const g of groups) {
    const lines = g.map((l) => l.trim()).filter(Boolean);
    const first = lines[0];
    if (/^#{1,6}\s/.test(first) && lines.length === 1) { add("act", first, first.replace(/^#+\s*/, "")); continue; }
    if (/^>.*<$/.test(first) && lines.length === 1) { add("centered", first, first.replace(/^>\s*|\s*<$/g, "")); continue; }
    if (lines.length === 1 && (/^>/.test(first) || (isCaps(first) && /TO:$/.test(first)) || /^(FADE (IN|OUT)|CUT TO|SMASH CUT|DISSOLVE)/.test(first))) {
      add("transition", first, first.replace(/^>\s*/, "")); continue;
    }
    if (SCENE_RE.test(first)) {
      add("scene", first, first.replace(/^\./, ""));
      if (lines.length > 1) add("action", lines.slice(1).join("\n"), lines.slice(1).join("\n"));
      continue;
    }
    if (lines.length > 1 && isCue(first)) {
      add("character", first, first.replace(/^@/, ""));
      let buf: string[] = [];
      const flush = () => { if (buf.length) { add("dialogue", buf.join("\n"), buf.join(" ")); buf = []; } };
      for (const l of lines.slice(1)) {
        if (/^\(.*\)$/.test(l)) { flush(); add("paren", l, l); } else buf.push(l);
      }
      flush();
      continue;
    }
    if (lines.length === 1 && isCaps(first) && first.length < 60 && !/[.!?]$/.test(first.replace(/\*+/g, ""))) { add("shot", first, first); continue; }
    add("action", lines.join("\n"), lines.join("\n"));
  }
  return out;
}

export const parseBlocks = (text: string, format: string) => (isProse(format) ? parseProse(text) : parseScreenplay(text));

export const words = (t: string) => (t.match(/\S+/g) ?? []).length;

/** Section titles: "# Chapter 3: Where" from the first line, else the stored title. */
export function splitIntoSections(text: string, format: string): Array<{ title: string; body: string }> {
  const t = text.replace(/\r\n/g, "\n").trim();
  if (!t) return [];
  // Split on top-level "# " headings (chapters in prose, acts in a screenplay).
  const parts = t.split(/\n(?=# )/);
  if (parts.length > 1 || t.startsWith("# ")) {
    return parts.map((p) => {
      const first = p.split("\n")[0];
      return { title: first.startsWith("# ") ? first.slice(2).trim() : "Opening", body: p.trim() };
    }).filter((p) => p.body);
  }
  // Prose without headings: "Chapter N" lines.
  if (isProse(format) && /^chapter\s+\w+/im.test(t)) {
    const ps = t.split(/\n(?=chapter\s+\w+)/i);
    return ps.map((p) => ({ title: p.split("\n")[0].trim(), body: `# ${p.trim()}` }));
  }
  // A screenplay without act headings: cut into chunks of ~25 scenes so pages stay light.
  if (!isProse(format)) {
    const scenes = t.split(/\n(?=\s*(?:INT|EXT|EST|INT\.?\/EXT|I\/E)[.\s])/i);
    const out: Array<{ title: string; body: string }> = [];
    for (let i = 0; i < scenes.length; i += 25) {
      const body = scenes.slice(i, i + 25).join("\n").trim();
      out.push({ title: `Scenes ${i + 1}–${Math.min(i + 25, scenes.length)}`, body });
    }
    return out;
  }
  return [{ title: "Full text", body: t }];
}

/** Strip Fountain title-page keys (Title:, Credit:, Author:...) at the top. */
export function stripTitlePage(text: string): { meta: Record<string, string>; body: string } {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const meta: Record<string, string> = {};
  if (!/^(Title|Credit|Author|Authors|Source|Draft date|Contact|Notes|Copyright):/i.test(lines[0] ?? "")) return { meta, body: text };
  let i = 0; let key = "";
  for (; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) break;
    const m = /^([A-Za-z ]+):\s*(.*)$/.exec(l);
    if (m) { key = m[1].toLowerCase(); meta[key] = m[2]; } else if (key) meta[key] = `${meta[key]} ${l.trim()}`.trim();
  }
  return { meta, body: lines.slice(i).join("\n").trim() };
}

// ── API helpers ────────────────────────────────────────────────────────

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let message = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try { message = (await ctx.json())?.error ?? message; } catch { /* keep */ }
    }
    throw new Error(message);
  }
  return data as T;
}

export const craftApi = {
  score: (version_id: string, model: "sonnet" | "opus") => invoke<{ run_id: string }>("craft", { action: "score", version_id, model }),
  hub: (version_id: string, model: "sonnet" | "opus") => invoke<{ run_id: string }>("craft", { action: "hub", version_id, model }),
  summary: (round_id: string, model: "sonnet" | "opus") => invoke<{ run_id: string }>("craft", { action: "summary", round_id, model }),
};

export const reviewApi = {
  call: <T>(body: Record<string, unknown>) => invoke<T>("review", body),
};

export async function loadSections(versionId: string): Promise<Section[]> {
  const { data } = await supabase.from("work_sections").select("id, version_id, position, title, body").eq("version_id", versionId).order("position");
  return (data as Section[]) ?? [];
}

/** Make a new frozen version from a list of sections. */
export async function createVersion(v: Partial<Version> & { work_slug: string; format: Format; label: string }, sections: Array<{ title: string; body: string }>): Promise<Version> {
  const word_count = sections.reduce((n, s) => n + words(s.body), 0);
  const { data, error } = await supabase.from("work_versions").insert({ ...v, word_count }).select("*").single();
  if (error) throw new Error(error.message);
  const ver = data as Version;
  if (sections.length) {
    const rows = sections.map((s, i) => ({ version_id: ver.id, position: i + 1, title: s.title, body: s.body }));
    for (let i = 0; i < rows.length; i += 50) {
      const { error: e2 } = await supabase.from("work_sections").insert(rows.slice(i, i + 50));
      if (e2) { await supabase.from("work_versions").delete().eq("id", ver.id); throw new Error(e2.message); }
    }
  }
  return ver;
}

/** Make one version "current" for its format; the old current one becomes a draft. */
export async function makeCurrent(v: Version) {
  await supabase.from("work_versions").update({ status: "draft" }).eq("work_slug", v.work_slug).eq("format", v.format).eq("lang", v.lang).eq("status", "current");
  await supabase.from("work_versions").update({ status: "current" }).eq("id", v.id);
}

export const reviewLink = (token: string) => `${window.location.origin}/review/${token}`;

export const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
export const fmtAgo = (s: string | null | undefined) => {
  if (!s) return "never";
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return fmtDate(s);
};

export const RATING_STYLE: Record<Rating, { dot: string; chip: string; label: string }> = {
  green: { dot: "bg-emerald-500", chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30", label: "Green" },
  yellow: { dot: "bg-amber-400", chip: "bg-amber-400/15 text-amber-700 dark:text-amber-300 border-amber-400/40", label: "Yellow" },
  red: { dot: "bg-rose-500", chip: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30", label: "Red" },
};
