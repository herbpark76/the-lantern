import { useCallback, useEffect, useRef, type ReactNode } from "react";
import type { Block } from "@/lib/works";

// Renders a section's blocks (prose or screenplay) with optional highlights, and reports
// text selections as (block, start, end) offsets in the block's plain text.

export interface Highlight { id: string; block: number; start: number; end: number; tone: "comment" | "suggest" | "reaction" | "active" | "other" }
export interface SelectionInfo { block: number; start: number; end: number; quote: string; rect: DOMRect }

const TONE: Record<Highlight["tone"], string> = {
  comment: "bg-amber-200/60 dark:bg-amber-500/25",
  suggest: "bg-sky-200/70 dark:bg-sky-500/25",
  reaction: "bg-rose-200/50 dark:bg-rose-500/20",
  other: "bg-ink-200/70 dark:bg-ink-700/60",
  active: "bg-accent-300 dark:bg-accent-700",
};

export function TextView({
  blocks, screenplay, lang = "en", highlights = [], onSelect, onHighlightClick, gutter, blockClassName,
}: {
  blocks: Block[]; screenplay: boolean; lang?: string; highlights?: Highlight[];
  onSelect?: (s: SelectionInfo | null) => void;
  onHighlightClick?: (id: string) => void;
  /** Something to show at the side of a block (reaction buttons, note counts). */
  gutter?: (b: Block) => ReactNode;
  blockClassName?: (b: Block) => string;
}) {
  const root = useRef<HTMLDivElement>(null);

  const readSelection = useCallback(() => {
    if (!onSelect) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount || !root.current) { onSelect(null); return; }
    const range = sel.getRangeAt(0);
    if (!root.current.contains(range.commonAncestorContainer)) { onSelect(null); return; }
    const pos = (node: Node, off: number) => {
      const el = (node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element)) as HTMLElement | null;
      const leaf = el?.closest("[data-start]") as HTMLElement | null;
      const blk = el?.closest("[data-block]") as HTMLElement | null;
      if (!blk) return null;
      const b = Number(blk.dataset.block);
      if (!leaf) return { b, o: node.nodeType === Node.TEXT_NODE ? 0 : off > 0 ? Infinity : 0 };
      return { b, o: Number(leaf.dataset.start) + (node.nodeType === Node.TEXT_NODE ? off : 0) };
    };
    const a = pos(range.startContainer, range.startOffset);
    const z = pos(range.endContainer, range.endOffset);
    if (!a || !z) { onSelect(null); return; }
    const block = blocks[a.b];
    if (!block) { onSelect(null); return; }
    const start = Math.max(0, Math.min(a.o, block.plain.length));
    const end = z.b === a.b ? Math.min(z.o, block.plain.length) : block.plain.length;
    if (end - start < 1) { onSelect(null); return; }
    onSelect({ block: a.b, start, end, quote: block.plain.slice(start, end), rect: range.getBoundingClientRect() });
  }, [blocks, onSelect]);

  useEffect(() => {
    if (!onSelect) return;
    let t = 0;
    const onChange = () => { window.clearTimeout(t); t = window.setTimeout(readSelection, 250); };
    document.addEventListener("selectionchange", onChange);
    return () => { document.removeEventListener("selectionchange", onChange); window.clearTimeout(t); };
  }, [onSelect, readSelection]);

  const korean = lang === "ko";
  return (
    <div ref={root} lang={lang}
      className={screenplay
        ? "font-['Courier_Prime','Courier_New',Courier,monospace] text-[15px] sm:text-[16px] leading-[1.55] text-ink-900 dark:text-ink-100"
        : `text-ink-800 dark:text-ink-200 ${korean ? "font-sans text-[17px] leading-[1.9] break-keep" : "font-serif text-[18px] leading-relaxed"}`}>
      {blocks.map((b) => {
        const hs = highlights.filter((h) => h.block === b.i);
        const content = <Pieces block={b} highlights={hs} onClick={onHighlightClick} />;
        const g = gutter?.(b);
        const extra = blockClassName?.(b) ?? "";
        return (
          <div key={b.i} className={`group relative ${extra}`}>
            {g && <div className="absolute -left-2 sm:-left-12 top-0 h-full flex items-start">{g}</div>}
            <BlockEl b={b} screenplay={screenplay}>{content}</BlockEl>
          </div>
        );
      })}
    </div>
  );
}

