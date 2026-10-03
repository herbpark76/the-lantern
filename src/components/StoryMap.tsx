import { useState, useMemo } from "react";
import type { Scene, Choice } from "@/lib/supabase";
import { Map as MapIcon, X, ChevronRight } from "lucide-react";

interface StoryMapProps {
  scenes: Scene[];
  choices: Choice[];
  mapMode: "fog" | "full" | "off";
  reachedScenes: Set<string>;
  steps: Array<{ id: string; scene_key: string; choice_key: string | null }>;
  accentColor: string;
  currentSceneKey: string;
}

export function StoryMap({ scenes, choices, mapMode, reachedScenes, steps, accentColor, currentSceneKey }: StoryMapProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [recapScene, setRecapScene] = useState<string | null>(null);

  if (mapMode === "off") return null;

  const allSceneKeys = useMemo(() => new Set(scenes.map((s) => s.key)), [scenes]);

  const visibleScenes = scenes.filter((s) => {
    if (mapMode === "full") return true;
    return reachedScenes.has(s.key);
  });

  // For fog mode: also show stub exits from reached scenes
  const stubExits = useMemo(() => {
    if (mapMode !== "fog") return [];
    const stubs: Array<{ fromKey: string; toKey: string; label: string }> = [];
    for (const scene of scenes) {
      if (!reachedScenes.has(scene.key)) continue;
      const sceneChoices = choices.filter((c) => c.scene_key === scene.key);
      for (const choice of sceneChoices) {
        if (!reachedScenes.has(choice.to_scene_key) && allSceneKeys.has(choice.to_scene_key)) {
          stubs.push({ fromKey: scene.key, toKey: choice.to_scene_key, label: choice.label });
        }
      }
    }
    return stubs;
  }, [scenes, choices, reachedScenes, mapMode, allSceneKeys]);

  const visibleChoices = choices.filter((c) => {
    if (mapMode === "full") return true;
    return reachedScenes.has(c.scene_key);
  });

  // Build scene recap from steps
  const sceneRecapSteps = (sceneKey: string): Array<{ id: string; scene_key: string; choice_key: string | null }> => {
    return steps.filter((s) => s.scene_key === sceneKey);
  };

  const nodes = visibleScenes.map((s) => ({
    key: s.key,
    title: s.title,
    x: s.map_x ?? 0,
    y: s.map_y ?? 0,
    isEnding: s.is_ending,
    isCurrent: s.key === currentSceneKey,
    reached: reachedScenes.has(s.key),
  }));

  // Normalize coordinates to 0-100 range for SVG
  const allCoords = scenes.map((s) => ({ x: s.map_x ?? 0, y: s.map_y ?? 0 }));
  const minX = Math.min(...allCoords.map((c) => c.x)) - 2;
  const maxX = Math.max(...allCoords.map((c) => c.x)) + 2;
  const minY = Math.min(...allCoords.map((c) => c.y)) - 2;
  const maxY = Math.max(...allCoords.map((c) => c.y)) + 2;
  const rangeX = Math.max(maxX - minX, 1);
  const rangeY = Math.max(maxY - minY, 1);

  const norm = (x: number, y: number) => ({
    x: ((x - minX) / rangeX) * 80 + 10,
    y: ((y - minY) / rangeY) * 70 + 15,
  });

  const toggleButton = (
    <button
      onClick={() => setIsOpen(!isOpen)}
      className="btn-ghost !px-3 !py-2 fixed bottom-4 right-4 z-30 shadow-md bg-ink-50 dark:bg-ink-900 border border-ink-200 dark:border-ink-700"
      aria-label="Toggle map"
    >
      <MapIcon size={18} />
      <span className="text-xs">Map</span>
    </button>
  );

  const mapContent = (
    <div className="bg-ink-50 dark:bg-ink-950 border-l border-ink-200 dark:border-ink-800 w-full sm:w-80 h-full overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-serif text-lg text-ink-900 dark:text-ink-50">Map</h3>
        <button onClick={() => setIsOpen(false)} className="btn-ghost !px-2 !py-1">
          <X size={18} />
        </button>
      </div>

      <svg viewBox="0 0 100 100" className="w-full h-auto" style={{ maxHeight: "60vh" }}>
        {/* Draw choice arrows */}
        {visibleChoices.map((choice) => {
          const fromScene = scenes.find((s) => s.key === choice.scene_key);
          const toScene = scenes.find((s) => s.key === choice.to_scene_key);
          if (!fromScene || !toScene) return null;
          if (mapMode === "fog" && !reachedScenes.has(choice.to_scene_key)) return null;

          const from = norm(fromScene.map_x ?? 0, fromScene.map_y ?? 0);
          const to = norm(toScene.map_x ?? 0, toScene.map_y ?? 0);
          const isReached = reachedScenes.has(choice.to_scene_key);

          return (
            <line
              key={`${choice.scene_key}-${choice.key}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={isReached ? accentColor : "#a89f8e"}
              strokeWidth={isReached ? 0.6 : 0.3}
              strokeDasharray={isReached ? "" : "2,1"}
              opacity={isReached ? 0.7 : 0.4}
            />
          );
        })}

        {/* Draw stub exits (fog mode) */}
        {stubExits.map((stub) => {
          const fromScene = scenes.find((s) => s.key === stub.fromKey);
          if (!fromScene) return null;
          const from = norm(fromScene.map_x ?? 0, fromScene.map_y ?? 0);
          return (
            <text
              key={`stub-${stub.fromKey}-${stub.toKey}`}
              x={from.x + 3}
              y={from.y}
              fill="#a89f8e"
              fontSize="3"
              opacity="0.5"
            >
              ?
            </text>
          );
        })}

        {/* Draw scene nodes */}
        {nodes.map((node) => {
          const pos = norm(node.x, node.y);
          const isStub = mapMode === "fog" && !node.reached;
          return (
            <g key={node.key}>
              <circle
                cx={pos.x}
                cy={pos.y}
                r={node.isCurrent ? 2.5 : node.isEnding ? 2 : 1.8}
                fill={node.isCurrent ? accentColor : node.isEnding ? accentColor : node.reached ? "#5c5447" : "#d4cec1"}
                opacity={isStub ? 0.3 : 1}
                className={node.isCurrent ? "animate-pulse" : ""}
              />
              <text
                x={pos.x}
                y={pos.y + 5}
                textAnchor="middle"
                fill="currentColor"
                fontSize="2.2"
                opacity={isStub ? 0.3 : 0.8}
                className="text-ink-600 dark:text-ink-400"
                style={{ pointerEvents: "auto", cursor: node.reached ? "pointer" : "default" }}
                onClick={() => node.reached && setRecapScene(node.key)}
              >
                {node.title}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-4 space-y-1 text-xs text-ink-500 dark:text-ink-500 font-sans">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full" style={{ background: accentColor }} />
          Current scene
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-ink-600" />
          Reached scene (tap to recap)
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-ink-300">?</span>
          Unexplored exit
        </div>
      </div>

      {recapScene && (
        <div className="mt-4 p-4 card animate-slide-up">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-serif text-base text-ink-900 dark:text-ink-50">
              {scenes.find((s) => s.key === recapScene)?.title}
            </h4>
            <button onClick={() => setRecapScene(null)} className="btn-ghost !px-1 !py-1">
              <X size={14} />
            </button>
          </div>
          <div className="text-sm text-ink-600 dark:text-ink-400 space-y-1">
            {sceneRecapSteps(recapScene).length > 0 ? (
              sceneRecapSteps(recapScene).map((step) => (
                <div key={step.id} className="flex items-center gap-2">
                  <ChevronRight size={12} className="text-accent-500" />
                  <span>Scene {step.scene_key} → chose {step.choice_key}</span>
                </div>
              ))
            ) : (
              <p className="italic">You arrived here but made no choice yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {toggleButton}
      {isOpen && (
        <>
          {/* Desktop: side panel */}
          <div className="hidden sm:block fixed top-14 right-0 bottom-0 z-40 animate-slide-in-right">
            {mapContent}
          </div>
          {/* Mobile: full overlay */}
          <div className="sm:hidden fixed inset-0 top-14 z-40 animate-slide-up">
            {mapContent}
          </div>
        </>
      )}
    </>
  );
}
