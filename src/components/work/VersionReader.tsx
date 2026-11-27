import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Gauge, GitCompare, Loader2, MessageSquarePlus } from "lucide-react";
import { diffWords, type Change } from "diff";
import { useRouter } from "@/lib/router";
import { FORMAT_LABEL, fmtDate, isProse, loadSections, parseBlocks, words, type Section, type Version, type Work } from "@/lib/works";
import { TextView } from "@/components/work/TextView";

// Reading one frozen version, section by section, and comparing two versions.

export function VersionReader({ work, version, versions, staff }: { work: Work; version: Version; versions: Version[]; staff: boolean }) {
  const { navigate } = useRouter();
  const [sections, setSections] = useState<Section[] | null>(null);
  const [idx, setIdx] = useState(0);
  useEffect(() => { setSections(null); loadSections(version.id).then((s) => { setSections(s); setIdx(0); }); }, [version.id]);
  const s = sections?.[idx];
  const blocks = useMemo(() => (s ? parseBlocks(s.body, version.format) : []), [s, version.format]);
  const siblings = versions.filter((v) => v.format === version.format && v.id !== version.id);
  const go = (i: number) => { setIdx(i); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const download = () => {
    if (!sections) return;
    const ext = version.format === "screenplay" ? "fountain" : "md";
    const text = sections.map((x) => x.body.trim()).join("\n\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    a.download = `${work.title} - ${FORMAT_LABEL[version.format]} - ${version.label}.${ext}`.replace(/[\\/:*?"<>|]/g, "");
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-5">
      <button onClick={() => navigate(`/work/${work.slug}`)} className="btn-ghost !px-2 -ml-2 text-sm"><ArrowLeft size={16} /> {work.title}</button>
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-widest text-ink-500 font-sans">{FORMAT_LABEL[version.format]} · {fmtDate(version.created_at)}</p>
        <h1 className="font-serif text-2xl sm:text-3xl text-ink-900 dark:text-ink-50">{version.label}</h1>
        {version.notes && <p className="text-sm text-ink-600 dark:text-ink-300 font-sans">{version.notes}</p>}
      </header>

      <div className="flex flex-wrap items-center gap-2 font-sans">
        {siblings.length > 0 && (
          <select className="input-field !py-2 !w-auto text-sm" value="" onChange={(e) => e.target.value && navigate(`/work/${work.slug}/compare/${e.target.value}/${version.id}`)}>
            <option value="">Compare with…</option>
            {siblings.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        )}
        <button onClick={download} disabled={!sections} className="btn-ghost !py-2"><Download size={15} /> {version.format === "screenplay" ? ".fountain" : ".md"}</button>
        {staff && (
          <>
            <button onClick={() => navigate(`/work/${work.slug}/reviews?version=${version.id}`)} className="btn-ghost !py-2"><MessageSquarePlus size={15} /> Send for review</button>
            <button onClick={() => navigate(`/work/${work.slug}/scorecard?version=${version.id}`)} className="btn-ghost !py-2"><Gauge size={15} /> Scorecard</button>
          </>
        )}
      </div>

      {!sections ? <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-ink-400" /></div> : !s ? <p className="text-ink-500">No text.</p> : (
        <>
          <div className="sticky top-14 z-10 -mx-4 px-4 py-2 bg-ink-50/90 dark:bg-ink-950/90 backdrop-blur flex items-center gap-2 font-sans">
            <button onClick={() => go(idx - 1)} disabled={idx === 0} className="btn-ghost !px-2 disabled:opacity-30" aria-label="Previous"><ChevronLeft size={18} /></button>
            <select className="input-field !py-2 text-sm flex-1 min-w-0" value={idx} onChange={(e) => go(Number(e.target.value))}>
              {sections.map((x, i) => <option key={x.id} value={i}>{x.title || `Section ${x.position}`}</option>)}
            </select>
            <button onClick={() => go(idx + 1)} disabled={idx >= sections.length - 1} className="btn-ghost !px-2 disabled:opacity-30" aria-label="Next"><ChevronRight size={18} /></button>
            <span className="text-xs text-ink-500 hidden sm:inline">{words(s.body).toLocaleString()} words</span>
          </div>
          <article className={`card ${isProse(version.format) ? "px-6 sm:px-10" : "px-4 sm:px-12"} py-8`}>
            <TextView blocks={blocks} screenplay={!isProse(version.format)} lang={version.lang} />
          </article>
          {idx < sections.length - 1 && (
            <div className="text-center"><button onClick={() => go(idx + 1)} className="btn-primary">Next: {sections[idx + 1].title} <ChevronRight size={16} /></button></div>
          )}
        </>
      )}
    </div>
  );
}

// ── Compare ─────────────────────────────────────────────────────────────

interface Pair { position: number; title: string; a: Section | null; b: Section | null; added: number; removed: number; changes: Change[] | null }

