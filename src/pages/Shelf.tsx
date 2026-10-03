import { useEffect, useState } from "react";
import { supabase, type Playthrough, type Story } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useRouter } from "@/lib/router";
import { Bookmark, Play, RotateCcw, CheckCircle, Clock, Loader2, BookOpen } from "lucide-react";

export function ShelfPage() {
  const { profile } = useAuth();
  const { navigate } = useRouter();
  const [playthroughs, setPlaythroughs] = useState<Playthrough[]>([]);
  const [stories, setStories] = useState<Record<string, Story>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) { setLoading(false); return; }
    Promise.all([
      supabase.from("playthroughs").select("*").eq("member_id", profile.id).order("started_at", { ascending: false }),
    ]).then(async ([ptRes]) => {
      const pts = (ptRes.data as Playthrough[]) ?? [];
      setPlaythroughs(pts);
      if (pts.length > 0) {
        const slugs = [...new Set(pts.map((p) => p.story_slug))];
        const { data: storyData } = await supabase.from("stories").select("*").in("slug", slugs);
        const storyMap: Record<string, Story> = {};
        for (const s of (storyData as Story[]) ?? []) {
          storyMap[s.slug] = s;
        }
        setStories(storyMap);
      }
      setLoading(false);
    });
  }, [profile]);

  if (!profile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <Bookmark size={28} className="text-ink-400 mx-auto mb-3" />
        <p className="text-ink-500 dark:text-ink-400 mb-4">Sign in to see your shelf.</p>
        <button onClick={() => navigate("/auth")} className="btn-primary">Sign in</button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-ink-400" />
      </div>
    );
  }

  const active = playthroughs.filter((p) => !p.completed_at);
  const finished = playthroughs.filter((p) => p.completed_at);

  const handleRestart = async (pt: Playthrough) => {
    if (!profile) return;
    await supabase.from("playthrough_steps").delete().eq("playthrough_id", pt.id);
    await supabase.from("playthroughs").delete().eq("id", pt.id);

    const { data: scenes } = await supabase
      .from("scenes")
      .select("key")
      .eq("story_slug", pt.story_slug)
      .order("act")
      .limit(1);

    const { data: newPt } = await supabase
      .from("playthroughs")
      .insert({
        member_id: profile.id,
        story_slug: pt.story_slug,
        current_scene_key: scenes?.[0]?.key ?? "start",
        timeline: 1,
        flags: {},
      })
      .select()
      .single();

    if (newPt) navigate(`/read/${pt.story_slug}/${(newPt as Playthrough).id}`);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="font-serif text-3xl text-ink-900 dark:text-ink-50 mb-8">My Shelf</h1>

      {playthroughs.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen size={28} className="text-ink-400 mx-auto mb-3" />
          <p className="text-ink-500 dark:text-ink-400 mb-4">
            You haven't started any stories yet.
          </p>
          <button onClick={() => navigate("/")} className="btn-primary">Browse the library</button>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div className="mb-10">
              <h2 className="font-serif text-xl text-ink-700 dark:text-ink-300 mb-4 flex items-center gap-2">
                <Clock size={18} className="text-accent-500" />
                In progress
              </h2>
              <div className="space-y-3">
                {active.map((pt) => {
                  const story = stories[pt.story_slug];
                  const accent = story?.settings?.accent_color ?? "#c97b3a";
                  return (
                    <div
                      key={pt.id}
                      className="card p-4 flex items-center justify-between"
                      style={{ borderLeftWidth: "3px", borderLeftColor: accent }}
                    >
                      <div>
                        <h3 className="font-serif text-lg text-ink-900 dark:text-ink-50">
                          {story?.title ?? pt.story_slug}
                        </h3>
                        <p className="text-xs text-ink-400 font-sans mt-1">
                          Started {new Date(pt.started_at).toLocaleDateString()}
                          {pt.timeline > 1 && ` · Timeline ${pt.timeline}`}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => navigate(`/read/${pt.story_slug}/${pt.id}`)} className="btn-primary !py-2 !px-4" style={{ background: accent }}>
                          <Play size={14} /> Resume
                        </button>
                        <button onClick={() => handleRestart(pt)} className="btn-ghost !py-2 !px-3">
                          <RotateCcw size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {finished.length > 0 && (
            <div>
              <h2 className="font-serif text-xl text-ink-700 dark:text-ink-300 mb-4 flex items-center gap-2">
                <CheckCircle size={18} className="text-success-500" />
                Finished reads
              </h2>
              <div className="space-y-3">
                {finished.map((pt) => {
                  const story = stories[pt.story_slug];
                  const accent = story?.settings?.accent_color ?? "#c97b3a";
                  return (
                    <div
                      key={pt.id}
                      className="card p-4 flex items-center justify-between"
                      style={{ borderLeftWidth: "3px", borderLeftColor: accent }}
                    >
                      <div>
                        <h3 className="font-serif text-lg text-ink-900 dark:text-ink-50">
                          {story?.title ?? pt.story_slug}
                        </h3>
                        <p className="text-xs text-ink-400 font-sans mt-1">
                          Completed {new Date(pt.completed_at ?? pt.started_at).toLocaleDateString()}
                          {pt.timeline > 1 && ` · Timeline ${pt.timeline}`}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => navigate(`/read/${pt.story_slug}/${pt.id}`)} className="btn-secondary !py-2 !px-4">
                          <BookOpen size={14} /> Reread
                        </button>
                        <button onClick={() => handleRestart(pt)} className="btn-ghost !py-2 !px-3">
                          <RotateCcw size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
