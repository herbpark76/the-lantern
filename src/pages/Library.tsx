import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, Clapperboard, Loader2, MessageSquareText, Plus } from "lucide-react";
import { supabase, type Story } from "@/lib/supabase";
import { useRouter } from "@/lib/router";
import { useAuth } from "@/lib/auth";
import { FORMAT_LABEL, fmtDate, type Version, type Work } from "@/lib/works";

// The Library: every work (story) with its formats and latest versions. Staff see all works,
// everyone else sees works marked public. Published interactive stories and books that aren't
// part of a work yet still show below.

export function LibraryPage() {
  const { navigate } = useRouter();
  const { profile } = useAuth();
  const staff = profile?.role === "author" || profile?.role === "admin";
  const [works, setWorks] = useState<Work[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [openRounds, setOpenRounds] = useState<Record<string, number>>({});
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    const [w, v, s] = await Promise.all([
      supabase.from("works").select("*").order("position").order("title"),
      supabase.from("work_versions").select("id, work_slug, format, label, status, lang, created_at, word_count"),
      supabase.from("stories").select("*").eq("status", "published").order("title"),
    ]);
    const ws = (w.data as Work[]) ?? [];
    setWorks(ws);
    setVersions((v.data as Version[]) ?? []);
    const linked = new Set(ws.flatMap((x) => x.links.map((l) => l.href.split("/").pop())));
    setStories(((s.data as Story[]) ?? []).filter((st) => !linked.has(st.slug) && st.slug !== "sample-story"));
    if (staff) {
      const { data: r } = await supabase.from("review_rounds").select("id, status, work_versions(work_slug)").eq("status", "open");
      const counts: Record<string, number> = {};
      for (const row of (r as unknown as Array<{ work_versions: { work_slug: string } | null }>) ?? []) {
        const slug = row.work_versions?.work_slug; if (slug) counts[slug] = (counts[slug] ?? 0) + 1;
      }
      setOpenRounds(counts);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [staff]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { document.title = "The Lantern"; }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-ink-400" /></div>;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <div className="text-center mb-12">
        <BookOpen size={28} className="text-accent-500 mx-auto mb-3" />
        <h1 className="font-serif text-3xl sm:text-4xl text-ink-900 dark:text-ink-50 mb-3">The Lantern</h1>
        <p className="text-lg text-ink-500 dark:text-ink-400 font-serif italic max-w-xl mx-auto">
          {staff ? "Your stories, every version of them, and what your readers think." : "Stories to read, listen to, and play."}
        </p>
      </div>

      {staff && (
        <div className="flex justify-end mb-4">
          <button onClick={() => setAdding((a) => !a)} className="btn-secondary !py-2 !px-4"><Plus size={16} /> New work</button>
        </div>
      )}
      {adding && <NewWork onDone={(slug) => { setAdding(false); if (slug) navigate(`/work/${slug}`); }} />}

      {works.length === 0 && stories.length === 0 && (
        <p className="text-center py-16 text-ink-500 font-sans">Nothing here yet.</p>
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {works.map((w) => {
          const vs = versions.filter((v) => v.work_slug === w.slug);
          const formats = Array.from(new Set([...vs.map((v) => v.format as string), ...w.links.map((l) => l.format)]));
          const latest = vs.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
          return (
            <button key={w.slug} onClick={() => navigate(`/work/${w.slug}`)}
              className="card card-hover p-6 text-left group animate-fade-in flex flex-col"
              style={{ borderTopWidth: "3px", borderTopColor: w.accent_color }}>
              <h2 className="font-serif text-xl text-ink-900 dark:text-ink-50 mb-2">{w.title}</h2>
              <p className="text-sm text-ink-500 dark:text-ink-400 leading-relaxed mb-4 line-clamp-3">{w.logline || w.blurb}</p>
              <div className="flex flex-wrap gap-1.5 mb-4 font-sans">
                {formats.map((f) => (
                  <span key={f} className="text-[11px] uppercase tracking-wide px-2 py-0.5 rounded-full border border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-300 inline-flex items-center gap-1">
                    {f === "screenplay" && <Clapperboard size={11} />}{FORMAT_LABEL[f] ?? f}
                  </span>
                ))}
              </div>
              <div className="mt-auto flex items-center justify-between text-xs font-sans text-ink-500">
                <span>{latest ? `Updated ${fmtDate(latest.created_at)}` : ""}</span>
                {staff && openRounds[w.slug] ? (
                  <span className="inline-flex items-center gap-1 text-accent-600"><MessageSquareText size={13} /> {openRounds[w.slug]} open review{openRounds[w.slug] > 1 ? "s" : ""}</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-accent-600 group-hover:gap-2 transition-all">Open <ArrowRight size={13} /></span>
                )}
              </div>
            </button>
          );
        })}
        {stories.map((story) => (
          <button key={story.slug}
            onClick={() => navigate(story.settings?.kind === "book" ? `/book/${story.slug}` : `/story/${story.slug}`)}
            className="card card-hover p-6 text-left group animate-fade-in"
            style={{ borderTopWidth: "3px", borderTopColor: story.settings?.accent_color ?? "#c97b3a" }}>
            <h2 className="font-serif text-xl text-ink-900 dark:text-ink-50 mb-2">{story.title}</h2>
            <p className="text-sm text-ink-500 dark:text-ink-400 leading-relaxed mb-4 line-clamp-3">{story.blurb}</p>
            <div className="flex items-center gap-1 text-sm font-sans text-accent-600 dark:text-accent-400 group-hover:gap-2 transition-all">
              <span>{story.settings?.kind === "book" ? "Read" : "Play"}</span><ArrowRight size={14} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function NewWork({ onDone }: { onDone: (slug: string | null) => void }) {
  const [title, setTitle] = useState("");
  const [logline, setLogline] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const slug = title.trim().toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const save = async () => {
    if (!title.trim() || !slug) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.from("works").insert({ slug, title: title.trim(), logline: logline.trim(), hub: { acts: [], beats: [], characters: [], points: [] } });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onDone(slug);
  };
  return (
    <div className="card p-5 mb-8 space-y-3 font-sans">
      <input className="input-field" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="input-field" rows={2} placeholder="Logline (one sentence, optional)" value={logline} onChange={(e) => setLogline(e.target.value)} />
      {err && <p className="text-sm text-error-600">{err}</p>}
      <div className="flex items-center gap-2">
        <button onClick={save} disabled={busy || !slug} className="btn-primary !py-2">Create</button>
        <button onClick={() => onDone(null)} className="btn-ghost">Cancel</button>
        {slug && <span className="text-xs text-ink-500 ml-auto">/work/{slug}</span>}
      </div>
    </div>
  );
}