export function CompareView({ work, a, b, versions }: { work: Work; a: Version; b: Version; versions: Version[] }) {
  const { navigate } = useRouter();
  const [pairs, setPairs] = useState<Pair[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    setPairs(null);
    Promise.all([loadSections(a.id), loadSections(b.id)]).then(([sa, sb]) => {
      // Match sections by title when titles line up, otherwise by position.
      const byTitle = new Map(sa.map((x) => [norm(x.title), x]));
      const used = new Set<string>();
      const out: Pair[] = [];
      const n = Math.max(sa.length, sb.length);
      for (let i = 0; i < n; i++) {
        const right = sb[i] ?? null;
        let left = right ? byTitle.get(norm(right.title)) ?? null : null;
        if (!left || used.has(left.id)) left = sa[i] && !used.has(sa[i].id) ? sa[i] : null;
        if (left) used.add(left.id);
        const ch = diffWords(left?.body ?? "", right?.body ?? "");
        out.push({
          position: i + 1, title: right?.title ?? left?.title ?? `Section ${i + 1}`, a: left, b: right, changes: ch,
          added: ch.filter((c) => c.added).reduce((m, c) => m + words(c.value), 0),
          removed: ch.filter((c) => c.removed).reduce((m, c) => m + words(c.value), 0),
        });
      }
      for (const x of sa) if (!used.has(x.id)) out.push({ position: out.length + 1, title: `${x.title} (removed)`, a: x, b: null, changes: diffWords(x.body, ""), added: 0, removed: words(x.body) });
      setPairs(out);
      setOpen(out.find((p) => p.added || p.removed)?.position ?? null);
    });
  }, [a.id, b.id]);

  const same = versions.filter((v) => v.format === b.format);
  const totals = pairs?.reduce((t, p) => ({ added: t.added + p.added, removed: t.removed + p.removed }), { added: 0, removed: 0 });

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-5 font-sans">
      <button onClick={() => navigate(`/work/${work.slug}`)} className="btn-ghost !px-2 -ml-2 text-sm"><ArrowLeft size={16} /> {work.title}</button>
      <div className="flex flex-wrap items-center gap-2">
        <GitCompare size={18} className="text-accent-500" />
        <select className="input-field !py-2 !w-auto text-sm" value={a.id} onChange={(e) => navigate(`/work/${work.slug}/compare/${e.target.value}/${b.id}`)}>
          {same.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
        <span className="text-ink-500">→</span>
        <select className="input-field !py-2 !w-auto text-sm" value={b.id} onChange={(e) => navigate(`/work/${work.slug}/compare/${a.id}/${e.target.value}`)}>
          {same.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
        {totals && <span className="text-sm ml-auto"><span className="text-emerald-600">+{totals.added.toLocaleString()}</span> / <span className="text-rose-600">−{totals.removed.toLocaleString()}</span> words</span>}
      </div>

      {!pairs ? <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-ink-400" /></div> : (
        <div className="space-y-2">
          {pairs.map((p) => {
            const changed = p.added || p.removed;
            return (
              <div key={p.position} className="card overflow-hidden">
                <button onClick={() => setOpen(open === p.position ? null : p.position)} disabled={!changed}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm">
                  <span className={`w-2 h-2 rounded-full ${changed ? "bg-accent-500" : "bg-ink-300 dark:bg-ink-700"}`} />
                  <span className="flex-1 text-ink-800 dark:text-ink-100">{p.title}</span>
                  {changed ? <span><span className="text-emerald-600">+{p.added}</span> <span className="text-rose-600">−{p.removed}</span></span> : <span className="text-ink-400">unchanged</span>}
                </button>
                {open === p.position && p.changes && (
                  <div className="px-5 sm:px-8 pb-6 pt-2 border-t border-ink-200 dark:border-ink-800 font-serif text-[17px] leading-relaxed whitespace-pre-wrap text-ink-700 dark:text-ink-300">
                    {condense(p.changes).map((c, i) => c.added
                      ? <ins key={i} className="bg-emerald-200/60 dark:bg-emerald-600/30 no-underline">{c.value}</ins>
                      : c.removed ? <del key={i} className="bg-rose-200/60 dark:bg-rose-600/30 text-rose-800 dark:text-rose-200">{c.value}</del>
                      : <span key={i}>{c.value}</span>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const norm = (t: string) => t.toLowerCase().replace(/^(chapter|ch\.?)\s*\w+[:.]?\s*/, "").replace(/[^a-z0-9]/g, "");

/** Long unchanged stretches collapse to their first and last lines. */
function condense(changes: Change[]): Change[] {
  return changes.map((c) => {
    if (c.added || c.removed || c.value.length < 700) return c;
    return { ...c, value: `${c.value.slice(0, 260)}\n\n  · · ·\n\n${c.value.slice(-260)}` };
  });
}
