import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { parse as parseYaml } from "jsr:@std/yaml@1.0.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") ?? "";
const GITHUB_REPO = Deno.env.get("GITHUB_REPO") ?? "";
const GITHUB_BRANCH = Deno.env.get("GITHUB_BRANCH") ?? "main";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface StoryYaml {
  title: string;
  blurb: string;
  author_email: string;
  status: "draft" | "published";
  start_scene?: string;
  settings: {
    timelines: boolean;
    crowd_split: boolean;
    map: "fog" | "full" | "off";
    accent_color: string;
    narration?: {
      voice_id: string;
      voice_name: string;
      model_id: string;
      manifest?: string;
    };
  };
}

interface FlagDef {
  key: string;
  type: "choice" | "boolean" | "number";
  allowed_values: string[];
  description: string;
}

interface ChoiceDef {
  key: string;
  label: string;
  to: string;
  sets: Record<string, unknown>;
  requires: Record<string, unknown>;
}

interface VariantDef {
  slot: string;
  when: Record<string, unknown>;
  text: string;
  priority: number;
}

interface SceneFrontmatter {
  key: string;
  title: string;
  act: number;
  slug?: string;
  is_bottleneck: boolean;
  is_ending: boolean;
  reads_flags: string[];
  map: { x: number; y: number };
  choices: ChoiceDef[];
  variants: VariantDef[];
}

interface BibleFrontmatter {
  kind: "character" | "place" | "object" | "rule" | "plant";
  key: string;
  name: string;
}

function extractFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!fmMatch) {
    return { frontmatter: {}, body: content };
  }
  return { frontmatter: parseYaml(fmMatch[1]) as Record<string, unknown>, body: fmMatch[2] };
}

function parseChapters(body: string): Array<{ title: string; body: string; when: Record<string, unknown> }> {
  const chapters: Array<{ title: string; body: string; when: Record<string, unknown> }> = [];
  const chapterRegex = /^## (.+)$/gm;
  const matches: Array<{ title: string; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = chapterRegex.exec(body)) !== null) {
    matches.push({ title: m[1].trim(), index: m.index + m[0].length });
  }
  if (matches.length === 0) {
    return [{ title: "", body: body.trim(), when: {} }];
  }
  for (let idx = 0; idx < matches.length; idx++) {
    const start = matches[idx].index;
    const end = idx + 1 < matches.length ? matches[idx + 1].index - matches[idx + 1].title.length - 4 : body.length;
    let chapterBody = body.slice(start, end);

    // Check for a <!-- when: {...} --> comment on the line immediately after the heading
    let when: Record<string, unknown> = {};
    const whenMatch = chapterBody.match(/^\s*<!--\s*when:\s*(\{[\s\S]*?\})\s*-->\s*\n/);
    if (whenMatch) {
      try {
        when = JSON.parse(whenMatch[1]) as Record<string, unknown>;
        chapterBody = chapterBody.slice(whenMatch[0].length);
      } catch {
        // leave when as {} if JSON is malformed
      }
    }

    chapters.push({ title: matches[idx].title, body: chapterBody.trim(), when });
  }
  return chapters;
}

function extractSlots(text: string): string[] {
  const slots: string[] = [];
  const slotRegex = /\{\{(\w+)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = slotRegex.exec(text)) !== null) {
    if (!slots.includes(m[1])) slots.push(m[1]);
  }
  return slots;
}

function asArray<T>(val: unknown): T[] {
  if (Array.isArray(val)) return val as T[];
  if (val == null) return [];
  return [val] as T[];
}

function asStringArray(val: unknown): string[] {
  const arr = asArray<unknown>(val);
  return arr.map((item) => {
    if (typeof item === "string") return item;
    if (typeof item === "number") return String(item);
    if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      const keys = Object.keys(obj);
      if (keys.length === 1) return keys[0];
    }
    return String(item);
  });
}

