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
  const result: Array<{ number: number; title: string; html: string }> = [];
  let num = chapterOffset;
  for (const ch of chapters) {
    if (!matchesWhen(ch.when ?? {}, flags, timeline)) continue;
    num += 1;
    result.push({
      number: num,
      title: ch.title,
      html: fillSlots(ch.body, variants, flags, timeline),
    });
  }
  return result;
}

const svgCache = new Map<string, string>();

async function fetchSvg(url: string): Promise<string> {
  if (svgCache.has(url)) return svgCache.get(url)!;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return "";
    const text = await resp.text();
    const svgMatch = text.match(/<svg[\s\S]*?<\/svg>/i);
    if (svgMatch) {
      svgCache.set(url, svgMatch[0]);
      return svgMatch[0];
    }
    return "";
  } catch {
    return "";
  }
}

export async function markdownToHtml(md: string): Promise<string> {
  let html = md;
  html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-lg font-serif text-ink-800 dark:text-ink-200 mt-4 mb-2">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="chapter-title">$1</h2>');
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  const blocks = html.split(/\n\n+/);
  const parts: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("<h")) { parts.push(trimmed); continue; }

    const imgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      const alt = imgMatch[1];
      const src = imgMatch[2];
      if (src.endsWith(".svg") && src.includes("/drawings/")) {
        const svg = await fetchSvg(src);
        if (svg) {
          parts.push(`<figure class="drawing">${svg}</figure>`);
          continue;
        }
      }
      parts.push(`<figure class="drawing"><img src="${src}" alt="${alt}" /></figure>`);
      continue;
    }

    parts.push(`<p>${trimmed.replace(/\n/g, "<br/>")}</p>`);
  }

  return parts.join("\n");
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
