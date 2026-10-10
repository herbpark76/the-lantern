// Narrated audio for book_docs (sample chapters, session summaries).
//
// POST { action: "status", id, lang }    → { total, ready, urls[] }   (staff or the book's interview subject)
// POST { action: "generate", id, lang }  → makes the NEXT missing part, returns status (staff only)
// POST { action: "reset", id, lang }     → forget generated audio so it is made fresh (staff only)
//
// Text is split into parts of ~1,500 characters at paragraph breaks; the client calls
// "generate" repeatedly until ready === total, then plays the parts in order.

import {
  admin, BUCKET, corsHeaders, ELEVENLABS_API_KEY, getCaller, isStaffUser, json, jsonError,
} from "../_shared/interview.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";

const PART_CHARS = 1500;

interface BookDoc {
  id: string;
  story_slug: string;
  body_en: string;
  body_ko: string;
  voice_en: string;
  voice_ko: string;
  model_id: string;
  speed: number;
  audio_en: AudioState | null;
  audio_ko: AudioState | null;
  published?: boolean;
}

interface AudioState {
  hash: string;
  total: number;
  parts: Array<string | null>;
}

// Markdown → plain text for narration: titles and paragraphs kept, section numbers dropped.
export function toSpeechText(md: string): string {
  return md
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (/^#{2,6}\s*\d+\s*$/.test(t)) return ""; // "### 3" section numbers
      return t
        .replace(/^#{1,6}\s*/, "")
        .replace(/^[-*]\s+/, "")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\*(.+?)\*/g, "$1");
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function splitParts(text: string, max = PART_CHARS): string[] {
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const parts: string[] = [];
  let cur = "";
  for (const p of paras) {
    if (p.length > max) {
      // Very long paragraph: split at sentence ends.
      const sentences = p.match(/[^.!?。…]+[.!?。…]+["'”’)]*\s*|[^.!?。…]+$/g) ?? [p];
      for (const s of sentences) {
        if ((cur + s).length > max && cur) { parts.push(cur.trim()); cur = ""; }
        cur += s;
      }
      continue;
    }
    if ((cur + "\n\n" + p).length > max && cur) { parts.push(cur.trim()); cur = ""; }
    cur += (cur ? "\n\n" : "") + p;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

async function sha(s: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

async function load(db: SupabaseClient, id: string): Promise<BookDoc | null> {
  const { data } = await db.from("book_docs").select("*").eq("id", id).maybeSingle();
  return data as BookDoc | null;
}

async function plan(doc: BookDoc, lang: "en" | "ko") {
  const text = toSpeechText(lang === "en" ? doc.body_en : doc.body_ko);
  const voice = lang === "en" ? doc.voice_en : doc.voice_ko;
  const parts = splitParts(text);
  const hash = await sha(`${voice}|${doc.model_id}|${doc.speed}|${text}`);
  return { parts, voice, hash };
}

async function status(db: SupabaseClient, doc: BookDoc, lang: "en" | "ko") {
  const { parts, hash } = await plan(doc, lang);
  const st = (lang === "en" ? doc.audio_en : doc.audio_ko);
  const valid = st && st.hash === hash ? st : null;
  const paths = valid ? valid.parts : [];
  const ready = paths.filter(Boolean).length;
  let urls: string[] = [];
  if (ready === parts.length && ready > 0) {
    const { data } = await db.storage.from(BUCKET).createSignedUrls(paths as string[], 60 * 60 * 6);
    urls = (data ?? []).map((d) => d.signedUrl ?? "");
  }
  return { total: parts.length, ready, urls, stale: !!st && !valid };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonError(405, "Method not allowed");

  try {
    const user = await getCaller(req);
    const db = admin();
    const staff = user ? await isStaffUser(db, user.id) : false;

    const { action = "status", id, lang } = await req.json().catch(() => ({}));
    if (!id || (lang !== "en" && lang !== "ko")) return jsonError(400, "id and lang (en|ko) are required");
    const doc = await load(db, id);
    if (!doc) return jsonError(404, "Not found");

    // Anyone may listen to a published chapter of a published book.
    if (!staff && action === "status" && doc.published) {
      const { data: story } = await db.from("stories").select("status").eq("slug", doc.story_slug).maybeSingle();
      if ((story as { status?: string } | null)?.status === "published") return json(await status(db, doc, lang));
    }

    if (!user) return jsonError(401, "Authentication required");
    if (!staff) {
      const { data: subj } = await db.from("interview_subjects").select("id")
        .eq("user_id", user.id).eq("story_slug", doc.story_slug).limit(1);
      if (!subj?.length) return jsonError(403, "Forbidden");
      if (action !== "status") return jsonError(403, "Staff only");
    }

    const col = lang === "en" ? "audio_en" : "audio_ko";

    if (action === "status") return json(await status(db, doc, lang));

    if (action === "reset") {
      await db.from("book_docs").update({ [col]: null }).eq("id", id);
      return json({ ok: true });
    }

    if (action === "generate") {
      if (!ELEVENLABS_API_KEY) return jsonError(503, "ELEVENLABS_API_KEY is not configured");
      const { parts, voice, hash } = await plan(doc, lang);
      const prev = lang === "en" ? doc.audio_en : doc.audio_ko;
      const st: AudioState = prev && prev.hash === hash && prev.parts.length === parts.length
        ? prev
        : { hash, total: parts.length, parts: parts.map(() => null) };

      const n = st.parts.findIndex((p) => !p);
      if (n >= 0) {
        const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "xi-api-key": ELEVENLABS_API_KEY },
          body: JSON.stringify({
            text: parts[n],
            model_id: doc.model_id,
            voice_settings: { stability: 0.6, similarity_boost: 0.8, style: 0.2, speed: Number(doc.speed) || 1 },
          }),
        });
        if (!resp.ok) {
          const err = await resp.text();
          console.error("[book-audio] TTS error", resp.status, err);
          let reason = err;
          try { reason = JSON.parse(err)?.detail?.message ?? err; } catch { /* raw */ }
          return jsonError(502, `Text-to-speech ${resp.status}: ${String(reason).slice(0, 160)}`);
        }
        const path = `books/${doc.id.replace(/[^a-z0-9-]/gi, "_")}/${lang}/${hash}-${String(n).padStart(2, "0")}.mp3`;
        const { error } = await db.storage.from(BUCKET).upload(path, await resp.arrayBuffer(), { contentType: "audio/mpeg", upsert: true });
        if (error) return jsonError(500, `Upload failed: ${error.message}`);
        st.parts[n] = path;
        await db.from("book_docs").update({ [col]: st }).eq("id", id);
        (doc as unknown as Record<string, unknown>)[col] = st;
      }
      return json(await status(db, doc, lang));
    }

    return jsonError(400, `Unknown action: ${action}`);
  } catch (err) {
    console.error("[book-audio] error", err);
    return jsonError(500, String((err as Error).message ?? err));
  }
});
