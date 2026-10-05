import type { ChapterDef } from "@/lib/supabase";

interface ChapterBarProps {
  chapters: ChapterDef[];
  currentSceneKey: string;
  reachedScenes: Set<string>;
  isStaff: boolean;
  accentColor: string;
  onChapterClick: (chapter: ChapterDef) => void;
}

export function ChapterBar({
  chapters, currentSceneKey, reachedScenes, isStaff, accentColor, onChapterClick,
}: ChapterBarProps) {
  if (!chapters || chapters.length === 0) return null;

  const currentChapter = chapters.find(
    (ch) => ch.scenes?.includes(currentSceneKey) || ch.start_scene === currentSceneKey
  );

  return (
    <div className="flex items-center gap-1.5 mb-2">
      {chapters.map((ch) => {
        const isWritten = !!ch.start_scene;
        const isCurrent = currentChapter?.letter === ch.letter;
        const isReached = ch.scenes?.some((s) => reachedScenes.has(s)) || reachedScenes.has(ch.start_scene ?? "");
        const isClickable = isWritten && !isCurrent && (isStaff || isReached);
        const isCurrentClickable = isCurrent && isStaff;

        const tooltip = isWritten
          ? `${ch.letter} — ${ch.title}`
          : `${ch.letter} — ${ch.title} (coming)`;

        return (
          <button
            key={ch.letter}
            disabled={!isClickable && !isCurrentClickable}
            onClick={() => (isClickable || isCurrentClickable) && onChapterClick(ch)}
            title={tooltip}
            className="font-serif text-sm tracking-widest uppercase transition-colors select-none"
            style={{
              color: isCurrent
                ? accentColor
                : !isWritten
                  ? "var(--ink-300, #c4bfb8)"
                  : isReached || isStaff
                    ? "var(--ink-600, #5c5447)"
                    : "var(--ink-300, #c4bfb8)",
              cursor: isClickable || isCurrentClickable ? "pointer" : "default",
              fontWeight: isCurrent ? 600 : 400,
            }}
          >
            {ch.letter}
          </button>
        );
      })}
    </div>
  );
}
