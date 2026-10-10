import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, RotateCcw, SkipForward, Volume2, Loader2, Keyboard, Send, X, Pause } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { interviewApi, InterviewError, pickRecorderMime, setInterviewSlug, SILENT_WAV, type InterviewChoice, type InterviewState, type Question } from "@/lib/interview";

// Voice-first interview page. Large type, one big button, designed for an iPhone held in one hand.
// Korean for the memoir interviews (Mom); English for ghostwriter projects (/interview/<slug>).

type Lang = "ko" | "en";

const STR = {
  ko: {
    title: "이야기 시간",
    micDenied: "마이크를 쓸 수 없어요. 설정에서 마이크를 허용해 주세요.",
    tapWhenReady: "준비되시면 말하기를 눌러 주세요.",
    sayMore: "조금 더 길게 말씀해 주세요.",
    notHeard: "잘 못 들었어요. 다시 한 번 말씀해 주시겠어요?",
    sayAgain: "다시 말씀해 주세요.",
    stuck: "잠깐 문제가 생겼어요",
    retry: "다시 시도",
    relogin: "다시 로그인하기",
    switchAccount: "다른 계정으로 들어가기",
    preparing: "아직 준비 중이에요",
    preparingSub: "아드님께 말씀해 주세요.",
    hello: (h: string) => `안녕하세요, ${h}`,
    resumeQ: "지난번 이야기를 이어서 할까요?",
    invite: (h: string) => <>오늘도 {h} 이야기를<br />들려주세요.</>,
    resumeBtn: "이어서 하기",
    startBtn: "시작하기",
    hintAuto: <>질문이 끝나면 바로 들을게요.<br />편하게 말씀하시고, 다 하시면 잠깐 쉬세요.</>,
    hintManual: <>질문을 들으시고, 큰 동그라미 버튼을<br />눌러서 편하게 말씀하시면 돼요.</>,
    thanks: "오늘도 고맙습니다",
    home: "처음으로",
    playQ: "질문 듣기",
    replayQ: "다시 듣기",
    youSaid: (h: string) => `${h} 말씀`,
    thinking: "듣고 있어요…",
    asking: "질문하는 중…",
    placeholder: "여기에 써 주세요",
    close: "닫기",
    send: "보내기",
    done: "다 했어요",
    speak: "말하기",
    countdown: (n: number) => `${n}초 뒤에 넘어가요…`,
    listeningTimed: (t: string) => `${t}  듣고 있어요…`,
    listening: "말씀하세요. 듣고 있어요…",
    manualTimed: (t: string) => `${t}  말씀하세요…`,
    tapToSpeak: "누르고 말씀하세요",
    pauseHint: "다 말씀하시면 잠깐 쉬세요. 알아서 넘어가요.",
    redo: "다시 말하기",
    skip: "넘어갈게요",
    type: "글로 쓰기",
    auto: (on: boolean) => `자동 듣기 ${on ? "켜짐" : "꺼짐"}`,
    endQ: "끝낼까요?",
    yes: "네",
    no: "아니요",
    end: "오늘은 여기까지",
    email: "이메일",
    password: "비밀번호",
    loginErr: "이메일이나 비밀번호가 맞지 않아요.",
    wait: "잠시만요…",
    enter: "들어가기",
    choose: "어떤 이야기를 할까요? · Which story?",
    pause: "잠깐 쉬기",
    paused: "잠깐 쉬어요. 준비되시면 말하기를 눌러 주세요.",
  },
  en: {
    title: "Story session",
    micDenied: "I can't use the microphone. Please allow it in Settings.",
    tapWhenReady: "Tap Speak when you're ready.",
    sayMore: "That was very short. Try again?",
    notHeard: "I didn't catch that. Could you say it again?",
    sayAgain: "Go ahead, say it again.",
    stuck: "Something went wrong",
    retry: "Try again",
    relogin: "Sign in again",
    switchAccount: "Use a different account",
    preparing: "Not set up yet",
    preparingSub: "This interview hasn't been created in Studio yet.",
    hello: (h: string) => `Hi, ${h}`,
    resumeQ: "Pick up where we left off?",
    invite: () => <>Let's find your story.<br />I'll ask, you talk.</>,
    resumeBtn: "Continue",
    startBtn: "Start",
    hintAuto: <>I'll start listening when each question ends.<br />Pause for a few seconds when you're done.</>,
    hintManual: <>Listen to the question, then tap<br />the big button and talk.</>,
    thanks: "Thanks — that's a wrap",
    home: "Back to start",
    playQ: "Play question",
    replayQ: "Replay",
    youSaid: () => "You said",
    thinking: "Thinking…",
    asking: "Asking…",
    placeholder: "Type your answer",
    close: "Close",
    send: "Send",
    done: "Done",
    speak: "Speak",
    countdown: (n: number) => `Moving on in ${n}s…`,
    listeningTimed: (t: string) => `${t}  listening…`,
    listening: "Go ahead, I'm listening…",
    manualTimed: (t: string) => `${t}  talk…`,
    tapToSpeak: "Tap and talk",
    pauseHint: "When you're done, just pause. I'll move on.",
    redo: "Redo answer",
    skip: "Skip",
    type: "Type instead",
    auto: (on: boolean) => `Auto-listen ${on ? "on" : "off"}`,
    endQ: "Wrap up?",
    yes: "Yes",
    no: "No",
    end: "Finish",
    email: "Email",
    password: "Password",
    loginErr: "That email or password didn't work.",
    wait: "One moment…",
    enter: "Sign in",
    choose: "Which story? · 어떤 이야기를 할까요?",
    pause: "Pause",
    paused: "Paused. Tap Speak when you're ready.",
  },
};

