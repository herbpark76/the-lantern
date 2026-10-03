import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") ?? "";
const GITHUB_REPO = Deno.env.get("GITHUB_REPO") ?? "";

interface EditRequestBody {
  story_slug: string;
  scene_key: string;
  chapter_title: string;
  flags: Record<string, unknown>;
  timeline: number;
  quoted_text: string;
  request_type: "replace" | "note";
  replacement_text?: string;
  note?: string;
  summary?: string;
  member_id?: string;
}

function shortSummary(text: string): string {
  const clean = text.replace(/\n/g, " ").trim();
  return clean.length > 50 ? clean.slice(0, 50) + "…" : clean || "edit request";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body: EditRequestBody = await req.json();

    const title = `[${body.story_slug}] ${body.scene_key} - ${body.summary || shortSummary(body.quoted_text)}`;

    const bodyLines: string[] = [
      `**Story:** ${body.story_slug}`,
      `**Scene:** ${body.scene_key}`,
      `**Chapter:** ${body.chapter_title}`,
      `**Flags:** ${JSON.stringify(body.flags)}`,
      `**Timeline:** ${body.timeline}`,
      ``,
      `**Quoted text:**`,
      `> ${body.quoted_text.split("\n").join("\n> ")}`,
      ``,
      `**Request type:** ${body.request_type}`,
    ];

    if (body.request_type === "replace" && body.replacement_text) {
      bodyLines.push("", "**Replacement text:**", "", body.replacement_text);
    } else if (body.request_type === "note" && body.note) {
      bodyLines.push("", "**Note:**", "", body.note);
    }

    if (body.member_id) {
      bodyLines.push("", `*Submitted by: ${body.member_id}*`);
    }

    const url = `https://api.github.com/repos/${GITHUB_REPO}/issues`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        body: bodyLines.join("\n"),
        labels: ["edit-request"],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return new Response(JSON.stringify({ error: `GitHub API error: ${resp.status} ${errText}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const issue = await resp.json();

    return new Response(JSON.stringify({ ok: true, issue_number: issue.number, issue_url: issue.html_url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
 
