import { useEffect, useMemo, useState } from "react";
import { Check, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  craftApi, FORMAT_LABEL, hubBeats, isProse, STC_BEATS,
  type Hub, type HubAct, type HubBeat, type HubCharacter, type HubPoint, type Version, type Work,
} from "@/lib/works";
import { ModelPicker, Running, useCraftRun } from "@/components/work/craftRun";

// The Story Hub: logline, theme, the three acts, the 15 Save the Cat beats with where each lands
// in the novella and in the screenplay, characters, and key points (decisions, continuity, style).

const ACT_SPAN: Record<number, [number, number]> = { 1: [0, 20], 2: [20, 80], 3: [80, 100] };
const STATUS_DOT: Record<string, string> = { set: "bg-emerald-500", weak: "bg-amber-400", missing: "bg-rose-500", "": "bg-ink-300 dark:bg-ink-600" };
const POINT_KINDS: Array<{ kind: HubPoint["kind"]; label: string }> = [
  { kind: "decision", label: "Locked decisions" }, { kind: "continuity", label: "Continuity" },
  { kind: "style", label: "Style rules" }, { kind: "open", label: "Open questions" }, { kind: "note", label: "Notes" },
];

export function StoryHub({ work, versions, staff, onSaved }: { work: Work; versions: Version[]; staff: boolean; onSaved: () => void }) {
  const [edit, setEdit] = useState(false);
  const [hub, setHub] = useState<Hub>(work.hub ?? {});
  const [logline, setLogline] = useState(work.logline);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setHub(work.hub ?? {}); setLogline(work.logline); }, [work]);

  const beats = useMemo(() => hubBeats(hub), [hub]);
  const acts: HubAct[] = [1, 2, 3].map((n) => hub.acts?.find((a) => a.act === n) ?? { act: n, summary: "" });
  const setBeat = (key: string, patch: Partial<HubBeat>) =>
    setHub((h) => ({ ...h, beats: hubBeats(h).map((b) => (b.key === key ? { ...b, ...patch } : b)) }));
  const setAct = (n: number, patch: Partial<HubAct>) =>
    setHub((h) => ({ ...h, acts: [1, 2, 3].map((k) => ({ ...(h.acts?.find((a) => a.act === k) ?? { act: k, summary: "" }), ...(k === n ? patch : {}) })) }));

  const save = async () => {
    setSaving(true);
    await supabase.from("works").update({ hub, logline, updated_at: new Date().toISOString() }).eq("slug", work.slug);
    setSaving(false); setEdit(false); onSaved();
  };
  const cancel = () => { setHub(work.hub ?? {}); setLogline(work.logline); setEdit(false); };

  return (
    <div className="space-y-8">
      {staff && (
        <div className="flex flex-wrap gap-2 justify-end font-sans">
          {edit ? (
            <>
              <button onClick={cancel} className="btn-ghost !py-2"><X size={15} /> Cancel</button>
              <button onClick={save} disabled={saving} className="btn-primary !py-2 !px-4"><Check size={15} /> Save hub</button>
            </>
          ) : <button onClick={() => setEdit(true)} className="btn-secondary !py-2 !px-4"><Pencil size={15} /> Edit</button>}
        </div>
      )}

      {staff && !edit && <DraftWithClaude work={work} versions={versions} hub={hub} onApply={async (h, l) => {
        await supabase.from("works").update({ hub: h, logline: l ?? work.logline, updated_at: new Date().toISOString() }).eq("slug", work.slug);
        onSaved();
      }} />}

      {/* Essentials */}
      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="Logline" wide edit={edit} value={logline} onChange={setLogline} />
        <Field label="Genre" edit={edit} value={hub.genre ?? ""} onChange={(v) => setHub({ ...hub, genre: v })} />
        <Field label="Theme" edit={edit} value={hub.theme ?? ""} onChange={(v) => setHub({ ...hub, theme: v })} />
        <Field label="Premise" wide edit={edit} value={hub.premise ?? ""} onChange={(v) => setHub({ ...hub, premise: v })} />
      </section>

      {/* Three-act strip */}
      <section className="space-y-3">
        <h2 className="font-sans text-sm uppercase tracking-wide text-ink-500">Three-act structure</h2>
        <ActStrip beats={beats} />
        <div className="grid gap-3 sm:grid-cols-3">
          {acts.map((a) => (
            <div key={a.act} className="card p-4 font-sans space-y-2">
              <div className="text-xs uppercase tracking-widest text-accent-600">Act {["I", "II", "III"][a.act - 1]}</div>
              {edit ? (
                <>
                  <textarea className="input-field !py-2 text-sm" rows={4} value={a.summary} onChange={(e) => setAct(a.act, { summary: e.target.value })} placeholder="What happens" />
                  <input className="input-field !py-1.5 text-sm" placeholder="Novella: Ch 1–4" value={a.prose ?? a.novella ?? ""} onChange={(e) => setAct(a.act, { prose: e.target.value })} />
                  <input className="input-field !py-1.5 text-sm" placeholder="Screenplay: pp. 1–25" value={a.screen ?? a.screenplay ?? ""} onChange={(e) => setAct(a.act, { screen: e.target.value })} />
                </>
              ) : (
                <>
                  <p className="text-sm text-ink-700 dark:text-ink-200 leading-relaxed">{a.summary || <span className="text-ink-400">Not described yet.</span>}</p>
                  <Where prose={a.prose ?? a.novella} screen={a.screen ?? a.screenplay} />
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Beats */}
      <section className="space-y-3">
        <h2 className="font-sans text-sm uppercase tracking-wide text-ink-500">Beat sheet <span className="normal-case tracking-normal">(Save the Cat)</span></h2>
        <div className="card divide-y divide-ink-200 dark:divide-ink-800 font-sans">
          {beats.map((b) => {
            const meta = STC_BEATS.find((x) => x.key === b.key)!;
            return (
              <div key={b.key} className="px-4 py-3 grid gap-2 sm:grid-cols-[180px_1fr_auto] sm:items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[b.status ?? ""]}`} />
                    <span className="text-sm font-medium text-ink-900 dark:text-ink-50">{b.label}</span>
                  </div>
                  <div className="text-[11px] text-ink-500 mt-0.5 pl-[18px]">~{meta.pct}% · {meta.hint}</div>
                </div>
                {edit ? (
                  <div className="space-y-2">
                    <textarea className="input-field !py-1.5 text-sm" rows={2} value={b.summary} onChange={(e) => setBeat(b.key, { summary: e.target.value })} placeholder="What happens here" />
                    <div className="flex gap-2">
                      <input className="input-field !py-1.5 text-sm" placeholder="Novella: Ch 3" value={b.prose} onChange={(e) => setBeat(b.key, { prose: e.target.value })} />
                      <input className="input-field !py-1.5 text-sm" placeholder="Screenplay: p. 24" value={b.screen} onChange={(e) => setBeat(b.key, { screen: e.target.value })} />
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-ink-700 dark:text-ink-200">{b.summary || <span className="text-ink-400">—</span>}</p>
                    <Where prose={b.prose} screen={b.screen} />
                  </div>
                )}
                {edit ? (
                  <select className="input-field !py-1.5 !w-auto text-sm" value={b.status} onChange={(e) => setBeat(b.key, { status: e.target.value as HubBeat["status"] })}>
                    <option value="">Not set</option><option value="set">Lands</option><option value="weak">Weak</option><option value="missing">Missing</option>
                  </select>
                ) : <span className="text-xs text-ink-500">{{ set: "Lands", weak: "Weak", missing: "Missing", "": "" }[b.status ?? ""]}</span>}
              </div>
            );
          })}
        </div>
      </section>

      <Characters edit={edit} list={hub.characters ?? []} onChange={(c) => setHub({ ...hub, characters: c })} />
      <Points edit={edit} list={hub.points ?? []} onChange={(p) => setHub({ ...hub, points: p })} />
    </div>
  );
}

function Field({ label, value, onChange, edit, wide }: { label: string; value: string; onChange: (v: string) => void; edit: boolean; wide?: boolean }) {
  return (
    <div className={`font-sans ${wide ? "sm:col-span-2" : ""}`}>
      <div className="text-xs uppercase tracking-wide text-ink-500 mb-1">{label}</div>
      {edit ? <textarea className="input-field !py-2 text-sm" rows={wide ? 3 : 2} value={value} onChange={(e) => onChange(e.target.value)} />
        : <p className={`text-ink-800 dark:text-ink-100 ${label === "Logline" ? "font-serif text-lg" : "text-sm"} leading-relaxed`}>{value || <span className="text-ink-400 text-sm">—</span>}</p>}
    </div>
  );
}

function Where({ prose, screen }: { prose?: string; screen?: string }) {
  if (!prose && !screen) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {prose && <span className="text-[11px] px-2 py-0.5 rounded-full bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300">Novella · {prose}</span>}
      {screen && <span className="text-[11px] px-2 py-0.5 rounded-full bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300">Screenplay · {screen}</span>}
    </div>
  );
}

function ActStrip({ beats }: { beats: HubBeat[] }) {
  const shown = beats.filter((b) => b.key !== "setup" && b.key !== "fun_and_games" && b.key !== "bad_guys_close_in");
  return (
    <div className="card px-4 pt-4 pb-14 font-sans overflow-x-auto">
      <div className="relative min-w-[640px] h-8">
        {[1, 2, 3].map((n) => {
          const [a, z] = ACT_SPAN[n];
          return (
            <div key={n} className={`absolute top-0 h-8 flex items-center justify-center text-xs font-medium ${n === 2 ? "bg-accent-500/15 text-accent-700 dark:text-accent-300" : "bg-ink-200/70 dark:bg-ink-800 text-ink-600 dark:text-ink-300"} ${n === 1 ? "rounded-l-lg" : ""} ${n === 3 ? "rounded-r-lg" : ""}`}
              style={{ left: `${a}%`, width: `${z - a}%` }}>Act {["I", "II", "III"][n - 1]}</div>
          );
        })}
        <div className="absolute top-0 h-8 border-l border-dashed border-accent-500/60" style={{ left: "50%" }} />
        {shown.map((b, i) => (
          <div key={b.key} className="absolute top-8 flex flex-col items-center -translate-x-1/2" style={{ left: `${Math.min(99, Math.max(1, b.pct))}%` }}
            title={`${b.label}${b.prose ? ` · Novella ${b.prose}` : ""}${b.screen ? ` · Screenplay ${b.screen}` : ""}`}>
            <span className={`w-3 h-3 -mt-1.5 rounded-full ring-2 ring-ink-50 dark:ring-ink-900 ${STATUS_DOT[b.status ?? ""]}`} />
            <span className={`text-[10px] leading-tight text-ink-500 whitespace-nowrap ${i % 2 ? "mt-5" : "mt-1"}`}>{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Characters({ edit, list, onChange }: { edit: boolean; list: HubCharacter[]; onChange: (c: HubCharacter[]) => void }) {
  const set = (i: number, patch: Partial<HubCharacter>) => onChange(list.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  if (!edit && !list.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="font-sans text-sm uppercase tracking-wide text-ink-500">Characters</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {list.map((c, i) => (
          <div key={i} className="card p-4 font-sans text-sm space-y-1.5">
            {edit ? (
              <>
                <div className="flex gap-2">
                  <input className="input-field !py-1.5" value={c.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Name" />
                  <input className="input-field !py-1.5" value={c.role} onChange={(e) => set(i, { role: e.target.value })} placeholder="Role" />
                  <button onClick={() => onChange(list.filter((_, j) => j !== i))} className="btn-ghost !px-2"><Trash2 size={14} /></button>
                </div>
                {(["want", "need", "arc", "notes"] as const).map((k) => (
                  <textarea key={k} className="input-field !py-1.5 text-sm" rows={k === "notes" ? 2 : 1} value={c[k] ?? ""} onChange={(e) => set(i, { [k]: e.target.value })} placeholder={k[0].toUpperCase() + k.slice(1)} />
                ))}
              </>
            ) : (
              <>
                <div className="flex items-baseline gap-2"><span className="font-medium text-ink-900 dark:text-ink-50">{c.name}</span><span className="text-xs text-ink-500">{c.role}</span></div>
                {c.want && <p><span className="text-ink-500">Wants:</span> {c.want}</p>}
                {c.need && <p><span className="text-ink-500">Needs:</span> {c.need}</p>}
                {c.arc && <p><span className="text-ink-500">Arc:</span> {c.arc}</p>}
                {c.notes && <p className="text-ink-600 dark:text-ink-300">{c.notes}</p>}
              </>
            )}
          </div>
        ))}
        {edit && <button onClick={() => onChange([...list, { name: "", role: "", want: "", need: "", arc: "", notes: "" }])} className="card p-4 border-dashed text-ink-500 font-sans text-sm flex items-center justify-center gap-2"><Plus size={15} /> Character</button>}
      </div>
    </section>
  );
}

function Points({ edit, list, onChange }: { edit: boolean; list: HubPoint[]; onChange: (p: HubPoint[]) => void }) {
  if (!edit && !list.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="font-sans text-sm uppercase tracking-wide text-ink-500">Key points</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {POINT_KINDS.map(({ kind, label }) => {
          const items = list.map((p, i) => ({ ...p, i })).filter((p) => p.kind === kind);
          if (!edit && !items.length) return null;
          return (
            <div key={kind} className="card p-4 font-sans text-sm">
              <div className="text-xs uppercase tracking-wide text-accent-600 mb-2">{label}</div>
              <ul className="space-y-1.5">
                {items.map((p) => (
                  <li key={p.i} className="flex gap-2">
                    {edit ? (
                      <>
                        <textarea className="input-field !py-1.5 text-sm" rows={2} value={p.text} onChange={(e) => onChange(list.map((x, j) => (j === p.i ? { ...x, text: e.target.value } : x)))} />
                        <button onClick={() => onChange(list.filter((_, j) => j !== p.i))} className="btn-ghost !px-2"><Trash2 size={14} /></button>
                      </>
                    ) : <><span className="text-ink-400">•</span><span className="text-ink-700 dark:text-ink-200">{p.text}</span></>}
                  </li>
                ))}
              </ul>
              {edit && <button onClick={() => onChange([...list, { kind, text: "" }])} className="btn-ghost !py-1 !px-2 mt-2 text-xs"><Plus size={13} /> Add</button>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Draft the hub from a version ──────────────────────────────────────

function DraftWithClaude({ work, versions, hub, onApply }: { work: Work; versions: Version[]; hub: Hub; onApply: (h: Hub, logline?: string) => Promise<void> }) {
  const candidates = versions.filter((v) => v.format === "novella" || v.format === "novel" || v.format === "screenplay");
  const [versionId, setVersionId] = useState(candidates.find((v) => v.status === "current")?.id ?? candidates[0]?.id ?? "");
  const [model, setModel] = useState<"sonnet" | "opus">("sonnet");
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { run, running, reload } = useCraftRun({ kind: "hub", work_slug: work.slug });
  const [dismissed, setDismissed] = useState<string | null>(null);

  if (!candidates.length) return null;
  const start = async () => {
    setErr(null);
    try { await craftApi.hub(versionId, model); await reload(); } catch (e) { setErr((e as Error).message); }
  };
  const result = run?.status === "done" && run.id !== dismissed ? run.result as {
    logline: string; premise: string; theme: string; genre: string; format: string; version_label: string;
    acts: Array<{ act: number; summary: string; where: string }>;
    beats: Array<{ key: string; summary: string; where: string; status: HubBeat["status"] }>;
    characters: Array<Omit<HubCharacter, "notes">>;
  } : null;

  const apply = async () => {
    if (!result || !run) return;
    const prose = isProse(result.format);
    const field = prose ? "prose" : "screen";
    const h: Hub = {
      ...hub,
      genre: hub.genre || result.genre, theme: hub.theme || result.theme, premise: hub.premise || result.premise,
      acts: [1, 2, 3].map((n) => {
        const old = hub.acts?.find((a) => a.act === n) ?? { act: n, summary: "" };
        const neu = result.acts.find((a) => a.act === n);
        return { ...old, summary: old.summary || neu?.summary || "", [field]: neu?.where ?? (old as unknown as Record<string, string>)[field] ?? "" };
      }),
      beats: hubBeats(hub).map((b) => {
        const neu = result.beats.find((x) => x.key === b.key);
        if (!neu) return b;
        return { ...b, summary: b.summary || neu.summary, [field]: neu.where, status: neu.status };
      }),
      characters: mergeCharacters(hub.characters ?? [], result.characters),
    };
    await onApply(h, work.logline ? undefined : result.logline);
    setDismissed(run.id);
  };

  return (
    <div className="font-sans">
      {!open && !running && !result && (
        <button onClick={() => setOpen(true)} className="btn-ghost !py-2 text-sm"><Sparkles size={15} /> Map the beats from a version with Claude</button>
      )}
      {open && !running && !result && (
        <div className="card p-4 flex flex-wrap items-center gap-2 text-sm">
          <Sparkles size={16} className="text-accent-500" />
          <span>Read</span>
          <select className="input-field !py-2 !w-auto text-sm" value={versionId} onChange={(e) => setVersionId(e.target.value)}>
            {candidates.map((v) => <option key={v.id} value={v.id}>{FORMAT_LABEL[v.format]}: {v.label}</option>)}
          </select>
          <span>and find where each beat and act lands.</span>
          <ModelPicker value={model} onChange={setModel} />
          <button onClick={start} className="btn-primary !py-2 !px-4">Start</button>
          <button onClick={() => setOpen(false)} className="btn-ghost !py-2">Cancel</button>
          {err && <p className="w-full text-error-600">{err}</p>}
        </div>
      )}
      {running && <Running text="Reading the whole version and mapping the acts, beats and characters…" />}
      {run?.status === "failed" && run.id !== dismissed && (
        <div className="card p-4 text-sm text-error-600 flex items-center gap-3">Mapping failed: {run.error}<button onClick={() => setDismissed(run.id)} className="btn-ghost !py-1 ml-auto">Dismiss</button></div>
      )}
      {result && (
        <div className="card p-5 space-y-3 text-sm border-accent-400/50">
          <div className="flex items-center gap-2"><Sparkles size={16} className="text-accent-500" /><span className="font-medium">Claude's map of {FORMAT_LABEL[result.format]}: {result.version_label}</span></div>
          <p className="text-ink-600 dark:text-ink-300 italic">{result.logline}</p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {result.beats.map((b) => (
              <li key={b.key} className="flex gap-2"><span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[b.status]}`} />
                <span><b>{STC_BEATS.find((x) => x.key === b.key)?.label}</b> ({b.where}): {b.summary}</span></li>
            ))}
          </ul>
          <p className="text-xs text-ink-500">Apply fills in where each beat and act lands in the {isProse(result.format) ? "novella" : "screenplay"}, beat statuses, and anything still empty. Your own text stays.</p>
          <div className="flex gap-2"><button onClick={apply} className="btn-primary !py-2">Apply to the hub</button><button onClick={() => setDismissed(run!.id)} className="btn-ghost !py-2">Discard</button></div>
        </div>
      )}
    </div>
  );
}

function mergeCharacters(old: HubCharacter[], neu: Array<Omit<HubCharacter, "notes">>): HubCharacter[] {
  const out = old.map((c) => ({ ...c }));
  for (const n of neu) {
    const first = n.name.split(" ")[0].toLowerCase();
    const have = out.find((c) => c.name.toLowerCase() === n.name.toLowerCase() || c.name.split(" ")[0].toLowerCase() === first);
    if (have) { have.want ||= n.want; have.need ||= n.need; have.arc ||= n.arc; have.role ||= n.role; }
    else out.push({ ...n, notes: "" });
  }
  return out;
}
