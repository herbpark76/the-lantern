import { useCallback, useEffect, useState } from "react";
import {
  Loader2, Mic, Play, RefreshCw, Trash2, ChevronLeft, Save, UserPlus, ExternalLink, AlertTriangle, CheckCircle, KeyRound,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  ERA_OPTIONS, eraLabel, interviewApi, InterviewError,
  type InterviewMode, type InterviewSession, type InterviewSubject, type InterviewTurn,
} from "@/lib/interview";

const GITHUB_REPO_URL = "https://github.com/herbpark76/the-lantern/blob/main/";

export function InterviewsTab() {
  const [subjects, setSubjects] = useState<InterviewSubject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.from("interview_subjects").select("*").order("created_at");
    const list = (data as InterviewSubject[]) ?? [];
    setSubjects(list);
    setSelectedId((cur) => cur ?? list[0]?.id ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-ink-400" /></div>;

  const subject = subjects.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-wrap items-center gap-2">
        {subjects.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelectedId(s.id)}
            className={`px-3 py-1.5 rounded-lg text-sm border ${s.id === selectedId
              ? "border-accent-400 text-accent-700 dark:text-accent-300 bg-accent-50 dark:bg-accent-950"
              : "border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-300"}`}
          >
            {s.display_name} <span className="text-ink-400">· {s.story_slug}{s.mode === "ghostwriter" ? " · ghostwriter" : ""}</span>
          </button>
        ))}
        <button onClick={() => setSelectedId("__new")} className={`btn-ghost !py-1.5 ${selectedId === "__new" ? "bg-ink-100 dark:bg-ink-800" : ""}`}>
          <UserPlus size={15} /> Add person
        </button>
      </div>

      {selectedId === "__new" || subjects.length === 0 ? (
        <NewSubjectForm onCreated={async (id) => { await load(); setSelectedId(id); }} />
      ) : subject ? (
        <SubjectView key={subject.id} subject={subject} onChanged={load} />
      ) : null}
    </div>
  );
}

// ── Add a person ─────────────────────────────────────────────────────────

function NewSubjectForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("Mom");
  const [slug, setSlug] = useState("red-earth");
  const [honorific, setHonorific] = useState("어머니");
  const [mode, setMode] = useState<InterviewMode>("memoir");

  // Sensible starting values for each kind of interview.
  const pickMode = (m: InterviewMode) => {
    setMode(m);
    if (m === "ghostwriter") { setName("Herb"); setSlug("herbs-workspace"); setHonorific("Herb"); }
    else { setName("Mom"); setSlug("red-earth"); setHonorific("어머니"); }
  };
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await interviewApi.createSubject({
        email, password: password || undefined, display_name: name, story_slug: slug, honorific,
        mode, language: mode === "ghostwriter" ? "en" : "ko",
      });
      setMsg(r.account_created ? "Account created and ready." : "Linked to the existing account.");
      onCreated(r.subject.id);
    } catch (e) {
      setMsg((e as InterviewError).message);
    }
    setBusy(false);
  };

  return (
    <div className="card p-5 space-y-4 max-w-xl">
      <div>
        <h3 className="font-serif text-lg text-ink-900 dark:text-ink-50">Add a person to interview</h3>
        <p className="text-sm text-ink-500 mt-1">
          Use their email. If they don't have a Lantern account yet, set a password and one is created for them
          (already confirmed). Sign them in once on their phone at <code>/interview</code> and add it to the home screen.
          One account can have several interviews; each also has its own link, <code>/interview/&lt;story slug&gt;</code>.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Kind of interview">
          <select className="input-field !py-2" value={mode} onChange={(e) => pickMode(e.target.value as InterviewMode)}>
            <option value="memoir">Memoir — Korean, life story by era</option>
            <option value="ghostwriter">Ghostwriter — English, builds a new story from your idea</option>
          </select>
        </Field>
        <div className="hidden sm:block" />
        <Field label="Email"><input className="input-field !py-2" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password (new accounts only)"><input className="input-field !py-2" type="text" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Field label="Display name"><input className="input-field !py-2" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="How the interviewer addresses them"><input className="input-field !py-2" value={honorific} onChange={(e) => setHonorific(e.target.value)} /></Field>
        <Field label="Book (story slug)"><input className="input-field !py-2" value={slug} onChange={(e) => setSlug(e.target.value)} /></Field>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary !py-2" disabled={busy || !email || !name || !slug} onClick={submit}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />} Add
        </button>
        {msg && <span className="text-sm text-ink-600 dark:text-ink-300">{msg}</span>}
      </div>
      <p className="text-xs text-ink-400">Tip: add yourself first as a test person to rehearse, then delete the test sessions.</p>
    </div>
  );
}

