import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { supabase, type Story } from "@/lib/supabase";
import { useRouter } from "@/lib/router";
import { AudioBar, Markdown, type BookDoc, type Lang } from "@/components/BookTab";

// Public reader for a published book (a stories row with settings.kind = "book"):
// chapter picker, prev/next, and narration when it has been recorded in Studio.

export function BookReaderPage({ slug }: { slug: string }) {
  const { navigate } = useRouter();
  const [story, setStory] = useState<Story | null>(null);
  const [chapters, setChapters] = useState<BookDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    Promise.all([
      supabase.from("stories").select("*").eq("slug", slug).maybeSingle(),
      supabase.from("book_docs").select("*").eq("story_slug", slug).eq("kind", "sample").eq("published", true).order("position"),
    ]).then(([s, d]) => {
      setStory((s.data as Story | null) ?? null);
      setChapters(((d.data as BookDoc[]) ?? []).filter((x) => x.kind === "sample" && x.published));
      setLoading(false);
    });
  }, [slug]);

  useEffect(() => { if (story) document.title = `${story.title} · The Lantern`; }, [story]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-ink-400" /></div>;
  }
  if (!story || !chapters.length) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <p className="text-ink-500 dark:text-ink-400">This book isn't available.</p>
        <button onClick={() => navigate("/")} className="btn-ghost mt-4">Back to the Library</button>
      </div>
    );
  }

  const ch = chapters[Math.min(index, chapters.length - 1)];
  const lang: Lang = ch.body_en?.trim() ? "en" : "ko";
  const title = (d: BookDoc) => (lang === "en" ? d.title_en || d.title_ko : d.title_ko || d.title_en) || `Chapter ${d.position}`;
  const go = (i: number) => { setIndex(i); window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-6">
      <header className="text-center space-y-2">
        <h1 className="font-serif text-3xl sm:text-4xl text-ink-900 dark:text-ink-50">{story.title}</h1>
        {story.blurb && <p className="text-ink-500 dark:text-ink-400 font-serif italic max-w-xl mx-auto">{story.blurb}</p>}
      </header>

      <div className="flex items-center justify-center gap-2 font-sans">
        <button onClick={() => go(index - 1)} disabled={index === 0} className="btn-ghost !px-2 disabled:opacity-30" aria-label="Previous chapter">
          <ChevronLeft size={18} />
        </button>
        <select className="input-field !py-2 !w-auto text-sm max-w-[75vw]" value={index} onChange={(e) => go(Number(e.target.value))}>
          {chapters.map((c, i) => <option key={c.id} value={i}>{title(c)}</option>)}
        </select>
        <button onClick={() => go(index + 1)} disabled={index >= chapters.length - 1} className="btn-ghost !px-2 disabled:opacity-30" aria-label="Next chapter">
          <ChevronRight size={18} />
        </button>
      </div>

      <AudioBar key={`${ch.id}:${ch.updated_at}`} doc={ch} lang={lang} readOnly />

      <article lang={lang} className="card px-6 sm:px-10 py-8">
        <Markdown text={lang === "en" ? ch.body_en : ch.body_ko} lang={lang} />
      </article>

      {index < chapters.length - 1 && (
        <div className="text-center">
          <button onClick={() => go(index + 1)} className="btn-primary">
            Next: {title(chapters[index + 1])} <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
