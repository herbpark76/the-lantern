import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Check, CheckCheck, Copy, GitBranchPlus, Lock, Mail, MessageSquare, Plus, Sparkles, Trash2, Unlock, UserPlus, X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "@/lib/router";
import {
  craftApi, createVersion, FORMAT_LABEL, fmtAgo, fmtDate, loadSections, parseBlocks, REACTIONS, reactionOf, reviewLink,
  type Note, type Question, type Reviewer, type Round, type Section, type Version, type Work,
} from "@/lib/works";
import { ModelPicker, Running, useCraftRun } from "@/components/work/craftRun";

const DEFAULT_INSTRUCTIONS = `Thank you for reading! Read it the way you'd read any book. When something strikes you:
• Select any words to leave a comment or suggest an edit.
• Tap the little face beside a paragraph if it dragged, confused you, or you loved it.
• At the end of each chapter, rate how much you wanted to keep going.
Honest beats nice. You can stop and come back any time with the same link.`;

const qid = () => Math.random().toString(36).slice(2, 9);

// ── The list of rounds and starting a new one ─────────────────────────

export function ReviewsPanel({ work, versions }: { work: Work; versions: Version[] }) {
  const { navigate } = useRouter();
  const initial = new URLSearchParams(window.location.search).get("version");
  const [rounds, setRounds] = useState<Array<Round & { reviewers: Array<Pick<Reviewer, "id" | "finished_at">>; review_notes: Array<{ count: number }> }>>([]);
  const [creating, setCreating] = useState(!!initial);
  const load = useCallback(async () => {
    const ids = versions.map((v) => v.id);
    if (!ids.length) { setRounds([]); return; }
    const { data } = await supabase.from("review_rounds").select("*, reviewers(id, finished_at), review_notes(count)").in("version_id", ids).order("created_at", { ascending: false });
    setRounds((data as typeof rounds) ?? []);
  }, [versions]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6 font-sans">
      <div className="flex justify-end"><button onClick={() => setCreating((c) => !c)} className="btn-primary !py-2 !px-4"><Plus size={16} /> New review round</button></div>
      {creating && <NewRound work={work} versions={versions} initialVersion={initial} onDone={(id) => { setCreating(false); if (id) navigate(`/work/${work.slug}/round/${id}`); else load(); }} />}

      {rounds.length === 0 && !creating && (
        <div className="card p-8 text-center text-ink-500 space-y-2">
          <p>No review rounds yet.</p>
          <p className="text-sm">A round sends one frozen version to a few readers. Each gets a private link: no account, they just read and react.</p>
        </div>
      )}

      <div className="grid gap-3">
        {rounds.map((r) => {
          const v = versions.find((x) => x.id === r.version_id);
          const done = r.reviewers.filter((x) => x.finished_at).length;
          return (
            <button key={r.id} onClick={() => navigate(`/work/${work.slug}/round/${r.id}`)} className="card card-hover p-4 text-left flex flex-wrap items-center gap-3">
              <MessageSquare size={18} className="text-accent-500" />
              <div className="flex-1 min-w-[200px]">
                <div className="font-medium text-ink-900 dark:text-ink-50">{r.title}</div>
                <div className="text-xs text-ink-500">{v ? `${FORMAT_LABEL[v.format]}: ${v.label}` : ""} · started {fmtDate(r.created_at)}{r.due_at ? ` · due ${fmtDate(r.due_at)}` : ""}</div>
              </div>
              <span className="text-sm text-ink-600 dark:text-ink-300">{done}/{r.reviewers.length} finished · {r.review_notes[0]?.count ?? 0} notes</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full ${r.status === "open" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-ink-200 dark:bg-ink-800 text-ink-500"}`}>{r.status === "open" ? "Open" : "Closed"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NewRound({ work, versions, initialVersion, onDone }: { work: Work; versions: Version[]; initialVersion: string | null; onDone: (id: string | null) => void }) {
  const [versionId, setVersionId] = useState(versions.find((v) => v.id === initialVersion)?.id ?? versions.find((v) => v.status === "current")?.id ?? versions[0]?.id ?? "");
  const version = versions.find((v) => v.id === versionId);
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState(DEFAULT_INSTRUCTIONS);
  const [due, setDue] = useState("");
  const [showOthers, setShowOthers] = useState(false);
  const [sections, setSections] = useState<Section[]>([]);
  const openQs = (work.hub.points ?? []).filter((p) => p.kind === "open").map((p) => ({ id: qid(), text: p.text, section: null as number | null }));
  const [questions, setQuestions] = useState<Question[]>(openQs.length ? openQs : [
    { id: qid(), text: "Where, if anywhere, did you lose interest or put it down?", section: null },
    { id: qid(), text: "Which character did you care about most, and who felt least real?", section: null },
    { id: qid(), text: "Was the ending satisfying? Was anything left unclear that shouldn't be?", section: null },
  ]);
  const [names, setNames] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (versionId) loadSections(versionId).then(setSections); }, [versionId]);
  useEffect(() => { if (version) setTitle(`${FORMAT_LABEL[version.format]} ${version.label}: readers`); }, [version?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!versionId || !title.trim()) return;
    setBusy(true); setErr(null);
    const { data, error } = await supabase.from("review_rounds").insert({
      version_id: versionId, title: title.trim(), instructions, due_at: due || null, show_others: showOthers,
      questions: questions.filter((q) => q.text.trim()),
    }).select("id").single();
    if (error) { setErr(error.message); setBusy(false); return; }
    const id = (data as { id: string }).id;
    const people = names.split(/[\n,]/).map((n) => n.trim()).filter(Boolean).map((n) => {
      const m = /^(.*?)\s*<(.+)>$/.exec(n);
      return { round_id: id, name: m ? m[1] : n, email: m ? m[2] : "" };
    });
    if (people.length) await supabase.from("reviewers").insert(people);
    onDone(id);
  };

  return (
    <div className="card p-5 space-y-4 text-sm">
      <h3 className="font-medium text-base text-ink-900 dark:text-ink-50">New review round</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1"><span className="text-ink-500">Version to review</span>
          <select className="input-field !py-2" value={versionId} onChange={(e) => setVersionId(e.target.value)}>
            {versions.map((v) => <option key={v.id} value={v.id}>{FORMAT_LABEL[v.format]}: {v.label}</option>)}
          </select>
        </label>
        <label className="space-y-1"><span className="text-ink-500">Name of the round</span>
          <input className="input-field !py-2" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
      </div>
      <label className="block space-y-1"><span className="text-ink-500">What readers see first</span>
        <textarea className="input-field !py-2" rows={6} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
      </label>

      <div className="space-y-2">
        <div className="text-ink-500">Questions for your readers (general ones appear at the end; chapter ones after that chapter)</div>
        {questions.map((q, i) => (
          <div key={q.id} className="flex gap-2">
            <input className="input-field !py-2" value={q.text} onChange={(e) => setQuestions(questions.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
            <select className="input-field !py-2 !w-44" value={q.section ?? ""} onChange={(e) => setQuestions(questions.map((x, j) => (j === i ? { ...x, section: e.target.value ? Number(e.target.value) : null } : x)))}>
              <option value="">At the end</option>
              {sections.map((s) => <option key={s.id} value={s.position}>After {s.title.slice(0, 30)}</option>)}
            </select>
            <button onClick={() => setQuestions(questions.filter((_, j) => j !== i))} className="btn-ghost !px-2"><X size={14} /></button>
          </div>
        ))}
        <button onClick={() => setQuestions([...questions, { id: qid(), text: "", section: null }])} className="btn-ghost !py-1 !px-2 text-xs"><Plus size={13} /> Question</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1"><span className="text-ink-500">Readers (one per line; "Name &lt;email&gt;" optional)</span>
          <textarea className="input-field !py-2" rows={3} placeholder={"Jenny <jenny@example.com>\nMark"} value={names} onChange={(e) => setNames(e.target.value)} />
        </label>
        <div className="space-y-3">
          <label className="block space-y-1"><span className="text-ink-500">Due date (optional)</span>
            <input type="date" className="input-field !py-2" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-ink-600 dark:text-ink-300"><input type="checkbox" checked={showOthers} onChange={(e) => setShowOthers(e.target.checked)} /> Readers can see each other's comments</label>
        </div>
      </div>
      {err && <p className="text-error-600">{err}</p>}
      <div className="flex gap-2"><button onClick={save} disabled={busy} className="btn-primary !py-2">Create round</button><button onClick={() => onDone(null)} className="btn-ghost">Cancel</button></div>
    </div>
  );
}

// ── The dashboard for one round ───────────────────────────────────────

type Filter = { section: string; kind: string; status: string; reviewer: string };

export function RoundDashboard({ work, roundId, versions, onVersionsChanged }: { work: Work; roundId: string; versions: Version[]; onVersionsChanged: () => void }) {
  const { navigate } = useRouter();
  const [round, setRound] = useState<Round | null>(null);
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [answers, setAnswers] = useState<Array<{ reviewer_id: string; question_id: string; answer: string }>>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [filter, setFilter] = useState<Filter>({ section: "", kind: "", status: "", reviewer: "" });
  const [newName, setNewName] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: r } = await supabase.from("review_rounds").select("*").eq("id", roundId).maybeSingle();
    if (!r) return;
    const rd = r as Round;
    setRound(rd);
    const [rv, n, a, s] = await Promise.all([
      supabase.from("reviewers").select("*").eq("round_id", roundId).order("created_at"),
      supabase.from("review_notes").select("*").eq("round_id", roundId).order("created_at"),
      supabase.from("review_answers").select("reviewer_id, question_id, answer").eq("round_id", roundId),
      loadSections(rd.version_id),
    ]);
    setReviewers((rv.data as Reviewer[]) ?? []);
    setNotes((n.data as Note[]) ?? []);
    setAnswers((a.data as typeof answers) ?? []);
    setSections(s);
  }, [roundId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const version = versions.find((v) => v.id === round?.version_id);
  const who = (id: string | null) => reviewers.find((r) => r.id === id)?.name ?? "You";
  const secOf = (id: string) => sections.find((s) => s.id === id);

  if (!round || !version) return <div className="py-20 text-center text-ink-500 font-sans">Loading…</div>;

  const addReviewer = async () => {
    const n = newName.trim(); if (!n) return;
    const m = /^(.*?)\s*<(.+)>$/.exec(n);
    await supabase.from("reviewers").insert({ round_id: round.id, name: m ? m[1] : n, email: m ? m[2] : "" });
    setNewName(""); load();
  };
  const copy = async (r: Reviewer) => {
    try { await navigator.clipboard.writeText(reviewLink(r.token)); setCopied(r.id); window.setTimeout(() => setCopied(null), 1500); } catch { window.prompt("Copy this link", reviewLink(r.token)); }
  };
  const mailto = (r: Reviewer) => {
    const subject = `Would you read ${work.title}?`;
    const body = `Hi ${r.name.split(" ")[0]},\n\nHere's your private link to read and mark up ${work.title} (${FORMAT_LABEL[version.format].toLowerCase()}, ${version.label}). No sign-up needed; it works on your phone too:\n\n${reviewLink(r.token)}\n\n${round.due_at ? `If you can, by ${fmtDate(round.due_at)}. ` : ""}Thank you!\n\nHerb`;
    return `mailto:${encodeURIComponent(r.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };
  const setStatus = async (n: Note, status: Note["status"]) => {
    await supabase.from("review_notes").update({ status, updated_at: new Date().toISOString() }).eq("id", n.id);
    setNotes(notes.map((x) => (x.id === n.id ? { ...x, status } : x)));
  };
  const reply = async (n: Note, text: string) => {
    await supabase.from("review_notes").update({ author_reply: text }).eq("id", n.id);
    setNotes(notes.map((x) => (x.id === n.id ? { ...x, author_reply: text } : x)));
  };
  const toggleOpen = async () => { await supabase.from("review_rounds").update({ status: round.status === "open" ? "closed" : "open" }).eq("id", round.id); load(); };

  const accepted = notes.filter((n) => n.kind === "suggest" && n.status === "accepted");
  const makeVersion = async () => {
    setMsg(null);
    const { sections: out, applied, failed } = applySuggestions(sections, accepted, version.format);
    if (!applied.length) { setMsg("None of the accepted edits could be applied automatically."); return; }
    const v = await createVersion({
      work_slug: version.work_slug, format: version.format, lang: version.lang, parent_id: version.id, status: "draft",
      label: `${version.label} + review edits`, source: `review:${round.id}`,
      notes: `${applied.length} accepted edit${applied.length > 1 ? "s" : ""} from "${round.title}".${failed.length ? ` ${failed.length} couldn't be placed automatically and need a hand edit.` : ""}`,
    }, out.map((s) => ({ title: s.title, body: s.body })));
    onVersionsChanged();
    setMsg(failed.length ? `New version made with ${applied.length} edits. ${failed.length} edit(s) couldn't be placed (the text had changed or had formatting inside); they're still marked accepted.` : `New version made with all ${applied.length} edits.`);
    navigate(`/work/${work.slug}/compare/${version.id}/${v.id}`);
  };

  const shown = notes.filter((n) => n.kind !== "pulse"
    && (!filter.section || n.section_id === filter.section)
    && (!filter.kind || n.kind === filter.kind)
    && (!filter.status || n.status === filter.status)
    && (!filter.reviewer || n.reviewer_id === filter.reviewer));

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8 font-sans">
      <div>
        <button onClick={() => navigate(`/work/${work.slug}/reviews`)} className="btn-ghost !px-2 -ml-2 text-sm"><ArrowLeft size={16} /> {work.title}: reviews</button>
        <div className="flex flex-wrap items-center gap-3 mt-2">
          <h1 className="font-serif text-2xl sm:text-3xl text-ink-900 dark:text-ink-50 flex-1">{round.title}</h1>
          <button onClick={toggleOpen} className="btn-ghost !py-2">{round.status === "open" ? <><Lock size={15} /> Close round</> : <><Unlock size={15} /> Reopen</>}</button>
        </div>
        <p className="text-sm text-ink-500">{FORMAT_LABEL[version.format]}: {version.label}{round.due_at ? ` · due ${fmtDate(round.due_at)}` : ""}</p>
      </div>

      {/* Readers */}
      <section className="space-y-2">
        <h2 className="text-xs uppercase tracking-wide text-ink-500">Readers</h2>
        <div className="card divide-y divide-ink-200 dark:divide-ink-800">
          {reviewers.map((r) => {
            const done = r.progress?.done?.length ?? 0;
            const count = notes.filter((n) => n.reviewer_id === r.id && n.kind !== "pulse").length;
            return (
              <div key={r.id} className="px-4 py-3 flex flex-wrap items-center gap-3 text-sm">
                <div className="flex-1 min-w-[160px]">
                  <div className="font-medium text-ink-900 dark:text-ink-50">{r.name} {r.finished_at && <span className="text-[11px] ml-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">Finished</span>}</div>
                  <div className="text-xs text-ink-500">{r.started_at ? `${done}/${sections.length} read · ${count} notes · seen ${fmtAgo(r.last_seen_at)}` : "Hasn't opened the link yet"}</div>
                </div>
                <div className="w-28 h-1.5 rounded bg-ink-200 dark:bg-ink-800 overflow-hidden"><div className="h-full bg-accent-500" style={{ width: `${sections.length ? (done / sections.length) * 100 : 0}%` }} /></div>
                <button onClick={() => copy(r)} className="btn-secondary !py-1.5 !px-3">{copied === r.id ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Link</>}</button>
                <a href={mailto(r)} className="btn-ghost !py-1.5 !px-2.5"><Mail size={14} /> Email</a>
                <button onClick={async () => { if (window.confirm(`Remove ${r.name} and their notes?`)) { await supabase.from("reviewers").delete().eq("id", r.id); load(); } }} className="btn-ghost !px-2"><Trash2 size={14} /></button>
              </div>
            );
          })}
          <div className="px-4 py-3 flex gap-2">
            <input className="input-field !py-2 text-sm" placeholder='Add a reader: "Name" or "Name <email>"' value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addReviewer()} />
            <button onClick={addReviewer} className="btn-secondary !py-2 !px-3"><UserPlus size={15} /></button>
          </div>
        </div>
      </section>

      <SummaryBox round={round} />

      <Heatmap sections={sections} notes={notes} onPick={(id) => setFilter({ ...filter, section: id })} format={version.format} />

      {round.questions.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs uppercase tracking-wide text-ink-500">Your questions</h2>
          <div className="grid gap-3">
            {round.questions.map((q) => {
              const as = answers.filter((a) => a.question_id === q.id && a.answer.trim());
              return (
                <div key={q.id} className="card p-4 text-sm space-y-2">
                  <div className="font-medium text-ink-900 dark:text-ink-50">{q.text}{q.section ? <span className="text-xs text-ink-500 font-normal"> (after {sections.find((s) => s.position === q.section)?.title})</span> : null}</div>
                  {as.length ? as.map((a) => <p key={a.reviewer_id} className="text-ink-700 dark:text-ink-200"><b className="font-medium">{who(a.reviewer_id)}:</b> {a.answer}</p>)
                    : <p className="text-ink-400">No answers yet.</p>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Notes */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xs uppercase tracking-wide text-ink-500 mr-auto">Notes ({shown.length})</h2>
          <select className="input-field !py-1.5 !w-auto text-sm" value={filter.section} onChange={(e) => setFilter({ ...filter, section: e.target.value })}>
            <option value="">All chapters</option>{sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
          <select className="input-field !py-1.5 !w-auto text-sm" value={filter.kind} onChange={(e) => setFilter({ ...filter, kind: e.target.value })}>
            <option value="">All kinds</option><option value="comment">Comments</option><option value="suggest">Suggested edits</option><option value="reaction">Reactions</option>
          </select>
          <select className="input-field !py-1.5 !w-auto text-sm" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
            <option value="">Any status</option><option value="open">Open</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option><option value="resolved">Resolved</option>
          </select>
          {reviewers.length > 1 && (
            <select className="input-field !py-1.5 !w-auto text-sm" value={filter.reviewer} onChange={(e) => setFilter({ ...filter, reviewer: e.target.value })}>
              <option value="">Everyone</option>{reviewers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          )}
        </div>
        {accepted.length > 0 && (
          <div className="card p-3 flex flex-wrap items-center gap-3 text-sm border-accent-400/50">
            <GitBranchPlus size={16} className="text-accent-500" />
            <span className="flex-1">{accepted.length} accepted edit{accepted.length > 1 ? "s" : ""}. Make a new version with them applied (this one stays as it is).</span>
            <button onClick={makeVersion} className="btn-primary !py-1.5 !px-3">Make new version</button>
          </div>
        )}
        {msg && <p className="text-sm text-ink-600 dark:text-ink-300">{msg}</p>}
        <div className="space-y-2">
          {shown.map((n) => <NoteCard key={n.id} n={n} who={who(n.reviewer_id)} where={secOf(n.section_id)?.title ?? ""} onStatus={(s) => setStatus(n, s)} onReply={(t) => reply(n, t)} />)}
          {!shown.length && <p className="text-sm text-ink-400">Nothing here yet.</p>}
        </div>
      </section>
    </div>
  );
}

function NoteCard({ n, who, where, onStatus, onReply }: { n: Note; who: string; where: string; onStatus: (s: Note["status"]) => void; onReply: (t: string) => void }) {
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState(n.author_reply);
  const r = reactionOf(n.reaction);
  return (
    <div className={`card p-4 text-sm space-y-2 ${n.status !== "open" ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
        <span className="font-medium text-ink-800 dark:text-ink-100">{who}</span><span>·</span><span>{where}</span>
        <span className={`ml-1 px-1.5 py-0.5 rounded ${n.kind === "suggest" ? "bg-sky-500/15 text-sky-700 dark:text-sky-300" : n.kind === "comment" ? "bg-amber-400/20 text-amber-700 dark:text-amber-300" : "bg-rose-400/15 text-rose-700 dark:text-rose-300"}`}>
          {n.kind === "suggest" ? "Edit" : n.kind === "comment" ? "Comment" : `${r?.emoji} ${r?.label}`}
        </span>
        {n.status !== "open" && <span className="uppercase tracking-wide">{n.status}</span>}
        <span className="ml-auto">{fmtAgo(n.created_at)}</span>
      </div>
      {n.kind === "suggest" ? (
        <p className="font-serif text-[16px] leading-relaxed">
          <del className="bg-rose-200/50 dark:bg-rose-600/25">{n.quote}</del>{" "}
          <ins className="bg-emerald-200/60 dark:bg-emerald-600/30 no-underline">{n.replacement}</ins>
        </p>
      ) : n.quote ? <p className="font-serif text-[16px] leading-relaxed text-ink-600 dark:text-ink-300 border-l-2 border-ink-300 dark:border-ink-700 pl-3">“{n.quote.length > 280 ? `${n.quote.slice(0, 280)}…` : n.quote}”</p> : null}
      {n.body && <p className="text-ink-800 dark:text-ink-100">{n.body}</p>}
      {n.author_reply && !replying && <p className="text-accent-700 dark:text-accent-300"><b className="font-medium">You:</b> {n.author_reply}</p>}
      {replying && (
        <div className="flex gap-2">
          <input className="input-field !py-1.5 text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder="Reply (they'll see it if they reopen the link)" />
          <button onClick={() => { onReply(text); setReplying(false); }} className="btn-secondary !py-1.5 !px-3">Save</button>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5 pt-1">
        {n.kind === "suggest" && n.status !== "accepted" && <button onClick={() => onStatus("accepted")} className="btn-secondary !py-1 !px-2.5 text-xs"><Check size={13} /> Accept</button>}
        {n.kind === "suggest" && n.status !== "rejected" && <button onClick={() => onStatus("rejected")} className="btn-ghost !py-1 !px-2.5 text-xs"><X size={13} /> Reject</button>}
        {n.kind !== "suggest" && n.status !== "resolved" && <button onClick={() => onStatus("resolved")} className="btn-ghost !py-1 !px-2.5 text-xs"><CheckCheck size={13} /> Resolve</button>}
        {n.status !== "open" && <button onClick={() => onStatus("open")} className="btn-ghost !py-1 !px-2.5 text-xs">Reopen</button>}
        <button onClick={() => setReplying((x) => !x)} className="btn-ghost !py-1 !px-2.5 text-xs"><MessageSquare size={13} /> Reply</button>
      </div>
    </div>
  );
}

function Heatmap({ sections, notes, onPick, format }: { sections: Section[]; notes: Note[]; onPick: (id: string) => void; format: string }) {
  const rows = useMemo(() => sections.map((s) => {
    const ns = notes.filter((n) => n.section_id === s.id);
    const pulses = ns.filter((n) => n.kind === "pulse" && n.score);
    const react: Record<string, number> = {};
    for (const n of ns.filter((x) => x.kind === "reaction")) react[n.reaction!] = (react[n.reaction!] ?? 0) + 1;
    return {
      s, pulse: pulses.length ? pulses.reduce((m, n) => m + (n.score ?? 0), 0) / pulses.length : null, pulses: pulses.length, react,
      comments: ns.filter((n) => n.kind === "comment").length, edits: ns.filter((n) => n.kind === "suggest").length,
    };
  }), [sections, notes]);
  const max = Math.max(1, ...rows.flatMap((r) => Object.values(r.react)));
  if (!notes.length) return null;
  const pulseColor = (p: number | null) => p === null ? "bg-ink-100 dark:bg-ink-800 text-ink-400"
    : p >= 4 ? "bg-emerald-500/80 text-white" : p >= 3 ? "bg-amber-400/80 text-ink-900" : "bg-rose-500/80 text-white";
  return (
    <section className="space-y-2">
      <h2 className="text-xs uppercase tracking-wide text-ink-500">Where readers leaned in and checked out</h2>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-ink-500 text-left">
              <th className="px-4 py-2 font-medium">{format === "screenplay" ? "Section" : "Chapter"}</th>
              <th className="px-2 py-2 font-medium text-center" title="Average 'how much did you want to keep reading' (1–5)">Pulse</th>
              {REACTIONS.map((r) => <th key={r.key} className="px-2 py-2 font-medium text-center" title={r.label}>{r.emoji}</th>)}
              <th className="px-2 py-2 font-medium text-center">💬</th><th className="px-2 py-2 font-medium text-center">✏️</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
            {rows.map((r) => (
              <tr key={r.s.id} onClick={() => onPick(r.s.id)} className="cursor-pointer hover:bg-ink-100/60 dark:hover:bg-ink-800/40">
                <td className="px-4 py-2 truncate max-w-[220px]">{r.s.title}</td>
                <td className="px-2 py-1.5 text-center"><span className={`inline-block min-w-[2.5rem] rounded px-1.5 py-0.5 text-xs ${pulseColor(r.pulse)}`}>{r.pulse === null ? "–" : r.pulse.toFixed(1)}</span></td>
                {REACTIONS.map((x) => {
                  const c = r.react[x.key] ?? 0;
                  const bad = x.key === "slow" || x.key === "confused" || x.key === "unconvinced";
                  return <td key={x.key} className="px-2 py-1.5 text-center"><span className="inline-block w-7 rounded text-xs py-0.5"
                    style={{ background: c ? (bad ? `rgba(225,29,72,${0.15 + 0.6 * c / max})` : `rgba(16,185,129,${0.15 + 0.6 * c / max})`) : "transparent" }}>{c || ""}</span></td>;
                })}
                <td className="px-2 py-1.5 text-center text-xs">{r.comments || ""}</td>
                <td className="px-2 py-1.5 text-center text-xs">{r.edits || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SummaryBox({ round }: { round: Round }) {
  const [model, setModel] = useState<"sonnet" | "opus">("sonnet");
  const [err, setErr] = useState<string | null>(null);
  const { run, running, reload } = useCraftRun({ kind: "summary", round_id: round.id });
  const r = run?.status === "done" ? run.result as { headline: string; consensus: Array<{ point: string; readers: number; where: string }>; split: string[]; fixes: string[]; praise: string[] } : null;
  const start = async () => { setErr(null); try { await craftApi.summary(round.id, model); await reload(); } catch (e) { setErr((e as Error).message); } };
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xs uppercase tracking-wide text-ink-500 mr-auto">What the readers agree on</h2>
        <ModelPicker value={model} onChange={setModel} />
        <button onClick={start} disabled={running} className="btn-secondary !py-2 !px-3 text-sm"><Sparkles size={15} /> {r ? "Summarize again" : "Summarize with Claude"}</button>
      </div>
      {err && <p className="text-sm text-error-600">{err}</p>}
      {running && <Running text="Reading every comment, reaction and answer…" />}
      {run?.status === "failed" && !running && <p className="text-sm text-error-600">Summary failed: {run.error}</p>}
      {r && !running && (
        <div className="card p-5 space-y-3 text-sm">
          <p className="font-serif text-lg text-ink-900 dark:text-ink-50">{r.headline}</p>
          {r.consensus.length > 0 && <div><div className="text-xs uppercase tracking-wide text-accent-600 mb-1">Several readers</div>
            <ul className="space-y-1">{r.consensus.map((c, i) => <li key={i}>• {c.point} <span className="text-ink-500">({c.readers} reader{c.readers > 1 ? "s" : ""}{c.where ? `, ${c.where}` : ""})</span></li>)}</ul></div>}
          {r.praise.length > 0 && <div><div className="text-xs uppercase tracking-wide text-emerald-600 mb-1">Loved</div><ul className="space-y-1">{r.praise.map((p, i) => <li key={i}>• {p}</li>)}</ul></div>}
          {r.split.length > 0 && <div><div className="text-xs uppercase tracking-wide text-ink-500 mb-1">Split opinions</div><ul className="space-y-1">{r.split.map((p, i) => <li key={i}>• {p}</li>)}</ul></div>}
          {r.fixes.length > 0 && <div><div className="text-xs uppercase tracking-wide text-rose-600 mb-1">Worth changing</div><ol className="space-y-1 list-decimal pl-4">{r.fixes.map((p, i) => <li key={i}>{p}</li>)}</ol></div>}
          <p className="text-xs text-ink-400">{fmtAgo(run!.finished_at)} · {run!.model.replace("claude-", "")}</p>
        </div>
      )}
    </section>
  );
}

// ── Applying accepted edits ───────────────────────────────────────────

export function applySuggestions(sections: Section[], notes: Note[], format: string) {
  const applied: string[] = []; const failed: string[] = [];
  const out = sections.map((s) => {
    const mine = notes.filter((n) => n.section_id === s.id && n.replacement !== null);
    if (!mine.length) return s;
    let body = s.body;
    const blocks = parseBlocks(body, format);
    // Where each block's source text sits in the body.
    let cursor = 0;
    const at = blocks.map((b) => { const i = body.indexOf(b.raw, cursor); if (i >= 0) cursor = i + b.raw.length; return i; });
    // Later blocks first, so earlier offsets stay valid.
    const sorted = [...mine].sort((a, b) => (b.block ?? 0) - (a.block ?? 0) || (b.start_at ?? 0) - (a.start_at ?? 0));
    for (const n of sorted) {
      const bi = n.block ?? -1; const b = blocks[bi]; const start = at[bi] ?? -1;
      let done = false;
      if (b && start >= 0) {
        const region = body.slice(start, start + b.raw.length);
        const k = region.indexOf(n.quote);
        if (k >= 0) { body = body.slice(0, start + k) + (n.replacement ?? "") + body.slice(start + k + n.quote.length); done = true; }
      }
      if (!done && n.quote && body.split(n.quote).length === 2) { body = body.replace(n.quote, n.replacement ?? ""); done = true; }
      (done ? applied : failed).push(n.id);
    }
    return { ...s, body };
  });
  return { sections: out, applied, failed };
}
