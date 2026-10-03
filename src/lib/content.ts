import type { Variant, Choice, Chapter } from "./supabase";

export function matchesWhen(whenObj: Record<string, unknown>, flags: Record<string, unknown>, timeline: number): boolean {
  if (!whenObj || Object.keys(whenObj).length === 0) return true;
  for (const [key, value] of Object.entries(whenObj)) {
    if (key === "timeline") {
      if (timeline !== Number(value)) return false;
    } else if (key === "timeline_gte") {
      if (timeline < Number(value)) return false;
    } else {
      if (flags[key] !== value) return false;
    }
  }
  return true;
}

export function pickVariant(
  slot: string,
  variants: Variant[],
  flags: Record<string, unknown>,
  timeline: number
): string {
  const matching = variants
    .filter((v) => v.slot === slot && matchesWhen(v.when, flags, timeline))
    .sort((a, b) => b.priority - a.priority);
  return matching.length > 0 ? matching[0].text : "";
}

export function fillSlots(
  text: string,
  variants: Variant[],
  flags: Record<string, unknown>,
  timeline: number
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, slot: string) => {
    return pickVariant(slot, variants, flags, timeline);
  });
}

export function renderChapters(
  chapters: Chapter[],
  variants: Variant[],
  flags: Record<string, unknown>,
  timeline: number,
  chapterOffset: number = 0
): Array<{ number: number; title: string; html: string }> {
  return chapters.map((ch, idx) => ({
    number: chapterOffset + idx + 1,
    title: ch.title,
    html: fillSlots(ch.body, variants, flags, timeline),
  }));
}

export function markdownToHtml(md: string): string {
  let html = md;
  html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-lg font-serif text-ink-800 dark:text-ink-200 mt-4 mb-2">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="chapter-title">$1</h2>');
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.split(/\n\n+/).map((para) => {
    const trimmed = para.trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("<h")) return trimmed;
    return `<p>${trimmed.replace(/\n/g, "<br/>")}</p>`;
  }).join("\n");
  return html;
}

export function getAvailableChoices(
  choices: Choice[],
  flags: Record<string, unknown>,
  timeline: number
): Choice[] {
  return choices
    .filter((c) => matchesWhen(c.requires, flags, timeline))
    .sort((a, b) => a.position - b.position);
}

export function applySets(
  sets: Record<string, unknown>,
  flags: Record<string, unknown>,
  timelinesEnabled: boolean
): { flags: Record<string, unknown>; incrementTimeline: boolean } {
  const newFlags = { ...flags };
  let incrementTimeline = false;

  for (const [key, value] of Object.entries(sets)) {
    if (key === "_new_timeline" && timelinesEnabled) {
      if (value === true) incrementTimeline = true;
    } else {
      newFlags[key] = value;
    }
  }

  return { flags: newFlags, incrementTimeline };
}

export function getChoiceTallyPercent(
  tallies: Array<{ scene_key: string; choice_key: string; total_count: number }>,
  sceneKey: string,
  choiceKey: string
): number | null {
  const sceneTallies = tallies.filter((t) => t.scene_key === sceneKey);
  const total = sceneTallies.reduce((sum, t) => sum + t.total_count, 0);
  if (total === 0) return null;
  const choice = sceneTallies.find((t) => t.choice_key === choiceKey);
  if (!choice || choice.total_count === 0) return 0;
  return Math.round((choice.total_count / total) * 100);
}