// ── One person ───────────────────────────────────────────────────────────

function SubjectView({ subject, onChanged }: { subject: InterviewSubject; onChanged: () => void }) {
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [openSession, setOpenSession] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSessions = useCallback(async () => {
    const { data } = await supabase
      .from("interview_sessions").select("*").eq("subject_id", subject.id).order("session_no", { ascending: false });
    setSessions((data as InterviewSession[]) ?? []);
    setLoading(false);
  }, [subject.id]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // Poll while a summary is being written.
  useEffect(() => {
    if (!sessions.some((s) => s.status === "finishing")) return;
    const t = window.setInterval(loadSessions, 8000);
    return () => window.clearInterval(t);
  }, [sessions, loadSessions]);

  const since = Date.now() - 30 * 86400_000;
  const monthCost = sessions.filter((s) => new Date(s.started_at).getTime() > since).reduce((a, s) => a + Number(s.est_cost_usd || 0), 0);

  if (openSession) {
    const s = sessions.find((x) => x.id === openSession);
    if (s) return <SessionDetail session={s} subject={subject} onBack={() => setOpenSession(null)} onChanged={loadSessions} />;
  }

  return (
    <div className="space-y-6">
      <SubjectSettings subject={subject} onSaved={onChanged} monthCost={monthCost} />

      <div>
        <h3 className="font-serif text-lg text-ink-900 dark:text-ink-50 mb-3">Sessions</h3>
        {loading ? (
          <Loader2 className="animate-spin text-ink-400" />
        ) : sessions.length === 0 ? (
          <p className="text-sm text-ink-500">No sessions yet. They'll appear here as soon as {subject.display_name} starts talking at <code>/interview</code>.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <button key={s.id} onClick={() => setOpenSession(s.id)} className="card card-hover w-full text-left px-4 py-3 flex items-center gap-4">
                <span className="font-serif text-xl text-ink-400 w-10">#{s.session_no}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-ink-900 dark:text-ink-100">{eraLabel(s.era)}</span>
                  <span className="block text-xs text-ink-500">
                    {new Date(s.started_at).toLocaleString()} · {minutes(s)} min · ${Number(s.est_cost_usd).toFixed(2)}
                  </span>
                </span>
                <StatusBadge session={s} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SubjectSettings({ subject, onSaved, monthCost }: { subject: InterviewSubject; onSaved: () => void; monthCost: number }) {
  const [nextEra, setNextEra] = useState(subject.next_era);
  const [notes, setNotes] = useState(subject.interviewer_notes);
  const [offLimits, setOffLimits] = useState(subject.off_limits.join("\n"));
  const [background, setBackground] = useState(subject.background);
  const [voiceId, setVoiceId] = useState(subject.tts_voice_id);
  const [model, setModel] = useState(subject.tts_model_id);
  const [speed, setSpeed] = useState(String(subject.tts_speed));
  const [budget, setBudget] = useState(String(subject.monthly_budget_usd));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const ghost = subject.mode === "ghostwriter";

  const save = async () => {
    setBusy(true);
    await supabase.from("interview_subjects").update({
      next_era: nextEra,
      interviewer_notes: notes,
      off_limits: offLimits.split("\n").map((s) => s.trim()).filter(Boolean),
      background,
      tts_voice_id: voiceId.trim(),
      tts_model_id: model.trim(),
      tts_speed: Number(speed) || 1,
      monthly_budget_usd: Number(budget) || 30,
    }).eq("id", subject.id);
    setBusy(false);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
    onSaved();
  };

  const resetPassword = async () => {
    setPwMsg(null);
    try { await interviewApi.setPassword(subject.id, newPw); setPwMsg("Password updated."); setNewPw(""); }
    catch (e) { setPwMsg((e as InterviewError).message); }
  };

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-serif text-lg text-ink-900 dark:text-ink-50 flex items-center gap-2"><Mic size={18} className="text-accent-500" /> {subject.display_name}</h3>
          <p className="text-xs text-ink-500 mt-1">
            {ghost ? "Ghostwriter" : "Memoir"} · Book: {subject.story_slug} · addressed as {subject.honorific} · last 30 days ≈ ${monthCost.toFixed(2)} of ${Number(subject.monthly_budget_usd).toFixed(0)}
          </p>
          <a href={`/interview/${subject.story_slug}`} target="_blank" rel="noreferrer" className="text-xs text-accent-600 inline-flex items-center gap-1 mt-1">
            <ExternalLink size={12} /> {window.location.origin}/interview/{subject.story_slug}
          </a>
        </div>
        <button className="btn-primary !py-2" onClick={save} disabled={busy}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : saved ? <CheckCircle size={16} /> : <Save size={16} />} {saved ? "Saved" : "Save"}
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {ghost ? (
          <p className="text-sm text-ink-500 self-center">
            The ghostwriter asks about your taste, the idea, characters, conflict and ending, then says when it has enough.
            Finishing a session writes a story bible, outline and opening chapter into Book.
          </p>
        ) : (
          <Field label="Topic for the next session">
            <select className="input-field !py-2" value={nextEra} onChange={(e) => setNextEra(e.target.value)}>
              {ERA_OPTIONS.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
            </select>
          </Field>
        )}
        <Field label="Off limits (one per line, never asked)">
          <textarea className="input-field !py-2 text-sm" rows={3} value={offLimits} onChange={(e) => setOffLimits(e.target.value)}
            placeholder={"e.g. 아버지와의 결혼 생활 (her marriage)\n돌아가신 오빠 이야기"} />
        </Field>
      </div>
      <Field label="Notes for the interviewer (English or Korean)">
        <textarea className="input-field !py-2 text-sm" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Ask more about the older brother who went to Seoul. She lights up talking about cooking — use food to get into memories." />
      </Field>
      <Field label="Background on the book (optional — what the interviewer should know)">
        <textarea className="input-field !py-2 text-sm" rows={3} value={background} onChange={(e) => setBackground(e.target.value)} />
      </Field>

      <details className="text-sm">
        <summary className="cursor-pointer text-ink-500">Voice, budget and account</summary>
        <div className="grid md:grid-cols-4 gap-3 mt-3">
          <Field label="ElevenLabs voice ID"><input className="input-field !py-2 text-sm" value={voiceId} onChange={(e) => setVoiceId(e.target.value)} /></Field>
          <Field label="TTS model">
            <select className="input-field !py-2 text-sm" value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="eleven_v3">eleven_v3 (most natural)</option>
              <option value="eleven_v4">eleven_v4</option>
              <option value="eleven_flash_v2_5">eleven_flash_v2_5 (fastest)</option>
              <option value="eleven_multilingual_v2">eleven_multilingual_v2</option>
            </select>
          </Field>
          <Field label="Speed"><input className="input-field !py-2 text-sm" value={speed} onChange={(e) => setSpeed(e.target.value)} /></Field>
          <Field label="Monthly budget ($)"><input className="input-field !py-2 text-sm" value={budget} onChange={(e) => setBudget(e.target.value)} /></Field>
        </div>
        <div className="flex items-end gap-2 mt-3">
          <Field label="Reset their sign-in password"><input className="input-field !py-2 text-sm" value={newPw} onChange={(e) => setNewPw(e.target.value)} /></Field>
          <button className="btn-secondary !py-2" onClick={resetPassword} disabled={newPw.length < 6}><KeyRound size={15} /> Set</button>
          {pwMsg && <span className="text-xs text-ink-500 pb-2">{pwMsg}</span>}
        </div>
      </details>
    </div>
  );
}

// ── One session ──────────────────────────────────────────────────────────

function SessionDetail({ session, subject, onBack, onChanged }: {
  session: InterviewSession; subject: InterviewSubject; onBack: () => void; onChanged: () => void;
}) {
  const [turns, setTurns] = useState<InterviewTurn[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [view, setView] = useState<"conversation" | "english">("conversation");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ghost = subject.mode === "ghostwriter";

  useEffect(() => {
    supabase.from("interview_turns").select("*").eq("session_id", session.id).order("turn_no")
      .then(({ data }) => setTurns((data as InterviewTurn[]) ?? []));
    interviewApi.sessionAudio(session.id).then((r) => setUrls(r.urls)).catch(() => {});
  }, [session.id]);

  const regenerate = async () => {
    setBusy("regen");
    setMsg(ghost
      ? "Writing the story bible, outline and opening chapter — this can take two or three minutes…"
      : "Writing the translation and summary — this can take a minute or two…");
    try {
      const r = await interviewApi.regenerate(session.id);
      setMsg(r.github_error ? `Summary saved, but GitHub commit failed: ${r.github_error}` : `Summary written and saved to GitHub${r.github_path ? `: ${r.github_path}` : ""}.`);
      onChanged();
    } catch (e) { setMsg((e as InterviewError).message); }
    setBusy(null);
  };

  const remove = async () => {
    setBusy("delete");
    try { await interviewApi.deleteSession(session.id); onChanged(); onBack(); }
    catch (e) { setMsg((e as InterviewError).message); setBusy(null); }
  };

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="btn-ghost !px-2"><ChevronLeft size={16} /> All sessions</button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-serif text-xl text-ink-900 dark:text-ink-50">Session {session.session_no}: {eraLabel(session.era)}</h3>
          <p className="text-xs text-ink-500 mt-1">
            {subject.display_name} · {new Date(session.started_at).toLocaleString()} · {minutes(session)} min ·
            {" "}{turns.filter((t) => t.speaker === "subject").length} answers · ${Number(session.est_cost_usd).toFixed(2)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge session={session} />
          <button className="btn-secondary !py-1.5 !px-3" onClick={regenerate} disabled={!!busy}>
            {busy === "regen" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {session.status === "active" ? "End & write summary" : session.summary_en ? "Regenerate" : "Write summary"}
          </button>
          {confirmDelete ? (
            <>
              <button className="btn-secondary !py-1.5 !px-3 !text-error-600" onClick={remove} disabled={!!busy}>Delete for good</button>
              <button className="btn-ghost !py-1.5" onClick={() => setConfirmDelete(false)}>Cancel</button>
            </>
          ) : (
            <button className="btn-ghost !py-1.5" onClick={() => setConfirmDelete(true)} aria-label="Delete session"><Trash2 size={14} /></button>
          )}
        </div>
      </div>

      {msg && <p className="text-sm text-ink-600 dark:text-ink-300">{msg}</p>}
      {session.github_path && (
        <a href={GITHUB_REPO_URL + session.github_path} target="_blank" rel="noreferrer" className="text-sm text-accent-600 inline-flex items-center gap-1">
          <ExternalLink size={13} /> {session.github_path}
        </a>
      )}
      {session.github_error && (
        <p className="text-sm text-warning-600 flex items-start gap-1"><AlertTriangle size={14} className="mt-0.5" /> GitHub: {session.github_error}</p>
      )}

      {(session.summary_en || session.scene_notes || session.followups) && (
        <div className="grid lg:grid-cols-3 gap-4">
          <NotesCard title={ghost ? "Story bible" : "Summary"} text={session.summary_en} />
          <NotesCard title={ghost ? "Outline" : "Scene notes"} text={session.scene_notes} />
          <NotesCard title={ghost ? "Still to decide" : "Follow-ups"} text={session.followups} />
        </div>
      )}
      {session.summary_ko && <NotesCard title="요약 · Korean summary for her to read" text={session.summary_ko} />}

      <div className="flex gap-1 border-b border-ink-200 dark:border-ink-800">
        {(ghost ? ["conversation"] as const : ["conversation", "english"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)}
            className={`px-3 py-2 text-sm ${view === v ? "text-accent-600 border-b-2 border-accent-500" : "text-ink-500"}`}>
            {v === "conversation" ? (ghost ? "Conversation (+ audio)" : "Conversation (Korean + audio)") : "English translation"}
          </button>
        ))}
      </div>

      {view === "conversation" ? (
        <div className="space-y-3">
          {turns.map((t) => (
            <div key={t.id} className={`flex gap-3 ${t.speaker === "subject" ? "" : "opacity-80"}`}>
              <div className="w-20 shrink-0 text-xs text-ink-400 pt-1">{t.speaker === "subject" ? subject.display_name : "Interviewer"}</div>
              <div className={`flex-1 rounded-xl px-4 py-2 ${t.speaker === "subject" ? "bg-accent-50 dark:bg-accent-950/40" : "bg-ink-100 dark:bg-ink-900"}`}>
                <p className="text-base leading-relaxed text-ink-900 dark:text-ink-100 whitespace-pre-wrap" lang={subject.language}>
                  {t.skipped ? <em className="text-ink-400">(skipped this question)</em> : t.text}
                </p>
                {urls[t.id] && <AudioButton url={urls[t.id]} />}
              </div>
            </div>
          ))}
          {turns.length === 0 && <p className="text-sm text-ink-500">No turns yet.</p>}
        </div>
      ) : (
        <div className="card p-5">
          {session.transcript_en
            ? <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink-800 dark:text-ink-200">{session.transcript_en}</p>
            : <p className="text-sm text-ink-500">The translation is written when the session ends.</p>}
        </div>
      )}
    </div>
  );
}

function AudioButton({ url }: { url: string }) {
  const [playing, setPlaying] = useState(false);
  const [audio] = useState(() => new Audio());
  useEffect(() => () => { audio.pause(); }, [audio]);
  const toggle = () => {
    if (playing) { audio.pause(); setPlaying(false); return; }
    audio.src = url;
    audio.onended = () => setPlaying(false);
    audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  };
  return (
    <button onClick={toggle} className="mt-1 inline-flex items-center gap-1 text-xs text-accent-600 dark:text-accent-400">
      <Play size={12} /> {playing ? "Pause" : "Play"}
    </button>
  );
}

function NotesCard({ title, text }: { title: string; text: string | null }) {
  return (
    <div className="card p-4">
      <h4 className="text-xs uppercase tracking-wide text-ink-500 mb-2">{title}</h4>
      <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink-800 dark:text-ink-200">{text || "—"}</p>
    </div>
  );
}

function StatusBadge({ session }: { session: InterviewSession }) {
  const map = {
    active: { label: "In progress", cls: "bg-success-500/15 text-success-600" },
    finishing: { label: "Writing summary…", cls: "bg-warning-500/15 text-warning-600" },
    finished: { label: "Done", cls: "bg-ink-200 dark:bg-ink-800 text-ink-600 dark:text-ink-300" },
  } as const;
  const m = map[session.status];
  return <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${m.cls}`}>{m.label}</span>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-ink-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

function minutes(s: InterviewSession): number {
  const end = s.ended_at ? new Date(s.ended_at).getTime() : new Date(s.last_activity_at).getTime();
  return Math.max(0, Math.round((end - new Date(s.started_at).getTime()) / 60000));
}
