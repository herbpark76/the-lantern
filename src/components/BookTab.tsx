import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen, ChevronLeft, ChevronRight, FileText, Globe, Headphones, History, Loader2, MessageSquare, Mic, Pause, Play,
  RefreshCw, SkipBack, SkipForward, Sparkles,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { InterviewError, interviewApi, TTS_MODELS } from "@/lib/interview";
import { VoicePicker, useVoices, voiceName } from "@/components/VoicePicker";

// Studio > Book: read a book's sample chapters and session summaries in English or Korean,
// and listen to them narrated (audio made on demand by the `book-audio` edge function).

export type Lang = "en" | "ko";

export interface BookDoc {
  id: string;
  story_slug: string;
  kind: "sample" | "summary";
  position: number;
  title_en: string;
  title_ko: string;
  body_en: string;
  body_ko: string;
  voice_en: string;
  voice_ko: string;
  model_id?: string;
  final_model_id?: string;
  generating?: boolean;
  gen_error?: string | null;
  /** On the story bible: the plan of the whole book. */
  plan?: {
    format?: string; target_words?: number;
    chapters?: Array<{ n: number; title?: string; act?: number; target_words?: number; purpose?: string }>;
  } | null;
  published?: boolean;
  updated_at: string;
}

interface AudioStatus {
  total: number;
  ready: number;
  urls: string[];
  stale?: boolean;
}

async function audioCall(body: Record<string, unknown>): Promise<AudioStatus> {
  const { data, error } = await supabase.functions.invoke("book-audio", { body });
  if (error) {
    let message = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try { message = (await ctx.json())?.error ?? message; } catch { /* keep */ }
    }
    throw new InterviewError(message);
  }
  return data as AudioStatus;
}

interface DocVersion {
  id: string;
  doc_id: string;
  title_en: string;
  title_ko: string;
  body_en: string;
  body_ko: string;
  note: string;
  created_at: string;
}

interface StoryRow {
  slug: string;
  title: string;
  blurb: string;
  status: "draft" | "published";
  settings: { kind?: string } | null;
}

function titleOf(d: { title_en: string; title_ko: string; id: string }, lang: Lang) {
  return (lang === "en" ? d.title_en || d.title_ko : d.title_ko || d.title_en) || d.id;
}

