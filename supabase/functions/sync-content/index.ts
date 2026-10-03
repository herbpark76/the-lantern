import { createClient } from "npm:@supabase/supabase-js@2.57.4";

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
  settings: {
    timelines: boolean;
    crowd_split: boolean;
    map: "fog" | "full" | "off";
    accent_color: string;
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

// Simple YAML-ish parser for frontmatter blocks.
// Handles key: value, nested objects, arrays of objects, and multiline strings (|-, |).
function parseFrontmatter(yamlText: string): Record<string, unknown> {
  const lines = yamlText.split("\n");
  const result: Record<string, unknown> = {};
  let i = 0;

  function parseValue(val: string): unknown {
    const trimmed = val.trim();
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
    if (trimmed === "" ) return "";
    if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10);
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      const inner = trimmed.slice(1, -1).trim();
      if (!inner) return [];
      return inner.split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""));
    }
    return trimmed.replace(/^["']|["']$/g, "");
  }

  function parseBlock(indent: number): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === "") { i++; continue; }
      const lineIndent = line.length - line.trimStart().length;
      if (lineIndent < indent) break;
      if (lineIndent > indent) { i++; continue; }

      const trimmed = line.trim();
      if (trimmed.startsWith("- ")) {
        // Array element — handled by parseArray
        break;
      }

      const colonIdx = trimmed.indexOf(":");
      if (colonIdx === -1) { i++; continue; }
      const key = trimmed.slice(0, colonIdx).trim();
      const valPart = trimmed.slice(colonIdx + 1).trim();

      if (valPart === "") {
        // Could be nested object or array
        i++;
        // Peek ahead
        if (i < lines.length) {
          const nextLine = lines[i];
          const nextIndent = nextLine.length - nextLine.trimStart().length;
          if (nextIndent > lineIndent) {
            if (nextLine.trim().startsWith("- ")) {
              obj[key] = parseArray(lineIndent + 2);
            } else {
              obj[key] = parseBlock(lineIndent + 2);
            }
          } else {
            obj[key] = "";
          }
        } else {
          obj[key] = "";
        }
      } else if (valPart === "|" || valPart === "|-" || valPart === ">") {
        const stripDash = valPart === "|-";
        i++;
        const textLines: string[] = [];
        const blockIndent = i < lines.length ? (lines[i].length - lines[i].trimStart().length) : 0;
        while (i < lines.length) {
          const bl = lines[i];
          if (bl.trim() === "") { textLines.push(""); i++; continue; }
          const blIndent = bl.length - bl.trimStart().length;
          if (blIndent < blockIndent && bl.trim() !== "") break;
          textLines.push(bl.slice(blockIndent));
          i++;
        }
        if (stripDash) {
          while (textLines.length > 0 && textLines[textLines.length - 1] === "") textLines.pop();
        }
        obj[key] = textLines.join("\n");
      } else {
        obj[key] = parseValue(valPart);
        i++;
      }
    }
    return obj;
  }

  function parseArray(indent: number): Array<Record<string, unknown>> {
    const arr: Array<Record<string, unknown>> = [];
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === "") { i++; continue; }
      const lineIndent = line.length - line.trimStart().length;
      if (lineIndent < indent - 2) break;
      if (lineIndent > indent) { i++; continue; }

      const trimmed = line.trim();
      if (!trimmed.startsWith("- ")) break;

      const elementContent = trimmed.slice(2);
      i++;

      if (elementContent.includes(":")) {
        // It's an object starting on the - line
        const colonIdx = elementContent.indexOf(":");
        const firstKey = elementContent.slice(0, colonIdx).trim();
        const firstVal = elementContent.slice(colonIdx + 1).trim();

        const obj: Record<string, unknown> = {};
        if (firstVal === "" ) {
          // Nested — look ahead
          if (i < lines.length) {
            const nextLine = lines[i];
            const nextIndent = nextLine.length - nextLine.trimStart().length;
            if (nextIndent > lineIndent) {
              if (nextLine.trim().startsWith("- ")) {
                obj[firstKey] = parseArray(nextIndent + 2);
              } else {
                obj[firstKey] = parseBlock(nextIndent);
              }
            } else {
              obj[firstKey] = "";
            }
          } else {
            obj[firstKey] = "";
          }
        } else if (firstVal === "|" || firstVal === "|-" || firstVal === ">") {
          const stripDash = firstVal === "|-";
          i++;
          const textLines: string[] = [];
          const blockIndent = i < lines.length ? (lines[i].length - lines[i].trimStart().length) : 0;
          while (i < lines.length) {
            const bl = lines[i];
            if (bl.trim() === "") { textLines.push(""); i++; continue; }
            const blIndent = bl.length - bl.trimStart().length;
            if (blIndent < blockIndent && bl.trim() !== "") break;
            textLines.push(bl.slice(blockIndent));
            i++;
          }
          if (stripDash) {
            while (textLines.length > 0 && textLines[textLines.length - 1] === "") textLines.pop();
          }
          obj[firstKey] = textLines.join("\n");
        } else {
          obj[firstKey] = parseValue(firstVal);
        }

        // Continue parsing remaining keys at the same indent
        while (i < lines.length) {
          const contLine = lines[i];
          if (contLine.trim() === "") { i++; continue; }
          const contIndent = contLine.length - contLine.trimStart().length;
          if (contIndent < lineIndent) break;
          if (contIndent > lineIndent) { i++; continue; }
          if (contLine.trim().startsWith("- ")) break;

          const cTrimmed = contLine.trim();
          const cColonIdx = cTrimmed.indexOf(":");
          if (cColonIdx === -1) { i++; continue; }
          const cKey = cTrimmed.slice(0, cColonIdx).trim();
          const cVal = cTrimmed.slice(cColonIdx + 1).trim();

          if (cVal === "") {
            i++;
            if (i < lines.length) {
              const nextLine = lines[i];
              const nextIndent = nextLine.length - nextLine.trimStart().length;
              if (nextIndent > contIndent) {
                if (nextLine.trim().startsWith("- ")) {
                  obj[cKey] = parseArray(nextIndent + 2);
                } else {
                  obj[cKey] = parseBlock(nextIndent);
                }
              } else {
                obj[cKey] = "";
              }
            } else {
              obj[cKey] = "";
            }
          } else if (cVal === "|" || cVal === "|-" || cVal === ">") {
            const stripDash = cVal === "|-";
            i++;
            const textLines: string[] = [];
            const blockIndent = i < lines.length ? (lines[i].length - lines[i].trimStart().length) : 0;
            while (i < lines.length) {
              const bl = lines[i];
              if (bl.trim() === "") { textLines.push(""); i++; continue; }
              const blIndent = bl.length - bl.trimStart().length;
              if (blIndent < blockIndent && bl.trim() !== "") break;
              textLines.push(bl.slice(blockIndent));
              i++;
            }
            if (stripDash) {
              while (textLines.length > 0 && textLines[textLines.length - 1] === "") textLines.pop();
            }
            obj[cKey] = textLines.join("\n");
          } else {
            obj[cKey] = parseValue(cVal);
            i++;
          }
        }

        arr.push(obj);
      } else {
        // Simple scalar array element
        arr.push({ value: parseValue(elementContent) });
      }
    }
    return arr;
  }

  return parseBlock(0);
}

function extractFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) {
    return { frontmatter: {}, body: content };
  }
  return { frontmatter: parseFrontmatter(fmMatch[1]), body: fmMatch[2] };
}

function parseChapters(body: string): Array<{ title: string; body: string }> {
  const chapters: Array<{ title: string; body: string }> = [];
  const chapterRegex = /^## (.+)$/gm;
  const matches: Array<{ title: string; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = chapterRegex.exec(body)) !== null) {
    matches.push({ title: m[1].trim(), index: m.index + m[0].length });
  }
  if (matches.length === 0) {
    return [{ title: "", body: body.trim() }];
  }
  for (let idx = 0; idx < matches.length; idx++) {
    const start = matches[idx].index;
    const end = idx + 1 < matches.length ? matches[idx + 1].index - matches[idx + 1].title.length - 4 : body.length;
    const chapterBody = body.slice(start, end).trim();
    chapters.push({ title: matches[idx].title, body: chapterBody });
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

  // Fetch story.yaml
  const storyYamlText = await githubGet(`content/${slug}/story.yaml`);
  const storyFm = parseFrontmatter(storyYamlText) as unknown as StoryYaml;

  // Fetch flags.yaml
  const flagsText = await githubGet(`content/${slug}/flags.yaml`);
  const flagsParsed = parseFrontmatter(flagsText);
  const flagDefs = (Array.isArray(flagsParsed) ? flagsParsed : [flagsParsed]) as FlagDef[];

  // Fetch bible entries
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
  } catch (e) {
    // bible dir might not exist
  }

  // Fetch scenes
  const scenesDir = await githubGetDir(`content/${slug}/scenes`);
  const sceneData: Array<{ frontmatter: SceneFrontmatter; chapters: Array<{ title: string; body: string }> }> = [];
  for (const entry of scenesDir) {
    if (entry.type === "file" && entry.name.endsWith(".md")) {
      const content = await githubGet(entry.path);
      const { frontmatter, body } = extractFrontmatter(content);
      const fm = frontmatter as unknown as SceneFrontmatter;
      const chapters = parseChapters(body);
      sceneData.push({ frontmatter: fm, chapters });
    }
  }

  // === VALIDATION ===

  // Collect all scene keys
  const sceneKeys = new Set(sceneData.map((s) => s.frontmatter.key));

  // Check: at least one ending
  const hasEnding = sceneData.some((s) => s.frontmatter.is_ending === true);
  if (!hasEnding) {
    errors.push("No scene has is_ending: true — at least one ending is required.");
  }

  // Check: every choice 'to' exists as a scene
  const declaredFlags = new Set(flagDefs.map((f) => f.key));
  for (const scene of sceneData) {
    const choices = scene.frontmatter.choices || [];
    for (const choice of choices) {
      if (!sceneKeys.has(choice.to)) {
        errors.push(`Scene "${scene.frontmatter.key}" has choice "${choice.key}" with to: "${choice.to}" which does not exist as a scene.`);
      }
    }
  }

  // Check: every flag used is declared
  for (const scene of sceneData) {
    for (const rf of scene.frontmatter.reads_flags || []) {
      if (!declaredFlags.has(rf)) {
        errors.push(`Scene "${scene.frontmatter.key}" reads_flags references "${rf}" which is not declared in flags.yaml.`);
      }
    }
    for (const choice of scene.frontmatter.choices || []) {
      for (const flagKey of Object.keys(choice.sets || {})) {
        if (flagKey === "_new_timeline") continue;
        if (!declaredFlags.has(flagKey)) {
          errors.push(`Scene "${scene.frontmatter.key}" choice "${choice.key}" sets undeclared flag "${flagKey}".`);
        }
      }
      for (const flagKey of Object.keys(choice.requires || {})) {
        if (flagKey === "timeline" || flagKey === "timeline_gte") continue;
        if (!declaredFlags.has(flagKey)) {
          errors.push(`Scene "${scene.frontmatter.key}" choice "${choice.key}" requires undeclared flag "${flagKey}".`);
        }
      }
    }
    for (const variant of scene.frontmatter.variants || []) {
      for (const flagKey of Object.keys(variant.when || {})) {
        if (flagKey === "timeline" || flagKey === "timeline_gte") continue;
        if (!declaredFlags.has(flagKey)) {
          errors.push(`Scene "${scene.frontmatter.key}" variant for slot "${variant.slot}" references undeclared flag "${flagKey}" in when.`);
        }
      }
    }
  }

  // Check: every slot used in a chapter has a variant with when: {}
  for (const scene of sceneData) {
    const allSlots = new Set<string>();
    for (const ch of scene.chapters) {
      for (const slot of extractSlots(ch.body)) {
        allSlots.add(slot);
      }
    }
    const variants = scene.frontmatter.variants || [];
    for (const slot of allSlots) {
      const hasDefault = variants.some((v) => v.slot === slot && Object.keys(v.when || {}).length === 0);
      if (!hasDefault) {
        errors.push(`Scene "${scene.frontmatter.key}" uses slot "{{${slot}}}" but no variant has when: {} as a default.`);
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // === WRITE TO DATABASE ===
  const commitSha = await getCommitSha();

  // Upsert story
  const { error: storyErr } = await supabase.from("stories").upsert({
    slug,
    title: storyFm.title,
    blurb: storyFm.blurb,
    status: storyFm.status,
    settings: storyFm.settings,
    synced_commit: commitSha,
    synced_at: new Date().toISOString(),
  });
  if (storyErr) errors.push(`DB error upserting story: ${storyErr.message}`);

  // Delete existing content rows
  await supabase.from("chapters").delete().eq("story_slug", slug);
  await supabase.from("variants").delete().eq("story_slug", slug);
  await supabase.from("choices").delete().eq("story_slug", slug);
  await supabase.from("scenes").delete().eq("story_slug", slug);
  await supabase.from("flags").delete().eq("story_slug", slug);
  await supabase.from("bible_entries").delete().eq("story_slug", slug);

  // Insert flags
  for (const flag of flagDefs) {
    await supabase.from("flags").insert({
      story_slug: slug,
      key: flag.key,
      type: flag.type,
      allowed_values: flag.allowed_values ?? [],
      description: flag.description ?? "",
    });
  }

  // Insert bible entries
  for (const entry of bibleEntries) {
    await supabase.from("bible_entries").insert({
      story_slug: slug,
      kind: entry.frontmatter.kind,
      key: entry.frontmatter.key,
      name: entry.frontmatter.name,
      body: entry.body,
    });
  }

  // Insert scenes
  for (const scene of sceneData) {
    const fm = scene.frontmatter;
    await supabase.from("scenes").insert({
      story_slug: slug,
      key: fm.key,
      title: fm.title,
      act: fm.act,
      is_bottleneck: fm.is_bottleneck ?? false,
      is_ending: fm.is_ending ?? false,
      reads_flags: fm.reads_flags ?? [],
      map_x: fm.map?.x ?? null,
      map_y: fm.map?.y ?? null,
    });

    // Insert chapters
    for (let pos = 0; pos < scene.chapters.length; pos++) {
      await supabase.from("chapters").insert({
        story_slug: slug,
        scene_key: fm.key,
        position: pos,
        title: scene.chapters[pos].title,
        body: scene.chapters[pos].body,
      });
    }

    // Insert variants
    for (const variant of fm.variants || []) {
      await supabase.from("variants").insert({
        story_slug: slug,
        scene_key: fm.key,
        slot: variant.slot,
        when: variant.when ?? {},
        text: variant.text,
        priority: variant.priority ?? 0,
      });
    }

    // Insert choices
    for (let pos = 0; pos < (fm.choices || []).length; pos++) {
      const choice = fm.choices[pos];
      await supabase.from("choices").insert({
        story_slug: slug,
        scene_key: fm.key,
        key: choice.key,
        label: choice.label,
        to_scene_key: choice.to,
        position: pos,
        sets: choice.sets ?? {},
        requires: choice.requires ?? {},
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
 
