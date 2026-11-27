import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Gauge, Quote, Wrench } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { craftApi, FORMAT_LABEL, fmtDate, RATING_STYLE, STC_BEATS, type CraftRun, type Rating, type Version, type Work } from "@/lib/works";
import { ModelPicker, Running, useCraftRun } from "@/components/work/craftRun";

// Red / yellow / green against the craft books, per version, on demand.

interface Item { id: string; label: string; source: string; group: string; rating: Rating; summary: string; evidence: Array<{ where: string; quote: string }>; fix: string }
interface ScoreResult {
  format: string;
  overall: { rating: Rating; headline: string; strengths: string[]; priorities: string[] };
  items: Item[];
  sections: Array<{ position: number; rating: Rating; tension: number; turn: string; note: string }>;
  beats: Array<{ key: string; where: string; pct: number; status: string; note: string }>;
}

export function ScorecardPanel({ work, versions }: { work: Work; versions: Version[] }) {
  const scorable = versions.filter((v) => v.format !== "webtoon");
  const initial = new URLSearchParams(window.location.search).get("version");
  const [versionId, setVersionId] = useState(
    scorable.find((v) => v.id === initial)?.id ?? scorable.find((v) => v.status === "current")?.id ?? scorable[0]?.id ?? "",
  );
  const [model, setModel] = useState<"sonnet" | "opus">("sonnet");
  const [err, setErr] = useState<string | null>(null);
  const { run, history, running, reload } = useCraftRun({ kind: "score", version_id: versionId });
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => setPicked(null), [versionId]);
  const version = versions.find((v) => v.id === versionId);
  const shown = history.find((h) => h.id === picked) ?? history.find((h) => h.status === "done") ?? null;

  if (!scorable.length) return <p className="text-ink-500 font-sans">Add a version first.</p>;

  const start = async () => {
    setErr(null);
    try { await craftApi.score(versionId, model); await reload(); } catch (e) { setErr((e as Error).message); }
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="card p-4 flex flex-wrap items-center gap-2 text-sm">
        <Gauge size={18} className="text-accent-500" />
        <select className="input-field !py-2 !w-auto text-sm max-w-full" value={versionId} onChange={(e) => setVersionId(e.target.value)}>
          {scorable.map((v) => <option key={v.id} value={v.id}>{FORMAT_LABEL[v.format]}: {v.label}</option>)}
        </select>
        <ModelPicker value={model} onChange={setModel} />
        <button onClick={start} disabled={running} className="btn-primary !py-2 !px-4">{shown ? "Score again" : "Score this version"}</button>
        {history.filter((h) => h.status === "done").length > 1 && (
          <select className="input-field !py-2 !w-auto text-sm ml-auto" value={shown?.id ?? ""} onChange={(e) => setPicked(e.target.value)}>
            {history.filter((h) => h.status === "done").map((h) => <option key={h.id} value={h.id}>{fmtDate(h.created_at)} · {h.model.replace("claude-", "")}</option>)}
          </select>
        )}
        <p className="w-full text-xs text-ink-500">
          Claude reads the whole {version ? FORMAT_LABEL[version.format].toLowerCase() : "version"} against {version?.format === "screenplay" ? "Save the Cat, Syd Field, McKee, Truby, Goldman and Trottier" : "Truby, Save the Cat! Writes a Novel, Story Grid, Maass, Cron, Swain, Self-Editing for Fiction Writers and King"}.
          It uses your Anthropic key: a full novella costs roughly a dollar on Sonnet, a few on Opus.
        </p>
        {err && <p className="w-full text-error-600">{err}</p>}
      </div>

      {running && <Running text="Reading the whole version and grading it against each criterion…" />}
      {run?.status === "failed" && !running && <p className="text-sm text-error-600">The last scoring run failed: {run.error}</p>}
      {shown && <ScoreView r={shown.result as ScoreResult} />}
      {!shown && !running && <p className="text-ink-500 text-sm">No scorecard for this version yet.</p>}

      <AcrossVersions work={work} versions={versions} format={version?.format ?? ""} />
    </div>
  );
}