function asRecord(val: unknown): Record<string, unknown> {
  if (val && typeof val === "object" && !Array.isArray(val)) {
    return val as Record<string, unknown>;
  }
  return {};
}

function normalizeScene(raw: Record<string, unknown>): SceneFrontmatter {
  const choices = asArray<Record<string, unknown>>(raw.choices).map((c) => {
    const to = c.to ?? c.to_scene ?? c.to_scene_key;
    return {
      key: String(c.key ?? ""),
      label: String(c.label ?? ""),
      to: String(to ?? ""),
      sets: asRecord(c.sets),
      requires: asRecord(c.requires),
    } satisfies ChoiceDef;
  });

  const variants = asArray<Record<string, unknown>>(raw.variants).map((v) => ({
    slot: String(v.slot ?? ""),
    when: asRecord(v.when),
    text: String(v.text ?? ""),
    priority: Number(v.priority ?? 0),
  }) satisfies VariantDef);

  const mapRaw = raw.map as Record<string, unknown> | undefined;
  const map = mapRaw && typeof mapRaw === "object"
    ? { x: Number(mapRaw.x ?? 0), y: Number(mapRaw.y ?? 0) }
    : { x: 0, y: 0 };

  return {
    key: String(raw.key ?? ""),
    title: String(raw.title ?? ""),
    act: Number(raw.act ?? 1),
    slug: typeof raw.slug === "string" ? raw.slug : undefined,
    is_bottleneck: Boolean(raw.is_bottleneck ?? false),
    is_ending: Boolean(raw.is_ending ?? false),
    reads_flags: asStringArray(raw.reads_flags),
    map,
    choices,
    variants,
  };
}

function normalizeFlags(raw: unknown): FlagDef[] {
  const arr = asArray<Record<string, unknown>>(raw);
  return arr.map((f) => ({
    key: String(f.key ?? ""),
    type: (f.type as FlagDef["type"]) ?? "choice",
    allowed_values: asArray<string>(f.allowed_values),
    description: String(f.description ?? ""),
  }));
}

async function githubGet(path: string): Promise<string> {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}?ref=${GITHUB_BRANCH}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3.raw",
    },
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`GitHub API error for ${path}: ${resp.status} ${errText}`);
  }
  return await resp.text();
}

async function githubGetDir(path: string): Promise<Array<{ name: string; path: string; type: string }>> {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}?ref=${GITHUB_BRANCH}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
    },
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`GitHub API error for dir ${path}: ${resp.status} ${errText}`);
  }
  return await resp.json();
}

async function getCommitSha(): Promise<string> {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/commits/${GITHUB_BRANCH}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
    },
  });
  if (!resp.ok) return "unknown";
  const data = await resp.json();
  return data.sha ?? "unknown";
}

