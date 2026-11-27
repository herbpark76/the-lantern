import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Check, ChevronLeft, ChevronRight, Loader2, MessageSquare, Moon, PartyPopper, Pencil, Sun, Trash2, X } from "lucide-react";
import { useTheme } from "@/lib/theme";
import {
  FORMAT_LABEL, fmtDate, isProse, parseBlocks, REACTIONS, reactionOf, reviewApi,
  type Note, type NoteKind, type Question, type ReactionKey, type Section,
} from "@/lib/works";
import { TextView, type Highlight, type SelectionInfo } from "@/components/work/TextView";

// /review/<token>: a reader's private review link. No account: the token is the key.
// Select words → comment or suggest an edit. Tap a paragraph → react (😴 🤔 ❤️ …).
// End of each chapter → a 1–5 "pulse" and the author's questions. Everything saves as you go.

interface OpenData {
  reviewer: { id: string; name: string; progress: { last_section?: number; done?: number[] }; finished_at: string | null };
  round: { id: string; title: string; instructions: string; due_at: string | null; status: string; show_others: boolean; questions: Question[] };
  work: { slug: string; title: string; accent_color: string };
  version: { id: string; format: string; label: string; lang: string };
  sections: Section[];
  notes: Note[];
  answers: Array<{ question_id: string; answer: string }>;
}

type Composer = { kind: "comment" | "suggest"; sel: Pick<SelectionInfo, "block" | "start" | "end" | "quote">; note?: Note } | null;

