import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Gauge, Layers, Loader2, MessageSquareText, Route } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "@/lib/router";
import { useAuth } from "@/lib/auth";
import type { Version, Work } from "@/lib/works";
import { VersionsPanel } from "@/components/work/Versions";
import { StoryHub } from "@/components/work/StoryHub";
import { ReviewsPanel, RoundDashboard } from "@/components/work/Reviews";
import { ScorecardPanel } from "@/components/work/Scorecard";
import { VersionReader, CompareView } from "@/components/work/VersionReader";

// /work/<slug>[/hub | /reviews | /scorecard | /v/<id> | /compare/<a>/<b> | /round/<id>]

type Tab = "versions" | "hub" | "reviews" | "scorecard";

export function WorkPage({ slug, rest }: { slug: string; rest: string[] }) {
  const { navigate } = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const staff = profile?.role === "author" || profile?.role === "admin";
  const [work, setWork] = useState<Work | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [w, v] = await Promise.all([
      supabase.from("works").select("*").eq("slug", slug).maybeSingle(),
      supabase.from("work_versions").select("*").eq("work_slug", slug).order("created_at", { ascending: false }),
    ]);
    setWork((w.data as Work | null) ?? null);
    setVersions((v.data as Version[]) ?? []);
    setLoading(false);
  }, [slug]);
  useEffect(() => { if (!authLoading) load(); }, [load, authLoading]);
  useEffect(() => { if (work) document.title = `${work.title} · The Lantern`; }, [work]);

  if (loading || authLoading) return <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-ink-400" /></div>;
  if (!work) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <p className="text-ink-500">This work isn't available{profile ? "" : ". If it's yours, sign in first"}.</p>
        <button onClick={() => navigate("/")} className="btn-ghost mt-4">Back to the Library</button>
      </div>
    );
  }

  const base = `/work/${slug}`;
  if (rest[0] === "v" && rest[1]) {
    const v = versions.find((x) => x.id === rest[1]);
    return v ? <VersionReader work={work} version={v} versions={versions} staff={staff} /> : <NotFound />;
  }
  if (rest[0] === "compare" && rest[1] && rest[2]) {
    const a = versions.find((x) => x.id === rest[1]); const b = versions.find((x) => x.id === rest[2]);
    return a && b ? <CompareView work={work} a={a} b={b} versions={versions} /> : <NotFound />;
  }
  if (rest[0] === "round" && rest[1] && staff) return <RoundDashboard work={work} roundId={rest[1]} versions={versions} onVersionsChanged={load} />;

  const tab: Tab = (["hub", "reviews", "scorecard"] as const).find((t) => t === rest[0]) ?? "versions";
  const tabs: Array<{ key: Tab; label: string; icon: typeof Layers; staffOnly?: boolean }> = [
    { key: "versions", label: "Formats & versions", icon: Layers },
    { key: "hub", label: "Story Hub", icon: Route },
    { key: "reviews", label: "Reviews", icon: MessageSquareText, staffOnly: true },
    { key: "scorecard", label: "Craft scorecard", icon: Gauge, staffOnly: true },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <button onClick={() => navigate("/")} className="btn-ghost !px-2 -ml-2 mb-3 text-sm"><ArrowLeft size={16} /> Library</button>
      <header className="mb-6 pl-4 border-l-4" style={{ borderColor: work.accent_color }}>
        <h1 className="font-serif text-3xl sm:text-4xl text-ink-900 dark:text-ink-50">{work.title}</h1>
        {work.logline && <p className="mt-2 text-ink-600 dark:text-ink-300 font-serif italic max-w-3xl">{work.logline}</p>}
      </header>

      <div className="flex gap-1 overflow-x-auto border-b border-ink-200 dark:border-ink-800 mb-6 font-sans">
        {tabs.filter((t) => !t.staffOnly || staff).map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => navigate(t.key === "versions" ? base : `${base}/${t.key}`)}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === t.key
                ? "border-accent-500 text-accent-700 dark:text-accent-300" : "border-transparent text-ink-500 hover:text-ink-800 dark:hover:text-ink-200"}`}>
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "versions" && <VersionsPanel work={work} versions={versions} staff={staff} onChanged={load} />}
      {tab === "hub" && <StoryHub work={work} versions={versions} staff={staff} onSaved={load} />}
      {tab === "reviews" && staff && <ReviewsPanel work={work} versions={versions} />}
      {tab === "scorecard" && staff && <ScorecardPanel work={work} versions={versions} />}
    </div>
  );
}

function NotFound() {
  const { navigate } = useRouter();
  return (
    <div className="max-w-2xl mx-auto px-4 py-20 text-center">
      <p className="text-ink-500">That page isn't here.</p>
      <button onClick={() => navigate("/")} className="btn-ghost mt-4">Back to the Library</button>
    </div>
  );
}