async function syncStory(slug: string, supabase: ReturnType<typeof createClient>): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = [];

  const storyYamlText = await githubGet(`content/${slug}/story.yaml`);
  const storyFm = parseYaml(storyYamlText) as StoryYaml;

  const flagsText = await githubGet(`content/${slug}/flags.yaml`);
  const flagsParsed = parseYaml(flagsText);
  const flagDefs = normalizeFlags(flagsParsed);

  const bibleEntries: Array<{ frontmatter: BibleFrontmatter; body: string }> = [];
  try {
    const bibleDir = await githubGetDir(`content/${slug}/bible`);
    for (const entry of bibleDir) {
      if (entry.type === "file" && entry.name.endsWith(".md")) {
        const content = await githubGet(entry.path);
        const { frontmatter, body } = extractFrontmatter(content);
        bibleEntries.push({ frontmatter: frontmatter as unknown as BibleFrontmatter, body: body.trim() });
      }
    }
  } catch {
    // bible dir might not exist
  }

  const scenesDir = await githubGetDir(`content/${slug}/scenes`);
  const sceneData: Array<{ frontmatter: SceneFrontmatter; chapters: Array<{ title: string; body: string; when: Record<string, unknown> }> }> = [];
  for (const entry of scenesDir) {
    if (entry.type === "file" && entry.name.endsWith(".md")) {
      const content = await githubGet(entry.path);
      const { frontmatter, body } = extractFrontmatter(content);
      const fm = normalizeScene(frontmatter);
      const chapters = parseChapters(body);
      sceneData.push({ frontmatter: fm, chapters });
    }
  }

  const sceneKeys = new Set(sceneData.map((s) => s.frontmatter.key));

  const hasEnding = sceneData.some((s) => s.frontmatter.is_ending === true);
  if (!hasEnding) {
    errors.push("No scene has is_ending: true — at least one ending is required.");
  }

  if (storyFm.start_scene && !sceneKeys.has(storyFm.start_scene)) {
    errors.push(`story.yaml start_scene "${storyFm.start_scene}" does not match any scene key.`);
  }

  const declaredFlags = new Set(flagDefs.map((f) => f.key));
  for (const scene of sceneData) {
    for (const choice of scene.frontmatter.choices) {
      if (!choice.to || !sceneKeys.has(choice.to)) {
        errors.push(`Scene "${scene.frontmatter.key}" has choice "${choice.key}" with to: "${choice.to}" which does not exist as a scene.`);
      }
    }
  }

  for (const scene of sceneData) {
    for (const rf of scene.frontmatter.reads_flags) {
      if (!declaredFlags.has(rf)) {
        errors.push(`Scene "${scene.frontmatter.key}" reads_flags references "${rf}" which is not declared in flags.yaml.`);
      }
    }
    for (const choice of scene.frontmatter.choices) {
      for (const flagKey of Object.keys(choice.sets)) {
        if (flagKey === "_new_timeline") continue;
        if (!declaredFlags.has(flagKey)) {
          errors.push(`Scene "${scene.frontmatter.key}" choice "${choice.key}" sets undeclared flag "${flagKey}".`);
        }
      }
      for (const flagKey of Object.keys(choice.requires)) {
        if (flagKey === "timeline" || flagKey === "timeline_gte") continue;
        if (!declaredFlags.has(flagKey)) {
          errors.push(`Scene "${scene.frontmatter.key}" choice "${choice.key}" requires undeclared flag "${flagKey}".`);
        }
      }
    }
    for (const variant of scene.frontmatter.variants) {
      for (const flagKey of Object.keys(variant.when)) {
        if (flagKey === "timeline" || flagKey === "timeline_gte") continue;
        if (!declaredFlags.has(flagKey)) {
          errors.push(`Scene "${scene.frontmatter.key}" variant for slot "${variant.slot}" references undeclared flag "${flagKey}" in when.`);
        }
      }
    }
  }

  for (const scene of sceneData) {
    const allSlots = new Set<string>();
    for (const ch of scene.chapters) {
      for (const flagKey of Object.keys(ch.when)) {
        if (flagKey === "timeline" || flagKey === "timeline_gte") continue;
        if (!declaredFlags.has(flagKey)) {
          errors.push(`Scene "${scene.frontmatter.key}" chapter "${ch.title}" has when condition referencing undeclared flag "${flagKey}".`);
        }
      }
      for (const slot of extractSlots(ch.body)) {
        allSlots.add(slot);
      }
    }
    for (const slot of allSlots) {
      const hasDefault = scene.frontmatter.variants.some((v) => v.slot === slot && Object.keys(v.when).length === 0);
      if (!hasDefault) {
        errors.push(`Scene "${scene.frontmatter.key}" uses slot "{{${slot}}}" but no variant has when: {} as a default.`);
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const commitSha = await getCommitSha();

  const { error: storyErr } = await supabase.from("stories").upsert({
    slug,
    title: storyFm.title,
    blurb: storyFm.blurb,
    status: storyFm.status,
    start_scene: storyFm.start_scene ?? null,
    settings: storyFm.settings,
    synced_commit: commitSha,
    synced_at: new Date().toISOString(),
  });
  if (storyErr) errors.push(`DB error upserting story: ${storyErr.message}`);

  await supabase.from("chapters").delete().eq("story_slug", slug);
  await supabase.from("variants").delete().eq("story_slug", slug);
  await supabase.from("choices").delete().eq("story_slug", slug);
  await supabase.from("scenes").delete().eq("story_slug", slug);
  await supabase.from("flags").delete().eq("story_slug", slug);
  await supabase.from("bible_entries").delete().eq("story_slug", slug);

  for (const flag of flagDefs) {
    await supabase.from("flags").insert({
      story_slug: slug,
      key: flag.key,
      type: flag.type,
      allowed_values: flag.allowed_values,
      description: flag.description,
    });
  }

  for (const entry of bibleEntries) {
    await supabase.from("bible_entries").insert({
      story_slug: slug,
      kind: entry.frontmatter.kind,
      key: entry.frontmatter.key,
      name: entry.frontmatter.name,
      body: entry.body,
    });
  }

  for (const scene of sceneData) {
    const fm = scene.frontmatter;
    await supabase.from("scenes").insert({
      story_slug: slug,
      key: fm.key,
      title: fm.title,
      act: fm.act,
      slug: fm.slug ?? null,
      is_bottleneck: fm.is_bottleneck,
      is_ending: fm.is_ending,
      reads_flags: fm.reads_flags,
      map_x: fm.map.x,
      map_y: fm.map.y,
    });

    for (let pos = 0; pos < scene.chapters.length; pos++) {
      await supabase.from("chapters").insert({
        story_slug: slug,
        scene_key: fm.key,
        position: pos,
        title: scene.chapters[pos].title,
        body: scene.chapters[pos].body,
        when: scene.chapters[pos].when,
      });
    }

    for (const variant of fm.variants) {
      await supabase.from("variants").insert({
        story_slug: slug,
        scene_key: fm.key,
        slot: variant.slot,
        when: variant.when,
        text: variant.text,
        priority: variant.priority,
      });
    }

    for (let pos = 0; pos < fm.choices.length; pos++) {
      const choice = fm.choices[pos];
      await supabase.from("choices").insert({
        story_slug: slug,
        scene_key: fm.key,
        key: choice.key,
        label: choice.label,
        to_scene_key: choice.to,
        position: pos,
        sets: choice.sets,
        requires: choice.requires,
      });
    }
  }

  return { ok: errors.length === 0, errors };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { story_slug, ran_by } = await req.json();
    const targetSlug: string | "all" = story_slug ?? "all";

    if (!GITHUB_TOKEN || !GITHUB_REPO) {
      return new Response(JSON.stringify({ error: "GITHUB_TOKEN or GITHUB_REPO not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    let slugs: string[] = [];
    if (targetSlug === "all") {
      const contentDir = await githubGetDir("content");
      slugs = contentDir.filter((e) => e.type === "dir").map((e) => e.name);
    } else {
      slugs = [targetSlug];
    }

    const results: Array<{ slug: string; ok: boolean; errors: string[] }> = [];
    let allOk = true;

    for (const slug of slugs) {
      try {
        const result = await syncStory(slug, supabase);
        results.push({ slug, ...result });

        await supabase.from("sync_runs").insert({
          story_slug: slug,
          commit_sha: await getCommitSha(),
          ran_by: ran_by ?? null,
          result: result.ok ? "ok" : "failed",
          errors: result.errors,
        });

        if (!result.ok) allOk = false;
      } catch (e) {
        const errs = [String(e.message || e)];
        results.push({ slug, ok: false, errors: errs });
        allOk = false;
        await supabase.from("sync_runs").insert({
          story_slug: slug,
          ran_by: ran_by ?? null,
          result: "failed",
          errors: errs,
        });
      }
    }

    return new Response(JSON.stringify({ ok: allOk, results }), {
      status: allOk ? 200 : 422,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
