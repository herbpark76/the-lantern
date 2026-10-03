import { useState } from "react";
import type { Scene, Choice } from "@/lib/supabase";
import { X, ChevronRight, Clock } from "lucide-react";

interface StoryMapProps {
  scenes: Scene[];
  choices: Choice[];
  mapMode: "fog" | "full" | "off";
  reachedScenes: Set<string>;
  steps: Array<{ id: string; scene_key: string; choice_key: string | null; timeline: number }>;
  accentColor: string;
  currentSceneKey: string;
  currentTimeline: number;
  showTimelines: boolean;
  isOpen: boolean;
  onToggle: () => void;
}

const GRID_X_SPACING = 70;
const GRID_Y_SPACING = 48;
const VIEWBOX_PAD = 24;
const DOT_R = 4;
const CURRENT_R = 5;
const RING_R = 9;
const LABEL_FONT_SIZE = 11;
const LABEL_MAX_CHARS = 16;
const LABEL_OFFSET = 9;
const HALO_WIDTH = 4;
const COUNT_FONT_SIZE = 10;

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

interface GridNode {
  key: string;
  title: string;
  x: number;
  y: number;
  isEnding: boolean;
  isCurrent: boolean;
  reached: boolean;
  px: number;
  py: number;
  labelSide: "left" | "right";
  labelX: number;
  labelY: number;
  labelAnchor: "start" | "end";
  dotR: number;
  untakenCount: number;
}

interface PathSegment {
  fromKey: string;
  toKey: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  timeline: number;
  isLoop: boolean;
}