type Phase =
  | "loading"
  | "welcome"     // before the session starts / resumes (first tap unlocks audio)
  | "speaking"    // interviewer audio playing
  | "ready"       // waiting for her to tap the mic
  | "recording"
  | "thinking"    // uploading + transcribing + next question
  | "finished";

const MAX_RECORD_MS = 5 * 60 * 1000;
const MIN_RECORD_MS = 700;
// Hands-free listening: after she has spoken, this much quiet ends her answer.
const SILENCE_MS = 10_000;
// If she says nothing at all for this long, stop listening and wait for a tap.
const NO_SPEECH_MS = 60_000;
const SILENCE_COUNTDOWN_FROM_MS = 4_000;

export function InterviewPage({ slug }: { slug?: string }) {
  setInterviewSlug(slug);
  const { session: authSession, loading: authLoading } = useAuth();
  const [stuck, setStuck] = useState(false);

  const [phase, setPhase] = useState<Phase>("loading");
  const [state, setState] = useState<InterviewState | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [herText, setHerText] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const showError = (e: unknown) => {
    const err = e as InterviewError;
    setError(err.message);
    setErrorDetail(err.detail ?? null);
  };
  const [noSubject, setNoSubject] = useState(false);
  const [choices, setChoices] = useState<InterviewChoice[] | null>(null);
  const [needsTapToPlay, setNeedsTapToPlay] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [closingText, setClosingText] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [typing, setTyping] = useState(false);
  const [typedText, setTypedText] = useState("");
  const [autoListen, setAutoListen] = useState<boolean>(() => {
    try { return localStorage.getItem("interview-auto-listen") !== "off"; } catch { return true; }
  });
  const [heardVoice, setHeardVoice] = useState(false);
  const [silenceLeft, setSilenceLeft] = useState<number | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordStartRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const phaseRef = useRef<Phase>("loading");
  phaseRef.current = phase;
  const autoListenRef = useRef(autoListen);
  autoListenRef.current = autoListen;
  const audioCtxRef = useRef<AudioContext | null>(null);
  const vadTimerRef = useRef<number | null>(null);
  const discardRef = useRef(false);
  const pausedRef = useRef<"pause" | "end" | null>(null);
  // Always call the latest version of these from audio callbacks.
  const afterQuestionRef = useRef<() => void>(() => {});

  // ── Load state ──
  useEffect(() => {
    if (authLoading) return;
    if (!authSession) { setPhase("welcome"); return; }
    interviewApi.state()
      .then((s) => {
        if (s.choose) { setChoices(s.choose); setPhase("welcome"); return; }
        setChoices(null); setState(s); setQuestion(s.question); setPhase("welcome");
      })
      .catch((e: InterviewError) => {
        // Expired or invalid sign-in: sign out so the login form shows.
        if (e.status === 401) { resetSignIn(); return; }
        if (e.code === "no_subject") setNoSubject(true);
        else setError(e.message);
        setPhase("welcome");
      });
  }, [authLoading, authSession, slug]);

  // If loading takes too long, offer a way out instead of spinning forever.
  useEffect(() => {
    if (phase !== "loading" && !authLoading) { setStuck(false); return; }
    const t = window.setTimeout(() => setStuck(true), 10000);
    return () => window.clearTimeout(t);
  }, [phase, authLoading]);

  // Before we know the interview, a named link (/interview/<slug>) is a ghostwriter project → English.
  const lang: Lang = state?.subject.language === "en" ? "en" : state?.subject.language === "ko" ? "ko" : slug ? "en" : "ko";
  const T = STR[lang];
  const ghost = state?.subject.mode === "ghostwriter";

  // Force a light, warm page and keep iOS from bouncing.
  useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains("dark");
    root.classList.remove("dark");
    return () => { if (hadDark) root.classList.add("dark"); };
  }, []);
  useEffect(() => { document.title = T.title; }, [T]);

  // ── Wake lock: keep the screen on during a session ──
  const acquireWakeLock = useCallback(async () => {
    try {
      const wl = (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock;
      if (wl && !wakeLockRef.current) wakeLockRef.current = await wl.request("screen");
    } catch { /* not supported or denied */ }
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && phaseRef.current !== "welcome" && phaseRef.current !== "finished") {
        wakeLockRef.current = null;
        acquireWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      wakeLockRef.current?.release().catch(() => {});
    };
  }, [acquireWakeLock]);

  // ── Audio playback ──
  const getAudio = () => {
    if (!audioRef.current) {
      const a = new Audio();
      a.setAttribute("playsinline", "true");
      a.preload = "auto";
      audioRef.current = a;
    }
    return audioRef.current;
  };

  const playQuestion = useCallback((q: Question | null) => {
    setNeedsTapToPlay(false);
    if (!q?.audio_url) { afterQuestionRef.current(); return; }
    const a = getAudio();
    a.onended = () => { if (phaseRef.current === "speaking") afterQuestionRef.current(); };
    a.onerror = () => { if (phaseRef.current === "speaking") setPhase("ready"); };
    a.src = q.audio_url;
    setPhase("speaking");
    a.play().catch(() => {
      // iOS refused autoplay — show a play button instead.
      setNeedsTapToPlay(true);
      setPhase("ready");
    });
  }, []);

  const stopAudio = () => {
    const a = audioRef.current;
    if (a && !a.paused) a.pause();
  };

  // ── Start / resume (first tap) ──
  const handleBegin = async () => {
    // Unlock audio inside the tap gesture, before any await.
    const a = getAudio();
    a.src = SILENT_WAV;
    a.play().catch(() => {});
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!audioCtxRef.current && Ctx) audioCtxRef.current = new Ctx();
      audioCtxRef.current?.resume().catch(() => {});
    } catch { /* no Web Audio: hands-free falls back to the button */ }
    if (autoListenRef.current) {
      // Ask for the microphone now, while she is tapping, so the permission prompt isn't a surprise later.
      navigator.mediaDevices?.getUserMedia({ audio: true }).then((st) => st.getTracks().forEach((t) => t.stop())).catch(() => {});
    }
    acquireWakeLock();
    setError(null); setErrorDetail(null);
    setPhase("thinking");
    try {
      const s = await interviewApi.start();
      setState(s);
      setQuestion(s.question);
      setHerText(s.last_answer);
      playQuestion(s.question);
    } catch (e) {
      if ((e as InterviewError).status === 401) { resetSignIn(); return; }
      showError(e);
      setPhase("welcome");
    }
  };

  // ── Recording ──
  const stopTimer = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const stopVad = () => {
    if (vadTimerRef.current) window.clearInterval(vadTimerRef.current);
    vadTimerRef.current = null;
    setSilenceLeft(null);
  };

  const releaseMic = () => {
    stopVad();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  // Listen to the mic level: once she has spoken, SILENCE_MS of quiet ends the answer.
  const startVad = (stream: MediaStream) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    ctx.resume().catch(() => {});
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const started = Date.now();
    let floor = 0;
    let floorSamples = 0;
    let voicedMs = 0;
    let lastVoice = 0;
    let spoke = false;
    setHeardVoice(false);
    vadTimerRef.current = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const now = Date.now();
      if (now - started < 700) { floor += rms; floorSamples++; return; } // learn the room's background level
      const base = floorSamples ? floor / floorSamples : 0.005;
      const threshold = Math.max(0.012, base * 2.5);
      if (rms > threshold) {
        voicedMs += 100;
        lastVoice = now;
        if (!spoke && voicedMs >= 400) { spoke = true; setHeardVoice(true); }
        setSilenceLeft(null);
      } else if (spoke) {
        const quiet = now - lastVoice;
        if (quiet >= SILENCE_MS) { stopVad(); stopRecording(); return; }
        setSilenceLeft(quiet >= SILENCE_COUNTDOWN_FROM_MS ? Math.ceil((SILENCE_MS - quiet) / 1000) : null);
      } else if (now - started >= NO_SPEECH_MS) {
        // Nothing said at all: stop quietly and wait for her to tap.
        stopVad();
        discardRef.current = true;
        stopRecording();
      }
    }, 100);
  };

  const startRecording = async () => {
    stopAudio();
    setNotice(null);
    setError(null); setErrorDetail(null);
    setNeedsTapToPlay(false);
    try {
      // Grab the mic only while recording, so iPhone playback stays on the loudspeaker.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const mime = pickRecorderMime();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => { if (ev.data.size > 0) chunksRef.current.push(ev.data); };
      rec.onstop = () => handleRecorded(rec.mimeType || mime || "audio/mp4");
      recorderRef.current = rec;
      discardRef.current = false;
      rec.start(1000);
      recordStartRef.current = Date.now();
      if (autoListenRef.current) startVad(stream);
      setElapsed(0);
      timerRef.current = window.setInterval(() => {
        const ms = Date.now() - recordStartRef.current;
        setElapsed(Math.floor(ms / 1000));
        if (ms > MAX_RECORD_MS) stopRecording();
      }, 250);
      setPhase("recording");
    } catch {
      releaseMic();
      setError(T.micDenied);
      setPhase("ready");
    }
  };

  const stopRecording = () => {
    stopTimer();
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  };

  const handleRecorded = async (mime: string) => {
    const durationMs = Date.now() - recordStartRef.current;
    releaseMic();
    const blob = new Blob(chunksRef.current, { type: mime.split(";")[0] });
    chunksRef.current = [];
    if (discardRef.current) {
      discardRef.current = false;
      setNotice(pausedRef.current === "end" ? null : pausedRef.current === "pause" ? T.paused : T.tapWhenReady);
      pausedRef.current = null;
      setPhase("ready");
      return;
    }
    if (durationMs < MIN_RECORD_MS || blob.size < 1000) {
      setNotice(T.sayMore);
      setPhase("ready");
      return;
    }
    setPhase("thinking");
    try {
      const r = await interviewApi.answerAudio(blob, durationMs);
      if (r.not_heard) {
        setNotice(r.message ?? T.notHeard);
        setPhase("ready");
        if (autoListenRef.current) window.setTimeout(() => { if (phaseRef.current === "ready") startRecording(); }, 1200);
        return;
      }
      setHerText(r.her_text ?? null);
      if (r.question) { setQuestion(r.question); playQuestion(r.question); }
      else setPhase("ready");
    } catch (e) {
      showError(e);
      setPhase("ready");
    }
  };

  // ── Other actions ──
  const sendTyped = async () => {
    const text = typedText.trim();
    if (!text) return;
    setPhase("thinking");
    setError(null); setErrorDetail(null);
    try {
      const r = await interviewApi.answerText(text);
      setTypedText("");
      setTyping(false);
      setHerText(r.her_text ?? text);
      if (r.question) { setQuestion(r.question); playQuestion(r.question); }
      else setPhase("ready");
    } catch (e) {
      showError(e);
      setPhase("ready");
    }
  };

  const handleSkip = async () => {
    stopAudio();
    setPhase("thinking");
    setError(null); setErrorDetail(null);
    setNotice(null);
    try {
      const r = await interviewApi.skip();
      setHerText(null);
      if (r.question) { setQuestion(r.question); playQuestion(r.question); }
      else setPhase("ready");
    } catch (e) {
      showError(e);
      setPhase("ready");
    }
  };

  const handleRedo = async () => {
    stopAudio();
    setPhase("thinking");
    setError(null); setErrorDetail(null);
    try {
      const s = await interviewApi.redo();
      setHerText(null);
      setQuestion(s.question);
      setNotice(T.sayAgain);
      setPhase("ready");
      if (autoListenRef.current) window.setTimeout(() => { if (phaseRef.current === "ready") startRecording(); }, 800);
    } catch (e) {
      showError(e);
      setPhase("ready");
    }
  };

  const handleFinish = async () => {
    setConfirmEnd(false);
    stopAudio();
    setPhase("thinking");
    try {
      const r = await interviewApi.finish();
      setClosingText(r.closing?.text ?? null);
      setPhase("finished");
      if (r.closing?.audio_url) {
        const a = getAudio();
        a.onended = null;
        a.src = r.closing.audio_url;
        a.play().catch(() => {});
      }
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    } catch (e) {
      showError(e);
      setPhase("ready");
    }
  };

  // Pause: stop the question or the listening (nothing is sent) and wait for a tap.
  // With end=true it then asks "Finish?" — the hands-free mic hides the bottom bar otherwise.
  const handlePause = (end = false) => {
    if (end) setConfirmEnd(true);
    if (phaseRef.current === "recording") {
      pausedRef.current = end ? "end" : "pause";
      discardRef.current = true;
      stopVad();
      stopRecording();
      return;
    }
    stopAudio();
    setNotice(end ? null : T.paused);
    setPhase("ready");
  };

  afterQuestionRef.current = () => {
    if (autoListenRef.current && !typing) startRecording();
    else setPhase("ready");
  };

  const toggleAutoListen = () => {
    const next = !autoListen;
    setAutoListen(next);
    try { localStorage.setItem("interview-auto-listen", next ? "on" : "off"); } catch { /* ignore */ }
    if (!next) stopVad();
  };

  // Big button reacts the moment a finger touches it (a firm press on iPhone can
  // otherwise turn into a long-press and never register as a tap).
  const onMicPress = (e: React.PointerEvent) => {
    e.preventDefault();
    if (phaseRef.current === "thinking") return;
    if (phaseRef.current === "recording") stopRecording();
    else startRecording();
  };

  const replay = () => {
    if (!question?.audio_url) return;
    const a = getAudio();
    a.onended = () => { if (phaseRef.current === "speaking") afterQuestionRef.current(); };
    a.src = question.audio_url;
    setNeedsTapToPlay(false);
    setPhase("speaking");
    a.play().catch(() => setPhase("ready"));
  };

  // Clean up on unmount.
  useEffect(() => () => { stopTimer(); releaseMic(); stopAudio(); audioCtxRef.current?.close().catch(() => {}); }, []);

  // ── Render ──
  const honorific = state?.subject.honorific ?? (lang === "ko" ? "어머니" : "");

  if ((phase === "loading" || authLoading) && stuck) {
    return (
      <Shell>
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-6 px-2">
          <p className="text-3xl font-semibold">{T.stuck}</p>
          <button onClick={() => window.location.reload()} className="w-full max-w-xs py-5 rounded-3xl bg-[#b0642e] text-white text-2xl font-semibold">{T.retry}</button>
          <SwitchAccount onClick={resetSignIn} label={T.relogin} />
        </div>
      </Shell>
    );
  }

  if (phase === "loading" || authLoading) {
    return <Shell><div className="flex-1 flex items-center justify-center"><Loader2 size={40} className="animate-spin text-[#b0642e]" /></div></Shell>;
  }

  if (!authSession) return <Shell><Login T={T} /></Shell>;

  if (choices) {
    return (
      <Shell>
        <div className="flex-1 flex flex-col justify-center gap-4 px-2">
          <p className="text-3xl font-semibold mb-2 text-center">{T.choose}</p>
          {choices.map((c) => (
            <a key={c.story_slug} href={`/interview/${c.story_slug}`}
              className="block w-full py-5 px-5 rounded-3xl bg-white border border-[#e8e4dc] shadow-sm">
              <span className="block text-2xl font-semibold">{c.story_slug}</span>
              <span className="block text-base text-[#7a7160]">{c.mode === "ghostwriter" ? "Ghostwriter" : "Memoir"} · {c.display_name}</span>
            </a>
          ))}
          <SwitchAccount onClick={resetSignIn} label={T.switchAccount} />
        </div>
      </Shell>
    );
  }

  if (noSubject) {
    return (
      <Shell>
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 px-2">
          <p className="text-3xl font-semibold">{T.preparing}</p>
          <p className="text-xl text-[#5c5447]">{T.preparingSub}</p>
          <SwitchAccount onClick={resetSignIn} label={T.switchAccount} />
        </div>
      </Shell>
    );
  }

  if (phase === "welcome") {
    const resuming = !!state?.session;
    return (
      <Shell>
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-8 px-2">
          <div className="space-y-3">
            <p className="text-4xl font-semibold leading-snug">{T.hello(honorific)}</p>
            <p className="text-2xl text-[#5c5447] leading-relaxed">
              {resuming ? T.resumeQ : T.invite(honorific)}
            </p>
          </div>
          <button
            onClick={handleBegin}
            className="w-full max-w-xs py-6 rounded-3xl bg-[#b0642e] text-white text-3xl font-semibold shadow-lg active:scale-[0.98] transition-transform"
          >
            {resuming ? T.resumeBtn : T.startBtn}
          </button>
          {error && <p className="text-xl text-[#b04a4a]">{error}</p>}
          <p className="text-lg text-[#7a7160] leading-relaxed">
            {autoListen ? T.hintAuto : T.hintManual}
          </p>
          <SwitchAccount onClick={resetSignIn} label={T.switchAccount} />
        </div>
      </Shell>
    );
  }

  if (phase === "finished") {
    return (
      <Shell>
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-8 px-2">
          <p className="text-4xl font-semibold">{T.thanks}</p>
          {closingText && <p className="text-2xl leading-relaxed text-[#453f35]">{closingText}</p>}
          {ghost && (
            <p className="text-lg text-[#7a7160] leading-relaxed">
              The story bible, outline and opening chapter take a few minutes.
              They'll show up in <a href="/studio" className="underline underline-offset-4">Studio → Book</a>.
            </p>
          )}
          <button
            onClick={() => { setState((s) => s ? { ...s, session: null } : s); setQuestion(null); setHerText(null); setPhase("welcome"); }}
            className="w-full max-w-xs py-5 rounded-3xl bg-[#efe8dc] text-[#453f35] text-2xl font-semibold"
          >
            {T.home}
          </button>
        </div>
      </Shell>
    );
  }

  const recording = phase === "recording";
  const thinking = phase === "thinking";
  const speaking = phase === "speaking";
  const mm = Math.floor(elapsed / 60);
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <Shell>
      {/* Question */}
      <div className="pt-3 pb-3">
        {question ? (
          <p className="text-[26px] leading-[1.5] font-medium text-[#1c1a16]">{question.text}</p>
        ) : (
          <p className="text-2xl text-[#7a7160]">…</p>
        )}
        <div className="mt-3 flex gap-3">
          {question?.audio_url && !recording && !thinking && (
            <button onClick={replay} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#efe8dc] text-[#453f35] text-lg">
              <Volume2 size={24} /> {needsTapToPlay ? T.playQ : T.replayQ}
            </button>
          )}
        </div>
      </div>

      {/* Her last answer */}
      {herText && !recording && (
        <div className="mb-2 rounded-2xl bg-white/70 border border-[#e8e4dc] px-4 py-2.5">
          <p className="text-sm text-[#7a7160] mb-0.5">{T.youSaid(honorific)}</p>
          <p className="text-lg leading-relaxed text-[#453f35] line-clamp-3">{herText}</p>
        </div>
      )}

      {/* Status / errors */}
      <div className="min-h-[2rem] text-center">
        {notice && <p className="text-xl text-[#b0642e]">{notice}</p>}
        {error && <p className="text-xl text-[#b04a4a]">{error}</p>}
        {error && errorDetail && <p className="text-xs text-[#a89f8e] mt-1 break-all">{errorDetail}</p>}
        {thinking && <p className="text-xl text-[#7a7160] flex items-center justify-center gap-2"><Loader2 size={22} className="animate-spin" /> {T.thinking}</p>}
        {speaking && <p className="text-xl text-[#7a7160]">{T.asking}</p>}
      </div>

      {/* Big mic button */}
      <div className="flex-1 flex flex-col items-center justify-center gap-3 py-2">
        {typing ? (
          <div className="w-full space-y-3">
            <textarea
              value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              rows={4}
              autoFocus
              className="w-full rounded-2xl border border-[#d4cec1] bg-white p-4 text-xl leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#d68d56]"
              placeholder={T.placeholder}
            />
            <div className="flex gap-3">
              <button onClick={() => setTyping(false)} className="flex-1 py-4 rounded-2xl bg-[#efe8dc] text-xl inline-flex items-center justify-center gap-2"><X size={22} /> {T.close}</button>
              <button onClick={sendTyped} disabled={thinking || !typedText.trim()} className="flex-1 py-4 rounded-2xl bg-[#b0642e] text-white text-xl inline-flex items-center justify-center gap-2 disabled:opacity-50"><Send size={22} /> {T.send}</button>
            </div>
          </div>
        ) : (
          <>
            <button
              onPointerDown={onMicPress}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (recording) stopRecording(); else startRecording(); } }}
              onContextMenu={(e) => e.preventDefault()}
              disabled={thinking}
              aria-label={recording ? T.done : T.speak}
              style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none", touchAction: "manipulation" }}
              className={`relative w-40 h-40 rounded-full flex flex-col items-center justify-center gap-1 text-white shadow-xl transition-all active:scale-95 disabled:opacity-40 ${
                recording ? "bg-[#c95a5a]" : "bg-[#8a8378]"
              }`}
            >
              {recording && <span className="absolute inset-0 rounded-full bg-[#c95a5a] animate-ping opacity-30" />}
              {recording ? <Square size={40} fill="white" /> : <Mic size={52} />}
              <span className="text-2xl font-semibold">{recording ? T.done : T.speak}</span>
            </button>
            <p className="text-lg text-[#5c5447] h-7">
              {recording
                ? (silenceLeft !== null
                    ? T.countdown(silenceLeft)
                    : autoListen
                      ? (heardVoice ? T.listeningTimed(`${mm}:${ss}`) : T.listening)
                      : T.manualTimed(`${mm}:${ss}`))
                : thinking || speaking ? "" : T.tapToSpeak}
            </p>
          </>
        )}
      </div>

      {recording && autoListen && (
        <p className="text-center text-base text-[#7a7160] pb-3">{T.pauseHint}</p>
      )}

      {/* While listening or asking: a way to take a break or wrap up without waiting. */}
      {recording && (
        <div className="pb-1 grid grid-cols-2 gap-3">
          <button onClick={() => handlePause(false)} className="py-3.5 rounded-2xl bg-[#efe8dc] text-[#453f35] text-lg inline-flex items-center justify-center gap-2">
            <Pause size={20} /> {T.pause}
          </button>
          <button onClick={() => handlePause(true)} className="py-3.5 rounded-2xl border border-[#d4cec1] text-[#5c5447] text-lg">
            {T.end}
          </button>
        </div>
      )}

      {/* Bottom actions */}
      {!recording && (
        <div className="pb-1 space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <button onClick={handleRedo} disabled={thinking || !herText} className="py-3.5 rounded-2xl bg-[#efe8dc] text-[#453f35] text-lg inline-flex items-center justify-center gap-2 disabled:opacity-40">
              <RotateCcw size={20} /> {T.redo}
            </button>
            <button onClick={handleSkip} disabled={thinking} className="py-3.5 rounded-2xl bg-[#efe8dc] text-[#453f35] text-lg inline-flex items-center justify-center gap-2 disabled:opacity-40">
              <SkipForward size={20} /> {T.skip}
            </button>
          </div>
          {confirmEnd ? (
            <div className="flex items-center justify-center gap-3 py-1">
              <span className="text-lg text-[#453f35]">{T.endQ}</span>
              <button onClick={handleFinish} className="px-5 py-3 rounded-xl bg-[#453f35] text-white text-lg">{T.yes}</button>
              <button onClick={() => setConfirmEnd(false)} className="px-5 py-3 rounded-xl bg-[#efe8dc] text-lg">{T.no}</button>
            </div>
          ) : (
          <div className="flex items-center justify-between">
            <button onClick={() => setTyping(true)} disabled={thinking} className="px-2 py-3 text-lg text-[#7a7160] inline-flex items-center gap-2 disabled:opacity-40">
              <Keyboard size={20} /> {T.type}
            </button>
            {speaking ? (
              <button onClick={() => handlePause(false)} className="px-3 py-3 text-lg text-[#453f35] inline-flex items-center gap-1.5">
                <Pause size={18} /> {T.pause}
              </button>
            ) : (
              <button onClick={toggleAutoListen} className="px-2 py-3 text-base text-[#7a7160]">
                {T.auto(autoListen)}
              </button>
            )}
            <button onClick={() => setConfirmEnd(true)} disabled={thinking} className="px-4 py-3 rounded-xl text-lg text-[#5c5447] border border-[#d4cec1] disabled:opacity-40">
              {T.end}
            </button>
          </div>
          )}
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-[100dvh] bg-[#faf6ef] text-[#1c1a16] font-sans break-keep"
      style={{ fontFamily: '-apple-system, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif' }}
    >
      <div
        className="max-w-md mx-auto min-h-[100dvh] flex flex-col px-5"
        style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))", paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        {children}
      </div>
    </div>
  );
}

