import type { NarrationSettings } from "./supabase";

export interface NarrationManifest {
  v?: number;
  voice_id?: string;
  voice_name?: string;
  model_id?: string;
  note?: string;
  files?: Record<string, number>;
  segments: Record<string, [string, number, number]>;
}

export interface NarrationItem {
  kind: "title" | "paragraph";
  plainText: string;
  html: string;
  chapterIndex: number;
  itemIndex: number;
}

function decodeEntities(text: string): string {
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
  };
  return text.replace(/&(amp|lt|gt|quot|#39);/g, (m) => entities[m] ?? m);
}

function htmlToPlainText(html: string): string {
  return decodeEntities(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractNarrationItems(
  renderedChapters: Array<{ number: number; title: string; html: string }>
): NarrationItem[] {
  const items: NarrationItem[] = [];
  for (let chIdx = 0; chIdx < renderedChapters.length; chIdx++) {
    const ch = renderedChapters[chIdx];
    if (ch.title) {
      items.push({
        kind: "title",
        plainText: `${ch.title}.`,
        html: "",
        chapterIndex: chIdx,
        itemIndex: items.length,
      });
    }
    const blockRegex = /<p>([\s\S]*?)<\/p>/g;
    let pMatch: RegExpExecArray | null;
    while ((pMatch = blockRegex.exec(ch.html)) !== null) {
      const rawHtml = pMatch[1];
      const plain = htmlToPlainText(rawHtml);
      if (plain) {
        items.push({
          kind: "paragraph",
          plainText: plain,
          html: `<p>${rawHtml}</p>`,
          chapterIndex: chIdx,
          itemIndex: items.length,
        });
      }
    }
  }
  return items;
}

export async function fetchManifest(
  manifestPath: string
): Promise<NarrationManifest | null> {
  try {
    const resp = await fetch(manifestPath);
    if (!resp.ok) return null;
    const data = await resp.json() as NarrationManifest;
    if (!data.segments) return null;
    return data;
  } catch {
    return null;
  }
}

export function findManifestSegment(
  manifest: NarrationManifest,
  plainText: string
): { file: string; start: number; end: number } | null {
  const seg = manifest.segments[plainText];
  if (!seg) return null;
  return { file: seg[0], start: seg[1], end: seg[2] };
}

export function getManifestBaseUrl(manifestPath: string): string {
  const idx = manifestPath.lastIndexOf("/");
  return manifestPath.slice(0, idx + 1);
}

export async function narrateViaEdgeFunction(
  storySlug: string,
  text: string,
  authToken: string
): Promise<string | null> {
  try {
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/narrate`;
    const resp = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ story_slug: storySlug, text }),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as { url?: string };
    return data.url ?? null;
  } catch {
    return null;
  }
}

export function speakViaBrowser(text: string): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 1;
  window.speechSynthesis.speak(utter);
}

export function stopBrowserSpeech(): void {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

export type NarrationMode = "manifest" | "api" | "tts";

export interface NarrationPlayback {
  mode: NarrationMode;
  audioUrl?: string;
  start?: number;
  end?: number;
}

export function resolveNarration(
  item: NarrationItem,
  manifest: NarrationManifest | null,
  manifestBaseUrl: string
): NarrationPlayback | null {
  if (manifest) {
    const seg = findManifestSegment(manifest, item.plainText);
    if (seg) {
      return {
        mode: "manifest",
        audioUrl: `${manifestBaseUrl}${seg.file}`,
        start: seg.start,
        end: seg.end,
      };
    }
    console.warn("[narration] No manifest segment for:", item.plainText.slice(0, 80));
  }
  return null;
}

export function hasNarration(settings: NarrationSettings | undefined): boolean {
  return !!settings?.voice_id;
}
