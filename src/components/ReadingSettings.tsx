import { useState, useRef, useEffect } from "react";
import { Type, Minus, Plus } from "lucide-react";
import type { ReaderSettings } from "@/lib/supabase";
import { supabase } from "@/lib/supabase";

const TEXT_SIZES = [16, 18, 20, 22, 24, 26];
const DEFAULT_SIZE = 18;
const SPACING_OPTIONS: Array<{ label: string; value: number }> = [
  { label: "Compact", value: 1.6 },
  { label: "Normal", value: 1.8 },
  { label: "Relaxed", value: 2.0 },
];
const WIDTH_OPTIONS: Array<{ label: string; value: ReaderSettings["width"] }> = [
  { label: "Narrow", value: "narrow" },
  { label: "Normal", value: "normal" },
  { label: "Wide", value: "wide" },
];

const LS_KEY = "reader:settings";

function loadFromStorage(): ReaderSettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.textSize === "number" && typeof parsed.lineSpacing === "number" && typeof parsed.width === "string") {
        return parsed as ReaderSettings;
      }
    }
  } catch { /* ignore */ }
  return { textSize: DEFAULT_SIZE, lineSpacing: 1.8, width: "normal" };
}

function saveToStorage(settings: ReaderSettings) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(settings));
  } catch { /* ignore */ }
}

export function useReaderSettings(profile: { id: string; reader_settings: ReaderSettings | null } | null) {
  const [settings, setSettings] = useState<ReaderSettings>(() => {
    if (profile?.reader_settings) return profile.reader_settings;
    return loadFromStorage();
  });

  // Sync from profile when it loads/changes (e.g. after sign-in)
  useEffect(() => {
    if (profile?.reader_settings) {
      setSettings(profile.reader_settings);
    }
  }, [profile?.reader_settings]);

  // Persist to localStorage on every change
  useEffect(() => {
    saveToStorage(settings);
  }, [settings]);

  // Persist to profile in Supabase if signed in (debounced via timeout)
  useEffect(() => {
    if (!profile) return;
    const timer = setTimeout(() => {
      supabase.from("profiles").update({ reader_settings: settings }).eq("id", profile.id);
    }, 800);
    return () => clearTimeout(timer);
  }, [settings, profile]);

  const updateSize = (delta: number) => {
    setSettings((prev) => {
      const idx = TEXT_SIZES.indexOf(prev.textSize);
      const currentIdx = idx >= 0 ? idx : TEXT_SIZES.indexOf(DEFAULT_SIZE);
      const newIdx = Math.max(0, Math.min(TEXT_SIZES.length - 1, currentIdx + delta));
      return { ...prev, textSize: TEXT_SIZES[newIdx] };
    });
  };

  const updateSpacing = (value: number) => {
    setSettings((prev) => ({ ...prev, lineSpacing: value }));
  };

  const updateWidth = (value: ReaderSettings["width"]) => {
    setSettings((prev) => ({ ...prev, width: value }));
  };

  return { settings, updateSize, updateSpacing, updateWidth };
}

interface Props {
  settings: ReaderSettings;
  onSizeChange: (delta: number) => void;
  onSpacingChange: (value: number) => void;
  onWidthChange: (value: ReaderSettings["width"]) => void;
}

export function ReadingSettingsPopover({ settings, onSizeChange, onSpacingChange, onWidthChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`btn-ghost !px-3 !text-sm ${open ? "text-accent-600 dark:text-accent-400" : ""}`}
        aria-label="Reading settings"
      >
        <Type size={16} />
        Aa
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-40 card p-4 w-60 animate-fade-in">
          {/* Text size */}
          <div className="mb-4">
            <label className="text-xs font-sans text-ink-400 block mb-2">Text size</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onSizeChange(-1)}
                disabled={settings.textSize <= TEXT_SIZES[0]}
                className="btn-secondary !p-1.5 disabled:opacity-40"
                aria-label="Decrease text size"
              >
                <Minus size={14} />
              </button>
              <span className="text-sm font-sans text-ink-700 dark:text-ink-300 w-12 text-center tabular-nums">
                {settings.textSize}px
              </span>
              <button
                onClick={() => onSizeChange(1)}
                disabled={settings.textSize >= TEXT_SIZES[TEXT_SIZES.length - 1]}
                className="btn-secondary !p-1.5 disabled:opacity-40"
                aria-label="Increase text size"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* Line spacing */}
          <div className="mb-4">
            <label className="text-xs font-sans text-ink-400 block mb-2">Line spacing</label>
            <div className="flex gap-1">
              {SPACING_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onSpacingChange(opt.value)}
                  className={`flex-1 !py-1.5 !text-xs rounded-lg border transition-colors ${
                    settings.lineSpacing === opt.value
                      ? "border-accent-500 bg-accent-500/10 text-accent-600 dark:text-accent-400"
                      : "border-ink-200 dark:border-ink-700 text-ink-500 dark:text-ink-400 hover:border-ink-300 dark:hover:border-ink-600"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Column width */}
          <div>
            <label className="text-xs font-sans text-ink-400 block mb-2">Column width</label>
            <div className="flex gap-1">
              {WIDTH_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onWidthChange(opt.value)}
                  className={`flex-1 !py-1.5 !text-xs rounded-lg border transition-colors ${
                    settings.width === opt.value
                      ? "border-accent-500 bg-accent-500/10 text-accent-600 dark:text-accent-400"
                      : "border-ink-200 dark:border-ink-700 text-ink-500 dark:text-ink-400 hover:border-ink-300 dark:hover:border-ink-600"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
