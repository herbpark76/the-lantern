// Craft rubrics and a structured Claude call for the `craft` edge function.
//
// Each criterion paraphrases a principle from a well-known craft book. The scorer rates a
// version red / yellow / green on each one, with evidence from the text and a concrete fix.

import { ANTHROPIC_API_KEY } from "./common.ts";

export interface Criterion {
  id: string;
  label: string;
  source: string;
  /** What the scorer should look for. Paraphrased; never quoted from the book. */
  test: string;
  group: "Structure" | "Character" | "Scene craft" | "Dialogue" | "Prose & style" | "Format";
}

export const NOVEL_RUBRIC: Criterion[] = [
  { id: "truby-7", group: "Structure", label: "Seven key steps", source: "John Truby, The Anatomy of Story",
    test: "Is there a clear weakness/need, a concrete desire, a true opponent competing for the same goal, a plan, a final battle, a self-revelation and a changed equilibrium? Are need (inner) and desire (outer) different and connected?" },
  { id: "stc-beats", group: "Structure", label: "Beat placement", source: "Jessica Brody, Save the Cat! Writes a Novel",
    test: "Do the major beats land near their expected share of the book (catalyst ~10%, break into two ~20%, midpoint ~50%, all is lost ~75%, break into three ~80%)? Is the midpoint a real false victory or false defeat that raises stakes?" },
  { id: "storygrid-5", group: "Scene craft", label: "Five commandments per chapter", source: "Shawn Coyne, The Story Grid",
    test: "Does each chapter have an inciting incident, a progressive complication that turns it, a crisis (a real dilemma), a climax (a choice) and a resolution? Does the value at stake change from start to end of the chapter?" },
  { id: "storygrid-genre", group: "Structure", label: "Genre obligations", source: "Shawn Coyne, The Story Grid",
    test: "Does the book deliver the obligatory scenes and conventions of its genre (here judge by the genre in the Story Hub), and does it pay them off in a fresh way?" },
  { id: "maass-tension", group: "Scene craft", label: "Micro-tension on every page", source: "Donald Maass, Writing the Breakout Novel",
    test: "Is there unease, conflict or unanswered question line to line, including in quiet and reflective passages, or are there stretches where nothing is in doubt?" },
  { id: "maass-stakes", group: "Structure", label: "Escalating stakes, public and personal", source: "Donald Maass, Writing the Breakout Novel",
    test: "Do the stakes rise across the book, both what could happen to the world/group and what it would cost the protagonist inside? Is it clear why this matters to him?" },
  { id: "cron-cause", group: "Character", label: "Inner struggle drives the plot", source: "Lisa Cron, Wired for Story",
    test: "Is every major event filtered through what it means to the protagonist and does it force him to change his view? Does cause and effect hold from scene to scene (because of that... therefore...)?" },
  { id: "swain-scene-sequel", group: "Scene craft", label: "Scene and sequel rhythm", source: "Dwight Swain, Techniques of the Selling Writer",
    test: "Do goal-conflict-disaster scenes alternate with reaction-dilemma-decision sequels, so pace has rise and rest? Are sequels short enough not to stall?" },
  { id: "sefw-show", group: "Prose & style", label: "Show, don't tell; trust the reader", source: "Renni Browne & Dave King, Self-Editing for Fiction Writers",
    test: "Are emotions dramatized rather than named? Is explanation that the reader already understood (RUE: resist the urge to explain) cut?" },
  { id: "sefw-dialogue", group: "Dialogue", label: "Dialogue mechanics and beats", source: "Renni Browne & Dave King, Self-Editing for Fiction Writers",
    test: "Plain 'said' tags without adverbs, action beats used sparingly and with purpose, no characters telling each other what they both know." },
  { id: "subtext", group: "Dialogue", label: "Subtext and distinct voices", source: "Robert McKee, Dialogue",
    test: "Do characters talk around what they mean? Could you tell who is speaking with the tags removed? Any on-the-nose lines?" },
  { id: "pov", group: "Prose & style", label: "POV discipline", source: "Renni Browne & Dave King, Self-Editing for Fiction Writers",
    test: "Does the point of view stay consistent (here close third on the protagonist unless stated otherwise), with no head-hopping or knowledge the POV character couldn't have?" },
  { id: "king-cut", group: "Prose & style", label: "Lean prose", source: "Stephen King, On Writing",
    test: "Could ~10% be cut? Adverbs, qualifiers, repeated beats, darlings that serve the author more than the story." },
  { id: "ending", group: "Structure", label: "Ending earns its emotion", source: "John Truby, The Anatomy of Story",
    test: "Is the climax caused by the protagonist's own choice? Is the self-revelation shown rather than stated, and does the final image answer the opening image?" },
];

