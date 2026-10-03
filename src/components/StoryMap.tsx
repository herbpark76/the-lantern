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

const GRID_X_SPACING = 90;
const GRID_Y_SPACING = 70;
const VIEWBOX_PAD = 28;
const STUB_LEN = 32;
const DOT_R = 7;
const CURRENT_R = 9;
const LABEL_FONT_SIZE = 12;
const LABEL_MAX_CHARS = 16;
const STUB_FONT_SIZE = 13;
const LABEL_GAP = 16;

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

interface StubExit {
  fromKey: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  qX: number;
  qY: number;
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

  const allNodes: GridNode[] = scenesWithCoords.map((s) => {
    const { px, py } = toPx(s.map_x ?? 0, s.map_y ?? 0);
    return {
      key: s.key, title: s.title, x: s.map_x ?? 0, y: s.map_y ?? 0,
      isEnding: s.is_ending, isCurrent: s.key === currentSceneKey,
      reached: reachedScenes.has(s.key), px, py,
    };
  });

  const nodeMap = new Map<string, GridNode>();
  for (const n of allNodes) nodeMap.set(n.key, n);

  // 1. Build path segments from steps
  const pathSegments: PathSegment[] = [];
  for (const step of steps) {
    if (!step.choice_key) continue;
    const choice = choices.find((c) => c.scene_key === step.scene_key && c.key === step.choice_key);
    if (!choice) continue;
    const fromNode = nodeMap.get(step.scene_key);
    const toNode = nodeMap.get(choice.to_scene_key);
    if (!fromNode || !toNode) continue;
    pathSegments.push({
      fromKey: step.scene_key, toKey: choice.to_scene_key,
      fromX: fromNode.px, fromY: fromNode.py,
      toX: toNode.px, toY: toNode.py,
      timeline: step.timeline,
      isLoop: toNode.y < fromNode.y,
    });
  }

  // 2. Build fog stubs — start at dot edge, angle away from label area
  const stubExits: StubExit[] = [];
  if (mapMode === "fog") {
    const allSceneKeys = new Set(scenes.map((s) => s.key));
    for (const scene of scenes) {
      if (!reachedScenes.has(scene.key)) continue;
      const fromNode = nodeMap.get(scene.key);
      if (!fromNode) continue;
      const sceneChoices = choices.filter((c) => c.scene_key === scene.key);
      for (const choice of sceneChoices) {
        if (!reachedScenes.has(choice.to_scene_key) && allSceneKeys.has(choice.to_scene_key)) {
          const toScene = scenes.find((s) => s.key === choice.to_scene_key);
          const targetPx = toPx(toScene?.map_x ?? fromNode.x, toScene?.map_y ?? fromNode.y + 1);
          let dx = targetPx.px - fromNode.px;
          let dy = targetPx.py - fromNode.py;
          // Avoid pointing straight down (label area) — nudge to side
          if (dy > 0 && Math.abs(dx) < 5) {
            dx = fromNode.x <= 1 ? 1 : -1; // push to whichever side has room
          }
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const ux = dx / len;
          const uy = dy / len;
          // Start at dot edge
          const dotR = fromNode.isCurrent ? CURRENT_R : DOT_R;
          const startX = fromNode.px + ux * dotR;
          const startY = fromNode.py + uy * dotR;
          const endX = fromNode.px + ux * (STUB_LEN + dotR);
          const endY = fromNode.py + uy * (STUB_LEN + dotR);
          // "?" placed slightly beyond stub end
          const qX = endX + ux * 8;
          const qY = endY + uy * 8 + 4;
          stubExits.push({ fromKey: scene.key, startX, startY, endX, endY, qX, qY });
        }
      }
    }
  }

  // 3. Visible nodes: reached scenes only
  const visibleNodes = allNodes.filter((n) => n.reached);