function SwitchAccount({ onClick, label = STR.ko.switchAccount }: { onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick} className="mt-6 text-base text-[#a89f8e] underline underline-offset-4">
      {label}
    </button>
  );
}

// Clear the saved sign-in straight from storage and reload. This works even when the
// stored session is broken (expired, revoked, or from an old version of the site).
function resetSignIn() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("sb-") && k.includes("auth-token"))
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* storage unavailable */ }
  window.location.reload();
}

function Login({ T }: { T: (typeof STR)[Lang] }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await signIn(email.trim(), password);
    if (error) setErr(T.loginErr);
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="flex-1 flex flex-col justify-center gap-5">
      <p className="text-4xl font-semibold mb-2">{T.title}</p>
      <label className="block">
        <span className="text-xl text-[#5c5447]">{T.email}</span>
        <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)}
          className="mt-2 w-full rounded-2xl border border-[#d4cec1] bg-white px-4 py-4 text-2xl" />
      </label>
      <label className="block">
        <span className="text-xl text-[#5c5447]">{T.password}</span>
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
          className="mt-2 w-full rounded-2xl border border-[#d4cec1] bg-white px-4 py-4 text-2xl" />
      </label>
      {err && <p className="text-xl text-[#b04a4a]">{err}</p>}
      <button type="submit" disabled={busy} className="py-5 rounded-3xl bg-[#b0642e] text-white text-3xl font-semibold disabled:opacity-60">
        {busy ? T.wait : T.enter}
      </button>
    </form>
  );
}
