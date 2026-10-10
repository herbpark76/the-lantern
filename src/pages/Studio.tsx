import { useEffect, useState, useCallback } from "react";
import { supabase, type Story, type Scene, type Choice, type Chapter, type Variant, type Flag, type BibleEntry, type SyncRun, type ChoiceTally, type Playthrough, type Profile, type NarrationClip } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useRouter } from "@/lib/router";
import { renderChapters, markdownToHtml, getAvailableChoices, applySets } from "@/lib/content";
import { fetchManifest } from "@/lib/narration";
import {
  Settings, RefreshCw, Map as MapIcon, Eye, GitPullRequest, BookOpen, BarChart3,
  Film, Users, Loader2, CheckCircle, XCircle, ExternalLink, ChevronRight,
  MessageSquare, Send, X, Headphones, Mic,
} from "lucide-react";
import { InterviewsTab } from "@/components/InterviewsTab";

type StudioTab = "stories" | "map" | "preview" | "queue" | "bible" | "tallies" | "directors" | "readers" | "interviews";

export function StudioPage() {
  const { profile } = useAuth();
  const { navigate } = useRouter();
  const [tab, setTab] = useState<StudioTab>("stories");
  const [stories, setStories] = useState<Story[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const isAuthor = profile?.role === "author" || profile?.role === "admin";

  useEffect(() => {
    if (!isAuthor) { setLoading(false); return; }
    supabase.from("stories").select("*").order("title").then(({ data }) => {
      setStories((data as Story[]) ?? []);
      setLoading(false);
    });
  }, [isAuthor]);

  if (!isAuthor) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <Settings size={28} className="text-ink-400 mx-auto mb-3" />
        <p className="text-ink-500 dark:text-ink-400">You need an author or admin account to access the studio.</p>
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

  const tabs: Array<{ key: StudioTab; label: string; icon: typeof Settings }> = [
    { key: "stories", label: "Stories", icon: Settings },
    { key: "map", label: "Map", icon: MapIcon },
    { key: "preview", label: "Preview", icon: Eye },
    { key: "queue", label: "Edit Queue", icon: GitPullRequest },
    { key: "bible", label: "Bible", icon: BookOpen },
    { key: "tallies", label: "Tallies", icon: BarChart3 },
    { key: "directors", label: "Director's Cut", icon: Film },
    { key: "readers", label: "Readers", icon: Users },
    { key: "interviews", label: "Interviews", icon: Mic },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-2xl text-ink-900 dark:text-ink-50">Author Studio</h1>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto pb-2 mb-6 border-b border-ink-200 dark:border-ink-800">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-sans whitespace-nowrap transition-colors ${
                tab === t.key
                  ? "text-accent-600 dark:text-accent-400 bg-ink-100 dark:bg-ink-800"
                  : "text-ink-500 dark:text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800"
              }`}
            >
              <Icon size={15} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Story selector for tabs that need it */}
      {(tab !== "stories" && tab !== "queue" && tab !== "interviews") && (
        <div className="mb-6">
          <select
            value={selectedSlug ?? ""}
            onChange={(e) => setSelectedSlug(e.target.value || null)}
            className="input-field !py-2 !w-auto"
          >
            <option value="">Select a story…</option>
            {stories.map((s) => (
              <option key={s.slug} value={s.slug}>{s.title}</option>
            ))}
          </select>
        </div>
      )}

      {tab === "stories" && <StoriesTab stories={stories} onStoriesChanged={() => {
        supabase.from("stories").select("*").order("title").then(({ data }) => {
          setStories((data as Story[]) ?? []);
        });
      }} />}
      {tab === "map" && selectedSlug && <MapTab slug={selectedSlug} />}
      {tab === "preview" && selectedSlug && <PreviewTab slug={selectedSlug} />}
      {tab === "queue" && <QueueTab stories={stories} />}
      {tab === "bible" && selectedSlug && <BibleTab slug={selectedSlug} />}
      {tab === "tallies" && selectedSlug && <TalliesTab slug={selectedSlug} />}
      {tab === "directors" && selectedSlug && <DirectorsTab slug={selectedSlug} profile={profile} />}
      {tab === "readers" && <ReadersTab stories={stories} />}
      {tab === "interviews" && <InterviewsTab />}
    </div>
  );
}

// === STORIES TAB ===
function StoriesTab({ stories, onStoriesChanged }: { stories: Story[]; onStoriesChanged?: () => void }) {
  const { session } = useAuth();
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncResults, setSyncResults] = useState<Record<string, { ok: boolean; errors: string[] }>>({});
  const [syncAllRunning, setSyncAllRunning] = useState(false);
  const [narrationClips, setNarrationClips] = useState<NarrationClip[]>([]);
  const [manifestSegments, setManifestSegments] = useState<Record<string, number>>({});

  const authToken = session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;

  useEffect(() => {
    supabase.from("narration_clips").select("*").then(({ data }) => {
      setNarrationClips((data as NarrationClip[]) ?? []);
    });

    // Fetch manifests for stories that have narration configured
    for (const story of stories) {
      const manifestPath = story.settings?.narration?.manifest;
      if (!manifestPath) continue;
      fetchManifest(manifestPath).then((m) => {
        if (m) {
          setManifestSegments((prev) => ({ ...prev, [story.slug]: Object.keys(m.segments).length }));
        }
      });
    }
  }, [stories]);

  const handleSync = async (slug: string) => {
    setSyncing(slug);
    setSyncResults((prev) => ({ ...prev, [slug]: { ok: false, errors: [] } }));
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-content`;
      const resp = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ story_slug: slug }),
      });
      const data = await resp.json();
      if (data.ok) {
        setSyncResults((prev) => ({ ...prev, [slug]: { ok: true, errors: [] } }));
      } else {
        const result = data.results?.find((r: { slug: string }) => r.slug === slug);
        setSyncResults((prev) => ({ ...prev, [slug]: { ok: false, errors: result?.errors ?? [data.error ?? "Sync failed"] } }));
      }
    } catch (err) {
      setSyncResults((prev) => ({ ...prev, [slug]: { ok: false, errors: [String(err)] } }));
    }
    setSyncing(null);
    onStoriesChanged?.();
  };

  const handleSyncAll = async () => {
    setSyncAllRunning(true);
    setSyncResults({});
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-content`;
      const resp = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ story_slug: "all" }),
      });
      const data = await resp.json();
      if (data.results) {
        const newResults: Record<string, { ok: boolean; errors: string[] }> = {};
        for (const r of data.results as Array<{ slug: string; ok: boolean; errors: string[] }>) {
          newResults[r.slug] = { ok: r.ok, errors: r.errors ?? [] };
        }
        setSyncResults(newResults);
      } else {
        setSyncResults({ _global: { ok: false, errors: [data.error ?? "Sync failed"] } });
      }
    } catch (err) {
      setSyncResults({ _global: { ok: false, errors: [String(err)] } });
    }
    setSyncAllRunning(false);
    onStoriesChanged?.();
  };

  return (
    <div className="space-y-4">
      {/* Sync all button — always visible */}
      <div className="card p-4 flex items-center justify-between gap-3">
        <div>
          <p className="font-serif text-sm text-ink-700 dark:text-ink-300">Sync all stories from GitHub</p>
          <p className="text-xs font-sans text-ink-400 mt-0.5">Discovers every folder under /content/ and syncs each one.</p>
        </div>
        <button
          onClick={handleSyncAll}
          disabled={syncAllRunning}
          className="btn-primary !py-2 shrink-0"
        >
          {syncAllRunning ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Sync all from GitHub
        </button>
      </div>

      {/* Global sync error */}
      {syncResults._global && (
        <div className="card p-3 text-sm font-sans bg-error-500/10 text-error-500 rounded-lg">
          <span className="flex items-center gap-1 mb-1"><XCircle size={14} /> Sync all failed</span>
          {syncResults._global.errors.map((e, i) => (
            <p key={i} className="text-xs ml-5">{e}</p>
          ))}
        </div>
      )}

      {/* Sync all summary */}
      {syncAllRunning === false && Object.keys(syncResults).length > 0 && !syncResults._global && (
        <div className="card p-3 text-sm font-sans">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle size={14} className="text-success-500" />
            <span className="text-ink-700 dark:text-ink-300">
              Synced {Object.keys(syncResults).length} {Object.keys(syncResults).length === 1 ? "story" : "stories"}:
              {Object.values(syncResults).filter((r) => r.ok).length} ok, {Object.values(syncResults).filter((r) => !r.ok).length} failed
            </span>
          </div>
        </div>
      )}

      {stories.length === 0 ? (
        <p className="text-ink-500 dark:text-ink-400 text-center py-8">No stories yet. Use "Sync all from GitHub" above to discover and import stories.</p>
      ) : (
        stories.map((story) => (
          <div key={story.slug} className="card p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-serif text-lg text-ink-900 dark:text-ink-50">{story.title}</h3>
                <p className="text-xs text-ink-400 font-sans mt-1">{story.slug}</p>
              </div>
              <span className={`text-xs font-sans px-2 py-1 rounded-full ${
                story.status === "published"
                  ? "bg-success-500/15 text-success-600"
                  : "bg-ink-200 dark:bg-ink-800 text-ink-500"
              }`}>
                {story.status}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-sans text-ink-500 mb-4">
              <div>
                <span className="text-ink-400">Timelines</span>
                <p className="text-ink-600 dark:text-ink-300">{story.settings?.timelines ? "On" : "Off"}</p>
              </div>
              <div>
                <span className="text-ink-400">Crowd split</span>
                <p className="text-ink-600 dark:text-ink-300">{story.settings?.crowd_split ? "On" : "Off"}</p>
              </div>
              <div>
                <span className="text-ink-400">Map</span>
                <p className="text-ink-600 dark:text-ink-300">{story.settings?.map}</p>
              </div>
              <div>
                <span className="text-ink-400">Last sync</span>
                <p className="text-ink-600 dark:text-ink-300">
                  {story.synced_at ? new Date(story.synced_at).toLocaleDateString() : "Never"}
                </p>
              </div>
            </div>

            {/* Narration status */}
            {story.settings?.narration && (
              <div className="flex items-center gap-3 mb-4 text-xs font-sans p-3 bg-ink-100 dark:bg-ink-800 rounded-lg">
                <Headphones size={14} className="text-accent-500" />
                <span className="text-ink-600 dark:text-ink-300">
                  {story.settings.narration.voice_name}
                </span>
                <span className="text-ink-400">·</span>
                <span className="text-ink-500 dark:text-ink-400">
                  {manifestSegments[story.slug] ?? 0} recorded segments
                </span>
                <span className="text-ink-400">·</span>
                <span className="text-ink-500 dark:text-ink-400">
                  {narrationClips.filter((c) => c.story_slug === story.slug).length} generated clips
                </span>
                <span className="text-ink-400">·</span>
                <span className="text-ink-500 dark:text-ink-400">
                  {(() => {
                    const thirtyDaysAgo = new Date();
                    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                    return narrationClips
                      .filter((c) => c.story_slug === story.slug && new Date(c.created_at) >= thirtyDaysAgo)
                      .reduce((sum, c) => sum + c.chars, 0);
                  })()} chars this month
                </span>
              </div>
            )}

            {syncResults[story.slug] && (
              <div className={`mb-3 text-sm font-sans rounded-lg px-3 py-2 ${
                syncResults[story.slug].ok
                  ? "bg-success-500/10 text-success-600"
                  : "bg-error-500/10 text-error-500"
              }`}>
                {syncResults[story.slug].ok ? (
                  <span className="flex items-center gap-1"><CheckCircle size={14} /> Synced successfully</span>
                ) : (
                  <div>
                    <span className="flex items-center gap-1 mb-1"><XCircle size={14} /> Sync failed</span>
                    {syncResults[story.slug].errors.map((e, i) => (
                      <p key={i} className="text-xs ml-5">{e}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => handleSync(story.slug)}
              disabled={syncing === story.slug}
              className="btn-primary !py-2"
            >
              {syncing === story.slug ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Sync from GitHub
            </button>
          </div>
        ))
      )}
    </div>
  );
}

// === MAP TAB ===
function MapTab({ slug }: { slug: string }) {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [tallies, setTallies] = useState<ChoiceTally[]>([]);
  const [loading, setLoading] = useState(true);
  const [story, setStory] = useState<Story | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from("stories").select("*").eq("slug", slug).maybeSingle(),
      supabase.from("scenes").select("*").eq("story_slug", slug).order("act"),
      supabase.from("choices").select("*").eq("story_slug", slug).order("position"),
      supabase.from("choice_tallies").select("*").eq("story_slug", slug),
    ]).then(([storyRes, scenesRes, choicesRes, talliesRes]) => {
      setStory(storyRes.data as Story | null);
      setScenes((scenesRes.data as Scene[]) ?? []);
      setChoices((choicesRes.data as Choice[]) ?? []);
      setTallies((talliesRes.data as ChoiceTally[]) ?? []);
      setLoading(false);
    });
  }, [slug]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-ink-400" /></div>;

  const accent = story?.settings?.accent_color ?? "#c97b3a";
  const allCoords = scenes.map((s) => ({ x: s.map_x ?? 0, y: s.map_y ?? 0 }));
  const minX = Math.min(...allCoords.map((c) => c.x)) - 3;
  const maxX = Math.max(...allCoords.map((c) => c.x)) + 3;
  const minY = Math.min(...allCoords.map((c) => c.y)) - 3;
  const maxY = Math.max(...allCoords.map((c) => c.y)) + 3;
  const rangeX = Math.max(maxX - minX, 1);
  const rangeY = Math.max(maxY - minY, 1);
  const norm = (x: number, y: number) => ({
    x: ((x - minX) / rangeX) * 80 + 10,
    y: ((y - minY) / rangeY) * 70 + 15,
  });

  const getTallyPct = (sceneKey: string, choiceKey: string): number | null => {
    const sceneTallies = tallies.filter((t) => t.scene_key === sceneKey);
    const total = sceneTallies.reduce((s, t) => s + t.total_count, 0);
    if (total === 0) return null;
    const choice = sceneTallies.find((t) => t.choice_key === choiceKey);
    if (!choice) return 0;
    return Math.round((choice.total_count / total) * 100);
  };

  return (
    <div className="card p-4">
      <svg viewBox="0 0 100 100" className="w-full h-auto" style={{ maxHeight: "70vh" }}>
        {choices.map((choice) => {
          const from = scenes.find((s) => s.key === choice.scene_key);
          const to = scenes.find((s) => s.key === choice.to_scene_key);
          if (!from || !to) return null;
          const fromPos = norm(from.map_x ?? 0, from.map_y ?? 0);
          const toPos = norm(to.map_x ?? 0, to.map_y ?? 0);
          const pct = getTallyPct(choice.scene_key, choice.key);
          return (
            <g key={`${choice.scene_key}-${choice.key}`}>
              <line x1={fromPos.x} y1={fromPos.y} x2={toPos.x} y2={toPos.y} stroke={accent} strokeWidth={0.5} opacity={0.5} />
              {pct !== null && (
                <text
                  x={(fromPos.x + toPos.x) / 2}
                  y={(fromPos.y + toPos.y) / 2 - 1}
                  textAnchor="middle"
                  fill={accent}
                  fontSize="2"
                  opacity="0.8"
                >
                  {pct}%
                </text>
              )}
            </g>
          );
        })}
        {scenes.map((scene) => {
          const pos = norm(scene.map_x ?? 0, scene.map_y ?? 0);
          return (
            <g key={scene.key}>
              <circle
                cx={pos.x}
                cy={pos.y}
                r={scene.is_ending ? 2.5 : 1.8}
                fill={scene.is_ending ? accent : "#5c5447"}
              />
              <text
                x={pos.x}
                y={pos.y + 5}
                textAnchor="middle"
                fill="currentColor"
                fontSize="2.2"
                className="text-ink-600 dark:text-ink-400"
              >
                {scene.title}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// === PREVIEW TAB ===
function PreviewTab({ slug }: { slug: string }) {
  const { profile } = useAuth();
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [selectedScene, setSelectedScene] = useState<string>("");
  const [flags, setFlags] = useState<Record<string, unknown>>({});
  const [timeline, setTimeline] = useState(1);
  const [storyFlags, setStoryFlags] = useState<Flag[]>([]);
  const [story, setStory] = useState<Story | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [bibleEntries, setBibleEntries] = useState<BibleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editPopover, setEditPopover] = useState<{ text: string; chapterTitle: string } | null>(null);
  const [editType, setEditType] = useState<"replace" | "note">("replace");
  const [editText, setEditText] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const [sceneNoteOpen, setSceneNoteOpen] = useState(false);
  const [sceneNote, setSceneNote] = useState("");
  const [bibleNote, setBibleNote] = useState<{ key: string; name: string } | null>(null);
  const [bibleNoteText, setBibleNoteText] = useState("");
  const [renderedChapters, setRenderedChapters] = useState<Array<{ number: number; title: string; html: string }>>([]);

  useEffect(() => {
    Promise.all([
      supabase.from("stories").select("*").eq("slug", slug).maybeSingle(),
      supabase.from("scenes").select("*").eq("story_slug", slug).order("act"),
      supabase.from("flags").select("*").eq("story_slug", slug),
      supabase.from("bible_entries").select("*").eq("story_slug", slug),
    ]).then(([storyRes, scenesRes, flagsRes, bibleRes]) => {
      setStory(storyRes.data as Story | null);
      const sceneData = (scenesRes.data as Scene[]) ?? [];
      setScenes(sceneData);
      setStoryFlags((flagsRes.data as Flag[]) ?? []);
      setBibleEntries((bibleRes.data as BibleEntry[]) ?? []);
      if (sceneData.length > 0) setSelectedScene(sceneData[0].key);
      setLoading(false);
    });
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    const base = renderChapters(chapters, variants, flags, timeline, 0);
    (async () => {
      const rendered = [];
      for (const ch of base) {
        const html = await markdownToHtml(ch.html);
        rendered.push({ ...ch, html });
      }
      if (!cancelled) setRenderedChapters(rendered);
    })();
    return () => { cancelled = true; };
  }, [chapters, variants, flags, timeline]);

  useEffect(() => {
    if (!selectedScene) return;
    Promise.all([
      supabase.from("chapters").select("*").eq("story_slug", slug).eq("scene_key", selectedScene).order("position"),
      supabase.from("variants").select("*").eq("story_slug", slug).eq("scene_key", selectedScene),
      supabase.from("choices").select("*").eq("story_slug", slug).eq("scene_key", selectedScene).order("position"),
    ]).then(([chRes, varRes, choiceRes]) => {
      setChapters((chRes.data as Chapter[]) ?? []);
      setVariants((varRes.data as Variant[]) ?? []);
      setChoices((choiceRes.data as Choice[]) ?? []);
    });
  }, [slug, selectedScene]);

  const submitEditRequest = async (reqType: "replace" | "note", quotedText: string, chapterTitle: string, replacementOrNote: string) => {
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/edit-request`;
      const resp = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          story_slug: slug,
          scene_key: selectedScene,
          chapter_title: chapterTitle,
          flags,
          timeline,
          quoted_text: quotedText,
          request_type: reqType,
          replacement_text: reqType === "replace" ? replacementOrNote : undefined,
          note: reqType === "note" ? replacementOrNote : undefined,
          summary: editSummary || undefined,
          member_id: profile?.id,
        }),
      });
      const data = await resp.json();
      if (data.ok) {
        setSubmitMsg(`Edit request #${data.issue_number} created on GitHub.`);
      } else {
        setSubmitMsg(`Error: ${data.error ?? "Failed to create edit request"}`);
      }
    } catch (err) {
      setSubmitMsg(`Error: ${String(err)}`);
    }
    setSubmitting(false);
  };

  const handleEditSubmit = () => {
    if (!editPopover) return;
    submitEditRequest(editType, editPopover.text, editPopover.chapterTitle, editText);
    setEditPopover(null);
    setEditText("");
    setEditSummary("");
  };

  const handleSceneNoteSubmit = () => {
    submitEditRequest("note", "(Scene-level note)", selectedScene, sceneNote);
    setSceneNoteOpen(false);
    setSceneNote("");
  };

  const handleBibleNoteSubmit = () => {
    if (!bibleNote) return;
    submitEditRequest("note", `(Bible entry: ${bibleNote.name})`, bibleNote.name, bibleNoteText);
    setBibleNote(null);
    setBibleNoteText("");
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-ink-400" /></div>;

  const accent = story?.settings?.accent_color ?? "#c97b3a";
  const availableChoices = getAvailableChoices(choices, flags, timeline);

  const handleTextSelection = () => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (text && text.length > 10) {
      const chapterEl = selection?.anchorNode?.parentElement?.closest("[data-chapter-title]");
      const chapterTitle = chapterEl?.getAttribute("data-chapter-title") || "";
      setEditPopover({ text, chapterTitle });
      setEditType("replace");
      setEditText("");
      setEditSummary("");
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="card p-4 space-y-3">
        <div>
          <label className="text-xs font-sans text-ink-400 block mb-1">Scene</label>
          <select value={selectedScene} onChange={(e) => setSelectedScene(e.target.value)} className="input-field !py-2">
            {scenes.map((s) => (
              <option key={s.key} value={s.key}>{s.title} ({s.key})</option>
            ))}
          </select>
        </div>

        {storyFlags.length > 0 && (
          <div>
            <label className="text-xs font-sans text-ink-400 block mb-1">Flags</label>
            <div className="space-y-2">
              {storyFlags.map((flag) => (
                <div key={flag.key} className="flex items-center gap-2">
                  <span className="text-sm font-sans text-ink-600 dark:text-ink-400 w-32 truncate">{flag.key}</span>
                  {flag.type === "number" ? (
                    <input
                      type="number"
                      value={(flags[flag.key] as number) ?? ""}
                      onChange={(e) => setFlags((f) => ({ ...f, [flag.key]: e.target.value ? Number(e.target.value) : undefined }))}
                      className="input-field !py-1 !text-sm flex-1"
                      placeholder="—"
                    />
                  ) : flag.type === "boolean" ? (
                    <select
                      value={(flags[flag.key] as string) ?? ""}
                      onChange={(e) => setFlags((f) => ({ ...f, [flag.key]: e.target.value || undefined }))}
                      className="input-field !py-1 !text-sm flex-1"
                    >
                      <option value="">—</option>
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  ) : (
                    <select
                      value={(flags[flag.key] as string) ?? ""}
                      onChange={(e) => setFlags((f) => ({ ...f, [flag.key]: e.target.value || undefined }))}
                      className="input-field !py-1 !text-sm flex-1"
                    >
                      <option value="">—</option>
                      {flag.allowed_values?.map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {story?.settings?.timelines && (
          <div>
            <label className="text-xs font-sans text-ink-400 block mb-1">Timeline</label>
            <input
              type="number"
              min={1}
              value={timeline}
              onChange={(e) => setTimeline(Number(e.target.value))}
              className="input-field !py-1 !text-sm !w-32"
            />
          </div>
        )}
      </div>

      {submitMsg && (
        <div className="card p-3 text-sm font-sans flex items-center gap-2 animate-fade-in">
          {submitMsg.startsWith("Error") ? <XCircle size={14} className="text-error-500" /> : <CheckCircle size={14} className="text-success-500" />}
          {submitMsg}
          <button onClick={() => setSubmitMsg(null)} className="ml-auto btn-ghost !px-1 !py-0"><X size={14} /></button>
        </div>
      )}

      {/* Preview content */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-lg text-ink-900 dark:text-ink-50">
            {scenes.find((s) => s.key === selectedScene)?.title}
          </h3>
          <button onClick={() => setSceneNoteOpen(true)} className="btn-ghost !text-xs">
            <MessageSquare size={12} /> Add note to scene
          </button>
        </div>

        <div
          className="prose-reader mx-auto"
          onMouseUp={handleTextSelection}
        >
          {renderedChapters.map((ch) => (
            <div key={ch.number} data-chapter-title={ch.title} className="mb-6">
              {ch.title && <h2 className="chapter-title">{ch.title}</h2>}
              <div dangerouslySetInnerHTML={{ __html: ch.html }} />
            </div>
          ))}
        </div>

        {availableChoices.length > 0 && (
          <div className="mt-8 pt-4 border-t border-ink-200 dark:border-ink-800">
            <p className="text-xs font-sans text-ink-400 mb-3">Available choices (preview only):</p>
            <div className="space-y-2">
              {availableChoices.map((c) => (
                <div key={c.key} className="flex items-center justify-between p-3 bg-ink-100 dark:bg-ink-800 rounded-lg">
                  <span className="font-serif text-ink-700 dark:text-ink-300">{c.label}</span>
                  <ChevronRight size={14} className="text-ink-400" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bible entries with note buttons */}
      {bibleEntries.length > 0 && (
        <div className="card p-6">
          <h3 className="font-serif text-lg text-ink-900 dark:text-ink-50 mb-3">Bible entries</h3>
          <div className="space-y-3">
            {bibleEntries.map((entry) => (
              <div key={entry.key} className="border border-ink-200 dark:border-ink-800 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-serif text-ink-800 dark:text-ink-200">{entry.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-sans text-ink-400 uppercase">{entry.kind}</span>
                    <button onClick={() => { setBibleNote({ key: entry.key, name: entry.name }); setBibleNoteText(""); }} className="btn-ghost !px-2 !py-1 !text-xs">
                      <MessageSquare size={10} /> Note
                    </button>
                  </div>
                </div>
                <p className="text-sm text-ink-500 dark:text-ink-400 font-serif whitespace-pre-wrap">{entry.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit popover */}
      {editPopover && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-fade-in" onClick={() => setEditPopover(null)}>
          <div className="card p-6 max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif text-lg text-ink-900 dark:text-ink-50">Suggest an edit</h3>
              <button onClick={() => setEditPopover(null)} className="btn-ghost !px-1"><X size={16} /></button>
            </div>
            <div className="mb-3 p-3 bg-ink-100 dark:bg-ink-800 rounded-lg text-sm font-serif italic text-ink-600 dark:text-ink-400 max-h-24 overflow-y-auto">
              "{editPopover.text}"
            </div>
            <div className="flex gap-2 mb-3">
              <button onClick={() => setEditType("replace")} className={editType === "replace" ? "btn-primary !py-1.5 !text-xs" : "btn-secondary !py-1.5 !text-xs"}>
                Suggest replacement
              </button>
              <button onClick={() => setEditType("note")} className={editType === "note" ? "btn-primary !py-1.5 !text-xs" : "btn-secondary !py-1.5 !text-xs"}>
                Leave a note
              </button>
            </div>
            <input
              type="text"
              value={editSummary}
              onChange={(e) => setEditSummary(e.target.value)}
              className="input-field !py-2 !text-sm mb-2"
              placeholder="Short summary (optional)"
            />
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="input-field !text-sm min-h-[100px] resize-y"
              placeholder={editType === "replace" ? "Replacement text…" : "Your note…"}
            />
            <button onClick={handleEditSubmit} disabled={submitting || !editText} className="btn-primary w-full mt-3 !py-2">
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Submit to GitHub
            </button>
          </div>
        </div>
      )}

      {/* Scene note modal */}
      {sceneNoteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-fade-in" onClick={() => setSceneNoteOpen(false)}>
          <div className="card p-6 max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif text-lg text-ink-900 dark:text-ink-50">Note on this scene</h3>
              <button onClick={() => setSceneNoteOpen(false)} className="btn-ghost !px-1"><X size={16} /></button>
            </div>
            <textarea
              value={sceneNote}
              onChange={(e) => setSceneNote(e.target.value)}
              className="input-field !text-sm min-h-[120px] resize-y"
              placeholder="Your note about this scene…"
            />
            <button onClick={handleSceneNoteSubmit} disabled={submitting || !sceneNote} className="btn-primary w-full mt-3 !py-2">
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Submit to GitHub
            </button>
          </div>
        </div>
      )}

      {/* Bible note modal */}
      {bibleNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-fade-in" onClick={() => setBibleNote(null)}>
          <div className="card p-6 max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif text-lg text-ink-900 dark:text-ink-50">Note: {bibleNote.name}</h3>
              <button onClick={() => setBibleNote(null)} className="btn-ghost !px-1"><X size={16} /></button>
            </div>
            <textarea
              value={bibleNoteText}
              onChange={(e) => setBibleNoteText(e.target.value)}
              className="input-field !text-sm min-h-[120px] resize-y"
              placeholder="Your note about this bible entry…"
            />
            <button onClick={handleBibleNoteSubmit} disabled={submitting || !bibleNoteText} className="btn-primary w-full mt-3 !py-2">
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Submit to GitHub
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// === QUEUE TAB ===
interface EditIssue {
  number: number;
  title: string;
  url: string;
  status: "open" | "in review" | "done";
  created_at: string;
  body: string;
}

function QueueTab({ stories }: { stories: Story[] }) {
  const [issues, setIssues] = useState<EditIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStory, setFilterStory] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (filterStory) params.set("story_slug", filterStory);
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/list-edit-requests?${params}`;
    fetch(apiUrl, {
      headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setIssues((data.issues as EditIssue[]) ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [filterStory]);

  const filtered = issues.filter((i) => !filterStatus || i.status === filterStatus);

  const statusColors: Record<string, string> = {
    open: "bg-warning-500/15 text-warning-600",
    "in review": "bg-accent-500/15 text-accent-600",
    done: "bg-success-500/15 text-success-600",
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <select value={filterStory} onChange={(e) => { setFilterStory(e.target.value); setLoading(true); }} className="input-field !py-2 !w-auto !text-sm">
          <option value="">All stories</option>
          {stories.map((s) => <option key={s.slug} value={s.slug}>{s.title}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input-field !py-2 !w-auto !text-sm">
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="in review">In review</option>
          <option value="done">Done</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-ink-400" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-ink-500 dark:text-ink-400 text-center py-8 text-sm">No edit requests found.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((issue) => (
            <a
              key={issue.number}
              href={issue.url}
              target="_blank"
              rel="noopener noreferrer"
              className="card card-hover p-4 flex items-start justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-sans px-2 py-0.5 rounded-full ${statusColors[issue.status]}`}>
                    {issue.status}
                  </span>
                  <span className="text-xs font-sans text-ink-400">#{issue.number}</span>
                </div>
                <p className="font-serif text-ink-800 dark:text-ink-200 text-sm truncate">{issue.title}</p>
                <p className="text-xs text-ink-400 font-sans mt-1">{new Date(issue.created_at).toLocaleDateString()}</p>
              </div>
              <ExternalLink size={14} className="text-ink-400 shrink-0 mt-1" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// === BIBLE TAB ===
function BibleTab({ slug }: { slug: string }) {
  const [entries, setEntries] = useState<BibleEntry[]>([]);
  const [filterKind, setFilterKind] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("bible_entries").select("*").eq("story_slug", slug).then(({ data }) => {
      setEntries((data as BibleEntry[]) ?? []);
      setLoading(false);
    });
  }, [slug]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-ink-400" /></div>;

  const kinds = ["character", "place", "object", "rule", "plant"];
  const filtered = filterKind ? entries.filter((e) => e.kind === filterKind) : entries;

  return (
    <div>
      <div className="flex gap-1 mb-4 overflow-x-auto">
        <button onClick={() => setFilterKind("")} className={`btn-ghost !text-xs !py-1.5 ${!filterKind ? "text-accent-600" : ""}`}>All</button>
        {kinds.map((k) => (
          <button key={k} onClick={() => setFilterKind(k)} className={`btn-ghost !text-xs !py-1.5 capitalize ${filterKind === k ? "text-accent-600" : ""}`}>{k}s</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-ink-500 text-center py-8 text-sm">No bible entries found.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((entry) => (
            <div key={entry.key} className="card p-4">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-serif text-lg text-ink-900 dark:text-ink-50">{entry.name}</h3>
                <span className="text-xs font-sans uppercase text-ink-400">{entry.kind}</span>
              </div>
              <p className="text-sm font-serif text-ink-600 dark:text-ink-400 whitespace-pre-wrap">{entry.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// === TALLIES TAB ===
function TalliesTab({ slug }: { slug: string }) {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [tallies, setTallies] = useState<ChoiceTally[]>([]);
  const [playthroughs, setPlaythroughs] = useState<Playthrough[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from("scenes").select("*").eq("story_slug", slug).order("act"),
      supabase.from("choices").select("*").eq("story_slug", slug).order("position"),
      supabase.from("choice_tallies").select("*").eq("story_slug", slug),
      supabase.from("playthroughs").select("*").eq("story_slug", slug),
    ]).then(([scenesRes, choicesRes, talliesRes, ptRes]) => {
      setScenes((scenesRes.data as Scene[]) ?? []);
      setChoices((choicesRes.data as Choice[]) ?? []);
      setTallies((talliesRes.data as ChoiceTally[]) ?? []);
      setPlaythroughs((ptRes.data as Playthrough[]) ?? []);
      setLoading(false);
    });
  }, [slug]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-ink-400" /></div>;

  const completedCount = playthroughs.filter((p) => p.completed_at).length;

  // Find most common complete route
  const findCommonRoute = (): string[] => {
    const completed = playthroughs.filter((p) => p.completed_at);
    if (completed.length === 0) return [];
    const routeCounts = new Map<string, number>();
    // For now, just show the count of completed playthroughs
    return [`<${completed.length} completed reads>`];
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card p-4 text-center">
          <p className="text-2xl font-serif text-ink-900 dark:text-ink-50">{playthroughs.length}</p>
          <p className="text-xs font-sans text-ink-400">Total playthroughs</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-serif text-ink-900 dark:text-ink-50">{completedCount}</p>
          <p className="text-xs font-sans text-ink-400">Completed</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-serif text-ink-900 dark:text-ink-50">{playthroughs.length - completedCount}</p>
          <p className="text-xs font-sans text-ink-400">In progress</p>
        </div>
      </div>

      {scenes.filter((s) => !s.is_ending).map((scene) => {
        const sceneChoices = choices.filter((c) => c.scene_key === scene.key);
        if (sceneChoices.length === 0) return null;
        const sceneTallies = tallies.filter((t) => t.scene_key === scene.key);
        const totalAll = sceneTallies.reduce((s, t) => s + t.total_count, 0);
        const totalCompleted = sceneTallies.reduce((s, t) => s + t.completed_count, 0);

        return (
          <div key={scene.key} className="card p-4">
            <h3 className="font-serif text-lg text-ink-900 dark:text-ink-50 mb-3">{scene.title}</h3>
            <div className="space-y-2">
              {sceneChoices.map((choice) => {
                const tally = sceneTallies.find((t) => t.choice_key === choice.key);
                const pctAll = totalAll > 0 && tally ? Math.round((tally.total_count / totalAll) * 100) : 0;
                const pctComp = totalCompleted > 0 && tally ? Math.round((tally.completed_count / totalCompleted) * 100) : 0;
                return (
                  <div key={choice.key} className="space-y-1">
                    <div className="flex items-center justify-between text-sm font-sans">
                      <span className="text-ink-700 dark:text-ink-300 truncate">{choice.label}</span>
                      <span className="text-xs text-ink-400">
                        {tally?.total_count ?? 0} readers · {pctAll}% all · {pctComp}% completed
                      </span>
                    </div>
                    <div className="h-1.5 bg-ink-200 dark:bg-ink-800 rounded-full overflow-hidden">
                      <div className="h-full bg-accent-500 rounded-full transition-all" style={{ width: `${pctAll}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// === DIRECTOR'S CUT TAB ===
function DirectorsTab({ slug, profile }: { slug: string; profile: Profile | null }) {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [story, setStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentSceneKey, setCurrentSceneKey] = useState<string>("");
  const [path, setPath] = useState<string[]>([]);
  const [flags, setFlags] = useState<Record<string, unknown>>({});
  const [timeline, setTimeline] = useState(1);
  const [editionTitle, setEditionTitle] = useState("");
  const [savedText, setSavedText] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [renderedChapters, setRenderedChapters] = useState<Array<{ number: number; title: string; html: string }>>([]);

  useEffect(() => {
    Promise.all([
      supabase.from("stories").select("*").eq("slug", slug).maybeSingle(),
      supabase.from("scenes").select("*").eq("story_slug", slug).order("act"),
      supabase.from("choices").select("*").eq("story_slug", slug).order("position"),
    ]).then(([storyRes, scenesRes, choicesRes]) => {
      setStory(storyRes.data as Story | null);
      const sceneData = (scenesRes.data as Scene[]) ?? [];
      setScenes(sceneData);
      setChoices((choicesRes.data as Choice[]) ?? []);
      if (sceneData.length > 0) setCurrentSceneKey(sceneData[0].key);
      setLoading(false);
    });
  }, [slug]);

  useEffect(() => {
    if (!currentSceneKey) return;
    Promise.all([
      supabase.from("chapters").select("*").eq("story_slug", slug).eq("scene_key", currentSceneKey).order("position"),
      supabase.from("variants").select("*").eq("story_slug", slug).eq("scene_key", currentSceneKey),
    ]).then(([chRes, varRes]) => {
      setChapters((chRes.data as Chapter[]) ?? []);
      setVariants((varRes.data as Variant[]) ?? []);
    });
  }, [slug, currentSceneKey]);

  useEffect(() => {
    let cancelled = false;
    const base = renderChapters(chapters, variants, flags, timeline, 0);
    (async () => {
      const rendered = [];
      for (const ch of base) {
        const html = await markdownToHtml(ch.html);
        rendered.push({ ...ch, html });
      }
      if (!cancelled) setRenderedChapters(rendered);
    })();
    return () => { cancelled = true; };
  }, [chapters, variants, flags, timeline]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-ink-400" /></div>;

  const currentScene = scenes.find((s) => s.key === currentSceneKey);
  const availableChoices = getAvailableChoices(
    choices.filter((c) => c.scene_key === currentSceneKey),
    flags,
    timeline
  );
  const isEnding = currentScene?.is_ending ?? false;

  const handleChoose = (choice: Choice) => {
    setPath((p) => [...p, choice.key]);
    const { flags: newFlags, incrementTimeline } = applySets(choice.sets, flags, story?.settings?.timelines ?? false);
    setFlags(newFlags);
    if (incrementTimeline) setTimeline((t) => t + 1);

    // Save text
    const sceneText = renderedChapters.map((ch) => `${ch.title ? `## ${ch.title}\n\n` : ""}${ch.html}`).join("\n\n");
    setSavedText((t) => [...t, sceneText]);

    setCurrentSceneKey(choice.to_scene_key);
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    const fullText = savedText.join("\n\n---\n\n");
    await supabase.from("editions").insert({
      story_slug: slug,
      kind: "directors_cut",
      path: path,
      member_id: profile.id,
      title: editionTitle || `Director's Cut — ${new Date().toLocaleDateString()}`,
      text: fullText,
      status: "draft",
    });
    setSaving(false);
    setSaved(true);
  };

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-serif text-lg text-ink-900 dark:text-ink-50">
            {currentScene?.title}
          </h3>
          {story?.settings?.timelines && (
            <span className="text-xs font-sans text-ink-400">Timeline {timeline}</span>
          )}
        </div>
        <div className="text-xs font-sans text-ink-400 mb-4">
          Choices made: {path.length > 0 ? path.join(" → ") : "None yet"}
        </div>

        <div className="prose-reader mx-auto">
          {renderedChapters.map((ch) => (
            <div key={ch.number}>
              {ch.title && <h2 className="chapter-title">{ch.title}</h2>}
              <div dangerouslySetInnerHTML={{ __html: ch.html }} />
            </div>
          ))}
        </div>

        {!isEnding && availableChoices.length > 0 && (
          <div className="mt-6 space-y-2">
            <p className="text-xs font-sans text-ink-400">Choose the next scene:</p>
            {availableChoices.map((c) => (
              <button key={c.key} onClick={() => handleChoose(c)} className="w-full text-left p-3 card card-hover">
                <span className="font-serif text-ink-800 dark:text-ink-200">{c.label}</span>
              </button>
            ))}
          </div>
        )}

        {isEnding && (
          <div className="mt-6 p-4 bg-success-500/10 rounded-lg">
            <p className="text-success-600 font-sans text-sm mb-3">You've reached an ending. Save this edition?</p>
            <input
              type="text"
              value={editionTitle}
              onChange={(e) => setEditionTitle(e.target.value)}
              className="input-field !py-2 !text-sm mb-2"
              placeholder="Edition title (optional)"
            />
            <button onClick={handleSave} disabled={saving} className="btn-primary w-full !py-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Film size={14} />}
              Save as Director's Cut
            </button>
            {saved && <p className="text-success-600 text-xs mt-2">Saved! Find it in your shelf.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// === READERS TAB ===
function ReadersTab({ stories }: { stories: Story[] }) {
  const [stats, setStats] = useState<Record<string, { members: number; started: number; finished: number }>>({});
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  useEffect(() => {
    Promise.all([
      supabase.from("profiles").select("*").order("joined_at", { ascending: false }),
      supabase.from("playthroughs").select("story_slug, completed_at"),
    ]).then(([profileRes, ptRes]) => {
      const allProfiles = (profileRes.data as Profile[]) ?? [];
      setProfiles(allProfiles);
      const pts = (ptRes.data as Array<{ story_slug: string; completed_at: string | null }>) ?? [];
      const statMap: Record<string, { members: number; started: number; finished: number }> = {};
      for (const s of stories) {
        const storyPts = pts.filter((p) => p.story_slug === s.slug);
        statMap[s.slug] = {
          members: allProfiles.length,
          started: storyPts.length,
          finished: storyPts.filter((p) => p.completed_at).length,
        };
      }
      setStats(statMap);
      setLoading(false);
    });
  }, [stories]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-ink-400" /></div>;

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-2xl font-serif text-ink-900 dark:text-ink-50">{profiles.length}</p>
            <p className="text-xs font-sans text-ink-400">Total members</p>
          </div>
          <div>
            <p className="text-2xl font-serif text-ink-900 dark:text-ink-50">{profiles.filter((p) => p.role === "reader").length}</p>
            <p className="text-xs font-sans text-ink-400">Readers</p>
          </div>
          <div>
            <p className="text-2xl font-serif text-ink-900 dark:text-ink-50">{profiles.filter((p) => p.role !== "reader").length}</p>
            <p className="text-xs font-sans text-ink-400">Staff</p>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <h3 className="font-serif text-lg text-ink-900 dark:text-ink-50 mb-3">Per-story stats</h3>
        <div className="space-y-2">
          {stories.map((s) => {
            const stat = stats[s.slug];
            return (
              <div key={s.slug} className="flex items-center justify-between py-2 border-b border-ink-100 dark:border-ink-800 last:border-0">
                <span className="font-serif text-ink-800 dark:text-ink-200 text-sm">{s.title}</span>
                <div className="flex gap-4 text-xs font-sans text-ink-400">
                  <span>{stat?.started ?? 0} started</span>
                  <span>{stat?.finished ?? 0} finished</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
