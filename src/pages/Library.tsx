import { useEffect, useState } from "react";
import { supabase, type Story } from "@/lib/supabase";
import { useRouter } from "@/lib/router";
import { BookOpen, ArrowRight, Loader2 } from "lucide-react";

export function LibraryPage() {
  const { navigate } = useRouter();
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("stories")
      .select("*")
      .eq("status", "published")
      .order("title")
      .then(({ data }) => {
        setStories((data as Story[]) ?? []);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-ink-400" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <div className="text-center mb-12">
        <BookOpen size={28} className="text-accent-500 mx-auto mb-3" />
        <h1 className="font-serif text-3xl sm:text-4xl text-ink-900 dark:text-ink-50 mb-3">
          The Lantern
        </h1>
        <p className="text-lg text-ink-500 dark:text-ink-400 font-serif italic max-w-xl mx-auto">
          Interactive branching novels where every choice shapes the story, and books to read or listen to.
        </p>
      </div>

      {stories.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-ink-500 dark:text-ink-400 font-sans">
            No stories have been published yet. An author needs to sync content from GitHub first.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {stories.map((story) => (
            <button
              key={story.slug}
              onClick={() => navigate(story.settings?.kind === "book" ? `/book/${story.slug}` : `/story/${story.slug}`)}
              className="card card-hover p-6 text-left group animate-fade-in"
              style={{ borderTopWidth: "3px", borderTopColor: story.settings?.accent_color ?? "#c97b3a" }}
            >
              <h2 className="font-serif text-xl text-ink-900 dark:text-ink-50 mb-2">
                {story.title}
              </h2>
              <p className="text-sm text-ink-500 dark:text-ink-400 leading-relaxed mb-4 line-clamp-3">
                {story.blurb}
              </p>
              <div className="flex items-center gap-1 text-sm font-sans text-accent-600 dark:text-accent-400 group-hover:gap-2 transition-all">
                <span>Read</span>
                <ArrowRight size={14} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
