import { useEffect, useMemo, useState } from "react";
import {
  BookOpen, Check, Clapperboard, Eye, FileUp, GitCompare, Headphones, Loader2, MessageSquarePlus, MousePointerClick,
  Pencil, Plus, Settings2, Star, Trash2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "@/lib/router";
import {
  createVersion, FORMAT_LABEL, fmtDate, isProse, makeCurrent, splitIntoSections, stripTitlePage, words,
  type Format, type Version, type Work,
} from "@/lib/works";

const FORMAT_ORDER = ["novel", "novella", "short", "screenplay", "treatment", "webtoon", "other"];

export function VersionsPanel({ work, versions, staff, onChanged }: { work: Work; versions: Version[]; staff: boolean; onChanged: () => void }) {
  const { navigate } = useRouter();
  const [adding, setAdding] = useState(false);
  const [settings, setSettings] = useState(false);
  const formats = useMemo(() => {
    const fs = Array.from(new Set(versions.map((v) => v.format)));
    return fs.sort((a, b) => FORMAT_ORDER.indexOf(a) - FORMAT_ORDER.indexOf(b));
  }, [versions]);

  return (
    <div className="space-y-6">
      {staff && (
        <div className="flex flex-wrap gap-2 justify-end">
          <button onClick={() => setSettings((s) => !s)} className="btn-ghost !py-2"><Settings2 size={16} /> Work settings</button>
          <button onClick={() => setAdding((a) => !a)} className="btn-primary !py-2 !px-4"><Plus size={16} /> Add a version</button>
        </div>
      )}
      {settings && <WorkSettings work={work} onDone={() => { setSettings(false); onChanged(); }} />}
      {adding && <AddVersion work={work} versions={versions} onDone={(id) => { setAdding(false); onChanged(); if (id) navigate(`/work/${work.slug}/v/${id}`); }} />}

      {work.links.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {work.links.map((l) => (
            <a key={l.href} href={l.href} onClick={(e) => { e.preventDefault(); navigate(l.href); }}
              className="card card-hover p-4 flex items-center gap-3 font-sans">
              {l.format === "listening" ? <Headphones size={20} className="text-accent-500" /> : <MousePointerClick size={20} className="text-accent-500" />}
              <div>
                <div className="text-sm font-medium text-ink-800 dark:text-ink-100">{l.label}</div>
                <div className="text-xs text-ink-500">{l.format === "listening" ? "Narrated, chapter by chapter (the Studio draft)" : "Lives on the site"}</div>
              </div>
            </a>
          ))}
        </div>
      )}

      {formats.length === 0 && (
        <div className="card p-8 text-center text-ink-500 font-sans">
          No versions yet.{staff ? " Add one: paste or upload a manuscript, a .fountain screenplay or a Word file." : ""}
        </div>
      )}

      {formats.map((f) => {
        const list = versions.filter((v) => v.format === f);
        return (
          <section key={f} className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-ink-200 dark:border-ink-800 flex items-center gap-2 font-sans">
              {f === "screenplay" ? <Clapperboard size={18} className="text-accent-500" /> : <BookOpen size={18} className="text-accent-500" />}
              <h2 className="font-medium text-ink-900 dark:text-ink-50">{FORMAT_LABEL[f] ?? f}</h2>
              <span className="text-xs text-ink-500">{list.length} version{list.length > 1 ? "s" : ""}</span>
            </div>
            <ul className="divide-y divide-ink-200 dark:divide-ink-800">
              {list.map((v) => <VersionRow key={v.id} work={work} v={v} list={list} staff={staff} onChanged={onChanged} />)}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function VersionRow({ work, v, list, staff, onChanged }: { work: Work; v: Version; list: Version[]; staff: boolean; onChanged: () => void }) {
  const { navigate } = useRouter();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(v.label);
  const [notes, setNotes] = useState(v.notes);
  const other = list.find((x) => x.id !== v.id && x.lang === v.lang);
  const size = v.format === "screenplay" ? `~${Math.max(1, Math.round(v.word_count / 180))} pages` : `${v.word_count.toLocaleString()} words`;

  const save = async () => {
    await supabase.from("work_versions").update({ label: label.trim() || v.label, notes }).eq("id", v.id);
    setEditing(false); onChanged();
  };
  const remove = async () => {
    if (!window.confirm(`Delete "${v.label}"? Its text and any review rounds on it are deleted too. This can't be undone.`)) return;
    await supabase.from("work_versions").delete().eq("id", v.id);
    onChanged();
  };
  const togglePublic = async () => { await supabase.from("work_versions").update({ public: !v.public }).eq("id", v.id); onChanged(); };

  return (
    <li className="px-5 py-4 font-sans">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[220px]">
          {editing ? (
            <div className="space-y-2">
              <input className="input-field !py-2" value={label} onChange={(e) => setLabel(e.target.value)} />
              <textarea className="input-field !py-2 text-sm" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What changed in this version" />
              <div className="flex gap-2"><button onClick={save} className="btn-primary !py-1.5 !px-3"><Check size={14} /> Save</button><button onClick={() => setEditing(false)} className="btn-ghost !py-1.5">Cancel</button></div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => navigate(`/work/${work.slug}/v/${v.id}`)} className="text-ink-900 dark:text-ink-50 font-medium hover:underline text-left">{v.label}</button>
                {v.status === "current" && <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent-500/15 text-accent-700 dark:text-accent-300 inline-flex items-center gap-1"><Star size={10} /> Current</span>}
                {v.status === "archived" && <span className="text-[11px] px-2 py-0.5 rounded-full bg-ink-200 dark:bg-ink-800 text-ink-500">Archived</span>}
                {v.lang !== "en" && <span className="text-[11px] px-2 py-0.5 rounded-full border border-ink-200 dark:border-ink-700 text-ink-500">{v.lang === "ko" ? "한국어" : v.lang}</span>}
                {v.public && <span className="text-[11px] px-2 py-0.5 rounded-full border border-emerald-500/40 text-emerald-600">Public</span>}
              </div>
              <div className="text-xs text-ink-500 mt-1">{fmtDate(v.created_at)} · {size}</div>
              {v.notes && <p className="text-sm text-ink-600 dark:text-ink-300 mt-1.5">{v.notes}</p>}
            </>
          )}
        </div>
        {!editing && (
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => navigate(`/work/${work.slug}/v/${v.id}`)} className="btn-secondary !py-1.5 !px-3"><Eye size={14} /> Read</button>
            {other && <button onClick={() => navigate(`/work/${work.slug}/compare/${other.id}/${v.id}`)} className="btn-ghost !py-1.5 !px-2.5" title={`What changed since "${other.label}"`}><GitCompare size={14} /> Compare</button>}
            {staff && <button onClick={() => navigate(`/work/${work.slug}/reviews?version=${v.id}`)} className="btn-ghost !py-1.5 !px-2.5"><MessageSquarePlus size={14} /> Review</button>}
            {staff && (
              <details className="relative">
                <summary className="btn-ghost !py-1.5 !px-2.5 list-none cursor-pointer">⋯</summary>
                <div className="absolute right-0 z-20 mt-1 w-48 card p-1 shadow-lg text-sm">
                  {v.status !== "current" && <button onClick={async () => { await makeCurrent(v); onChanged(); }} className="w-full text-left px-3 py-2 rounded hover:bg-ink-100 dark:hover:bg-ink-800 flex items-center gap-2"><Star size={14} /> Make current</button>}
                  {v.status !== "archived" && <button onClick={async () => { await supabase.from("work_versions").update({ status: "archived" }).eq("id", v.id); onChanged(); }} className="w-full text-left px-3 py-2 rounded hover:bg-ink-100 dark:hover:bg-ink-800">Archive</button>}
                  <button onClick={() => setEditing(true)} className="w-full text-left px-3 py-2 rounded hover:bg-ink-100 dark:hover:bg-ink-800 flex items-center gap-2"><Pencil size={14} /> Rename / notes</button>
                  <button onClick={togglePublic} className="w-full text-left px-3 py-2 rounded hover:bg-ink-100 dark:hover:bg-ink-800">{v.public ? "Make private" : "Make public"}</button>
                  <button onClick={remove} className="w-full text-left px-3 py-2 rounded hover:bg-ink-100 dark:hover:bg-ink-800 text-error-600 flex items-center gap-2"><Trash2 size={14} /> Delete</button>
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

// ── Adding a version ─────────────────────────────────────────────────────

type Source = "file" | "draft";

function AddVersion({ work, versions, onDone }: { work: Work; versions: Version[]; onDone: (id: string | null) => void }) {
  const [format, setFormat] = useState<Format>(versions[0]?.format ?? "novella");
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [lang, setLang] = useState("en");
  const [source, setSource] = useState<Source>("file");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [drafts, setDrafts] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [current, setCurrent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("book_docs").select("story_slug").eq("kind", "sample").then(({ data }) => {
      const s = Array.from(new Set(((data as Array<{ story_slug: string }>) ?? []).map((d) => d.story_slug)));
      setDrafts(s); setDraft((d) => d || s.find((x) => x.includes(work.slug.split("-")[0])) || s[0] || "");
    });
  }, [work.slug]);

  const readFile = async (f: File) => {
    setErr(null); setFileName(f.name);
    if (!label) setLabel(f.name.replace(/\.[^.]+$/, ""));
    if (/\.fountain$/i.test(f.name)) setFormat("screenplay");
    try {
      if (/\.docx$/i.test(f.name)) setText(await docxToMarkdown(f));
      else if (/\.(fountain|md|markdown|txt)$/i.test(f.name)) setText(await f.text());
      else setErr("Use a .docx, .fountain, .md or .txt file. (For a PDF, export the .fountain or Word file instead.)");
    } catch (e) { setErr(`Couldn't read that file: ${(e as Error).message}`); }
  };

  const sections = useMemo(() => {
    if (source !== "file") return [];
    const body = format === "screenplay" ? stripTitlePage(text).body : text;
    return splitIntoSections(body, format);
  }, [text, format, source]);

  const save = async () => {
    if (!label.trim()) { setErr("Give the version a name, e.g. \"v10\" or \"After sister's notes\"."); return; }
    setBusy(true); setErr(null);
    try {
      let secs = sections;
      let src = fileName ? `file:${fileName}` : "pasted";
      if (source === "draft") {
        const { data } = await supabase.from("book_docs").select("position, title_en, title_ko, body_en, body_ko, generating")
          .eq("story_slug", draft).eq("kind", "sample").order("position");
        const rows = ((data as Array<{ position: number; title_en: string; title_ko: string; body_en: string; body_ko: string; generating: boolean }>) ?? [])
          .filter((r) => !r.generating && (lang === "ko" ? r.body_ko : r.body_en)?.trim());
        secs = rows.map((r) => ({ title: (lang === "ko" ? r.title_ko || r.title_en : r.title_en || r.title_ko) || `Chapter ${r.position}`, body: lang === "ko" ? r.body_ko : r.body_en }));
        src = `book_docs:${draft}:${lang}`;
      }
      if (!secs.length) throw new Error("There's no text to save.");
      const v = await createVersion({ work_slug: work.slug, format, label: label.trim(), notes, lang, source: src, status: "draft" }, secs);
      if (current) await makeCurrent(v);
      onDone(v.id);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <div className="card p-5 space-y-4 font-sans">
      <h3 className="font-medium text-ink-900 dark:text-ink-50">Add a version</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm text-ink-600 dark:text-ink-300 space-y-1">
          <span>Format</span>
          <select className="input-field !py-2" value={format} onChange={(e) => setFormat(e.target.value as Format)}>
            {FORMAT_ORDER.map((f) => <option key={f} value={f}>{FORMAT_LABEL[f]}</option>)}
          </select>
        </label>
        <label className="text-sm text-ink-600 dark:text-ink-300 space-y-1 sm:col-span-2">
          <span>Name</span>
          <input className="input-field !py-2" placeholder={format === "screenplay" ? "v9" : "After sister's notes"} value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
      </div>
      <textarea className="input-field !py-2 text-sm" rows={2} placeholder="What changed in this version (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />

      <div className="inline-flex rounded-lg border border-ink-200 dark:border-ink-700 overflow-hidden text-sm">
        <button onClick={() => setSource("file")} className={`px-4 py-2 ${source === "file" ? "bg-accent-500 text-white" : "text-ink-600 dark:text-ink-300"}`}>Upload or paste</button>
        <button onClick={() => setSource("draft")} className={`px-4 py-2 ${source === "draft" ? "bg-accent-500 text-white" : "text-ink-600 dark:text-ink-300"}`}>Copy the Studio draft</button>
      </div>

      {source === "file" ? (
        <div className="space-y-3">
          <label className="flex items-center justify-center gap-2 border-2 border-dashed border-ink-300 dark:border-ink-700 rounded-lg p-5 cursor-pointer hover:border-accent-400 text-sm text-ink-600 dark:text-ink-300">
            <FileUp size={18} /> {fileName || "Choose a .docx, .fountain, .md or .txt file"}
            <input type="file" accept=".docx,.fountain,.md,.markdown,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
          </label>
          <textarea className="input-field font-mono text-xs" rows={8} placeholder={isProse(format) ? "…or paste the manuscript. Start each chapter with a line like: # Chapter 1: Title" : "…or paste the Fountain text. Act headings like # Act One become sections."}
            value={text} onChange={(e) => setText(e.target.value)} />
          {sections.length > 0 && (
            <div className="text-xs text-ink-500">
              {sections.length} section{sections.length > 1 ? "s" : ""}, {sections.reduce((n, s) => n + words(s.body), 0).toLocaleString()} words:{" "}
              {sections.slice(0, 8).map((s) => s.title).join(" · ")}{sections.length > 8 ? " …" : ""}
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-ink-600 dark:text-ink-300 space-y-1">
            <span>Studio book</span>
            <select className="input-field !py-2" value={draft} onChange={(e) => setDraft(e.target.value)}>
              {drafts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="text-sm text-ink-600 dark:text-ink-300 space-y-1">
            <span>Language</span>
            <select className="input-field !py-2" value={lang} onChange={(e) => setLang(e.target.value)}>
              <option value="en">English</option><option value="ko">한국어</option>
            </select>
          </label>
          <p className="text-xs text-ink-500 sm:col-span-2">Freezes the chapters as they are in Studio &gt; Book right now. Later edits in Studio don't change this version.</p>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-ink-600 dark:text-ink-300">
        <input type="checkbox" checked={current} onChange={(e) => setCurrent(e.target.checked)} /> Make this the current {FORMAT_LABEL[format].toLowerCase()} version
      </label>
      {err && <p className="text-sm text-error-600">{err}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={busy} className="btn-primary !py-2">{busy && <Loader2 size={14} className="animate-spin" />} Save version</button>
        <button onClick={() => onDone(null)} className="btn-ghost">Cancel</button>
      </div>
    </div>
  );
}

/** Word file → markdown: headings become "# ", italics and bold are kept. */
async function docxToMarkdown(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  const doc = new DOMParser().parseFromString(value, "text/html");
  const inline = (el: Node): string => Array.from(el.childNodes).map((n) => {
    if (n.nodeType === Node.TEXT_NODE) return n.textContent ?? "";
    const tag = (n as Element).tagName?.toLowerCase();
    const inner = inline(n);
    if (!inner.trim()) return inner;
    if (tag === "em" || tag === "i") return `*${inner}*`;
    if (tag === "strong" || tag === "b") return `**${inner}**`;
    if (tag === "br") return " ";
    return inner;
  }).join("");
  const out: string[] = [];
  for (const el of Array.from(doc.body.children)) {
    const tag = el.tagName.toLowerCase();
    const t = inline(el).replace(/\s+/g, " ").trim();
    if (!t) continue;
    if (tag === "h1" || (tag === "h2" && /^chapter\b/i.test(t))) out.push(`# ${t.replace(/\*+/g, "")}`);
    else if (/^h[2-6]$/.test(tag)) out.push(`### ${t.replace(/\*+/g, "")}`);
    else if (tag === "ul" || tag === "ol") for (const li of Array.from(el.querySelectorAll("li"))) out.push(`- ${inline(li).trim()}`);
    else if (/^chapter\s+\w+/i.test(t) && t.length < 80 && !out.length) out.push(`# ${t}`);
    else if (/^chapter\s+\w+/i.test(t) && t.length < 80) out.push(`# ${t}`);
    else out.push(t);
  }
  return out.join("\n\n");
}

// ── Work settings ───────────────────────────────────────────────────────

function WorkSettings({ work, onDone }: { work: Work; onDone: () => void }) {
  const [title, setTitle] = useState(work.title);
  const [logline, setLogline] = useState(work.logline);
  const [blurb, setBlurb] = useState(work.blurb);
  const [color, setColor] = useState(work.accent_color);
  const [vis, setVis] = useState(work.visibility);
  const [links, setLinks] = useState(work.links.map((l) => `${l.format} | ${l.label} | ${l.href}`).join("\n"));
  const save = async () => {
    const parsed = links.split("\n").map((l) => l.split("|").map((x) => x.trim())).filter((p) => p.length === 3 && p[2])
      .map(([format, label, href]) => ({ format, label, href }));
    await supabase.from("works").update({ title, logline, blurb, accent_color: color, visibility: vis, links: parsed, updated_at: new Date().toISOString() }).eq("slug", work.slug);
    onDone();
  };
  return (
    <div className="card p-5 space-y-3 font-sans text-sm">
      <input className="input-field !py-2" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
      <textarea className="input-field !py-2" rows={2} value={logline} onChange={(e) => setLogline(e.target.value)} placeholder="Logline" />
      <textarea className="input-field !py-2" rows={2} value={blurb} onChange={(e) => setBlurb(e.target.value)} placeholder="Short blurb for the Library" />
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">Color <input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label>
        <label className="flex items-center gap-2">
          <select className="input-field !py-1.5 !w-auto" value={vis} onChange={(e) => setVis(e.target.value as Work["visibility"])}>
            <option value="private">Private (only you)</option><option value="public">Public in the Library</option>
          </select>
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-ink-500">Links to formats elsewhere on the site, one per line: format | label | /path</span>
        <textarea className="input-field !py-2 font-mono text-xs" rows={3} value={links} onChange={(e) => setLinks(e.target.value)} />
      </label>
      <div className="flex gap-2"><button onClick={save} className="btn-primary !py-2">Save</button><button onClick={onDone} className="btn-ghost">Cancel</button></div>
    </div>
  );
}
