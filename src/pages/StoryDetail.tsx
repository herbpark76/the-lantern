import { useEffect, useState } from "react";
import { supabase, type Story, type Playthrough, isStaff } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useRouter } from "@/lib/router";
import { ArrowLeft, Play, RotateCcw, BookOpen, CheckCircle, Clock, Loader2, Eye, Trash2, ChevronDown, ChevronUp } from "lucide-react";

interface StoryDetailProps {
  slug: string;
}

export function StoryDetailPage({ slug }: StoryDetailProps) {
  const { profile } = useAuth();
  const { navigate } = useRouter();
  const [story, setStory] = useState<Story | null>(null);
  const [playthroughs, setPlaythroughs] = useState<Playthrough[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [previewsOpen, setPreviewsOpen] = useState(false);
  const [deletingPreview, setDeletingPreview] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from("stories").select("*").eq("slug", slug).maybeSingle(),
      profile
        ? supabase.from("playthroughs").select("*").eq("story_slug", slug).eq("member_id", profile.id).order("started_at", { ascending: false })
        : Promise.resolve({ data: null }),
    ]).then(([storyRes, ptRes]) => {
      setStory(storyRes.data as Story | null);
      setPlaythroughs((ptRes.data as Playthrough[]) ?? []);
      setLoading(false);
    });
  }, [slug, profile]);

  const realPlaythroughs = playthroughs.filter((p) => !p.is_preview);
  const previewPlaythroughs = playthroughs.filter((p) => p.is_preview);
  const activePlaythrough = realPlaythroughs.find((p) => !p.completed_at);
  const finishedPlaythroughs = realPlaythroughs.filter((p) => p.completed_at);

  const handleStart = async () => {
    if (!profile) {
      navigate("/auth");
      return;
    }
    if (activePlaythrough) {
      navigate(`/read/${slug}/${activePlaythrough.id}`);
      return;
    }

    setStarting(true);

    let firstScene = story?.start_scene ?? null;
    if (!firstScene) {
      const { data: scenes } = await supabase
        .from("scenes")
        .select("key")
        .eq("story_slug", slug)
        .order("act", { ascending: true })
        .limit(1);
      firstScene = scenes?.[0]?.key ?? "start";
    }

    const { data: newPt, error } = await supabase
      .from("playthroughs")
      .insert({
        member_id: profile.id,
        story_slug: slug,
        current_scene_key: firstScene,
        timeline: 1,
        flags: {},
      })
      .select()
      .single();

    if (error) {
      setStarting(false);
      return;
    }

    navigate(`/read/${slug}/${(newPt as Playthrough).id}`);
  };

  const handleRestart = async () => {
    if (!profile) return;
    setStarting(true);

    let firstScene = story?.start_scene ?? null;
    if (!firstScene) {
      const { data: scenes } = await supabase
        .from("scenes")
        .select("key")
        .eq("story_slug", slug)
        .order("act", { ascending: true })
        .limit(1);
      firstScene = scenes?.[0]?.key ?? "start";
    }

    const { data: newPt } = await supabase
      .from("playthroughs")
      .insert({
        member_id: profile.id,
        story_slug: slug,
        current_scene_key: firstScene,
        timeline: 1,
        flags: {},
      })
      .select()
      .single();

    setStarting(false);
    if (newPt) navigate(`/read/${slug}/${(newPt as Playthrough).id}`);
  };

  const handleDeletePreview = async (ptId: string) => {
    setDeletingPreview(ptId);
    await supabase.from("playthrough_steps").delete().eq("playthrough_id", ptId);
    await supabase.from("playthroughs").delete().eq("id", ptId);
    setDeletingPreview(null);
    setPlaythroughs((prev) => prev.filter((p) => p.id !== ptId));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-ink-400" />
      </div>
    );
  }

  if (!story) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <p className="text-ink-500 dark:text-ink-400">Story not found.</p>
        <button onClick={() => navigate("/")} className="btn-ghost mt-4">
          <ArrowLeft size={16} /> Back to library
        </button>
      </div>
    );
  }

  const accent = story.settings?.accent_color ?? "#c97b3a";
  const staff = isStaff(profile);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 animate-fade-in">
      <button onClick={() => navigate("/")} className="btn-ghost mb-6">
        <ArrowLeft size={16} /> Library
      </button>

      <div className="mb-8" style={{ borderTopWidth: "3px", borderTopColor: accent }}>
        <h1 className="font-serif text-3xl sm:text-4xl text-ink-900 dark:text-ink-50 mt-4 mb-3">
          {story.title}
        </h1>
        <p className="text-lg text-ink-600 dark:text-ink-400 leading-relaxed font-serif">
          {story.blurb}
        </p>
      </div>

      <div className="space-y-3 mb-8">
        {activePlaythrough ? (
          <>
            <button onClick={handleStart} disabled={starting} className="btn-primary w-full" style={{ background: accent }}>
              {starting ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              Resume reading
            </button>
            <button onClick={handleRestart} disabled={starting} className="btn-secondary w-full">
              <RotateCcw size={16} /> Start over
            </button>
          </>
        ) : (
          <button onClick={handleStart} disabled={starting} className="btn-primary w-full" style={{ background: accent }}>
            {starting ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            {profile ? "Begin reading" : "Sign in to begin"}
          </button>
        )}
      </div>

      {finishedPlaythroughs.length > 0 && (
        <div className="mt-12">
          <h2 className="font-serif text-xl text-ink-900 dark:text-ink-50 mb-4 flex items-center gap-2">
            <BookOpen size={18} className="text-accent-500" />
            Your finished reads
          </h2>
          <div className="space-y-3">
            {finishedPlaythroughs.map((pt) => (
              <button
                key={pt.id}
                onClick={() => navigate(`/read/${slug}/${pt.id}`)}
                className="card card-hover p-4 w-full text-left flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2 text-sm font-sans text-ink-600 dark:text-ink-400">
                    <CheckCircle size={14} className="text-success-500" />
                    Completed
                  </div>
                  <p className="text-xs text-ink-400 mt-1 font-sans">
                    {new Date(pt.completed_at || pt.started_at).toLocaleDateString()}
                    {pt.timeline > 1 && ` • Timeline ${pt.timeline}`}
                  </p>
                </div>
                <Clock size={16} className="text-ink-400" />
              </button>
            ))}
          </div>
        </div>
      )}

      {staff && previewPlaythroughs.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setPreviewsOpen((v) => !v)}
            className="flex items-center gap-2 text-sm font-sans text-ink-500 dark:text-ink-400 hover:text-ink-700 dark:hover:text-ink-300 transition-colors"
          >
            {previewsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            <Eye size={16} />
            Previews ({previewPlaythroughs.length})
          </button>
          {previewsOpen && (
            <div className="mt-3 space-y-2">
              {previewPlaythroughs.map((pt) => (
                <div
                  key={pt.id}
                  className="card p-3 flex items-center justify-between"
                >
                  <button
                    onClick={() => navigate(`/read/${slug}/${pt.id}`)}
                    className="flex items-center gap-2 text-sm font-sans text-ink-600 dark:text-ink-400 flex-1 text-left"
                  >
                    <Eye size={14} className="text-ink-400" />
                    <span className="truncate">{pt.current_scene_key}</span>
                    <span className="text-xs text-ink-400">
                      {new Date(pt.started_at).toLocaleDateString()}
                    </span>
                  </button>
                  <button
                    onClick={() => handleDeletePreview(pt.id)}
                    disabled={deletingPreview === pt.id}
                    className="btn-ghost !p-1.5 text-ink-400 hover:text-error-500"
                    aria-label="Delete preview"
                  >
                    {deletingPreview === pt.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
