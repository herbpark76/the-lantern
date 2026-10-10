import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, FileText, Headphones, Loader2, Pause, Play, RefreshCw, SkipBack, SkipForward } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { InterviewError } from "@/lib/interview";

// Studio > Book: read a book's sample chapters and session summaries in English or Korean,
// and listen to them narrated (audio made on demand by the `book-audio` edge function).

type Lang = "en" | "ko";

interface BookDoc {
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

export function BookTab() {
  const [docs, setDocs] = useState<BookDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [slug, setSlug] = useState<string | null>(null);
  const [kind, setKind] = useState<"sample" | "summary">("sample");
  const [docId, setDocId] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>(() => {
    try { return (localStorage.getItem("book-lang") as Lang) || "ko"; } catch { return "ko"; }
  });

  useEffect(() => {
    supabase.from("book_docs").select("*").order("position").then(({ data }) => {
      const list = (data as BookDoc[]) ?? [];
      setDocs(list);
      setSlug(list[0]?.story_slug ?? null);
      setLoading(false);
    });
  }, []);

  useEffect(() => { try { localStorage.setItem("book-lang", lang); } catch { /* ignore */ } }, [lang]);

  const slugs = useMemo(() => Array.from(new Set(docs.map((d) => d.story_slug))), [docs]);
  const ofKind = docs.filter((d) => d.story_slug === slug && d.kind === kind);
  const doc = ofKind.find((d) => d.id === docId) ?? ofKind[0] ?? null;

  if (loading) return <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-ink-400" /></div>;
  if (!docs.length) {
    return <p className="text-sm text-ink-500 font-sans">No book pages yet. Sample chapters and session summaries appear here once they're added.</p>;
  }

  return (
    <div className="space-y-5">
      {slugs.length > 1 && (
        <div className="flex gap-2 font-sans">
          {slugs.map((s) => (
            <button key={s} onClick={() => { setSlug(s); setDocId(null); }}
              className={`px-3 py-1.5 rounded-lg text-sm border ${s === slug ? "border-accent-400 text-accent-700 dark:text-accent-300" : "border-ink-200 dark:border-ink-700 text-ink-500"}`}>
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 font-sans">
        <div className="flex gap-2">
          <KindButton active={kind === "sample"} onClick={() => { setKind("sample"); setDocId(null); }} icon={<BookOpen size={16} />}>
            Sample Chapter
          </KindButton>
          <KindButton active={kind === "summary"} onClick={() => { setKind("summary"); setDocId(null); }} icon={<FileText size={16} />}>
            Summary
          </KindButton>
        </div>
        <div className="inline-flex rounded-lg border border-ink-200 dark:border-ink-700 overflow-hidden text-sm">
          {(["en", "ko"] as const).map((l) => (
            <button key={l} onClick={() => setLang(l)}
              className={`px-4 py-2 ${lang === l ? "bg-accent-500 text-white" : "text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-800"}`}>
              {l === "en" ? "English" : "한국어"}
            </button>
          ))}
        </div>
      </div>

      {ofKind.length > 1 && (
        <select className="input-field !py-2 !w-auto font-sans text-sm" value={doc?.id ?? ""} onChange={(e) => setDocId(e.target.value)}>
          {ofKind.map((d) => <option key={d.id} value={d.id}>{lang === "en" ? d.title_en : d.title_ko}</option>)}
        </select>
      )}

      {doc ? (
        <>
          <AudioBar key={`${doc.id}:${lang}:${doc.updated_at}`} doc={doc} lang={lang} />
          <article lang={lang} className="card px-6 sm:px-10 py-8">
            <Markdown text={lang === "en" ? doc.body_en : doc.body_ko} lang={lang} />
          </article>
        </>
      ) : (
        <p className="text-sm text-ink-500 font-sans">Nothing here yet.</p>
      )}
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

// ── Audio ────────────────────────────────────────────────────────────────

function AudioBar({ doc, lang }: { doc: BookDoc; lang: Lang }) {
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
    audioCall({ action: "status", id: doc.id, lang }).then(setStatus).catch((e) => setError(e.message));
    return () => {
      cancelRef.current = true;
      audioRef.current?.pause();
    };
  }, [doc.id, lang]);

  const ready = status && status.total > 0 && status.ready === status.total && status.urls.length === status.total;

  const generate = useCallback(async (fresh = false) => {
    setBusy(true);
    setError(null);
    try {
      if (fresh) await audioCall({ action: "reset", id: doc.id, lang });
      let st = await audioCall({ action: "status", id: doc.id, lang });
      setStatus(st);
      while (!cancelRef.current && st.ready < st.total) {
        st = await audioCall({ action: "generate", id: doc.id, lang });
        setStatus(st);
      }
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }, [doc.id, lang]);

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

  const voiceLabel = lang === "ko" ? "Daegu voice · 한국어" : "Daegu voice · English";

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
          <button onClick={() => generate(true)} disabled={busy} className="btn-ghost !px-2 !py-1 text-xs" title="Re-record">
            <RefreshCw size={13} />
          </button>
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
          <button onClick={() => generate(false)} className="btn-primary !py-1.5 !px-3 text-sm ml-auto">
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

function Markdown({ text, lang }: { text: string; lang: Lang }) {
  const blocks = text.trim().split(/\n\s*\n/);
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
