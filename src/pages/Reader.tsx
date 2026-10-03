import { useEffect, useState, useCallback, useRef } from "react";
import { supabase, type Playthrough, type Scene, type Chapter, type Variant, type Choice, type ChoiceTally } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useRouter } from "@/lib/router";
import {
  renderChapters, markdownToHtml, getAvailableChoices, applySets, getChoiceTallyPercent, matchesWhen,
} from "@/lib/content";
import { StoryMap } from "@/components/StoryMap";
import { ArrowLeft, ChevronRight, Users, CheckCircle, Loader2, Home, BookOpen } from "lucide-react";

interface ReaderProps {
  slug: string;
  playthroughId: string;
}

export function ReaderPage({ slug, playthroughId }: ReaderProps) {
  const { profile } = useAuth();
  const { navigate } = useRouter();
  const [playthrough, setPlaythrough] = useState<Playthrough | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [allChoices, setAllChoices] = useState<Choice[]>([]);
  const [allScenes, setAllScenes] = useState<Scene[]>([]);
  const [steps, setSteps] = useState<Array<{ id: string; scene_key: string; choice_key: string | null; timeline: number }>>([]);
  const [tallies, setTallies] = useState<ChoiceTally[]>([]);
  const [loading, setLoading] = useState(true);
  const [choosing, setChoosing] = useState(false);
  const [crowdMsg, setCrowdMsg] = useState<string | null>(null);
  const [chapterOffset, setChapterOffset] = useState(0);
  const [storySettings, setStorySettings] = useState<{ timelines: boolean; crowd_split: boolean; map: "fog" | "full" | "off"; accent_color: string } | null>(null);
  const crowdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [renderedChapters, setRenderedChapters] = useState<Array<{ number: number; title: string; html: string }>>([]);

  const loadData = useCallback(async () => {
    const { data: pt } = await supabase
      .from("playthroughs")
      .select("*")
      .eq("id", playthroughId)
      .maybeSingle();

    if (!pt) { setLoading(false); return; }
    const ptData = pt as Playthrough;
    setPlaythrough(ptData);

    const { data: storyData } = await supabase
      .from("stories")
      .select("settings")
      .eq("slug", slug)
      .maybeSingle();
    setStorySettings((storyData as { settings: typeof storySettings })?.settings ?? null);

    const [sceneRes, chaptersRes, variantsRes, choicesRes, scenesRes, stepsRes, talliesRes, allChaptersRes, allChoicesRes] = await Promise.all([
      supabase.from("scenes").select("*").eq("story_slug", slug).eq("key", ptData.current_scene_key).maybeSingle(),
      supabase.from("chapters").select("*").eq("story_slug", slug).eq("scene_key", ptData.current_scene_key).order("position"),
      supabase.from("variants").select("*").eq("story_slug", slug).eq("scene_key", ptData.current_scene_key),
      supabase.from("choices").select("*").eq("story_slug", slug).eq("scene_key", ptData.current_scene_key).order("position"),
      supabase.from("scenes").select("*").eq("story_slug", slug),
      supabase.from("playthrough_steps").select("*").eq("playthrough_id", playthroughId).order("step_no"),
      supabase.from("choice_tallies").select("*").eq("story_slug", slug),
      supabase.from("chapters").select("*").eq("story_slug", slug).order("position"),
      supabase.from("choices").select("*").eq("story_slug", slug),
    ]);

    const currentScene = sceneRes.data as Scene | null;
    setScene(currentScene);
    setChapters((chaptersRes.data as Chapter[]) ?? []);
    setVariants((variantsRes.data as Variant[]) ?? []);
    setAllChoices((choicesRes.data as Choice[]) ?? []);
    setAllScenes((scenesRes.data as Scene[]) ?? []);
    setSteps((stepsRes.data as Array<{ id: string; scene_key: string; choice_key: string | null; timeline: number }>) ?? []);
    setTallies((talliesRes.data as ChoiceTally[]) ?? []);

    const settings = (storyData as { settings: typeof storySettings })?.settings ?? null;

    const allChapters = (allChaptersRes.data as Chapter[]) ?? [];
    const allChoicesAll = (allChoicesRes.data as Choice[]) ?? [];
    const stepsData = (stepsRes.data as Array<{ scene_key: string; choice_key: string | null; timeline: number }>) ?? [];

    const chaptersByScene = new Map<string, Chapter[]>();
    for (const ch of allChapters) {
      const arr = chaptersByScene.get(ch.scene_key) ?? [];
      arr.push(ch);
      chaptersByScene.set(ch.scene_key, arr);
    }

    const choicesByKey = new Map<string, Choice>();
    for (const c of allChoicesAll) {
      choicesByKey.set(`${c.scene_key}:${c.key}`, c);
    }

    let replayFlags: Record<string, unknown> = {};
    let replayTimeline = 1;
    let offset = 0;

    for (const step of stepsData) {
      const sceneChapters = chaptersByScene.get(step.scene_key) ?? [];
      const visibleCount = sceneChapters.filter(
        (ch) => matchesWhen(ch.when ?? {}, replayFlags, replayTimeline)
      ).length;
      offset += visibleCount;

      if (step.choice_key) {
        const choice = choicesByKey.get(`${step.scene_key}:${step.choice_key}`);
        if (choice) {
          const { flags: newFlags, incrementTimeline } = applySets(
            choice.sets, replayFlags, settings?.timelines ?? false
          );
          replayFlags = newFlags;
          if (incrementTimeline) replayTimeline += 1;
        }
      }
    }

    setChapterOffset(offset);
    setLoading(false);
  }, [slug, playthroughId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Render chapters when data changes
  useEffect(() => {
    if (!scene || !playthrough) return;
    const rendered = renderChapters(
      chapters,
      variants,
      playthrough.flags,
      playthrough.timeline,
      chapterOffset
    ).map((ch) => ({ ...ch, html: markdownToHtml(ch.html) }));
    setRenderedChapters(rendered);
  }, [chapters, variants, playthrough, chapterOffset, scene]);

  const reachedScenes = new Set<string>();
  if (playthrough) reachedScenes.add(playthrough.current_scene_key);
  for (const step of steps) reachedScenes.add(step.scene_key);

  const handleChoice = async (choice: Choice) => {
    if (!playthrough || !profile || choosing) return;
    setChoosing(true);

    const { flags: newFlags, incrementTimeline } = applySets(
      choice.sets,
      playthrough.flags,
      storySettings?.timelines ?? false
    );
    const newTimeline = incrementTimeline ? playthrough.timeline + 1 : playthrough.timeline;
    const nextStepNo = (steps?.length ?? 0);

    // Save step
    await supabase.from("playthrough_steps").insert({
      playthrough_id: playthrough.id,
      step_no: nextStepNo,
      scene_key: playthrough.current_scene_key,
      choice_key: choice.key,
      timeline: playthrough.timeline,
    });

    // Crowd split feedback
    if (storySettings?.crowd_split) {
      const pct = getChoiceTallyPercent(
        tallies.map((t) => ({ scene_key: t.scene_key, choice_key: t.choice_key, total_count: t.total_count })),
        playthrough.current_scene_key,
        choice.key
      );
      if (pct !== null && pct > 0) {
        const count = tallies.find((t) => t.scene_key === playthrough.current_scene_key && t.choice_key === choice.key)?.total_count ?? 0;
        setCrowdMsg(`You and ${pct}% of readers chose this (${count} reader${count !== 1 ? "s" : ""}).`);
        crowdTimer.current = setTimeout(() => setCrowdMsg(null), 3000);
      }
    }

    // Check if next scene is ending
    const nextScene = allScenes.find((s) => s.key === choice.to_scene_key);
    const isEnding = nextScene?.is_ending ?? false;

    const updateData: Record<string, unknown> = {
      current_scene_key: choice.to_scene_key,
      flags: newFlags,
      timeline: newTimeline,
    };

    if (isEnding) {
      updateData.completed_at = new Date().toISOString();
      updateData.ending_scene_key = choice.to_scene_key;
    }

    const { error } = await supabase
      .from("playthroughs")
      .update(updateData)
      .eq("id", playthrough.id);

    if (error) {
      setChoosing(false);
      return;
    }

    // Reload to show next scene
    setLoading(true);
    await loadData();
    setChoosing(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-ink-400" />
      </div>
    );
  }

  if (!playthrough || !scene) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <p className="text-ink-500 dark:text-ink-400">This reading session could not be found.</p>
        <button onClick={() => navigate("/")} className="btn-ghost mt-4">
          <Home size={16} /> Back home
        </button>
      </div>
    );
  }

  const availableChoices = getAvailableChoices(allChoices, playthrough.flags, playthrough.timeline);
  const isCompleted = !!playthrough.completed_at;
  const accent = storySettings?.accent_color ?? "#c97b3a";

  return (
    <div className="min-h-[calc(100vh-3.5rem)]">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => navigate(`/story/${slug}`)} className="btn-ghost !px-2">
            <ArrowLeft size={16} />
          </button>
          {storySettings?.timelines && (
            <div className="text-xs font-sans text-ink-400">
              Timeline {playthrough.timeline}
            </div>
          )}
        </div>

        {/* Scene title */}
        <div className="mb-8" style={{ borderTopWidth: "2px", borderTopColor: accent }}>
          <p className="text-xs font-sans uppercase tracking-widest text-ink-400 mt-3 mb-1">
            Act {scene.act} · Scene
          </p>
          <h1 className="font-serif text-2xl text-ink-900 dark:text-ink-50">{scene.title}</h1>
        </div>

        {/* Chapters */}
        <div className="prose-reader mx-auto">
          {renderedChapters.map((ch) => (
            <div key={ch.number} className="mb-8 animate-fade-in">
              {ch.title && (
                <h2 className="chapter-title flex items-baseline gap-2">
                  <span className="text-xs font-sans text-ink-400 tabular-nums">
                    {String(ch.number).padStart(2, "0")}
                  </span>
                  {ch.title}
                </h2>
              )}
              <div dangerouslySetInnerHTML={{ __html: ch.html }} />
            </div>
          ))}
        </div>

        {/* Crowd split message */}
        {crowdMsg && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 animate-slide-up">
            <div className="bg-ink-900 dark:bg-ink-100 text-ink-50 dark:text-ink-900 px-5 py-3 rounded-full text-sm font-sans flex items-center gap-2 shadow-lg">
              <Users size={14} />
              {crowdMsg}
            </div>
          </div>
        )}

        {/* Choices or ending */}
        <div className="max-w-2xl mx-auto mt-12">
          {isCompleted ? (
            <div className="text-center py-8 animate-fade-in">
              <CheckCircle size={32} className="text-success-500 mx-auto mb-3" />
              <h2 className="font-serif text-2xl text-ink-900 dark:text-ink-50 mb-2">The End</h2>
              <p className="text-ink-500 dark:text-ink-400 mb-6 font-sans text-sm">
                You have reached the end of this path.
              </p>
              <div className="flex gap-3 justify-center">
                <button onClick={() => navigate(`/story/${slug}`)} className="btn-secondary">
                  <Home size={16} /> Story page
                </button>
                <button onClick={() => navigate("/shelf")} className="btn-primary" style={{ background: accent }}>
                  <BookOpen size={16} /> My shelf
                </button>
              </div>
            </div>
          ) : availableChoices.length > 0 ? (
            <div className="space-y-3">
              <p className="text-center text-sm font-sans text-ink-400 mb-4">What do you do?</p>
              {availableChoices.map((choice) => (
                <button
                  key={choice.key}
                  onClick={() => handleChoice(choice)}
                  disabled={choosing}
                  className="w-full text-left p-4 card card-hover group animate-fade-in"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-serif text-lg text-ink-800 dark:text-ink-200 group-hover:text-accent-600 dark:group-hover:text-accent-400 transition-colors">
                      {choice.label}
                    </span>
                    <ChevronRight size={18} className="text-ink-400 group-hover:text-accent-500 group-hover:translate-x-1 transition-all" />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-ink-500 dark:text-ink-400 font-sans text-sm">
                The story continues, but no choices are available here yet.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Map */}
      {storySettings && storySettings.map !== "off" && (
        <StoryMap
          scenes={allScenes}
          choices={allChoices}
          mapMode={storySettings.map}
          reachedScenes={reachedScenes}
          steps={steps}
          accentColor={accent}
          currentSceneKey={playthrough.current_scene_key}
        />
      )}
    </div>
  );
}