  // 4. Compute viewBox from visible nodes + stub endpoints + label space
  const fitPoints: Array<{ x: number; y: number }> = [];
  for (const n of visibleNodes) {
    fitPoints.push({ x: n.px, y: n.py });
    fitPoints.push({ x: n.px, y: n.py + DOT_R + LABEL_GAP + LABEL_FONT_SIZE + 4 });
    fitPoints.push({ x: n.px - LABEL_MAX_CHARS * 3.5, y: n.py });
    fitPoints.push({ x: n.px + LABEL_MAX_CHARS * 3.5, y: n.py });
  }
  for (const s of stubExits) {
    fitPoints.push({ x: s.endX, y: s.endY });
    fitPoints.push({ x: s.qX, y: s.qY });
  }
  if (fitPoints.length === 0) {
    fitPoints.push({ x: 0, y: 0 }, { x: 100, y: 100 });
  }
  const fitMinX = Math.min(...fitPoints.map((p) => p.x)) - VIEWBOX_PAD;
  const fitMaxX = Math.max(...fitPoints.map((p) => p.x)) + VIEWBOX_PAD;
  const fitMinY = Math.min(...fitPoints.map((p) => p.y)) - VIEWBOX_PAD;
  const fitMaxY = Math.max(...fitPoints.map((p) => p.y)) + VIEWBOX_PAD;
  const vbW = Math.max(fitMaxX - fitMinX, 100);
  const vbH = Math.max(fitMaxY - fitMinY, 100);

  // 5. Group choices by timeline
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

  // Loop path: curve along the right edge
  const loopPath = (seg: PathSegment) => {
    const rightX = Math.max(seg.fromX, seg.toX) + 40;
    return `M ${seg.fromX} ${seg.fromY} C ${rightX} ${seg.fromY}, ${rightX} ${seg.toY}, ${seg.toX} ${seg.toY}`;
  };

  const mapContent = (
    <div className="bg-ink-50 dark:bg-ink-950 border-l border-ink-200 dark:border-ink-800 w-full h-full overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-serif text-lg text-ink-900 dark:text-ink-50">Timeline</h3>
        <button onClick={onToggle} className="btn-ghost !px-2 !py-1" aria-label="Close map">
          <X size={18} />
        </button>
      </div>

      <svg viewBox={`${fitMinX} ${fitMinY} ${vbW} ${vbH}`} className="w-full h-auto" style={{ maxHeight: "55vh" }}>
        {/* Lines first */}
        {pathSegments.map((seg, i) => {
          const isCurrentTl = seg.timeline === currentTimeline;
          const color = isCurrentTl ? accentColor : "#9a958c";
          const opacity = isCurrentTl ? 1 : 0.5;
          if (seg.isLoop) {
            return (
              <path key={`path-${i}`} d={loopPath(seg)} fill="none" stroke={color}
                strokeWidth={2} opacity={opacity} strokeLinecap="round" />
            );
          }
          return (
            <line key={`path-${i}`} x1={seg.fromX} y1={seg.fromY} x2={seg.toX} y2={seg.toY}
              stroke={color} strokeWidth={2} opacity={opacity} strokeLinecap="round" />
          );
        })}

        {/* Fog stubs: dashed line from dot edge + "?" beyond end */}
        {stubExits.map((stub, i) => (
          <g key={`stub-${i}`}>
            <line x1={stub.startX} y1={stub.startY} x2={stub.endX} y2={stub.endY}
              stroke="currentColor" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.6}
              className="text-ink-500 dark:text-ink-400" />
            <text x={stub.qX} y={stub.qY} textAnchor="middle" fill="currentColor"
              fontSize={STUB_FONT_SIZE} opacity={0.6}
              className="text-ink-500 dark:text-ink-400">?</text>
          </g>
        ))}

        {/* Dots on top */}
        {visibleNodes.map((node) => {
          const r = node.isCurrent ? CURRENT_R : DOT_R;
          const fill = node.isCurrent ? accentColor : node.isEnding ? accentColor : "#5c5447";
          const label = truncate(node.title, LABEL_MAX_CHARS);
          return (
            <g key={node.key}>
              {node.isCurrent && (
                <circle cx={node.px} cy={node.py} r={r + 6} fill={accentColor}
                  opacity={0.18} className="animate-pulse" />
              )}
              <circle cx={node.px} cy={node.py} r={r} fill={fill}
                style={{ cursor: "pointer" }} onClick={() => setRecapScene(node.key)} />
              {node.isEnding && (
                <circle cx={node.px} cy={node.py} r={r + 3} fill="none"
                  stroke={accentColor} strokeWidth={1.5} opacity={0.5} />
              )}
              <text x={node.px} y={node.py + r + LABEL_GAP} textAnchor="middle"
                fill="currentColor" fontSize={LABEL_FONT_SIZE} opacity={0.8}
                className="text-ink-600 dark:text-ink-400 font-sans"
                style={{ pointerEvents: "none", userSelect: "none", fontWeight: node.isCurrent ? 600 : 400 }}>
                {label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-500 dark:text-ink-500 font-sans">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: accentColor }} />Current
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-ink-600" />Reached
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full border border-ink-400" style={{ background: "transparent" }} />Ending
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-ink-400">- - ?</span>Unknown
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
