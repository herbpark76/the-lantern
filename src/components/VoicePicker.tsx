import { useEffect, useState } from "react";
import { Loader2, Volume2 } from "lucide-react";
import { interviewApi, type ElevenVoice } from "@/lib/interview";

// Dropdown of the voices in the ElevenLabs account (loaded once per page), with a preview
// button and a fallback box for pasting a voice ID by hand.

let cache: Promise<ElevenVoice[]> | null = null;
function loadVoices(): Promise<ElevenVoice[]> {
  if (!cache) {
    cache = interviewApi.listVoices().then((r) => r.voices).catch((e) => { cache = null; throw e; });
  }
  return cache;
}

export function useVoices() {
  const [voices, setVoices] = useState<ElevenVoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadVoices().then((v) => { if (alive) setVoices(v); }).catch((e) => { if (alive) setError((e as Error).message); });
    return () => { alive = false; };
  }, []);
  return { voices, error };
}

export function voiceName(voices: ElevenVoice[] | null, id: string): string {
  const known: Record<string, string> = { UzElYEdLTwdjry68bt1c: "Daegu voice", kNjmAhXxYgxjF0oyxw4c: "Matthew" };
  return voices?.find((v) => v.id === id)?.name ?? known[id] ?? "Custom voice";
}

let previewAudio: HTMLAudioElement | null = null;

export function VoicePicker({ value, onChange, size = "md", disabled }: {
  value: string; onChange: (id: string) => void; size?: "sm" | "md"; disabled?: boolean;
}) {
  const { voices, error } = useVoices();
  const [custom, setCustom] = useState(false);
  const inList = !!voices?.some((v) => v.id === value);
  const cls = size === "sm" ? "input-field !py-1 !px-2 !w-auto text-xs" : "input-field !py-2 text-sm";
  const current = voices?.find((v) => v.id === value);

  const preview = () => {
    if (!current?.preview_url) return;
    previewAudio?.pause();
    previewAudio = new Audio(current.preview_url);
    previewAudio.play().catch(() => {});
  };

  if (!voices && !error) {
    return <span className={`${cls} inline-flex items-center gap-1.5 text-ink-400`}><Loader2 size={12} className="animate-spin" /> Loading voices…</span>;
  }

  // Couldn't list voices (e.g. the API key lacks the voices permission): paste an ID instead.
  if (error || custom) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <input className={cls} value={value} onChange={(e) => onChange(e.target.value.trim())} placeholder="ElevenLabs voice ID"
          title={error ? `Couldn't load your voices: ${error}` : undefined} disabled={disabled} />
        {!error && <button type="button" className="text-xs text-accent-600 underline" onClick={() => setCustom(false)}>list</button>}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <select className={cls} value={inList ? value : "__other"} disabled={disabled}
        onChange={(e) => { if (e.target.value === "__paste") setCustom(true); else if (e.target.value !== "__other") onChange(e.target.value); }}>
        {!inList && <option value="__other">{voiceName(voices, value)} ({value.slice(0, 6)}…)</option>}
        {voices!.map((v) => (
          <option key={v.id} value={v.id}>{v.name}{size === "md" && v.description ? ` · ${v.description}` : ""}</option>
        ))}
        <option value="__paste">Paste a voice ID…</option>
      </select>
      {current?.preview_url && (
        <button type="button" onClick={preview} className="btn-ghost !px-1.5 !py-1" title="Preview this voice" aria-label="Preview this voice">
          <Volume2 size={14} />
        </button>
      )}
    </span>
  );
}
