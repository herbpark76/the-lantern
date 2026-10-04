import { useState, useEffect } from "react";
import type { Scene, Flag, ChapterDef } from "@/lib/supabase";
import { X, Loader2, ArrowRight } from "lucide-react";

interface JumpModalProps {
  open: boolean;
  mode: "reader" | "staff";
  targetScene: Scene | null;
  targetChapter: ChapterDef | null;
  flags: Flag[];
  accentColor: string;
  onConfirm: (opts: { flags: Record<string, unknown>; timeline: number }) => void;
  onCancel: () => void;
}

export function JumpModal({
  open, mode, targetScene, targetChapter, flags, accentColor, onConfirm, onCancel,
}: JumpModalProps) {
  const [flagValues, setFlagValues] = useState<Record<string, string>>({});
  const [timeline, setTimeline] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setFlagValues({});
      setTimeline(1);
      setSubmitting(false);
    }
  }, [open]);

  if (!open || !targetScene) return null;

  const relevantFlags = mode === "staff"
    ? flags.filter((f) => targetScene.reads_flags.includes(f.key))
    : [];

  const handleConfirm = () => {
    setSubmitting(true);
    const flagObj: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(flagValues)) {
      if (val === "none") {
        flagObj[key] = "none";
      } else if (val === "true" || val === "false") {
        flagObj[key] = val === "true";
      } else {
        flagObj[key] = val;
      }
    }
    onConfirm({ flags: flagObj, timeline });
  };

  const title = targetScene.title;
  const isChapterJump = !!targetChapter;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div
        className="bg-ink-50 dark:bg-ink-900 rounded-xl shadow-2xl max-w-md w-full mx-4 p-6 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-lg text-ink-900 dark:text-ink-50">
            {mode === "reader" ? "Go back?" : "Preview read"}
          </h3>
          <button onClick={onCancel} className="btn-ghost !p-1.5">
            <X size={16} />
          </button>
        </div>

        {mode === "reader" ? (
          <>
            <p className="text-sm text-ink-600 dark:text-ink-400 font-sans leading-relaxed mb-1">
              Go back to <strong>{title}</strong>?
            </p>
            <p className="text-sm text-ink-500 dark:text-ink-500 font-sans leading-relaxed mb-6">
              Your current read is saved; this starts a new copy from here.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={onCancel} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={submitting}
                className="btn-primary"
                style={{ background: accentColor }}
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                Start from here
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-ink-600 dark:text-ink-400 font-sans leading-relaxed mb-4">
              Jump to <strong>{title}</strong>
              {isChapterJump && targetChapter && (
                <span className="text-ink-400"> ({targetChapter.letter})</span>
              )}
              {targetScene.slug && (
                <span className="text-ink-400"> · {targetScene.slug}</span>
              )}
            </p>

            {relevantFlags.length > 0 && (
              <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
                {relevantFlags.map((flag) => (
                  <div key={flag.key}>
                    <label className="block text-xs font-sans text-ink-500 dark:text-ink-400 mb-1">
                      {flag.description || flag.key}
                    </label>
                    <select
                      value={flagValues[flag.key] ?? "none"}
                      onChange={(e) => setFlagValues((prev) => ({ ...prev, [flag.key]: e.target.value }))}
                      className="w-full text-sm font-sans bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded px-2 py-1.5 text-ink-800 dark:text-ink-200"
                    >
                      <option value="none">none</option>
                      {flag.type === "boolean" ? (
                        <>
                          <option value="true">true</option>
                          <option value="false">false</option>
                        </>
                      ) : (
                        flag.allowed_values
                          .filter((v) => v !== "none")
                          .map((val) => (
                            <option key={val} value={val}>{val}</option>
                          ))
                      )}
                    </select>
                  </div>
                ))}
              </div>
            )}

            <div className="mb-6">
              <label className="block text-xs font-sans text-ink-500 dark:text-ink-400 mb-1">
                Timeline
              </label>
              <input
                type="number"
                min={1}
                value={timeline}
                onChange={(e) => setTimeline(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-24 text-sm font-sans bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded px-2 py-1.5 text-ink-800 dark:text-ink-200"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button onClick={onCancel} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={submitting}
                className="btn-primary"
                style={{ background: accentColor }}
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                Start preview
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
