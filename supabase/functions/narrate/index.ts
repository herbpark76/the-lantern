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
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { story_slug, text } = await req.json();
    if (!story_slug || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "story_slug and text are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (text.length > MAX_CHARS) {
      return new Response(JSON.stringify({ error: `Text exceeds ${MAX_CHARS} character limit` }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: story } = await supabase
      .from("stories")
      .select("settings")
      .eq("slug", story_slug)
      .maybeSingle();

    const narration = (story as { settings?: { narration?: { voice_id: string; model_id: string } } })?.settings?.narration;
    if (!narration?.voice_id) {
      return new Response(JSON.stringify({ error: "No narration configured for this story" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const textHash = await sha256(`${narration.voice_id}|${narration.model_id}|${text}`);
    const clipPath = `${story_slug}/${textHash}.mp3`;

    // Check if clip already exists in storage
    const { data: existingFile } = await supabase.storage
      .from("narration")
      .list(story_slug, { search: `${textHash}.mp3` });

    if (existingFile && existingFile.length > 0) {
      const { data: urlData } = supabase.storage
        .from("narration")
        .getPublicUrl(clipPath);
      return new Response(JSON.stringify({ url: urlData.publicUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check monthly usage limit
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { data: recentClips } = await supabase
      .from("narration_clips")
      .select("chars")
      .eq("story_slug", story_slug)
      .gte("created_at", thirtyDaysAgo.toISOString());

    const totalChars = (recentClips ?? []).reduce((sum: number, c: { chars: number }) => sum + c.chars, 0);
    if (totalChars + text.length > MONTHLY_LIMIT) {
      return new Response(JSON.stringify({ error: "Monthly narration limit exceeded for this story" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!ELEVENLABS_API_KEY) {
      return new Response(JSON.stringify({ error: "ElevenLabs API key not configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate TTS
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
      return new Response(JSON.stringify({ error: `ElevenLabs API error: ${ttsResp.status} ${errText}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const audioBuffer = await ttsResp.arrayBuffer();

    // Upload to storage
    const { error: uploadErr } = await supabase.storage
      .from("narration")
      .upload(clipPath, audioBuffer, { contentType: "audio/mpeg", upsert: false });

    if (uploadErr) {
      return new Response(JSON.stringify({ error: `Storage upload failed: ${uploadErr.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert clip record
    await supabase.from("narration_clips").insert({
      story_slug,
      text_hash: textHash,
      chars: text.length,
      created_by: user.id,
    });

    const { data: urlData } = supabase.storage
      .from("narration")
      .getPublicUrl(clipPath);

    return new Response(JSON.stringify({ url: urlData.publicUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
