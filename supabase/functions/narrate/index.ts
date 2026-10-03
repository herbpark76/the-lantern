import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY") ?? "";

const MAX_CHARS = 2500;
const MONTHLY_LIMIT = 50000;

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonResponse(data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonError(405, "Method not allowed");
  }

  try {
    // Caller-authenticated client — used only to verify the user is signed in
    const authClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });

    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return jsonError(401, "Authentication required");
    }

    // Service-role client — bypasses RLS for storage upload + DB insert
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { story_slug, text } = await req.json();
    if (!story_slug || typeof text !== "string") {
      return jsonError(400, "story_slug and text are required");
    }

    if (text.length > MAX_CHARS) {
      return jsonError(413, `Text exceeds ${MAX_CHARS} character limit`);
    }

    const { data: story } = await admin
      .from("stories")
      .select("settings")
      .eq("slug", story_slug)
      .maybeSingle();

    const narration = (story as { settings?: { narration?: { voice_id: string; model_id: string } } })?.settings?.narration;
    if (!narration?.voice_id) {
      return jsonError(404, "No narration configured for this story");
    }

    const textHash = await sha256(`${narration.voice_id}|${narration.model_id}|${text}`);
    const clipPath = `${story_slug}/${textHash}.mp3`;

    // Check cache BEFORE calling ElevenLabs — try listing the file in storage
    const { data: existingFile } = await admin.storage
      .from("narration")
      .list(story_slug, { search: `${textHash}.mp3` });

    if (existingFile && existingFile.length > 0) {
      const { data: urlData } = admin.storage
        .from("narration")
        .getPublicUrl(clipPath);
      return jsonResponse({ url: urlData.publicUrl });
    }

    // Check monthly usage limit
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { data: recentClips } = await admin
      .from("narration_clips")
      .select("chars")
      .eq("story_slug", story_slug)
      .gte("created_at", thirtyDaysAgo.toISOString());

    const totalChars = (recentClips ?? []).reduce((sum: number, c: { chars: number }) => sum + c.chars, 0);
    if (totalChars + text.length > MONTHLY_LIMIT) {
      return jsonError(429, "Monthly narration limit exceeded for this story");
    }

    if (!ELEVENLABS_API_KEY) {
      return jsonError(503, "ElevenLabs API key not configured");
    }

    // Generate TTS via ElevenLabs
    const ttsResp = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${narration.voice_id}?output_format=mp3_24000_48`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({ text, model_id: narration.model_id }),
      },
    );

    if (!ttsResp.ok) {
      const errText = await ttsResp.text();
      console.error(`[narrate] ElevenLabs API error: ${ttsResp.status}`, errText);
      return jsonError(502, `ElevenLabs API error: ${ttsResp.status}`);
    }

    const audioBuffer = await ttsResp.arrayBuffer();

    // Upload to storage with service-role client (bypasses RLS)
    const { error: uploadErr } = await admin.storage
      .from("narration")
      .upload(clipPath, audioBuffer, { contentType: "audio/mpeg", upsert: false });

    if (uploadErr) {
      console.error("[narrate] Storage upload failed:", uploadErr.message);
      return jsonError(500, `Storage upload failed: ${uploadErr.message}`);
    }

    // Insert clip record with service-role client (bypasses RLS)
    const { error: insertErr } = await admin.from("narration_clips").insert({
      story_slug,
      text_hash: textHash,
      chars: text.length,
      created_by: user.id,
    });

    if (insertErr) {
      console.error("[narrate] Clip record insert failed:", insertErr.message);
      // Audio was uploaded successfully; don't fail the whole request
    }

    const { data: urlData } = admin.storage
      .from("narration")
      .getPublicUrl(clipPath);

    return jsonResponse({ url: urlData.publicUrl });
  } catch (err) {
    console.error("[narrate] Unexpected error:", err);
    return jsonError(500, err.message ?? "Internal server error");
  }
});