export function StoryMap({
  scenes, choices, mapMode, reachedScenes, steps, accentColor,
  currentSceneKey, currentTimeline, showTimelines, isOpen, onToggle,
}: StoryMapProps) {
  const [recapScene, setRecapScene] = useState<string | null>(null);

  if (mapMode === "off") return null;

  const scenesWithCoords = scenes.filter((s) => s.map_x !== null && s.map_y !== null);

  const toPx = (gx: number, gy: number) => ({
    px: gx * GRID_X_SPACING,
    py: gy * GRID_Y_SPACING,
  });

  const allPxVals = scenesWithCoords.map((s) => toPx(s.map_x ?? 0, s.map_y ?? 0).px);
  const globalMinX = allPxVals.length > 0 ? Math.min(...allPxVals) : 0;
  const globalMaxX = allPxVals.length > 0 ? Math.max(...allPxVals) : 100;
  const globalSpanX = globalMaxX - globalMinX || 1;
  const rightThirdX = globalMinX + globalSpanX * (2 / 3);

  const takenChoiceByScene = new Map<string, string>();
  for (const step of steps) {
    if (step.choice_key) takenChoiceByScene.set(step.scene_key, step.choice_key);
  }
  const allSceneKeys = new Set(scenes.map((s) => s.key));

  // 1. Build all nodes with label placement + untaken count
  const allNodes: GridNode[] = scenesWithCoords.map((s) => {
    const { px, py } = toPx(s.map_x ?? 0, s.map_y ?? 0);
    const dotR = s.key === currentSceneKey ? CURRENT_R : DOT_R;
    const labelSide: "left" | "right" = px >= rightThirdX ? "left" : "right";
    const labelX = labelSide === "right" ? px + LABEL_OFFSET : px - LABEL_OFFSET;
    const labelAnchor: "start" | "end" = labelSide === "right" ? "start" : "end";

    let untakenCount = 0;
    if (s.key !== currentSceneKey && reachedScenes.has(s.key)) {
      const sceneChoices = choices.filter((c) => c.scene_key === s.key);
      untakenCount = sceneChoices.filter(
        (c) => c.key !== takenChoiceByScene.get(s.key)
          && !reachedScenes.has(c.to_scene_key)
          && allSceneKeys.has(c.to_scene_key)
      ).length;
    }

    return {
      key: s.key, title: s.title, x: s.map_x ?? 0, y: s.map_y ?? 0,
      isEnding: s.is_ending, isCurrent: s.key === currentSceneKey,
      reached: reachedScenes.has(s.key), px, py,
      labelSide, labelX, labelY: py, labelAnchor, dotR, untakenCount,
    };
  });

  const nodeMap = new Map<string, GridNode>();
  for (const n of allNodes) nodeMap.set(n.key, n);

  // 2. Build path segments from steps — offset to dot edges
  const pathSegments: PathSegment[] = [];
  for (const step of steps) {
    if (!step.choice_key) continue;
    const choice = choices.find((c) => c.scene_key === step.scene_key && c.key === step.choice_key);
    if (!choice) continue;
    const fromNode = nodeMap.get(step.scene_key);
    const toNode = nodeMap.get(choice.to_scene_key);
    if (!fromNode || !toNode) continue;
    const dx = toNode.px - fromNode.px;
    const dy = toNode.py - fromNode.py;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;
    pathSegments.push({
      fromKey: step.scene_key, toKey: choice.to_scene_key,
      fromX: fromNode.px + ux * fromNode.dotR,
      fromY: fromNode.py + uy * fromNode.dotR,
      toX: toNode.px - ux * toNode.dotR,
      toY: toNode.py - uy * toNode.dotR,
      timeline: step.timeline,
      isLoop: toNode.y < fromNode.y,
    });
  }

  // 3. Visible nodes: reached scenes only
  const visibleNodes = allNodes.filter((n) => n.reached);

  // 4. Resolve vertical label collisions
  const MIN_LABEL_GAP = LABEL_FONT_SIZE + 4;
  const sortedByY = [...visibleNodes].sort((a, b) => a.labelY - b.labelY);
  for (let i = 1; i < sortedByY.length; i++) {
    const prev = sortedByY[i - 1];
    const curr = sortedByY[i];
    if (Math.abs(curr.labelY - prev.labelY) < MIN_LABEL_GAP) {
      curr.labelY = prev.labelY + MIN_LABEL_GAP;
    }
  }

  // 5. Compute fixed-size map bounds (content extent, NOT zoom-to-fit)
  const fitPoints: Array<{ x: number; y: number }> = [];
  for (const n of visibleNodes) {
    fitPoints.push({ x: n.px, y: n.py });
    fitPoints.push({ x: n.labelX, y: n.labelY });
    fitPoints.push({ x: n.labelX + (n.labelSide === "right" ? LABEL_MAX_CHARS * 3.5 : -LABEL_MAX_CHARS * 3.5), y: n.labelY });
    fitPoints.push({ x: n.px, y: n.py + n.dotR + 6 });
    fitPoints.push({ x: n.px, y: n.py - n.dotR - 12 });
  }
  if (fitPoints.length === 0) {
    fitPoints.push({ x: 0, y: 0 }, { x: 100, y: 100 });
  }
  const mapMinX = Math.min(...fitPoints.map((p) => p.x)) - VIEWBOX_PAD;
  const mapMaxX = Math.max(...fitPoints.map((p) => p.x)) + VIEWBOX_PAD;
  const mapMinY = Math.min(...fitPoints.map((p) => p.y)) - VIEWBOX_PAD;
  const mapMaxY = Math.max(...fitPoints.map((p) => p.y)) + VIEWBOX_PAD;
  const mapW = Math.max(mapMaxX - mapMinX, 50);
  const mapH = Math.max(mapMaxY - mapMinY, 50);

  // 6. Group choices by timeline
  const tlMap = new Map<number, Array<{ label: string; sceneKey: string }>>();
  for (const step of steps) {
    if (!step.choice_key) continue;
    const choice = choices.find((c) => c.scene_key === step.scene_key && c.key === step.choice_key);
    if (!choice) continue;
    const arr = tlMap.get(step.timeline) ?? [];
    arr.push({ label: choice.label, sceneKey: step.scene_key });
    tlMap.set(step.timeline, arr);
  }
  const choicesByTimeline = [...tlMap.keys()].sort((a, b) => a - b).map((tl) => ({
    timeline: tl, items: tlMap.get(tl) ?? [],
  }));

  const sceneRecapSteps = (sceneKey: string) => steps.filter((s) => s.scene_key === sceneKey);
  const recapSceneData = recapScene ? scenes.find((s) => s.key === recapScene) : null;

  const loopPath = (seg: PathSegment) => {
    const rightX = Math.max(seg.fromX, seg.toX) + 40;
    return `M ${seg.fromX} ${seg.fromY} C ${rightX} ${seg.fromY}, ${rightX} ${seg.toY}, ${seg.toX} ${seg.toY}`;
  };

  const mapContent = (
    <div
      className="bg-ink-50 dark:bg-ink-950 border-l border-ink-200 dark:border-ink-800 w-full h-full overflow-y-auto p-4 [--map-bg:#faf9f7] dark:[--map-bg:#121110]"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-serif text-lg text-ink-900 dark:text-ink-50">Timeline</h3>
        <button onClick={onToggle} className="btn-ghost !px-2 !py-1" aria-label="Close map">
          <X size={18} />
        </button>
      </div>

      {/* Fixed-scale SVG: 1 SVG unit = 1 CSS px, centered horizontally */}
      <div className="flex justify-center">
        <svg
          viewBox={`${mapMinX} ${mapMinY} ${mapW} ${mapH}`}
          width={mapW}
          height={mapH}
          style={{ flexShrink: 0 }}
        >
          {/* Layer 1: Path lines */}
          {pathSegments.map((seg, i) => {
            const isCurrentTl = seg.timeline === currentTimeline;
            const color = isCurrentTl ? accentColor : "#9a958c";
            const opacity = isCurrentTl ? 1 : 0.5;
            if (seg.isLoop) {
              return (
                <path key={`path-${i}`} d={loopPath(seg)} fill="none" stroke={color}
                  strokeWidth={1.5} opacity={opacity} strokeLinecap="round" />
              );
            }
            return (
              <line key={`path-${i}`} x1={seg.fromX} y1={seg.fromY} x2={seg.toX} y2={seg.toY}
                stroke={color} strokeWidth={1.5} opacity={opacity} strokeLinecap="round" />
            );
          })}

          {/* Layer 2: Dots */}
          {visibleNodes.map((node) => {
            const r = node.dotR;
            const fill = node.isCurrent ? accentColor : "#5c5447";
            return (
              <g key={node.key}>
                {node.isCurrent && (
                  <circle cx={node.px} cy={node.py} r={RING_R} fill={accentColor} opacity={0.15} />
                )}
                <circle cx={node.px} cy={node.py} r={r} fill={fill}
                  style={{ cursor: "pointer" }} onClick={() => setRecapScene(node.key)} />
              </g>
            );
          })}

          {/* Layer 3: Labels on top with halo */}
          {visibleNodes.map((node) => {
            const label = truncate(node.title, LABEL_MAX_CHARS);
            return (
              <text
                key={`label-${node.key}`}
                x={node.labelX}
                y={node.labelY + LABEL_FONT_SIZE * 0.35}
                textAnchor={node.labelAnchor}
                fill="currentColor"
                fontSize={LABEL_FONT_SIZE}
                opacity={0.7}
                className="text-ink-600 dark:text-ink-400 font-sans"
                style={{
                  pointerEvents: "none",
                  userSelect: "none",
                  fontWeight: node.isCurrent ? 600 : 400,
                  paintOrder: "stroke",
                  stroke: "var(--map-bg)",
                  strokeWidth: HALO_WIDTH,
                  strokeLinejoin: "round",
                }}
                dominantBaseline="middle"
              >
                {label}
              </text>
            );
          })}

          {/* Layer 4: "+N" count markers above-left of dot */}
          {visibleNodes.filter((n) => n.untakenCount > 0).map((node) => (
            <text
              key={`count-${node.key}`}
              x={node.px - DOT_R - 2}
              y={node.py - DOT_R - 2}
              textAnchor="end"
              fill="currentColor"
              fontSize={COUNT_FONT_SIZE}
              opacity={0.5}
              className="text-ink-500 dark:text-ink-400 font-sans"
              style={{ pointerEvents: "auto", cursor: "default" }}
              dominantBaseline="middle"
            >
              <title>{`${node.untakenCount} road${node.untakenCount > 1 ? "s" : ""} not taken`}</title>
              +{node.untakenCount}
            </text>
          ))}
        </svg>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-500 dark:text-ink-500 font-sans">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: accentColor }} />Current
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-ink-600" />Reached
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-ink-400 text-[10px]">+N</span>Roads not taken
        </div>
      </div>

      {/* Your choices grouped by timeline */}
      {choicesByTimeline.length > 0 && (
        <div className="mt-4 pt-4 border-t border-ink-200 dark:border-ink-800">
          <h4 className="font-serif text-sm text-ink-900 dark:text-ink-50 mb-2">Your choices</h4>
          <div className="space-y-3">
            {choicesByTimeline.map((group) => (
              <div key={group.timeline}>
                {showTimelines && (
                  <p className="text-xs font-sans text-ink-400 mb-1 flex items-center gap-1">
                    <Clock size={10} />Timeline {group.timeline}
                  </p>
                )}
                <ol className="space-y-1 ml-1">
                  {group.items.map((item, i) => (
                    <li key={i} className="text-xs font-sans text-ink-600 dark:text-ink-400 flex items-start gap-1.5">
                      <span className="text-ink-400 tabular-nums mt-0.5">{i + 1}.</span>
                      <span className="flex-1">{item.label}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scene recap */}
      {recapSceneData && (
        <div className="mt-4 p-3 card animate-slide-up">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-serif text-base text-ink-900 dark:text-ink-50">{recapSceneData.title}</h4>
            <button onClick={() => setRecapScene(null)} className="btn-ghost !px-1 !py-1">
              <X size={14} />
            </button>
          </div>
          <div className="text-sm text-ink-600 dark:text-ink-400 space-y-1">
            {sceneRecapSteps(recapScene!).length > 0 ? (
              sceneRecapSteps(recapScene!).map((step) => {
                const choice = choices.find((c) => c.scene_key === step.scene_key && c.key === step.choice_key);
                return (
                  <div key={step.id} className="flex items-start gap-2">
                    <ChevronRight size={12} className="text-accent-500 mt-0.5 shrink-0" />
                    <span className="text-xs">{choice?.label ?? step.choice_key}</span>
                  </div>
                );
              })
            ) : (
              <p className="italic text-xs">You arrived here but made no choice yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );

  if (!isOpen) return null;

  return (
    <>
      {/* Desktop: overlay sidebar (≥1200px) */}
      <div className="hidden xl:block fixed top-14 right-0 bottom-0 w-[300px] z-30 animate-slide-in-right shadow-2xl">
        {mapContent}
      </div>
      {/* Below 1200px: overlay drawer */}
      <div className="xl:hidden fixed inset-0 z-40 bg-black/30" onClick={onToggle}>
        <div className="absolute bottom-0 left-0 right-0 max-h-[70vh] animate-slide-up rounded-t-xl overflow-hidden shadow-2xl"
          onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-center pt-2 pb-1">
            <div className="w-10 h-1 rounded-full bg-ink-300 dark:bg-ink-700" />
          </div>
          <div className="h-[60vh]">{mapContent}</div>
        </div>
      </div>
    </>
  );
}