export function BookTab() {
  const [docs, setDocs] = useState<BookDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [slug, setSlug] = useState<string | null>(null);
  const [kind, setKind] = useState<"sample" | "summary">("sample");
  const [docId, setDocId] = useState<string | null>(null);
  const [versions, setVersions] = useState<DocVersion[]>([]);
  const [versionId, setVersionId] = useState<string>("");
  const [story, setStory] = useState<StoryRow | null>(null);
  const [showPublish, setShowPublish] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [lang, setLang] = useState<Lang>(() => {
    try { return (localStorage.getItem("book-lang") as Lang) || "ko"; } catch { return "ko"; }
  });

  const loadDocs = useCallback(async () => {
    const { data } = await supabase.from("book_docs").select("*").order("position");
    const list = (data as BookDoc[]) ?? [];
    setDocs(list);
    setSlug((cur) => cur ?? list[0]?.story_slug ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { loadDocs(); }, [loadDocs]);
  // While a chapter is being written, check back every few seconds.
  const anyGenerating = docs.some((d) => d.generating);
  useEffect(() => {
    if (!anyGenerating) return;
    const t = window.setInterval(loadDocs, 8000);
    return () => window.clearInterval(t);
  }, [anyGenerating, loadDocs]);
  useEffect(() => { try { localStorage.setItem("book-lang", lang); } catch { /* ignore */ } }, [lang]);

  // Only offer "Interview" for books whose interview is the signed-in user's own (not Mom's).
  const [myInterviewSlugs, setMyInterviewSlugs] = useState<string[]>([]);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id;
      if (!uid) return;
      supabase.from("interview_subjects").select("story_slug").eq("user_id", uid)
        .then(({ data: rows }) => setMyInterviewSlugs(((rows as Array<{ story_slug: string }>) ?? []).map((r) => r.story_slug)));
    });
  }, []);

  const loadStory = useCallback(async () => {
    if (!slug) { setStory(null); return; }
    const { data } = await supabase.from("stories").select("slug, title, blurb, status, settings").eq("slug", slug).maybeSingle();
    setStory((data as StoryRow | null) ?? null);
  }, [slug]);
  useEffect(() => { loadStory(); }, [loadStory]);

  const slugs = useMemo(() => Array.from(new Set(docs.map((d) => d.story_slug))), [docs]);
  const ofSlug = docs.filter((d) => d.story_slug === slug);
  const chapters = ofSlug.filter((d) => d.kind === "sample").sort((a, b) => a.position - b.position);
  // Bible / summaries: the living bible first, then the newest session's.
  const summaries = ofSlug.filter((d) => d.kind === "summary")
    .sort((a, b) => (a.id.endsWith("/bible") ? -1 : b.id.endsWith("/bible") ? 1 : b.position - a.position));
  const ofKind = kind === "sample" ? chapters : summaries;
  const doc = ofKind.find((d) => d.id === docId) ?? (kind === "sample" ? ofKind[0] : ofKind[0]) ?? null;

  // Earlier versions of this page (kept whenever a revision rewrites it).
  useEffect(() => {
    setVersionId("");
    if (!doc) { setVersions([]); return; }
    supabase.from("book_doc_versions").select("*").eq("doc_id", doc.id).order("created_at", { ascending: false })
      .then(({ data }) => setVersions((data as DocVersion[]) ?? []));
  }, [doc?.id, doc?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-ink-400" /></div>;
  if (!docs.length) {
    return <p className="text-sm text-ink-500 font-sans">No book pages yet. Chapters and story bibles appear here after an interview is finished.</p>;
  }

  // Books written in only one language (e.g. English ghostwriter projects) show no language toggle.
  const hasEn = ofSlug.some((d) => d.body_en?.trim());
  const hasKo = ofSlug.some((d) => d.body_ko?.trim());
  const langs: Lang[] = hasEn && hasKo ? ["en", "ko"] : hasKo ? ["ko"] : ["en"];
  const shown: Lang = langs.includes(lang) ? lang : langs[0];
  const englishOnly = langs.length === 1 && langs[0] === "en";
  const version = versions.find((v) => v.id === versionId) ?? null;
  // A page written in only one language (e.g. Red Earth's English story bible) shows that language.
  const pick = (en: string, ko: string) => (shown === "en" ? en || ko : ko || en);
  const body = version ? pick(version.body_en, version.body_ko) : doc ? pick(doc.body_en, doc.body_ko) : "";
  const published = story?.status === "published" && story.settings?.kind === "book";

  const restore = async () => {
    if (!doc || !version) return;
    setMsg(null);
    const { error: e1 } = await supabase.from("book_doc_versions").insert({
      doc_id: doc.id, title_en: doc.title_en, title_ko: doc.title_ko, body_en: doc.body_en, body_ko: doc.body_ko,
      note: "Before restoring an earlier version",
    });
    const { error: e2 } = await supabase.from("book_docs").update({
      title_en: version.title_en, title_ko: version.title_ko, body_en: version.body_en, body_ko: version.body_ko,
      updated_at: new Date().toISOString(),
    }).eq("id", doc.id);
    if (e1 || e2) { setMsg((e1 ?? e2)!.message); return; }
    setMsg("Restored. The version you replaced is kept in the list.");
    await loadDocs();
  };

  const buildPlan = async () => {
    if (!slug) return;
    setWriting(true); setMsg(null);
    try {
      const r = await interviewApi.replan(slug);
      await loadDocs();
      setKind("summary");
      setDocId(r.bible_id);
    } catch (e) { setMsg((e as Error).message); }
    setWriting(false);
  };

  const createChapter = async (chapterId?: string) => {
    if (!slug) return;
    setWriting(true); setMsg(null);
    try {
      const r = await interviewApi.writeChapter(slug, chapterId);
      await loadDocs();
      setKind("sample");
      setDocId(r.chapter_id);
    } catch (e) { setMsg((e as Error).message); }
    setWriting(false);
  };

  // The book plan (on the bible) and where this chapter sits in it.
  const plan = summaries.find((d) => d.id.endsWith("/bible"))?.plan ?? null;
  const planned = plan?.chapters ?? [];
  const nextNo = chapters.reduce((m, c) => Math.max(m, c.position), 0) + 1;
  const nextPlan = planned.find((c) => Number(c.n) === nextNo);
  const docPlan = kind === "sample" && doc ? planned.find((c) => Number(c.n) === doc.position) : undefined;
  const wordCount = (t: string) => (t.match(/\S+/g) ?? []).length;

  const idx = chapters.findIndex((c) => c.id === doc?.id);
  const goChapter = (d: number) => {
    const next = chapters[idx + d];
    if (next) setDocId(next.id);
  };

  return (
    <div className="space-y-5">
      {slugs.length > 1 && (
        <div className="flex flex-wrap gap-2 font-sans">
          {slugs.map((s) => (
            <button key={s} onClick={() => { setSlug(s); setDocId(null); setShowPublish(false); }}
              className={`px-3 py-1.5 rounded-lg text-sm border ${s === slug ? "border-accent-400 text-accent-700 dark:text-accent-300" : "border-ink-200 dark:border-ink-700 text-ink-500"}`}>
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 font-sans">
        <div className="flex flex-wrap gap-2">
          <KindButton active={kind === "sample"} onClick={() => { setKind("sample"); setDocId(null); }} icon={<BookOpen size={16} />}>
            Content
          </KindButton>
          <KindButton active={kind === "summary"} onClick={() => { setKind("summary"); setDocId(null); }} icon={<FileText size={16} />}>
            {englishOnly || summaries.some((d) => d.id.endsWith("/bible")) ? "Story Bible" : "Summary"}
          </KindButton>
          {slug && myInterviewSlugs.includes(slug) && (
            <a href={`/interview/${slug}`} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-ink-200 dark:border-ink-700 text-ink-700 dark:text-ink-200 hover:bg-ink-100 dark:hover:bg-ink-800">
              <Mic size={16} /> Interview
            </a>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {langs.length > 1 && (
            <div className="inline-flex rounded-lg border border-ink-200 dark:border-ink-700 overflow-hidden text-sm">
              {langs.map((l) => (
                <button key={l} onClick={() => setLang(l)}
                  className={`px-4 py-2 ${lang === l ? "bg-accent-500 text-white" : "text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-800"}`}>
                  {l === "en" ? "English" : "한국어"}
                </button>
              ))}
            </div>
          )}
          {chapters.length > 0 && (
            <button onClick={() => setShowPublish((v) => !v)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${published
                ? "border border-success-500/40 text-success-600 bg-success-500/10"
                : "bg-accent-500 text-white"}`}>
              <Globe size={16} /> {published ? "Published" : "Publish"}
            </button>
          )}
        </div>
      </div>

      {showPublish && slug && (
        <PublishPanel slug={slug} story={story} chapters={chapters.filter((c) => !c.generating && (c.body_en || c.body_ko).trim())} bible={summaries[0] ?? null} lang={shown}
          onDone={async () => { await loadStory(); await loadDocs(); }} />
      )}

      {/* Which page: chapter picker for Content, page picker for the bible */}
      {ofKind.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 font-sans">
          {kind === "sample" && (
            <button onClick={() => goChapter(-1)} disabled={idx <= 0} className="btn-ghost !px-2 disabled:opacity-30" aria-label="Previous chapter">
              <ChevronLeft size={18} />
            </button>
          )}
          <select className="input-field !py-2 !w-auto text-sm max-w-full" value={doc?.id ?? ""} onChange={(e) => setDocId(e.target.value)}>
            {ofKind.map((d) => (
              <option key={d.id} value={d.id}>
                {titleOf(d, shown)}{kind === "sample" && published ? (d.published ? "  · live" : "  · not published") : ""}
              </option>
            ))}
          </select>
          {kind === "sample" && (
            <button onClick={() => goChapter(1)} disabled={idx < 0 || idx >= chapters.length - 1} className="btn-ghost !px-2 disabled:opacity-30" aria-label="Next chapter">
              <ChevronRight size={18} />
            </button>
          )}
          {versions.length > 0 && (
            <select className="input-field !py-2 !w-auto text-sm" value={versionId} onChange={(e) => setVersionId(e.target.value)}>
              <option value="">Current version</option>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  Earlier · {new Date(v.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })} {new Date(v.created_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </option>
              ))}
            </select>
          )}
          {doc && !version && !doc.generating && (
            <span className="ml-auto inline-flex flex-wrap gap-2">
              <button onClick={() => setShowNotes((v) => !v)}
                className={`btn-secondary !py-2 !px-3 text-sm inline-flex items-center gap-1.5 ${showNotes ? "ring-2 ring-accent-400" : ""}`}>
                <MessageSquare size={15} /> {kind === "sample" ? "Revise this chapter" : "Give notes on the bible"}
              </button>
              {kind === "summary" && (
                <button onClick={buildPlan} disabled={writing} className="btn-secondary !py-2 !px-3 text-sm inline-flex items-center gap-1.5"
                  title="Rebuild the three-act structure, plot points and chapter-by-chapter plan from the current bible">
                  <Sparkles size={15} /> {plan ? "Rebuild chapter plan" : "Build chapter plan"}
                </button>
              )}
              {kind === "sample" && (
                <button onClick={() => createChapter()} disabled={writing}
                  className="btn-primary !py-2 !px-3 text-sm inline-flex items-center gap-1.5">
                  <Sparkles size={15} /> {nextPlan ? `Create Chapter ${nextNo}${nextPlan.title ? `: ${nextPlan.title}` : ""}` : "Create next chapter"}
                </button>
              )}
            </span>
          )}
        </div>
      )}

      {kind === "sample" && doc && !doc.generating && (docPlan || planned.length > 0) && (
        <p className="text-xs text-ink-500 font-sans -mt-2">
          {docPlan
            ? <>Act {docPlan.act ?? "?"} · planned ~{(docPlan.target_words ?? 0).toLocaleString()} words · written {wordCount(shown === "en" ? doc.body_en : doc.body_ko).toLocaleString()} words{docPlan.purpose ? ` · ${docPlan.purpose}` : ""}</>
            : <>Not in the current chapter plan</>}
          {planned.length > 0 && <> · chapter {doc.position} of {planned.length} planned{plan?.format ? ` (${plan.format}, ~${(plan.target_words ?? 0).toLocaleString()} words)` : ""}</>}
        </p>
      )}

      {kind === "sample" && ofKind.length === 0 && (
        <div className="card p-6 text-center space-y-3 font-sans">
          <p className="text-ink-600 dark:text-ink-300">No chapters yet. The first one is written from the story bible.</p>
          <button onClick={() => createChapter()} disabled={writing} className="btn-primary !py-2">
            <Sparkles size={15} /> Create Chapter 1
          </button>
        </div>
      )}

      {showNotes && doc && slug && !doc.generating && !version && (
        <NotesPanel
          slug={slug}
          target={kind === "sample" ? doc : null}
          targetTitle={titleOf(doc, "en")}
          memoir={!englishOnly}
          voiceLink={myInterviewSlugs.includes(slug) && englishOnly
            ? `/interview/${slug}?revise=${kind === "sample" ? encodeURIComponent(doc.id) : ""}` : null}
          onStarted={async () => { setShowNotes(false); await loadDocs(); }}
        />
      )}

      {version && (
        <div className="card px-4 py-3 flex flex-wrap items-center gap-3 font-sans text-sm border-warning-500/40 bg-warning-500/5">
          <History size={16} className="text-warning-600" />
          <span className="text-ink-700 dark:text-ink-200">
            You're looking at an earlier version{version.note ? ` (${version.note.toLowerCase()})` : ""}.
          </span>
          <button onClick={restore} className="btn-primary !py-1.5 !px-3 text-sm ml-auto">Restore this version</button>
          <button onClick={() => setVersionId("")} className="btn-ghost !py-1.5 text-sm">Back to current</button>
        </div>
      )}
      {msg && <p className="text-sm text-ink-600 dark:text-ink-300 font-sans">{msg}</p>}

      {kind === "sample" && chapters.length > 0 && !plan && (
        <p className="text-xs text-warning-600 font-sans -mt-2">
          This book has no chapter plan yet, so new chapters only follow the bible loosely.{" "}
          <button onClick={buildPlan} disabled={writing} className="underline">Build the chapter plan</button> first.
        </p>
      )}

      {doc?.generating ? (
        <div className="card px-6 py-12 text-center font-sans space-y-2">
          <Loader2 size={24} className="animate-spin text-accent-500 mx-auto" />
          <p className="text-ink-700 dark:text-ink-200">
            {doc.kind === "summary"
              ? "Building the structure and chapter plan from the bible and the chapters so far…"
              : `Writing ${titleOf(doc, shown)} from its brief in the chapter plan and the chapters before it…`}
          </p>
          <p className="text-sm text-ink-500">
            {!englishOnly && doc.kind === "sample" ? "Korean first, then the English translation. This usually takes 4–7 minutes." : "This usually takes 2–4 minutes."}
            {" "}You can leave this page; it keeps going.
          </p>
        </div>
      ) : doc?.gen_error && !(shown === "en" ? doc.body_en : doc.body_ko)?.trim() ? (
        <div className="card px-6 py-8 text-center font-sans space-y-3">
          <p className="text-error-600 text-sm">Writing this chapter failed: {doc.gen_error}</p>
          <button onClick={() => createChapter(doc.id)} disabled={writing} className="btn-primary !py-2"><RefreshCw size={14} /> Try again</button>
        </div>
      ) : doc ? (
        <>
          {doc.gen_error && <p className="text-sm text-error-600 font-sans">The last rewrite failed: {doc.gen_error}</p>}
          {!version && <AudioBar key={`${doc.id}:${shown}:${doc.updated_at}:${doc.model_id}`} doc={doc} lang={shown} onChanged={loadDocs} />}
          <article lang={shown} className="card px-6 sm:px-10 py-8">
            <Markdown text={body} lang={shown} />
          </article>
        </>
      ) : (
        <p className="text-sm text-ink-500 font-sans">Nothing here yet.</p>
      )}
    </div>
  );
}

// ── Notes on a chapter (or the bible), typed or dictated ─────────────────

function NotesPanel({ slug, target, targetTitle, memoir, voiceLink, onStarted }: {
  slug: string; target: BookDoc | null; targetTitle: string; memoir: boolean; voiceLink: string | null; onStarted: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [fresh, setFresh] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const toggleDictation = async () => {
    setError(null);
    if (recording) { recRef.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported?.(m));
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: (rec.mimeType || "audio/webm").split(";")[0] });
        if (blob.size < 1000) return;
        setTranscribing(true);
        try {
          const r = await interviewApi.transcribe(blob, "en");
          setNotes((n) => (n.trim() ? `${n.trim()}\n\n` : "") + r.text.trim());
        } catch (e) { setError((e as Error).message); }
        setTranscribing(false);
      };
      recRef.current = rec;
      rec.start(1000);
      setRecording(true);
    } catch { setError("Couldn't use the microphone. Allow it in the browser and try again."); }
  };

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      if (target && fresh) await interviewApi.writeChapter(slug, target.id, notes.trim());
      else await interviewApi.reviseNotes(slug, target?.id ?? null, notes.trim());
      onStarted();
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };

  return (
    <div className="card p-5 space-y-3 font-sans">
      <div>
        <h3 className="font-serif text-lg text-ink-900 dark:text-ink-50">{target ? `Notes on ${targetTitle}` : "Notes on the story"}</h3>
        <p className="text-sm text-ink-500 mt-1">
          {target
            ? <>Say what to change, deepen, cut or add. The chapter is rewritten with your notes{memoir ? " (in Korean, then the English translation)" : ""}, the story bible and plan take them in, and the current version is kept so you can switch back.</>
            : <>Anything about characters, plot, tone or where the story goes. The story bible and chapter plan are updated; no chapter is rewritten.</>}
        </p>
      </div>
      <textarea className="input-field !py-2 text-sm" rows={6} value={notes} onChange={(e) => setNotes(e.target.value)}
        placeholder={target ? "e.g. Slow down the scene at the market. Her aunt should be funnier and louder. Cut the part about the radio. End the chapter on the bread, not the report card." : "e.g. The brother should be more sympathetic later on…"} />
      {target && (
        <label className="flex items-start gap-2 text-sm text-ink-700 dark:text-ink-200">
          <input type="checkbox" className="mt-1" checked={fresh} onChange={(e) => setFresh(e.target.checked)} />
          <span>
            <strong>Start over</strong> instead of editing this draft: write the chapter fresh from its brief in the plan
            {memoir ? ", her interviews" : ""} and the chapters before it, following your notes (optional). The current draft is kept as a version.
          </span>
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={toggleDictation} disabled={transcribing || busy}
          className={`btn-secondary !py-2 !px-3 text-sm inline-flex items-center gap-1.5 ${recording ? "!bg-[#c95a5a] !text-white" : ""}`}>
          {transcribing ? <Loader2 size={14} className="animate-spin" /> : <Mic size={14} />}
          {recording ? "Stop dictating" : transcribing ? "Transcribing…" : "Dictate"}
        </button>
        <button onClick={submit} disabled={busy || recording || transcribing || (!fresh && !notes.trim())} className="btn-primary !py-2 !px-3 text-sm">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {target ? (fresh ? "Rewrite from scratch" : "Revise the chapter") : "Update the bible"}
        </button>
        {voiceLink && (
          <a href={voiceLink} target="_blank" rel="noreferrer" className="text-sm text-accent-600 underline ml-auto">
            Or talk it through with the editor
          </a>
        )}
      </div>
      {error && <p className="text-xs text-error-600">{error}</p>}
    </div>
  );
}

// ── Publish to the Library ────────────────────────────────────────────────

function PublishPanel({ slug, story, chapters, bible, lang, onDone }: {
  slug: string; story: StoryRow | null; chapters: BookDoc[]; bible: BookDoc | null; lang: Lang; onDone: () => void;
}) {
  const live = story?.status === "published" && story.settings?.kind === "book";
  const conflict = !!story && story.settings?.kind !== "book";
  // Suggest a title from the bible ("Working title: ...") the first time.
  const suggested = useMemo(() => {
    const text = bible ? (lang === "en" ? bible.body_en : bible.body_ko) : "";
    const m = text.match(/working title[^:\n]*:\s*\**["“]?([^"”\n*]+)/i);
    return m?.[1]?.trim() ?? slug.split("-").map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");
  }, [bible, lang, slug]);
  const suggestedBlurb = useMemo(() => {
    const text = bible ? (lang === "en" ? bible.body_en : bible.body_ko) : "";
    const m = text.match(/logline[^:\n]*:?\**\s*\n*\s*([^\n#]{30,400})/i);
    return m?.[1]?.replace(/\*\*/g, "").trim() ?? "";
  }, [bible, lang]);
  const [title, setTitle] = useState(story?.title ?? suggested);
  const [blurb, setBlurb] = useState(story?.blurb ?? suggestedBlurb);
  const [picked, setPicked] = useState<string[]>(() => {
    const already = chapters.filter((c) => c.published).map((c) => c.id);
    return already.length ? already : chapters.map((c) => c.id);
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const publish = async () => {
    setBusy(true); setMsg(null);
    try {
      await interviewApi.publishBook({ story_slug: slug, title: title.trim(), blurb: blurb.trim(), chapter_ids: picked });
      setMsg("Published. It's in the Library now.");
      onDone();
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  };
  const unpublish = async () => {
    setBusy(true); setMsg(null);
    try { await interviewApi.unpublishBook(slug); setMsg("Taken down from the Library."); onDone(); }
    catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  };

  if (conflict) {
    return <div className="card p-4 text-sm font-sans text-warning-600">An interactive story already uses the slug "{slug}", so this book can't be published under it.</div>;
  }

  return (
    <div className="card p-5 space-y-4 font-sans">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg text-ink-900 dark:text-ink-50">{live ? "Published in the Library" : "Publish to the Library"}</h3>
          <p className="text-sm text-ink-500 mt-1">
            Anyone can read the chapters you tick. They hear the final narration, once it's recorded below.
            {live && <> Reader link: <a href={`/book/${slug}`} target="_blank" rel="noreferrer" className="text-accent-600 underline">/book/{slug}</a></>}
          </p>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs text-ink-500 mb-1">Title</span>
          <input className="input-field !py-2" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="block sm:row-span-2">
          <span className="block text-xs text-ink-500 mb-1">Blurb (shown on the Library card)</span>
          <textarea className="input-field !py-2 text-sm" rows={4} value={blurb} onChange={(e) => setBlurb(e.target.value)} />
        </label>
        <div>
          <span className="block text-xs text-ink-500 mb-1">Chapters</span>
          <div className="space-y-1.5">
            {chapters.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-200">
                <input type="checkbox" checked={picked.includes(c.id)}
                  onChange={(e) => setPicked((p) => e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id))} />
                {titleOf(c, lang)}
              </label>
            ))}
          </div>
        </div>
      </div>
      <FinalNarration slug={slug} chapters={chapters.filter((c) => picked.includes(c.id))} lang={lang} onChanged={onDone} />
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary !py-2" onClick={publish} disabled={busy || !title.trim() || !picked.length}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Globe size={15} />} {live ? "Update" : "Publish"}
        </button>
        {live && <button className="btn-secondary !py-2" onClick={unpublish} disabled={busy}>Unpublish</button>}
        {msg && <span className="text-sm text-ink-600 dark:text-ink-300">{msg}</span>}
      </div>
    </div>
  );
}

function KindButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
        active
          ? "bg-accent-500 border-accent-500 text-white"
          : "border-ink-200 dark:border-ink-700 text-ink-700 dark:text-ink-200 hover:bg-ink-100 dark:hover:bg-ink-800"
      }`}>
      {icon}{children}
    </button>
  );
}

// ── Final narration (what readers of the published book hear) ───────────

function FinalNarration({ slug, chapters, lang, onChanged }: { slug: string; chapters: BookDoc[]; lang: Lang; onChanged: () => void }) {
  const [model, setModel] = useState(chapters[0]?.final_model_id ?? "eleven_v4");
  const voiceCol = lang === "ko" ? "voice_ko" : "voice_en";
  const [voice, setVoice] = useState(chapters[0]?.[voiceCol] ?? "");
  const mixedVoices = new Set(chapters.map((c) => c[voiceCol])).size > 1;
  const [stats, setStats] = useState<Record<string, AudioStatus>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const ids = chapters.map((c) => c.id).join(",");

  const refresh = useCallback(async () => {
    const out: Record<string, AudioStatus> = {};
    for (const c of chapters) {
      try { out[c.id] = await audioCall({ action: "status", id: c.id, lang, track: "final" }); } catch { /* skip */ }
    }
    setStats(out);
  }, [ids, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { cancelRef.current = false; refresh(); return () => { cancelRef.current = true; }; }, [refresh]);

  const changeModel = async (m: string) => {
    setModel(m);
    const { error: e } = await supabase.from("book_docs").update({ final_model_id: m }).eq("story_slug", slug).eq("kind", "sample");
    if (e) { setError(e.message); return; }
    onChanged();
    refresh();
  };

  const changeVoice = async (v: string) => {
    if (!v) return;
    setVoice(v);
    const { error: e } = await supabase.from("book_docs").update({ [voiceCol]: v }).eq("story_slug", slug).eq("kind", "sample");
    if (e) { setError(e.message); return; }
    onChanged();
    refresh();
  };

  const recordAll = async () => {
    setError(null);
    for (const c of chapters) {
      if (cancelRef.current) break;
      setBusy(c.id);
      try {
        let st = await audioCall({ action: "status", id: c.id, lang, track: "final" });
        setStats((s) => ({ ...s, [c.id]: st }));
        while (!cancelRef.current && st.ready < st.total) {
          st = await audioCall({ action: "generate", id: c.id, lang, track: "final" });
          setStats((s) => ({ ...s, [c.id]: st }));
        }
      } catch (e) { setError(`${titleOf(c, lang)}: ${(e as Error).message}`); break; }
    }
    setBusy(null);
  };

  const done = (c: BookDoc) => { const s = stats[c.id]; return !!s && s.total > 0 && s.ready === s.total; };
  const allDone = chapters.length > 0 && chapters.every(done);

  return (
    <div className="rounded-lg border border-ink-200 dark:border-ink-700 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Headphones size={16} className="text-accent-500" />
        <span className="text-sm font-medium text-ink-800 dark:text-ink-100">Final narration</span>
        <span className="text-xs text-ink-500">What readers hear. Separate from the Studio draft narration.</span>
        <span className="ml-auto inline-flex flex-wrap items-center gap-2">
          <VoicePicker value={voice} onChange={changeVoice} size="sm" disabled={!!busy} />
          <select value={model} onChange={(e) => changeModel(e.target.value)} className="input-field !py-1 !px-2 !w-auto text-xs" disabled={!!busy}>
            {TTS_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </span>
      </div>
      {mixedVoices && <p className="text-xs text-warning-600">These chapters use different voices. Picking a voice here sets it for every chapter.</p>}
      <ul className="space-y-1 text-sm">
        {chapters.map((c) => {
          const s = stats[c.id];
          return (
            <li key={c.id} className="flex items-center gap-2 text-ink-700 dark:text-ink-200">
              {busy === c.id ? <Loader2 size={13} className="animate-spin text-accent-500" />
                : done(c) ? <span className="text-success-600">✓</span> : <span className="text-ink-300">○</span>}
              <span className="flex-1">{titleOf(c, lang)}</span>
              <span className="text-xs text-ink-400">
                {!s ? "…" : done(c) ? "recorded" : s.stale ? "out of date" : s.ready ? `${s.ready} of ${s.total} parts` : "not recorded"}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-3">
        <button className="btn-secondary !py-1.5 !px-3 text-sm" onClick={recordAll} disabled={!!busy || allDone || !chapters.length}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Headphones size={14} />}
          {allDone ? "All recorded" : busy ? "Recording…" : "Record final narration"}
        </button>
        {error && <span className="text-xs text-error-600">{error}</span>}
      </div>
    </div>
  );
}

// ── Audio ────────────────────────────────────────────────────────────────

export function AudioBar({ doc, lang, readOnly = false, onChanged, authorHint = false }: {
  doc: BookDoc; lang: Lang; readOnly?: boolean; onChanged?: () => void;
  /** Public reader viewed by an author: say how to add narration instead of hiding the player. */
  authorHint?: boolean;
}) {
  // Studio plays the draft narration; the public reader plays the final recording.
  const track = readOnly ? "final" : "draft";
  // Narration model for this page (Studio only). Changing it means the narration is recorded again.
  const [model, setModel] = useState(doc.model_id ?? "eleven_v3");
  const changeModel = async (m: string) => {
    setModel(m);
    const { error } = await supabase.from("book_docs").update({ model_id: m }).eq("id", doc.id);
    if (error) { setModel(doc.model_id ?? "eleven_v3"); return; }
    onChanged?.();
  };
  // Voice for this page's narration (both the Studio draft and the final recording).
  const voiceCol = lang === "ko" ? "voice_ko" : "voice_en";
  const [voice, setVoice] = useState(doc[voiceCol]);
  const changeVoice = async (v: string) => {
    if (!v) return;
    setVoice(v);
    const { error } = await supabase.from("book_docs").update({ [voiceCol]: v }).eq("id", doc.id);
    if (error) { setVoice(doc[voiceCol]); return; }
    onChanged?.();
  };
  const { voices } = useVoices();
  const voicePicker = readOnly ? null : <VoicePicker value={voice} onChange={changeVoice} size="sm" />;
  const modelPicker = readOnly ? null : (
    <select value={model} onChange={(e) => changeModel(e.target.value)} className="input-field !py-1 !px-2 !w-auto text-xs" title="Narration model">
      {TTS_MODELS.map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}
      {!TTS_MODELS.some((m) => m.id === model) && <option value={model}>{model}</option>}
    </select>
  );
  const [status, setStatus] = useState<AudioStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [part, setPart] = useState(0);
  const [playing, setPlaying] = useState(false);
  // Listening speed, remembered on this device. Pitch stays natural when slowed.
  const [rate, setRate] = useState<number>(() => {
    try { return Number(localStorage.getItem("book-rate")) || 0.85; } catch { return 0.85; }
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    cancelRef.current = false;
    audioCall({ action: "status", id: doc.id, lang, track }).then(setStatus).catch((e) => setError(e.message));
    return () => {
      cancelRef.current = true;
      audioRef.current?.pause();
    };
  }, [doc.id, lang, track]);

  const ready = status && status.total > 0 && status.ready === status.total && status.urls.length === status.total;

  const generate = useCallback(async (fresh = false) => {
    setBusy(true);
    setError(null);
    try {
      if (fresh) await audioCall({ action: "reset", id: doc.id, lang, track });
      let st = await audioCall({ action: "status", id: doc.id, lang, track });
      setStatus(st);
      while (!cancelRef.current && st.ready < st.total) {
        st = await audioCall({ action: "generate", id: doc.id, lang, track });
        setStatus(st);
      }
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }, [doc.id, lang, track]);

  const playPart = (n: number) => {
    if (!status?.urls[n]) return;
    if (!audioRef.current) audioRef.current = new Audio();
    const a = audioRef.current;
    a.src = status.urls[n];
    a.preservesPitch = true;
    a.playbackRate = rate;
    a.onended = () => {
      if (n + 1 < (status?.urls.length ?? 0)) playPart(n + 1);
      else { setPlaying(false); setPart(0); }
    };
    setPart(n);
    a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  };

  const toggle = () => {
    const a = audioRef.current;
    if (playing && a) { a.pause(); setPlaying(false); return; }
    if (a && a.src && a.currentTime > 0 && !a.ended) { a.play().then(() => setPlaying(true)); return; }
    playPart(part);
  };

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
    try { localStorage.setItem("book-rate", String(rate)); } catch { /* ignore */ }
  }, [rate]);

  // Public reader: only a player, and only once narration exists.
  if (readOnly && !ready) {
    if (!authorHint || !status) return null;
    return (
      <div className="card px-4 py-3 flex flex-wrap items-center gap-2 font-sans text-sm text-ink-600 dark:text-ink-300 border-dashed">
        <Headphones size={16} className="text-ink-400" />
        <span>
          {status.stale ? "This chapter changed since its final narration was recorded." : "No narration for readers yet."}
          {" "}Only you see this. Record it in Studio → Book → Publish → <strong>Final narration</strong>.
        </span>
        <a href="/studio" className="ml-auto text-accent-600 underline text-sm">Open Studio</a>
      </div>
    );
  }

  const voiceLabel = readOnly
    ? `${voiceName(voices, voice)} · ${lang === "ko" ? "한국어" : "English"}`
    : `Studio draft · ${lang === "ko" ? "한국어" : "English"}`;

  return (
    <div className="card px-4 py-3 flex flex-wrap items-center gap-3 font-sans">
      <Headphones size={18} className="text-accent-500" />
      {ready ? (
        <>
          <button onClick={() => playPart(Math.max(0, part - 1))} className="btn-ghost !px-2" aria-label="Previous part"><SkipBack size={16} /></button>
          <button onClick={toggle} className="w-10 h-10 rounded-full bg-accent-500 text-white flex items-center justify-center" aria-label={playing ? "Pause" : "Play"}>
            {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
          </button>
          <button onClick={() => playPart(Math.min((status?.total ?? 1) - 1, part + 1))} className="btn-ghost !px-2" aria-label="Next part"><SkipForward size={16} /></button>
          <span className="text-sm text-ink-600 dark:text-ink-300">Part {part + 1} of {status!.total}</span>
          <select value={rate} onChange={(e) => setRate(Number(e.target.value))} className="input-field !py-1 !px-2 !w-auto text-sm">
            {[0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 1, 1.1, 1.25].map((r) => <option key={r} value={r}>{r}×</option>)}
          </select>
          <span className="text-xs text-ink-400 ml-auto">{voiceLabel}</span>
          {voicePicker}
          {modelPicker}
          {!readOnly && (
            <button onClick={() => generate(true)} disabled={busy} className="btn-ghost !px-2 !py-1 text-xs" title="Re-record">
              <RefreshCw size={13} />
            </button>
          )}
        </>
      ) : busy ? (
        <span className="text-sm text-ink-600 dark:text-ink-300 inline-flex items-center gap-2">
          <Loader2 size={15} className="animate-spin" /> Recording narration… part {Math.min((status?.ready ?? 0) + 1, status?.total ?? 1)} of {status?.total ?? "…"}
        </span>
      ) : (
        <>
          <span className="text-sm text-ink-600 dark:text-ink-300">
            {status?.stale ? "The text changed since the last recording." : "No narration yet."}
            {status && status.ready > 0 && status.ready < status.total ? ` ${status.ready} of ${status.total} parts recorded.` : ""}
          </span>
          <span className="ml-auto inline-flex items-center gap-2">{voicePicker}{modelPicker}</span>
          <button onClick={() => generate(false)} className="btn-primary !py-1.5 !px-3 text-sm">
            <Headphones size={14} /> {status && status.ready > 0 && !status.stale ? "Finish recording" : "Record narration"}
          </button>
        </>
      )}
      {error && <p className="w-full text-xs text-error-600">{error}</p>}
    </div>
  );
}

// ── Minimal markdown (headings, paragraphs, bullets, bold, italics) ─────

function inline(s: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push(m[1] ? <strong key={k++}>{m[1]}</strong> : <em key={k++}>{m[2]}</em>);
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

export function Markdown({ text, lang }: { text: string; lang: Lang }) {
  // Headings always stand alone, even when the text has no blank line after them.
  const blocks = text.trim().replace(/^(#{1,6} .*)$/gm, "\n$1\n").split(/\n\s*\n/).filter((b) => b.trim());
  const korean = lang === "ko";
  return (
    <div className={`text-ink-800 dark:text-ink-200 ${korean ? "font-sans text-[17px] leading-[1.9] break-keep" : "font-serif text-[18px] leading-relaxed"}`}>
      {blocks.map((b, i) => {
        const t = b.trim();
        if (t.startsWith("# ")) return <h2 key={i} className="font-serif text-2xl text-ink-900 dark:text-ink-50 mb-6">{t.slice(2)}</h2>;
        if (/^#{2,6}\s/.test(t)) {
          const label = t.replace(/^#{2,6}\s*/, "");
          return /^\d+$/.test(label)
            ? <p key={i} className="text-center text-ink-400 tracking-widest my-8 font-sans text-sm">{label}</p>
            : <h3 key={i} className="font-sans text-sm uppercase tracking-wide text-ink-500 mt-8 mb-3">{label}</h3>;
        }
        const lines = t.split("\n");
        if (lines.every((l) => /^[-*]\s/.test(l.trim()))) {
          return (
            <ul key={i} className="list-disc pl-5 space-y-2 mb-5">
              {lines.map((l, j) => <li key={j}>{inline(l.trim().replace(/^[-*]\s/, ""))}</li>)}
            </ul>
          );
        }
        return <p key={i} className="mb-5">{inline(t.replace(/\n/g, " "))}</p>;
      })}
    </div>
  );
}
