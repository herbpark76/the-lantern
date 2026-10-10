// Interview Mode: staff-only admin actions for Studio > Interviews.
//   { action: "create_subject", email, password?, display_name, story_slug, mode?, language?, honorific? }
//     mode "memoir" (default: Korean, Daegu voice) or "ghostwriter" (English, Matthew voice).
//     One account can have several interviews, one per story_slug.
//   { action: "set_password", subject_id, password }
//   { action: "session_audio", session_id }   → { urls: { [turn_id]: signedUrl } }
//   { action: "delete_session", session_id }  → removes a (test) session + its audio

import { ELEVENLABS_API_KEY, SERVICE_ROLE_KEY, SUPABASE_URL, textToSpeech, type Subject } from "../_shared/interview.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;
import { admin, BUCKET, corsHeaders, getCaller, isStaffUser, json, jsonError, type Turn } from "../_shared/interview.ts";

const MATTHEW_VOICE = "kNjmAhXxYgxjF0oyxw4c"; // English narrator voice for ghostwriter projects

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonError(405, "Method not allowed");

  try {
    const user = await getCaller(req);
    if (!user) return jsonError(401, "Authentication required");
    const db = admin();
    if (!(await isStaffUser(db, user.id))) return jsonError(403, "Staff only");

    const body = await req.json().catch(() => ({})) as Record<string, string>;

    if (body.action === "create_subject") {
      const email = (body.email ?? "").trim().toLowerCase();
      // Same rule as the Studio form: "Last Exit" → "last-exit".
      body.story_slug = (body.story_slug ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-{2,}/g, "-").replace(/^-|-$/g, "");
      if (!email || !body.display_name || !body.story_slug) return jsonError(400, "email, display_name and story_slug are required");

      // Find an existing account with this email, or create one (already confirmed).
      let userId: string | null = null;
      for (let page = 1; page <= 20 && !userId; page++) {
        const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
        if (error) throw new Error(error.message);
        userId = data.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
        if (data.users.length < 200) break;
      }
      let created = false;
      if (!userId) {
        if (!body.password || body.password.length < 6) return jsonError(400, "No account with that email yet — give a password (6+ characters) to create one");
        const { data, error } = await db.auth.admin.createUser({
          email, password: body.password, email_confirm: true,
          user_metadata: { display_name: body.display_name },
        });
        if (error) throw new Error(error.message);
        userId = data.user.id;
        created = true;
      }

      const mode = body.mode === "ghostwriter" ? "ghostwriter" : "memoir";
      const language = body.language === "en" || body.language === "ko" ? body.language : (mode === "ghostwriter" ? "en" : "ko");
      const defaults = mode === "ghostwriter"
        ? { honorific: body.display_name, tts_voice_id: MATTHEW_VOICE, tts_model_id: "eleven_v3", tts_speed: 1.0, next_era: "free" }
        : {};
      const { data: subject, error } = await db.from("interview_subjects").insert({
        user_id: userId,
        display_name: body.display_name,
        story_slug: body.story_slug,
        mode,
        language,
        ...defaults,
        ...(body.honorific ? { honorific: body.honorific } : {}),
      }).select().single();
      if (error) {
        return jsonError(400, error.message.includes("duplicate") ? "That account already has an interview for this story" : error.message);
      }
      return json({ subject, account_created: created });
    }

    // Publish a ghostwriter/memoir book to the public Library (a stories row with settings.kind = "book").
    //   { action: "publish_book", story_slug, title, blurb, chapter_ids: string[] }
    //   { action: "unpublish_book", story_slug }
    if (body.action === "publish_book" || body.action === "unpublish_book") {
      const slug = String(body.story_slug ?? "");
      if (!slug) return jsonError(400, "story_slug is required");
      const { data: existing } = await db.from("stories").select("slug, settings, status").eq("slug", slug).maybeSingle();
      const ex = existing as { settings?: Record<string, unknown> } | null;
      if (ex && ex.settings?.kind !== "book") return jsonError(409, "An interactive story already uses this slug");

      if (body.action === "unpublish_book") {
        if (ex) await db.from("stories").update({ status: "draft" }).eq("slug", slug);
        return json({ ok: true, status: "draft" });
      }

      const raw = body as unknown as { title?: string; blurb?: string; chapter_ids?: unknown };
      const title = String(raw.title ?? "").trim();
      if (!title) return jsonError(400, "A title is required");
      const ids = Array.isArray(raw.chapter_ids) ? raw.chapter_ids.map(String) : [];
      if (!ids.length) return jsonError(400, "Pick at least one chapter to publish");

      const { error: storyErr } = await db.from("stories").upsert({
        slug, title, blurb: String(raw.blurb ?? "").trim(), author_id: user.id, status: "published",
        settings: { ...(ex?.settings ?? {}), kind: "book" },
      }, { onConflict: "slug" });
      if (storyErr) throw new Error(storyErr.message);

      const { data: docs } = await db.from("book_docs").select("id").eq("story_slug", slug).eq("kind", "sample");
      const all = ((docs as Array<{ id: string }>) ?? []).map((d) => d.id);
      const on = all.filter((id) => ids.includes(id));
      const off = all.filter((id) => !ids.includes(id));
      if (on.length) await db.from("book_docs").update({ published: true }).in("id", on);
      if (off.length) await db.from("book_docs").update({ published: false }).in("id", off);
      return json({ ok: true, status: "published", published: on });
    }

    // Write the next chapter of a ghostwriter book (or rewrite chapter_id from the bible) in the
    // background: { action: "write_chapter", story_slug, chapter_id? } → { chapter_id }
    if (body.action === "write_chapter") {
      const slug = String(body.story_slug ?? "");
      const { data: subjRows } = await db.from("interview_subjects").select("*").eq("story_slug", slug).order("created_at");
      const subjects = (subjRows as Subject[]) ?? [];
      const subject = subjects.find((x) => x.mode === "ghostwriter") ?? subjects[0] ?? null;
      if (!subject) return jsonError(404, "This book has no interview yet");
      const { data: docs } = await db.from("book_docs").select("id, position, generating").eq("story_slug", slug).eq("kind", "sample");
      const rows = (docs as Array<{ id: string; position: number; generating: boolean }>) ?? [];
      if (rows.some((r) => r.generating)) return jsonError(409, "A chapter is already being written. Give it a few minutes.");

      let chapterId = body.chapter_id ? String(body.chapter_id) : "";
      if (chapterId) {
        if (!rows.some((r) => r.id === chapterId)) return jsonError(404, "Chapter not found");
        await db.from("book_docs").update({ generating: true, gen_error: null }).eq("id", chapterId);
      } else {
        const n = rows.reduce((m, r) => Math.max(m, r.position), 0) + 1;
        chapterId = `${slug}/sample-${String(n).padStart(2, "0")}`;
        const lang = subject.language === "ko" ? "ko" : "en";
        const { error } = await db.from("book_docs").insert({
          id: chapterId, story_slug: slug, kind: "sample", position: n,
          title_en: `Chapter ${n}`, ...(lang === "ko" ? { title_ko: `제${n}장` } : {}), [`voice_${lang}`]: subject.tts_voice_id,
          model_id: subject.tts_model_id, speed: Number(subject.tts_speed) || 1,
          generating: true, gen_error: null,
        });
        if (error) throw new Error(error.message);
      }

      const p = fetch(`${SUPABASE_URL}/functions/v1/interview-finish`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "write_chapter", chapter_id: chapterId }),
      }).catch((e) => console.error("[interview-admin] write_chapter trigger failed", e));
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(p);
      return json({ chapter_id: chapterId });
    }

    // Rebuild the bible's structure and chapter plan without an interview: { action: "replan", story_slug }
    if (body.action === "replan") {
      const slug = String(body.story_slug ?? "");
      const bibleId = `${slug}/bible`;
      const { data: subjRows } = await db.from("interview_subjects").select("*").eq("story_slug", slug).order("created_at");
      const subjects = (subjRows as Subject[]) ?? [];
      const subject = subjects.find((x) => x.mode === "ghostwriter") ?? subjects[0] ?? null;
      if (!subject) return jsonError(404, "This book has no interview yet");
      const { data: existing } = await db.from("book_docs").select("id, generating").eq("id", bibleId).maybeSingle();
      if ((existing as { generating?: boolean } | null)?.generating) return jsonError(409, "The plan is already being built.");
      if (existing) {
        await db.from("book_docs").update({ generating: true, gen_error: null }).eq("id", bibleId);
      } else {
        // First living bible: start from the newest session bible.
        const { data: latest } = await db.from("book_docs").select("body_en, body_ko").eq("story_slug", slug).eq("kind", "summary")
          .order("updated_at", { ascending: false }).limit(1).maybeSingle();
        const l = latest as { body_en: string; body_ko: string } | null;
        const lang = subject.language === "ko" ? "ko" : "en";
        await db.from("book_docs").insert({
          id: bibleId, story_slug: slug, kind: "summary", position: 0,
          [`title_${lang}`]: "Story Bible", body_en: l?.body_en ?? "", body_ko: l?.body_ko ?? "",
          [`voice_${lang}`]: subject.tts_voice_id, generating: true,
        });
      }
      const p = fetch(`${SUPABASE_URL}/functions/v1/interview-finish`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "replan", story_slug: slug }),
      }).catch((e) => console.error("[interview-admin] replan trigger failed", e));
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(p);
      return json({ ok: true, bible_id: bibleId });
    }

    // The voices in the ElevenLabs account, for the voice dropdowns in Studio.
    if (body.action === "list_voices") {
      if (!ELEVENLABS_API_KEY) return jsonError(503, "ELEVENLABS_API_KEY is not configured");
      const resp = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": ELEVENLABS_API_KEY } });
      if (!resp.ok) {
        const err = await resp.text();
        let reason = err;
        try { const j = JSON.parse(err); reason = j?.detail?.message ?? j?.detail?.status ?? err; } catch { /* raw */ }
        return jsonError(502, `ElevenLabs ${resp.status}: ${String(reason).slice(0, 200)}`);
      }
      const data = await resp.json() as { voices?: Array<{ voice_id: string; name: string; category?: string; preview_url?: string; labels?: Record<string, string> }> };
      const voices = (data.voices ?? []).map((v) => ({
        id: v.voice_id, name: v.name, category: v.category ?? "", preview_url: v.preview_url ?? null,
        description: [v.labels?.gender, v.labels?.age, v.labels?.accent].filter(Boolean).join(", "),
      })).sort((a, b) => a.name.localeCompare(b.name));
      return json({ voices });
    }

    // Hear a voice/model/speed before saving it: { action: "voice_test", voice_id, model_id, speed, language, honorific? }
    if (body.action === "voice_test") {
      const ko = body.language === "ko";
      const name = (body.honorific ?? "").trim();
      const text = ko
        ? `${name ? `${name}, ` : ""}안녕하세요. 오늘은 어린 시절 이야기를 조금 더 들려주시겠어요? 그때 살던 집은 어떤 모습이었는지 궁금해요.`
        : `${name ? `Hi ${name}. ` : "Hi. "}I've been thinking about your story since last time. Tell me about the moment everything changed for your main character. Where were they, and what did they see?`;
      const pseudo = { tts_voice_id: String(body.voice_id ?? "").trim(), tts_model_id: String(body.model_id ?? "").trim(), tts_speed: Number(body.speed) || 1 } as Subject;
      if (!pseudo.tts_voice_id || !pseudo.tts_model_id) return jsonError(400, "voice_id and model_id are required");
      try {
        const audio = new Uint8Array(await textToSpeech(pseudo, text));
        let bin = "";
        for (let i = 0; i < audio.length; i += 0x8000) bin += String.fromCharCode(...audio.subarray(i, i + 0x8000));
        return json({ audio: `data:audio/mpeg;base64,${btoa(bin)}`, text });
      } catch (e) {
        return jsonError(502, String((e as Error).message ?? e));
      }
    }

    if (body.action === "set_password") {
      const { data: subject } = await db.from("interview_subjects").select("user_id").eq("id", body.subject_id).maybeSingle();
      if (!subject) return jsonError(404, "Subject not found");
      if (!body.password || body.password.length < 6) return jsonError(400, "Password must be 6+ characters");
      const { error } = await db.auth.admin.updateUserById((subject as { user_id: string }).user_id, { password: body.password });
      if (error) throw new Error(error.message);
      return json({ ok: true });
    }

    if (body.action === "session_audio") {
      const { data } = await db.from("interview_turns").select("id, audio_path").eq("session_id", body.session_id);
      const turns = (data as Pick<Turn, "id" | "audio_path">[]) ?? [];
      const withAudio = turns.filter((t) => t.audio_path);
      const urls: Record<string, string> = {};
      if (withAudio.length) {
        const { data: signed } = await db.storage.from(BUCKET).createSignedUrls(withAudio.map((t) => t.audio_path!), 60 * 60 * 6);
        (signed ?? []).forEach((s, i) => { if (s.signedUrl) urls[withAudio[i].id] = s.signedUrl; });
      }
      return json({ urls });
    }

    if (body.action === "delete_session") {
      const { data } = await db.from("interview_turns").select("audio_path").eq("session_id", body.session_id);
      const paths = ((data as Array<{ audio_path: string | null }>) ?? []).map((t) => t.audio_path).filter(Boolean) as string[];
      if (paths.length) await db.storage.from(BUCKET).remove(paths);
      await db.from("interview_sessions").delete().eq("id", body.session_id);
      return json({ ok: true });
    }

    return jsonError(400, `Unknown action: ${body.action}`);
  } catch (err) {
    console.error("[interview-admin] error", err);
    return jsonError(500, String((err as Error).message ?? err));
  }
});