function BlockEl({ b, screenplay, children }: { b: Block; screenplay: boolean; children: ReactNode }) {
  const p = { "data-block": b.i } as Record<string, unknown>;
  if (!screenplay) {
    switch (b.type) {
      case "h1": return <h2 {...p} className="font-serif text-2xl text-ink-900 dark:text-ink-50 mb-6">{children}</h2>;
      case "h2": case "h3": return <h3 {...p} className="font-sans text-sm uppercase tracking-wide text-ink-500 mt-8 mb-3">{children}</h3>;
      case "sep": return <p {...p} className="text-center text-ink-400 tracking-widest my-8 font-sans text-sm">{children}</p>;
      case "li": return <p {...p} className="mb-2 pl-5 relative before:content-['•'] before:absolute before:left-1">{children}</p>;
      case "quote": return <blockquote {...p} className="mb-5 pl-4 border-l-2 border-ink-300 italic">{children}</blockquote>;
      default: return <p {...p} className="mb-5">{children}</p>;
    }
  }
  switch (b.type) {
    case "act": return <h2 {...p} className="font-sans text-xl font-semibold text-center uppercase tracking-widest my-10 text-ink-900 dark:text-ink-50">{children}</h2>;
    case "scene": return <p {...p} className="font-bold uppercase mt-8 mb-3">{children}</p>;
    case "shot": return <p {...p} className="uppercase mt-4 mb-3">{children}</p>;
    case "character": return <p {...p} className="uppercase mt-4 ml-[34%] sm:ml-[38%]">{children}</p>;
    case "paren": return <p {...p} className="ml-[24%] sm:ml-[29%] mr-[20%]">{children}</p>;
    case "dialogue": return <p {...p} className="ml-[14%] sm:ml-[18%] mr-[10%] sm:mr-[18%] mb-1">{children}</p>;
    case "transition": return <p {...p} className="uppercase text-right my-4">{children}</p>;
    case "centered": return <p {...p} className="text-center my-4">{children}</p>;
    default: return <p {...p} className="mb-3 whitespace-pre-line">{children}</p>;
  }
}

function Pieces({ block, highlights, onClick }: { block: Block; highlights: Highlight[]; onClick?: (id: string) => void }) {
  // Cut the block's segments at every highlight edge.
  const cuts = new Set<number>([0, block.plain.length]);
  for (const s of block.segs) cuts.add(s.start);
  for (const h of highlights) { cuts.add(Math.max(0, h.start)); cuts.add(Math.min(block.plain.length, h.end)); }
  const points = Array.from(cuts).sort((a, b) => a - b);
  const out: ReactNode[] = [];
  for (let k = 0; k < points.length - 1; k++) {
    const a = points[k]; const z = points[k + 1];
    if (z <= a) continue;
    const seg = block.segs.find((s) => a >= s.start && a < s.start + s.text.length);
    if (!seg) continue;
    const text = seg.text.slice(a - seg.start, z - seg.start);
    const on = highlights.filter((h) => h.start <= a && h.end >= z);
    const top = on.find((h) => h.tone === "active") ?? on[0];
    let el: ReactNode = <span key={k} data-start={a}>{text}</span>;
    if (seg.em) el = <em key={k} data-start={a}>{text}</em>;
    if (seg.strong) el = <strong key={k} data-start={a}>{text}</strong>;
    if (top) {
      el = (
        <mark key={k} data-start={a} onClick={() => onClick?.(top.id)}
          className={`${TONE[top.tone]} text-inherit rounded-sm cursor-pointer ${seg.em ? "italic" : ""} ${seg.strong ? "font-bold" : ""}`}>
          {text}
        </mark>
      );
    }
    out.push(el);
  }
  return <>{out}</>;
}
