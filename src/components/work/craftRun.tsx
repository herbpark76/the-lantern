import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { CraftRun } from "@/lib/works";

/** Latest craft run matching a filter, polled every 5 s while it's running. */
export function useCraftRun(filter: { kind: CraftRun["kind"]; version_id?: string | null; round_id?: string | null; work_slug?: string | null }) {
  const [run, setRun] = useState<CraftRun | null>(null);
  const [history, setHistory] = useState<CraftRun[]>([]);
  const [loading, setLoading] = useState(true);
  const key = `${filter.kind}:${filter.version_id ?? ""}:${filter.round_id ?? ""}:${filter.work_slug ?? ""}`;

  const load = useCallback(async () => {
    let q = supabase.from("craft_runs").select("*").eq("kind", filter.kind).order("created_at", { ascending: false }).limit(20);
    if (filter.version_id) q = q.eq("version_id", filter.version_id);
    if (filter.round_id) q = q.eq("round_id", filter.round_id);
    if (filter.work_slug) q = q.eq("work_slug", filter.work_slug);
    if (!filter.version_id && !filter.round_id && !filter.work_slug) { setRun(null); setHistory([]); setLoading(false); return; }
    const { data } = await q;
    const list = (data as CraftRun[]) ?? [];
    setHistory(list);
    setRun(list[0] ?? null);
    setLoading(false);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setLoading(true); load(); }, [load]);
  const running = run?.status === "running" && Date.now() - new Date(run.created_at).getTime() < 15 * 60 * 1000;
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(load, 5000);
    return () => window.clearInterval(t);
  }, [running, load]);

  return { run, history, loading, running, reload: load, setRun };
}

export function ModelPicker({ value, onChange }: { value: "sonnet" | "opus"; onChange: (m: "sonnet" | "opus") => void }) {
  return (
    <select className="input-field !py-2 !w-auto text-sm" value={value} onChange={(e) => onChange(e.target.value as "sonnet" | "opus")}
      title="Opus is slower and costs more, and reads more closely">
      <option value="sonnet">Sonnet (faster)</option>
      <option value="opus">Opus (deeper read)</option>
    </select>
  );
}

export function Running({ text }: { text: string }) {
  return (
    <div className="card px-6 py-10 text-center font-sans space-y-2">
      <Loader2 size={22} className="animate-spin text-accent-500 mx-auto" />
      <p className="text-ink-700 dark:text-ink-200">{text}</p>
      <p className="text-sm text-ink-500">Usually 1–4 minutes. You can leave this page; it keeps going.</p>
    </div>
  );
}