export const SCREENPLAY_RUBRIC: Criterion[] = [
  { id: "stc-15", group: "Structure", label: "15 beats on the page", source: "Blake Snyder, Save the Cat!",
    test: "Scale Snyder's page targets to this script's length (on 110 pages: theme stated ~5, catalyst ~12, break into two ~25, B story ~30, midpoint ~55, all is lost ~75, break into three ~85). Which beats land, which are late, early or missing?" },
  { id: "field-paradigm", group: "Structure", label: "Setup and plot points", source: "Syd Field, Screenplay",
    test: "Do the first ten pages set up character, world and dramatic need? Are plot point I and II clear events that spin the story in a new direction?" },
  { id: "mckee-turn", group: "Scene craft", label: "Every scene turns", source: "Robert McKee, Story",
    test: "Does each scene change a value from positive to negative or the reverse? Flag scenes that end where they began (non-events)." },
  { id: "mckee-gap", group: "Scene craft", label: "Progressive complications and the gap", source: "Robert McKee, Story",
    test: "Do actions get results different from what the character expected, with each complication bigger than the last, no repetition of the same kind of beat?" },
  { id: "truby-desire", group: "Character", label: "Desire line and opponent", source: "John Truby, The Anatomy of Story",
    test: "Is the protagonist's goal visible and active on screen? Is the opposition clear and does it escalate? Is the self-revelation dramatized?" },
  { id: "stc-likable", group: "Character", label: "Reason to root for the lead", source: "Blake Snyder, Save the Cat!",
    test: "Does an unlikable lead get an early moment that makes us want to follow him? Do we invest in his change?" },
  { id: "goldman-late", group: "Scene craft", label: "Enter late, leave early", source: "William Goldman, Adventures in the Screen Trade",
    test: "Do scenes start as late and end as early as possible? Flag scenes with warm-up or wind-down." },
  { id: "stc-exposition", group: "Scene craft", label: "Exposition that plays", source: "Blake Snyder, Save the Cat! (Pope in the Pool)",
    test: "Is backstory and world-building delivered while something entertaining or tense is happening, rather than in talking heads?" },
  { id: "visual", group: "Prose & style", label: "Filmable action lines", source: "David Trottier, The Screenwriter's Bible",
    test: "Are action lines only what can be seen and heard? Flag unfilmables (thoughts, feelings, backstory in description). Are paragraphs short (about 4 lines max)?" },
  { id: "dialogue-subtext", group: "Dialogue", label: "Subtext and distinct voices", source: "Robert McKee, Dialogue",
    test: "Do characters avoid saying exactly what they feel? Are voices distinct? Any speeches that should be cut or turned into action?" },
  { id: "trottier-format", group: "Format", label: "Format and length", source: "David Trottier, The Screenwriter's Bible",
    test: "Spec format conventions: scene headings, no camera directions in a spec, sparing parentheticals, page count in the 90-120 range for a feature, consistent character names." },
  { id: "payoff", group: "Structure", label: "Setups and payoffs", source: "Blake Snyder / Robert McKee",
    test: "Is everything paid off planted earlier, and is everything planted paid off? Does the final image mirror the opening image?" },
];