export function ReviewPage({ token }: { token: string }) {
  const { theme, toggleTheme } = useTheme();
  const [data, setData] = useState<OpenData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [idx, setIdx] = useState(0);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [sel, setSel] = useState<SelectionInfo | null>(null);
  const [whole, setWhole] = useState<{ block: number; rect: DOMRect } | null>(null);
  const [composer, setComposer] = useState<Composer>(null);
  const [drawer, setDrawer] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const call = useCallback(<T,>(body: Record<string, unknown>) => reviewApi.call<T>({ token, ...body }), [token]);

  useEffect(() => {
    call<OpenData>({ action: "open" }).then((d) => {
      setData(d); setNotes(d.notes);
      setAnswers(Object.fromEntries(d.answers.map((a) => [a.question_id, a.answer])));
      const last = d.reviewer.progress?.last_section;
      const i = last ? d.sections.findIndex((s) => s.position === last) : 0;
      setIdx(Math.max(0, i));
      setStarted(!!d.reviewer.progress?.last_section || d.notes.some((n) => n.mine));
      setFinished(!!d.reviewer.finished_at);
      document.title = `${d.work.title} · review`;
    }).catch((e) => setError((e as Error).message));
  }, [call]);

  const flash = (t: string) => { setToast(t); window.setTimeout(() => setToast(null), 1800); };
  const section = data?.sections[idx];
  const screenplay = data ? !isProse(data.version.format) : false;
  const blocks = useMemo(() => (section && data ? parseBlocks(section.body, data.version.format) : []), [section, data]);
  const here = notes.filter((n) => n.section_id === section?.id);
  const closed = data?.round.status !== "open";

  const highlights: Highlight[] = here.filter((n) => n.block !== null && n.start_at !== null && n.end_at !== null && n.kind !== "reaction" && n.kind !== "pulse")
    .map((n) => ({ id: n.id, block: n.block!, start: n.start_at!, end: n.end_at!, tone: n.id === active ? "active" : !n.mine ? "other" : n.kind === "suggest" ? "suggest" : "comment" }));

  const goSection = async (i: number, markDone = false) => {
    if (!data) return;
    if (markDone && section) call({ action: "progress", section: section.position, done: true }).catch(() => {});
    setIdx(i); setSel(null); setWhole(null); setActive(null);
    window.scrollTo({ top: 0 });
    const s = data.sections[i];
    if (s) call({ action: "progress", section: s.position }).catch(() => {});
  };

  const addNote = async (kind: NoteKind, extra: Partial<Note> & { block?: number | null; start_at?: number | null; end_at?: number | null }) => {
    if (!section || closed) return null;
    setSaving(true);
    try {
      const { note } = await call<{ note: Note }>({ action: "add_note", note: { kind, section_id: section.id, ...extra } });
      setNotes((ns) => [...ns.filter((n) => !(kind === "pulse" && n.kind === "pulse" && n.section_id === section.id && n.mine)), note]);
      return note;
    } catch (e) { flash((e as Error).message); return null; } finally { setSaving(false); }
  };
  const react = async (block: number, reaction: ReactionKey, quote: string, range?: { start: number; end: number }) => {
    const existing = here.find((n) => n.mine && n.kind === "reaction" && n.block === block && n.reaction === reaction);
    if (existing) { await removeNote(existing); }
    else { await addNote("reaction", { block, reaction, quote: quote.slice(0, 400), start_at: range?.start ?? null, end_at: range?.end ?? null }); flash(`${reactionOf(reaction)?.emoji} noted`); }
    clearSel();
  };
  const removeNote = async (n: Note) => {
    setNotes((ns) => ns.filter((x) => x.id !== n.id));
    await call({ action: "delete_note", id: n.id }).catch(() => {});
  };
  const clearSel = () => { setSel(null); setWhole(null); window.getSelection()?.removeAllRanges(); };

  const saveAnswer = (qid: string, text: string) => {
    setAnswers((a) => ({ ...a, [qid]: text }));
    call({ action: "answer", question_id: qid, answer: text }).catch(() => {});
  };

  if (error) return <Center><p className="text-ink-600 dark:text-ink-300 font-sans px-6 text-center">{error}</p></Center>;
  if (!data) return <Center><Loader2 className="animate-spin text-ink-400" /></Center>;

  // ── Thank-you ──
  if (finished && idx >= data.sections.length) {
    return (
      <Shell data={data} theme={theme} toggleTheme={toggleTheme}>
        <Center>
          <div className="text-center space-y-3 font-sans max-w-md px-5">
            <PartyPopper size={32} className="mx-auto text-accent-500" />
            <h1 className="font-serif text-2xl text-ink-900 dark:text-ink-50">Thank you, {data.reviewer.name.split(" ")[0]}.</h1>
            <p className="text-ink-600 dark:text-ink-300">Your notes are with Herb. You can come back with this link to add anything, until he closes the review.</p>
            <button onClick={() => setIdx(0)} className="btn-ghost">Back to the start</button>
          </div>
        </Center>
      </Shell>
    );
  }
  if (!section) return <Center><p className="text-ink-500 font-sans">There's no text in this review.</p></Center>;

  const unitName = screenplay ? "section" : "chapter";
  const sectionQs = data.round.questions.filter((q) => q.section === section.position);
  const generalQs = data.round.questions.filter((q) => !q.section);
  const last = idx === data.sections.length - 1;
  const myPulse = here.find((n) => n.mine && n.kind === "pulse");
  const doneCount = new Set([...(data.reviewer.progress?.done ?? [])]).size;

  // ── Welcome ──
  if (!started) {
    return (
      <Shell data={data} theme={theme} toggleTheme={toggleTheme}>
        <div className="max-w-xl mx-auto px-5 py-12 space-y-6 font-sans">
          <div className="text-center space-y-2">
            <BookOpen size={28} className="mx-auto" style={{ color: data.work.accent_color }} />
            <h1 className="font-serif text-3xl text-ink-900 dark:text-ink-50">{data.work.title}</h1>
            <p className="text-ink-500">{FORMAT_LABEL[data.version.format]} · {data.version.label} · {data.sections.length} {unitName}s</p>
          </div>
          <p className="text-ink-700 dark:text-ink-200">Hi {data.reviewer.name.split(" ")[0]},</p>
          <p className="text-ink-700 dark:text-ink-200 whitespace-pre-line leading-relaxed">{data.round.instructions}</p>
          {data.round.due_at && <p className="text-sm text-ink-500">If you can, finish by {fmtDate(data.round.due_at)}.</p>}
          <div className="card p-4 grid grid-cols-3 gap-3 text-center text-xs text-ink-600 dark:text-ink-300">
            <div><div className="text-xl mb-1">🖍️</div>Select words to comment or suggest an edit</div>
            <div><div className="text-xl mb-1">😴 🤔 ❤️</div>Tap a paragraph to react</div>
            <div><div className="text-xl mb-1">1–5</div>Rate each {unitName} at the end</div>
          </div>
          <button onClick={() => setStarted(true)} className="btn-primary w-full">Start reading</button>
        </div>
      </Shell>
    );
  }

  const toolbarRect = sel?.rect ?? whole?.rect ?? null;

  return (
    <Shell data={data} theme={theme} toggleTheme={toggleTheme}
      progress={{ i: idx, n: data.sections.length, done: doneCount }}
      onNotes={() => setDrawer(true)} noteCount={notes.filter((n) => n.mine && n.kind !== "pulse").length}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-40">
        <div className="flex items-center gap-2 py-3 font-sans">
          <button onClick={() => goSection(idx - 1)} disabled={idx === 0} className="btn-ghost !px-2 disabled:opacity-30" aria-label="Previous"><ChevronLeft size={18} /></button>
          <select className="input-field !py-2 text-sm flex-1 min-w-0" value={idx} onChange={(e) => goSection(Number(e.target.value))}>
            {data.sections.map((s, i) => <option key={s.id} value={i}>{(data.reviewer.progress?.done ?? []).includes(s.position) ? "✓ " : ""}{s.title}</option>)}
          </select>
          <button onClick={() => goSection(idx + 1)} disabled={last} className="btn-ghost !px-2 disabled:opacity-30" aria-label="Next"><ChevronRight size={18} /></button>
        </div>

        {closed && <p className="text-sm text-center text-ink-500 font-sans mb-3">This review is closed. You can still read, but notes can't be added.</p>}

        <article className={`card ${screenplay ? "px-4 sm:px-12" : "px-5 sm:px-12"} py-8 select-text`}
          onClick={(e) => {
            // A tap on a paragraph without selecting text → react / comment on the whole paragraph.
            const s = window.getSelection();
            if (s && !s.isCollapsed) return;
            const el = (e.target as HTMLElement).closest("[data-block]") as HTMLElement | null;
            if ((e.target as HTMLElement).closest("mark")) return;
            if (!el || closed) { setWhole(null); return; }
            const b = Number(el.dataset.block);
            setSel(null);
            setWhole(whole?.block === b ? null : { block: b, rect: el.getBoundingClientRect() });
          }}>
          <TextView blocks={blocks} screenplay={screenplay} lang={data.version.lang}
            highlights={highlights}
            onSelect={closed ? undefined : (s) => { setSel(s); if (s) setWhole(null); }}
            onHighlightClick={(id) => { setActive(id); setDrawer(true); }}
            blockClassName={(b) => (whole?.block === b.i ? "bg-accent-100/60 dark:bg-accent-900/30 rounded" : "")}
            gutter={(b) => {
              const rs = here.filter((n) => n.kind === "reaction" && n.block === b.i);
              const cs = here.filter((n) => (n.kind === "comment" || n.kind === "suggest") && n.block === b.i && n.start_at === null);
              if (!rs.length && !cs.length) return null;
              return (
                <div className="flex flex-col items-center gap-0.5 text-[13px] leading-none pt-1 select-none">
                  {Array.from(new Set(rs.map((r) => r.reaction))).map((k) => <span key={k}>{reactionOf(k)?.emoji}</span>)}
                  {cs.length > 0 && <MessageSquare size={13} className="text-amber-600" />}
                </div>
              );
            }} />
        </article>

        {/* End of the section */}
        <div className="mt-8 space-y-5 font-sans">
          <div className="card p-5 space-y-3">
            <p className="text-ink-800 dark:text-ink-100 font-medium">How much did you want to keep reading after this {unitName}?</p>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} disabled={closed} onClick={() => addNote("pulse", { score: n, body: myPulse?.body ?? "" })}
                  className={`flex-1 py-3 rounded-lg border text-lg ${myPulse?.score === n ? "bg-accent-500 text-white border-accent-500" : "border-ink-200 dark:border-ink-700 hover:bg-ink-100 dark:hover:bg-ink-800"}`}>{n}</button>
              ))}
            </div>
            <div className="flex justify-between text-xs text-ink-500"><span>Could put it down</span><span>Couldn't stop</span></div>
            {myPulse && (
              <input className="input-field !py-2 text-sm" placeholder="Anything about this chapter as a whole? (optional)" defaultValue={myPulse.body}
                onBlur={(e) => e.target.value !== myPulse.body && addNote("pulse", { score: myPulse.score, body: e.target.value })} />
            )}
          </div>

          {sectionQs.map((q) => <QuestionBox key={q.id} q={q} value={answers[q.id] ?? ""} onSave={(t) => saveAnswer(q.id, t)} disabled={closed} />)}
          {last && generalQs.map((q) => <QuestionBox key={q.id} q={q} value={answers[q.id] ?? ""} onSave={(t) => saveAnswer(q.id, t)} disabled={closed} />)}

          {!last ? (
            <button onClick={() => goSection(idx + 1, true)} className="btn-primary w-full">Next: {data.sections[idx + 1].title} <ChevronRight size={16} /></button>
          ) : (
            <button disabled={closed} onClick={async () => {
              await call({ action: "progress", section: section.position, done: true }).catch(() => {});
              await call({ action: "finish" }).catch(() => {});
              setFinished(true); setIdx(data.sections.length); window.scrollTo({ top: 0 });
            }} className="btn-primary w-full"><Check size={16} /> I'm finished: send my notes</button>
          )}
          {!last && generalQs.length > 0 && <p className="text-xs text-center text-ink-500">{generalQs.length} question{generalQs.length > 1 ? "s" : ""} wait at the end.</p>}
        </div>
      </div>

      {/* Floating toolbar for a selection or a tapped paragraph */}
      {toolbarRect && !composer && (
        <Toolbar rect={toolbarRect} selection={!!sel}
          onComment={() => {
            const s = sel ?? (whole ? { block: whole.block, start: -1, end: -1, quote: blocks[whole.block]?.plain ?? "" } : null);
            if (s) setComposer({ kind: "comment", sel: s });
          }}
          onSuggest={() => {
            const s = sel ?? (whole ? { block: whole.block, start: 0, end: blocks[whole.block]?.plain.length ?? 0, quote: blocks[whole.block]?.plain ?? "" } : null);
            if (s) setComposer({ kind: "suggest", sel: s });
          }}
          onReact={(k) => {
            if (sel) react(sel.block, k, sel.quote, { start: sel.start, end: sel.end });
            else if (whole) react(whole.block, k, blocks[whole.block]?.plain ?? "");
          }}
          active={(whole ? here.filter((n) => n.mine && n.kind === "reaction" && n.block === whole.block).map((n) => n.reaction!) : [])}
          onClose={clearSel} />
      )}

      {composer && (
        <ComposerSheet c={composer} saving={saving} onClose={() => { setComposer(null); clearSel(); }}
          onSave={async (body, replacement) => {
            const s = composer.sel;
            if (composer.note) {
              const { note } = await call<{ note: Note }>({ action: "update_note", id: composer.note.id, body, replacement });
              setNotes((ns) => ns.map((n) => (n.id === note.id ? note : n)));
            } else {
              const ranged = s.start >= 0;
              await addNote(composer.kind, {
                block: s.block, start_at: ranged ? s.start : null, end_at: ranged ? s.end : null,
                quote: s.quote.slice(0, 4000), body, replacement: composer.kind === "suggest" ? replacement : null,
              });
              flash(composer.kind === "suggest" ? "Edit suggested" : "Comment saved");
            }
            setComposer(null); clearSel();
          }} />
      )}

      {drawer && (
        <NotesDrawer notes={notes.filter((n) => n.kind !== "pulse")} sections={data.sections} current={section.id} active={active}
          onClose={() => { setDrawer(false); setActive(null); }}
          onGo={(n) => {
            const i = data.sections.findIndex((s) => s.id === n.section_id);
            if (i !== idx) goSection(i);
            setActive(n.id); setDrawer(false);
            window.setTimeout(() => document.querySelector(`[data-block="${n.block}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
          }}
          onEdit={(n) => { setDrawer(false); setComposer({ kind: n.kind === "suggest" ? "suggest" : "comment", sel: { block: n.block ?? 0, start: n.start_at ?? -1, end: n.end_at ?? -1, quote: n.quote }, note: n }); }}
          onDelete={removeNote} closed={closed} />
      )}

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-ink-900 text-ink-50 dark:bg-ink-100 dark:text-ink-900 text-sm font-sans shadow-lg">{toast}</div>}
    </Shell>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────

function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[70vh] flex items-center justify-center">{children}</div>;
}

function Shell({ data, children, theme, toggleTheme, progress, onNotes, noteCount }: {
  data: OpenData; children: React.ReactNode; theme: string; toggleTheme: () => void;
  progress?: { i: number; n: number; done: number }; onNotes?: () => void; noteCount?: number;
}) {
  return (
    <div className="min-h-screen bg-ink-50 dark:bg-ink-950">
      <header className="sticky top-0 z-30 bg-ink-50/90 dark:bg-ink-950/90 backdrop-blur border-b border-ink-200 dark:border-ink-800">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3 font-sans">
          <BookOpen size={18} style={{ color: data.work.accent_color }} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-ink-900 dark:text-ink-50 truncate">{data.work.title}</div>
            <div className="text-[11px] text-ink-500 truncate">{data.version.label} · reviewing as {data.reviewer.name}</div>
          </div>
          {onNotes && (
            <button onClick={onNotes} className="btn-ghost !px-2.5 !py-1.5 text-sm"><MessageSquare size={16} /> {noteCount ?? 0}</button>
          )}
          <button onClick={toggleTheme} className="btn-ghost !px-2" aria-label="Theme">{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}</button>
        </div>
        {progress && (
          <div className="h-1 bg-ink-200 dark:bg-ink-800"><div className="h-full bg-accent-500 transition-all" style={{ width: `${((progress.i + 1) / progress.n) * 100}%` }} /></div>
        )}
      </header>
      {children}
    </div>
  );
}

function Toolbar({ rect, selection, onComment, onSuggest, onReact, onClose, active }: {
  rect: DOMRect; selection: boolean; onComment: () => void; onSuggest: () => void; onReact: (k: ReactionKey) => void; onClose: () => void; active: string[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  useEffect(() => {
    const w = ref.current?.offsetWidth ?? 320;
    const top = rect.top > 90 ? rect.top - 56 : rect.bottom + 10;
    const left = Math.min(window.innerWidth - w - 8, Math.max(8, rect.left + rect.width / 2 - w / 2));
    setPos({ top, left });
  }, [rect]);
  return (
    <div ref={ref} onMouseDown={(e) => e.preventDefault()} onTouchStart={(e) => e.stopPropagation()}
      className="fixed z-40 flex items-center gap-0.5 rounded-xl bg-ink-900 text-ink-50 dark:bg-ink-100 dark:text-ink-900 shadow-xl px-1.5 py-1 font-sans animate-fade-in"
      style={{ top: pos.top, left: pos.left }}>
      <button onClick={onComment} className="px-2.5 py-1.5 rounded-lg hover:bg-white/10 dark:hover:bg-black/10 text-sm flex items-center gap-1.5"><MessageSquare size={15} /> Comment</button>
      <button onClick={onSuggest} className="px-2.5 py-1.5 rounded-lg hover:bg-white/10 dark:hover:bg-black/10 text-sm flex items-center gap-1.5"><Pencil size={15} /> {selection ? "Edit" : "Rewrite"}</button>
      <span className="w-px h-5 bg-white/20 dark:bg-black/20 mx-0.5" />
      {REACTIONS.map((r) => (
        <button key={r.key} onClick={() => onReact(r.key)} title={r.label}
          className={`w-8 h-8 rounded-lg text-[17px] hover:bg-white/10 dark:hover:bg-black/10 ${active.includes(r.key) ? "bg-white/20 dark:bg-black/15" : ""}`}>{r.emoji}</button>
      ))}
      <button onClick={onClose} className="w-7 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center opacity-60"><X size={14} /></button>
    </div>
  );
}

function ComposerSheet({ c, saving, onClose, onSave }: { c: NonNullable<Composer>; saving: boolean; onClose: () => void; onSave: (body: string, replacement: string) => Promise<void> }) {
  const [body, setBody] = useState(c.note?.body ?? "");
  const [replacement, setReplacement] = useState(c.note?.replacement ?? c.sel.quote);
  const suggest = c.kind === "suggest";
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30" onClick={onClose}>
      <div className="w-full sm:max-w-lg bg-ink-50 dark:bg-ink-900 rounded-t-2xl sm:rounded-2xl p-5 space-y-3 font-sans shadow-2xl animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          {suggest ? <Pencil size={16} className="text-sky-600" /> : <MessageSquare size={16} className="text-amber-600" />}
          <span className="font-medium text-ink-900 dark:text-ink-50">{suggest ? "Suggest an edit" : "Comment"}</span>
          <button onClick={onClose} className="ml-auto btn-ghost !p-1.5"><X size={16} /></button>
        </div>
        {!suggest && c.sel.quote && (
          <p className="font-serif text-[15px] text-ink-600 dark:text-ink-300 border-l-2 border-ink-300 dark:border-ink-700 pl-3 max-h-24 overflow-y-auto">“{c.sel.quote.length > 300 ? `${c.sel.quote.slice(0, 300)}…` : c.sel.quote}”</p>
        )}
        {suggest && (
          <>
            <p className="text-xs text-ink-500">Change the words below to how you'd write them.</p>
            <textarea autoFocus className="input-field font-serif text-[16px] leading-relaxed" rows={Math.min(8, Math.max(3, Math.ceil(replacement.length / 60)))} value={replacement} onChange={(e) => setReplacement(e.target.value)} />
          </>
        )}
        <textarea autoFocus={!suggest} className="input-field text-sm" rows={suggest ? 2 : 4} value={body} onChange={(e) => setBody(e.target.value)}
          placeholder={suggest ? "Why? (optional)" : "What did you think? Confusing, slow, loved it, didn't sound like her…"} />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button disabled={saving || (suggest ? replacement.trim() === c.sel.quote.trim() || !replacement.trim() : !body.trim())}
            onClick={() => onSave(body.trim(), replacement)} className="btn-primary !py-2">{saving && <Loader2 size={14} className="animate-spin" />} Save</button>
        </div>
      </div>
    </div>
  );
}

function QuestionBox({ q, value, onSave, disabled }: { q: Question; value: string; onSave: (t: string) => void; disabled: boolean }) {
  const [t, setT] = useState(value);
  const [saved, setSaved] = useState(false);
  return (
    <div className="card p-5 space-y-2">
      <p className="text-ink-800 dark:text-ink-100 font-medium">{q.text}</p>
      <textarea className="input-field text-sm" rows={3} value={t} disabled={disabled} onChange={(e) => { setT(e.target.value); setSaved(false); }}
        onBlur={() => { if (t !== value) { onSave(t); setSaved(true); } }} placeholder="Your answer" />
      {saved && <p className="text-xs text-emerald-600">Saved</p>}
    </div>
  );
}

function NotesDrawer({ notes, sections, current, active, onClose, onGo, onEdit, onDelete, closed }: {
  notes: Note[]; sections: Section[]; current: string; active: string | null; closed: boolean;
  onClose: () => void; onGo: (n: Note) => void; onEdit: (n: Note) => void; onDelete: (n: Note) => void;
}) {
  const [all, setAll] = useState(false);
  const list = notes.filter((n) => all || n.section_id === current);
  const title = (id: string) => sections.find((s) => s.id === id)?.title ?? "";
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="w-full max-w-md h-full bg-ink-50 dark:bg-ink-900 shadow-2xl flex flex-col font-sans animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 h-14 flex items-center gap-2 border-b border-ink-200 dark:border-ink-800">
          <span className="font-medium text-ink-900 dark:text-ink-50">Notes</span>
          <div className="ml-3 inline-flex rounded-lg border border-ink-200 dark:border-ink-700 overflow-hidden text-xs">
            <button onClick={() => setAll(false)} className={`px-3 py-1 ${!all ? "bg-accent-500 text-white" : ""}`}>This chapter</button>
            <button onClick={() => setAll(true)} className={`px-3 py-1 ${all ? "bg-accent-500 text-white" : ""}`}>All</button>
          </div>
          <button onClick={onClose} className="ml-auto btn-ghost !p-1.5"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {!list.length && <p className="text-sm text-ink-500 text-center py-10">No notes {all ? "yet" : "on this chapter yet"}. Select some words to start.</p>}
          {list.map((n) => {
            const r = reactionOf(n.reaction);
            return (
              <div key={n.id} className={`card p-3 text-sm space-y-1.5 ${n.id === active ? "ring-2 ring-accent-400" : ""}`}>
                <div className="flex items-center gap-2 text-xs text-ink-500">
                  {!n.mine && <span className="font-medium text-ink-700 dark:text-ink-200">{n.author_name}</span>}
                  <span>{n.kind === "suggest" ? "✏️ Edit" : n.kind === "comment" ? "💬 Comment" : `${r?.emoji} ${r?.label}`}</span>
                  {all && <span className="truncate">· {title(n.section_id)}</span>}
                </div>
                <button onClick={() => onGo(n)} className="text-left w-full">
                  {n.kind === "suggest"
                    ? <p className="font-serif"><del className="bg-rose-200/50 dark:bg-rose-600/25">{n.quote.slice(0, 200)}</del> <ins className="bg-emerald-200/60 dark:bg-emerald-600/30 no-underline">{n.replacement?.slice(0, 200)}</ins></p>
                    : <p className="font-serif text-ink-600 dark:text-ink-300 line-clamp-2">“{n.quote}”</p>}
                </button>
                {n.body && <p className="text-ink-800 dark:text-ink-100">{n.body}</p>}
                {n.author_reply && <p className="text-accent-700 dark:text-accent-300"><b className="font-medium">Herb:</b> {n.author_reply}</p>}
                {n.mine && !closed && (
                  <div className="flex gap-1">
                    {n.kind !== "reaction" && <button onClick={() => onEdit(n)} className="btn-ghost !py-1 !px-2 text-xs"><Pencil size={12} /> Edit</button>}
                    <button onClick={() => onDelete(n)} className="btn-ghost !py-1 !px-2 text-xs"><Trash2 size={12} /> Delete</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