function Dot({ r, size = 3 }: { r: Rating; size?: number }) {
  return <span className={`inline-block rounded-full shrink-0 ${RATING_STYLE[r]?.dot ?? "bg-ink-300"}`} style={{ width: size * 4, height: size * 4 }} />;
}

function ScoreView({ r }: { r: ScoreResult }) {
  const [open, setOpen] = useState<string | null>(null);
  const groups = useMemo(() => Array.from(new Set(r.items.map((i) => i.group))), [r]);
  const counts = { green: 0, yellow: 0, red: 0 } as Record<Rating, number>;
  r.items.forEach((i) => { counts[i.rating] = (counts[i.rating] ?? 0) + 1; });
  const unit = r.format === "screenplay" ? "Section" : "Ch";

  return (
    <div className="space-y-6">
      <div className="card p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`px-3 py-1 rounded-full border text-sm font-medium ${RATING_STYLE[r.overall.rating].chip}`}>Overall: {RATING_STYLE[r.overall.rating].label}</span>
          <span className="text-sm text-ink-500">{counts.green} green · {counts.yellow} yellow · {counts.red} red</span>
        </div>
        <p className="font-serif text-lg text-ink-900 dark:text-ink-50">{r.overall.headline}</p>
        <div className="grid gap-4 sm:grid-cols-2 text-sm">
          <div><div className="text-xs uppercase tracking-wide text-emerald-600 mb-1">Working</div><ul className="space-y-1 list-disc pl-4">{r.overall.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
          <div><div className="text-xs uppercase tracking-wide text-rose-600 mb-1">Fix first</div><ol className="space-y-1 list-decimal pl-4">{r.overall.priorities.map((s, i) => <li key={i}>{s}</li>)}</ol></div>
        </div>
      </div>

      {groups.map((g) => (
        <section key={g} className="space-y-2">
          <h3 className="text-xs uppercase tracking-wide text-ink-500">{g}</h3>
          <div className="card divide-y divide-ink-200 dark:divide-ink-800">
            {r.items.filter((i) => i.group === g).map((i) => (
              <div key={i.id}>
                <button onClick={() => setOpen(open === i.id ? null : i.id)} className="w-full px-4 py-3 flex items-center gap-3 text-left">
                  <Dot r={i.rating} />
                  <span className="flex-1">
                    <span className="text-sm font-medium text-ink-900 dark:text-ink-50">{i.label}</span>
                    <span className="text-xs text-ink-500 ml-2">{i.source}</span>
                  </span>
                  {open === i.id ? <ChevronDown size={16} className="text-ink-400" /> : <ChevronRight size={16} className="text-ink-400" />}
                </button>
                {open === i.id && (
                  <div className="px-4 pb-4 pl-11 space-y-2 text-sm">
                    <p className="text-ink-700 dark:text-ink-200">{i.summary}</p>
                    {i.evidence.map((e, k) => (
                      <p key={k} className="text-ink-600 dark:text-ink-300 flex gap-2"><Quote size={13} className="mt-1 shrink-0 text-ink-400" /><span><b className="font-medium">{e.where}:</b> “{e.quote}”</span></p>
                    ))}
                    {i.fix && <p className="flex gap-2 text-accent-700 dark:text-accent-300"><Wrench size={13} className="mt-1 shrink-0" /><span>{i.fix}</span></p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      {r.sections?.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs uppercase tracking-wide text-ink-500">Chapter by chapter</h3>
          <div className="card p-4 space-y-3">
            <div className="flex items-end gap-1 h-16">
              {r.sections.map((s) => (
                <div key={s.position} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-[14px]" title={`${unit} ${s.position}: tension ${s.tension}/5 · ${s.turn}`}>
                  <div className={`w-full rounded-t ${RATING_STYLE[s.rating]?.dot ?? ""} opacity-80`} style={{ height: `${s.tension * 20}%` }} />
                </div>
              ))}
            </div>
            <div className="flex gap-1 text-[10px] text-ink-500">{r.sections.map((s) => <div key={s.position} className="flex-1 text-center min-w-[14px]">{s.position}</div>)}</div>
            <p className="text-[11px] text-ink-500">Bar height is tension (1–5); color is how well the {unit === "Ch" ? "chapter" : "section"} works.</p>
            <ul className="divide-y divide-ink-200 dark:divide-ink-800 text-sm">
              {r.sections.map((s) => (
                <li key={s.position} className="py-2 flex gap-3">
                  <Dot r={s.rating} size={2.5} />
                  <span className="w-14 shrink-0 text-ink-500">{unit} {s.position}</span>
                  <span className="w-36 shrink-0 text-ink-500 hidden sm:block">{s.turn}</span>
                  <span className="text-ink-700 dark:text-ink-200">{s.note}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {r.beats?.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs uppercase tracking-wide text-ink-500">Beat timing</h3>
          <div className="card divide-y divide-ink-200 dark:divide-ink-800 text-sm">
            {STC_BEATS.map((meta) => {
              const b = r.beats.find((x) => x.key === meta.key);
              if (!b) return null;
              const tone: Rating = b.status === "on time" ? "green" : b.status === "missing" ? "red" : "yellow";
              return (
                <div key={meta.key} className="px-4 py-2.5 flex flex-wrap items-center gap-3">
                  <Dot r={tone} size={2.5} />
                  <span className="w-44 font-medium text-ink-900 dark:text-ink-50">{meta.label}</span>
                  <span className="w-24 text-ink-500">{b.where}</span>
                  <span className="w-28 text-xs text-ink-500">{Math.round(b.pct)}% <span className="text-ink-400">(aim ~{meta.pct}%)</span> · {b.status}</span>
                  <span className="flex-1 min-w-[200px] text-ink-700 dark:text-ink-200">{b.note}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

/** Latest scorecard of each version of the same format, side by side, to watch yellows turn green. */
function AcrossVersions({ work, versions, format }: { work: Work; versions: Version[]; format: string }) {
  const [runs, setRuns] = useState<CraftRun[]>([]);
  useEffect(() => {
    supabase.from("craft_runs").select("*").eq("work_slug", work.slug).eq("kind", "score").eq("status", "done").order("created_at", { ascending: false })
      .then(({ data }) => setRuns((data as CraftRun[]) ?? []));
  }, [work.slug, format]);
  const cols = versions.filter((v) => v.format === format)
    .map((v) => ({ v, r: runs.find((x) => x.version_id === v.id)?.result as ScoreResult | undefined }))
    .filter((c) => c.r)
    .sort((a, b) => a.v.created_at.localeCompare(b.v.created_at));
  if (cols.length < 2) return null;
  const items = cols[cols.length - 1].r!.items;
  return (
    <section className="space-y-2">
      <h3 className="text-xs uppercase tracking-wide text-ink-500">Across versions</h3>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-ink-500">
            <th className="px-4 py-2 font-medium">Criterion</th>
            {cols.map((c) => <th key={c.v.id} className="px-3 py-2 font-medium text-center whitespace-nowrap">{c.v.label}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
            <tr><td className="px-4 py-2 font-medium">Overall</td>{cols.map((c) => <td key={c.v.id} className="text-center"><Dot r={c.r!.overall.rating} /></td>)}</tr>
            {items.map((it) => (
              <tr key={it.id}>
                <td className="px-4 py-2">{it.label}</td>
                {cols.map((c) => { const x = c.r!.items.find((y) => y.id === it.id); return <td key={c.v.id} className="text-center">{x ? <Dot r={x.rating} /> : <span className="text-ink-300">·</span>}</td>; })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
