// Interview Mode: staff-only admin actions for Studio > Interviews.
//   { action: "create_subject", email, password?, display_name, story_slug, mode?, language?, honorific? }
//     mode "memoir" (default: Korean, Daegu voice) or "ghostwriter" (English, Matthew voice).
//     One account can have several interviews, one per story_slug.
//   { action: "set_password", subject_id, password }
//   { action: "session_audio", session_id }   → { urls: { [turn_id]: signedUrl } }
//   { action: "delete_session", session_id }  → removes a (test) session + its audio

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