export const STC_BEATS = [
  { key: "opening_image", label: "Opening Image", act: 1, pct: 0 },
  { key: "theme_stated", label: "Theme Stated", act: 1, pct: 5 },
  { key: "setup", label: "Set-Up", act: 1, pct: 5 },
  { key: "catalyst", label: "Catalyst", act: 1, pct: 10 },
  { key: "debate", label: "Debate", act: 1, pct: 15 },
  { key: "break_into_two", label: "Break Into Two", act: 2, pct: 20 },
  { key: "b_story", label: "B Story", act: 2, pct: 22 },
  { key: "fun_and_games", label: "Fun and Games", act: 2, pct: 30 },
  { key: "midpoint", label: "Midpoint", act: 2, pct: 50 },
  { key: "bad_guys_close_in", label: "Bad Guys Close In", act: 2, pct: 62 },
  { key: "all_is_lost", label: "All Is Lost", act: 2, pct: 75 },
  { key: "dark_night", label: "Dark Night of the Soul", act: 2, pct: 78 },
  { key: "break_into_three", label: "Break Into Three", act: 3, pct: 80 },
  { key: "finale", label: "Finale", act: 3, pct: 88 },
  { key: "final_image", label: "Final Image", act: 3, pct: 100 },
];

export function rubricFor(format: string): Criterion[] {
  return format === "screenplay" ? SCREENPLAY_RUBRIC : NOVEL_RUBRIC;
}

// ── Claude with a forced tool call (structured output) ─────────────────

export interface ToolCallResult<T> { input: T; usage: Record<string, number>; model: string }

export async function claudeTool<T>(opts: {
  model: string; system: string; user: string; toolName: string; toolDescription: string;
  schema: Record<string, unknown>; maxTokens: number;
}): Promise<ToolCallResult<T>> {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");
  const send = (forced: boolean) => fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages: [{ role: "user", content: opts.user + (forced ? "" : `\n\nRespond only by calling the ${opts.toolName} tool.`) }],
      tools: [{ name: opts.toolName, description: opts.toolDescription, input_schema: opts.schema }],
      tool_choice: forced ? { type: "tool", name: opts.toolName } : { type: "any" },
    }),
  });

  let resp = await send(true);
  if (resp.status === 400) {
    const t = await resp.clone().text();
    if (/tool_choice|thinking/i.test(t)) resp = await send(false);
  }
  if (!resp.ok) throw new Error(`Claude API ${resp.status}: ${(await resp.text()).slice(0, 400)}`);
  const data = await resp.json() as {
    model: string; stop_reason: string; usage: Record<string, number>;
    content: Array<{ type: string; name?: string; input?: unknown }>;
  };
  const block = data.content.find((c) => c.type === "tool_use" && c.name === opts.toolName);
  if (!block) throw new Error(`Claude did not return ${opts.toolName} (stop: ${data.stop_reason})`);
  if (data.stop_reason === "max_tokens") throw new Error("The answer was cut off (max_tokens). Try again, or score a shorter version.");
  return { input: block.input as T, usage: data.usage, model: data.model };
}

// ── Text helpers ───────────────────────────────────────────────────────

export interface SectionRow { id: string; position: number; title: string; body: string }

export function wordCount(t: string): number {
  return (t.match(/\S+/g) ?? []).length;
}

/** The whole version as one document, sections marked so the model can cite them. */
export function versionText(sections: SectionRow[], format: string, maxChars = 420_000): string {
  const unit = format === "screenplay" ? "SECTION" : "CHAPTER";
  let out = "";
  for (const s of sections) {
    const chunk = `\n\n=== ${unit} ${s.position}: ${s.title} (${wordCount(s.body)} words) ===\n\n${s.body.trim()}`;
    if (out.length + chunk.length > maxChars) { out += `\n\n[... text truncated after ${unit} ${s.position - 1} ...]`; break; }
    out += chunk;
  }
  return out.trim();
}

/** Rough screenplay page estimate: ~55 lines per page, dialogue wraps narrower. */
export function screenplayPages(sections: SectionRow[]): number {
  let lines = 0;
  for (const s of sections) {
    for (const raw of s.body.split("\n")) {
      const l = raw.trim();
      if (!l) { lines += 1; continue; }
      lines += Math.max(1, Math.ceil(l.length / 58));
    }
  }
  return Math.max(1, Math.round(lines / 55));
}
