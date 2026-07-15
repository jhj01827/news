'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import CategoryTabs from '@/components/CategoryTabs';
import { Category, Article } from '@/lib/types';
import { fetchAllArticles } from '@/lib/articles';
import { trackEvent } from '@/lib/mixpanel';

// ─────────────────────────────────────────────────────────────
// 1. DATA TYPES
// ─────────────────────────────────────────────────────────────
interface TagData {
  keyword: string;
  count: number;       // how many articles mention this tag
  articles: Article[];
}

interface GNode {
  id: string;
  label: string;
  count: number;
  r: number;           // visual radius
  x: number;
  y: number;
  vx: number;
  vy: number;
  tag: TagData;
}

interface GEdge {
  s: string;           // source node id
  t: string;           // target node id
  weight: number;      // co-occurrence count
}

// ─────────────────────────────────────────────────────────────
// 2. DATA PROCESSING
// ─────────────────────────────────────────────────────────────
function buildGraph(
  filterCat: Category,
  allArticles: Article[],
): { nodes: GNode[]; edges: GEdge[] } {
  // --- tag frequency ---
  const tagMap = new Map<string, TagData>();
  const src = filterCat === 'all'
    ? allArticles
    : allArticles.filter((a) => a.category === filterCat);

  // global counts (for node sizing, uses ALL articles)
  const globalCount = new Map<string, number>();
  for (const a of allArticles) {
    for (const kw of (a.keywords ?? [])) {
      globalCount.set(kw, (globalCount.get(kw) ?? 0) + 1);
    }
  }

  // build tag map from filtered articles
  for (const a of src) {
    for (const kw of (a.keywords ?? [])) {
      if (!tagMap.has(kw)) {
        tagMap.set(kw, { keyword: kw, count: globalCount.get(kw) ?? 1, articles: [] });
      }
      tagMap.get(kw)!.articles.push(a);
    }
  }

  // sort by count, limit nodes
  let tags = Array.from(tagMap.values()).sort((a, b) => b.count - a.count);
  if (filterCat === 'all') {
    const multi = tags.filter((t) => t.count >= 2);
    tags = multi.length >= 8 ? multi.slice(0, 50) : tags.slice(0, 15);
  } else {
    tags = tags.slice(0, 40);
  }

  const maxCount = tags[0]?.count ?? 1;

  // --- nodes: start clustered near center, will spread via physics ---
  const nodes: GNode[] = tags.map((tag, i) => {
    // tiny jitter so they don't all collide at exact center
    const angle = (i / tags.length) * Math.PI * 2;
    const jitter = 8 + i * 2;
    return {
      id: tag.keyword,
      label: tag.keyword,
      count: tag.count,
      r: nodeRadius(tag.count, maxCount),
      x: jitter * Math.cos(angle),
      y: jitter * Math.sin(angle),
      vx: 0,
      vy: 0,
      tag,
    };
  });

  // --- edges: tags that co-occur in the same article ---
  const edgeMap = new Map<string, number>();
  const nodeSet = new Set(nodes.map((n) => n.id));
  for (const a of src) {
    const kws = (a.keywords ?? []).filter((k) => nodeSet.has(k));
    for (let i = 0; i < kws.length; i++) {
      for (let j = i + 1; j < kws.length; j++) {
        const key = [kws[i], kws[j]].sort().join('\x00');
        edgeMap.set(key, (edgeMap.get(key) ?? 0) + 1);
      }
    }
  }

  const edges: GEdge[] = [];
  edgeMap.forEach((weight, key) => {
    const [s, t] = key.split('\x00');
    edges.push({ s, t, weight });
  });

  return { nodes, edges };
}

// node visual radius: hub nodes 4+ are bigger
function nodeRadius(count: number, maxCount: number): number {
  // hub (4+): 6–14px, small (1): 3.5px
  const t = Math.sqrt(Math.max(count, 1) / Math.max(maxCount, 1));
  return 3.5 + t * 10.5;
}

// ─────────────────────────────────────────────────────────────
// 3. FORCE SIMULATION (runs fixed ~300 steps, then stops)
// ─────────────────────────────────────────────────────────────
const SIM_STEPS = 320;        // total frames before freezing
const REPEL_STRENGTH = 2800;  // node-node repulsion
const LINK_DIST = 90;         // ideal edge length
const LINK_STRENGTH = 0.25;   // spring constant
const GRAVITY = 0.04;         // toward canvas center
const DAMPING = 0.78;         // velocity damping each tick

function simStep(
  nodes: GNode[],
  edges: GEdge[],
  cx: number,
  cy: number,
  alpha: number,           // cooling factor 0→1, decreases over time
) {
  const nMap = new Map(nodes.map((n) => [n.id, n]));

  // repulsion between all node pairs
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy || 0.0001;
      const d = Math.sqrt(d2);
      const f = (REPEL_STRENGTH * alpha) / d2;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      a.vx -= fx; a.vy -= fy;
      b.vx += fx; b.vy += fy;
    }
  }

  // spring attraction along edges
  for (const e of edges) {
    const a = nMap.get(e.s);
    const b = nMap.get(e.t);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 0.0001;
    const f = (d - LINK_DIST) * LINK_STRENGTH * alpha;
    a.vx += (dx / d) * f; a.vy += (dy / d) * f;
    b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
  }

  // gravity toward center
  for (const n of nodes) {
    n.vx += (cx - n.x) * GRAVITY * alpha;
    n.vy += (cy - n.y) * GRAVITY * alpha;
    n.vx *= DAMPING;
    n.vy *= DAMPING;
    n.x  += n.vx;
    n.y  += n.vy;
  }
}

// ─────────────────────────────────────────────────────────────
// 4. CANVAS DRAW
// ─────────────────────────────────────────────────────────────
function drawGraph(
  ctx: CanvasRenderingContext2D,
  W: number,    // physical (dpr-scaled)
  H: number,
  dpr: number,
  nodes: GNode[],
  edges: GEdge[],
  cam: { x: number; y: number; scale: number },
  hoveredId: string | null,
) {
  // clear
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0A0A0F';
  ctx.fillRect(0, 0, W, H);

  const Wl = W / dpr;
  const Hl = H / dpr;

  ctx.save();
  // camera: world origin is at logical canvas center
  ctx.translate(Wl / 2 * dpr + cam.x * dpr, Hl / 2 * dpr + cam.y * dpr);
  ctx.scale(cam.scale * dpr, cam.scale * dpr);

  const nMap = new Map(nodes.map((n) => [n.id, n]));
  const hovNode = hoveredId ? nMap.get(hoveredId) ?? null : null;

  // ── Edges ──────────────────────────────────────────────────
  for (const e of edges) {
    const a = nMap.get(e.s);
    const b = nMap.get(e.t);
    if (!a || !b) continue;
    const isHov = hoveredId === e.s || hoveredId === e.t;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = isHov
      ? 'rgba(160,158,230,0.65)'
      : 'rgba(100,98,160,0.22)';
    ctx.lineWidth = isHov ? 1.0 : 0.6;
    ctx.stroke();
  }

  // ── Nodes ──────────────────────────────────────────────────
  for (const n of nodes) {
    const isHov = n.id === hoveredId;
    const isHub = n.count >= 4;

    // glow halo for hub nodes (and hovered)
    if (isHub || isHov) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r * (isHov ? 3.2 : 2.8), 0, Math.PI * 2);
      const glowAlpha = isHov ? 0.09 : 0.04;
      ctx.fillStyle = `rgba(255,255,255,${glowAlpha})`;
      ctx.fill();
    }

    // node circle
    ctx.beginPath();
    ctx.arc(n.x, n.y, isHov ? n.r * 1.35 : n.r, 0, Math.PI * 2);

    if (isHub) {
      // bright white fill for hubs
      ctx.fillStyle = isHov ? 'rgba(255,255,255,1)' : 'rgba(235,233,255,0.92)';
    } else {
      // dimmer fill for smaller nodes
      const alpha = 0.4 + (n.count / 3) * 0.35;
      ctx.fillStyle = isHov
        ? `rgba(200,198,240,0.9)`
        : `rgba(160,158,210,${Math.min(alpha, 0.78)})`;
    }
    ctx.fill();

    // subtle border
    ctx.strokeStyle = isHov
      ? 'rgba(255,255,255,0.9)'
      : isHub
        ? 'rgba(255,255,255,0.35)'
        : 'rgba(180,178,230,0.18)';
    ctx.lineWidth = isHov ? 1.2 : 0.7;
    ctx.stroke();

    // ── Label ────────────────────────────────────────────────
    const showLabel = isHov || isHub || n.r > 5.5;
    if (showLabel) {
      const fs = Math.max(9, Math.min(12, 8 + n.r * 0.35));
      ctx.font = `${isHub ? 600 : 400} ${fs}px 'Pretendard Variable','Pretendard',sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const labelX = n.x + (isHov ? n.r * 1.35 : n.r) + 4;
      const labelY = n.y;

      // shadow for readability
      ctx.shadowColor = 'rgba(0,0,0,0.95)';
      ctx.shadowBlur = 5;

      ctx.fillStyle = isHov
        ? '#F0EDE6'
        : isHub
          ? 'rgba(220,218,245,0.92)'
          : 'rgba(140,138,190,0.78)';
      ctx.globalAlpha = isHov ? 1 : 0.88;
      ctx.fillText(n.label, labelX, labelY);
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }
  }

  ctx.restore();
}

// ─────────────────────────────────────────────────────────────
// 5. MAIN COMPONENT
// ─────────────────────────────────────────────────────────────
export default function TrendMapPage() {
  const router = useRouter();
  const [category, setCategory] = useState<Category>('all');
  const [allArticles, setAllArticles] = useState<Article[]>([]);
  const [sheet, setSheet] = useState<TagData | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [nodeCount, setNodeCount] = useState(0);

  // tooltip state (screen coordinates)
  const [tooltip, setTooltip] = useState<{
    x: number; y: number; label: string; count: number;
  } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef   = useRef<HTMLDivElement>(null);
  const sheetRef  = useRef<HTMLDivElement>(null);

  // graph state stored in refs (not state, to avoid re-renders in RAF)
  const nodesRef = useRef<GNode[]>([]);
  const edgesRef = useRef<GEdge[]>([]);
  const simStepRef = useRef(0);     // how many sim steps done
  const rafRef = useRef<number>(0);
  const canvasReadyRef = useRef(false);

  // camera
  const cam = useRef({ x: 0, y: 0, scale: 1 });

  // drag
  const drag = useRef({ on: false, sx: 0, sy: 0, cx: 0, cy: 0, moved: false });
  // pinch
  const pinch = useRef({ on: false, d: 0 });
  // hovered node id
  const hovId = useRef<string | null>(null);

  // ── fetch articles once ────────────────────────────────────
  useEffect(() => { fetchAllArticles().then(setAllArticles); }, []);

  // ── rebuild graph when data/category changes ───────────────
  const rebuildGraph = useCallback((W: number, H: number) => {
    if (allArticles.length === 0 || W < 10 || H < 10) return;
    const { nodes, edges } = buildGraph(category, allArticles);
    nodesRef.current = nodes;
    edgesRef.current = edges;
    simStepRef.current = 0;  // restart simulation
    cam.current = { x: 0, y: 0, scale: 1 };
    hovId.current = null;
    setNodeCount(nodes.length);
  }, [allArticles, category]);

  useEffect(() => {
    if (!canvasReadyRef.current) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    rebuildGraph(cv.width / dpr, cv.height / dpr);
  }, [rebuildGraph]);

  // ── RAF render + sim loop ──────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap   = wrapRef.current;
    if (!canvas || !wrap) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const W = wrap.clientWidth;
      const H = wrap.clientHeight;
      if (W < 10 || H < 10) return;
      canvas.width  = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width  = `${W}px`;
      canvas.style.height = `${H}px`;
      if (!canvasReadyRef.current) {
        canvasReadyRef.current = true;
        requestAnimationFrame(() => rebuildGraph(W, H));
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const loop = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) { rafRef.current = requestAnimationFrame(loop); return; }

      const dpr = window.devicePixelRatio || 1;
      const W = canvas.width;
      const H = canvas.height;
      const Wl = W / dpr;
      const Hl = H / dpr;

      // run one physics step if simulation not complete
      if (simStepRef.current < SIM_STEPS) {
        const alpha = 1 - simStepRef.current / SIM_STEPS; // 1→0
        simStep(nodesRef.current, edgesRef.current, 0, 0, alpha);
        simStepRef.current++;
      }

      drawGraph(ctx, W, H, dpr, nodesRef.current, edgesRef.current, cam.current, hovId.current);
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── coordinate transform: screen → world ──────────────────
  const s2w = useCallback((sx: number, sy: number) => {
    const cv = canvasRef.current;
    if (!cv) return { x: 0, y: 0 };
    const rect = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const Wl = cv.width / dpr;
    const Hl = cv.height / dpr;
    const c = cam.current;
    // screen → logical canvas → world
    const lx = sx - rect.left;
    const ly = sy - rect.top;
    return {
      x: (lx - Wl / 2 - c.x) / c.scale,
      y: (ly - Hl / 2 - c.y) / c.scale,
    };
  }, []);

  // ── find node at world position ────────────────────────────
  const hitTest = useCallback((wx: number, wy: number): GNode | null => {
    const nodes = nodesRef.current;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const dx = wx - n.x, dy = wy - n.y;
      const hitR = Math.max(n.r * 1.5, 10); // generous hit area
      if (dx * dx + dy * dy <= hitR * hitR) return n;
    }
    return null;
  }, []);

  // ── Mouse events ──────────────────────────────────────────
  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const w = s2w(e.clientX, e.clientY);
    const hit = hitTest(w.x, w.y);
    hovId.current = hit?.id ?? null;

    if (hit) {
      canvasRef.current!.style.cursor = 'pointer';
      setTooltip({ x: e.clientX, y: e.clientY, label: hit.label, count: hit.count });
    } else {
      canvasRef.current!.style.cursor = drag.current.on ? 'grabbing' : 'grab';
      setTooltip(null);
    }

    if (drag.current.on) {
      const dx = e.clientX - drag.current.sx;
      const dy = e.clientY - drag.current.sy;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.current.moved = true;
      cam.current.x = drag.current.cx + dx;
      cam.current.y = drag.current.cy + dy;
    }
  }, [s2w, hitTest]);

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    drag.current = { on: true, sx: e.clientX, sy: e.clientY, cx: cam.current.x, cy: cam.current.y, moved: false };
    canvasRef.current!.style.cursor = 'grabbing';
  }, []);

  const onMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const was = drag.current.moved;
    drag.current.on = false; drag.current.moved = false;
    canvasRef.current!.style.cursor = 'grab';
    if (!was) {
      const w = s2w(e.clientX, e.clientY);
      const hit = hitTest(w.x, w.y);
      if (hit) {
        trackEvent('Trend Node Clicked', { keyword: hit.label });
        setSheet(hit.tag);
      }
    }
  }, [s2w, hitTest]);

  const onMouseLeave = useCallback(() => {
    drag.current.on = false;
    hovId.current = null;
    setTooltip(null);
    if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
  }, []);

  // ── Wheel zoom (centered on cursor) ───────────────────────
  const onWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.91;
    const cv = canvasRef.current; if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const Wl = cv.width / dpr;
    const Hl = cv.height / dpr;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    // zoom toward cursor
    cam.current.x = px - Wl / 2 + (cam.current.x + Wl / 2 - px) * factor;
    cam.current.y = py - Hl / 2 + (cam.current.y + Hl / 2 - py) * factor;
    cam.current.scale = Math.max(0.2, Math.min(6, cam.current.scale * factor));
    setTooltip(null);
  }, []);

  // ── Touch events ──────────────────────────────────────────
  const onTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 2) {
      pinch.current = { on: true, d: Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY,
      )};
      drag.current.on = false;
    } else {
      pinch.current.on = false;
      drag.current = { on: true, sx: e.touches[0].clientX, sy: e.touches[0].clientY, cx: cam.current.x, cy: cam.current.y, moved: false };
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (e.touches.length === 2 && pinch.current.on) {
      const nd = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY,
      );
      cam.current.scale = Math.max(0.2, Math.min(6, cam.current.scale * (nd / pinch.current.d)));
      pinch.current.d = nd;
    } else if (e.touches.length === 1 && drag.current.on) {
      const dx = e.touches[0].clientX - drag.current.sx;
      const dy = e.touches[0].clientY - drag.current.sy;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.current.moved = true;
      cam.current.x = drag.current.cx + dx;
      cam.current.y = drag.current.cy + dy;
    }
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length < 2) pinch.current.on = false;
    if (e.touches.length === 0) {
      const was = drag.current.moved;
      drag.current.on = false; drag.current.moved = false;
      if (!was && e.changedTouches.length === 1) {
        const t = e.changedTouches[0];
        const w = s2w(t.clientX, t.clientY);
        const hit = hitTest(w.x, w.y);
        if (hit) {
          trackEvent('Trend Node Clicked', { keyword: hit.label });
          setSheet(hit.tag);
        }
      }
    }
  }, [s2w, hitTest]);

  // ── Bottom sheet ──────────────────────────────────────────
  useEffect(() => {
    if (sheet) requestAnimationFrame(() => setSheetVisible(true));
  }, [sheet]);

  const closeSheet = useCallback(() => {
    setSheetVisible(false);
    setTimeout(() => setSheet(null), 320);
  }, []);

  const sheetDragY = useRef<number | null>(null);
  const onSheetTS = (e: React.TouchEvent) => { sheetDragY.current = e.touches[0].clientY; };
  const onSheetTE = (e: React.TouchEvent) => {
    if (sheetDragY.current !== null && e.changedTouches[0].clientY - sheetDragY.current > 60) closeSheet();
    sheetDragY.current = null;
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <div style={{
      width: '100%',
      height: '100dvh',
      background: '#0A0A0F',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      position: 'relative',
    }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <header style={{
        flexShrink: 0,
        position: 'relative',
        zIndex: 50,
        background: 'rgba(10,10,15,0.90)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '0.5px solid rgba(255,255,255,0.07)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px 4px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Graph icon */}
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <circle cx="7.5" cy="7.5" r="2" fill="#F0EDE6" />
              <circle cx="2"   cy="2"   r="1.4" fill="rgba(180,178,230,0.7)" />
              <circle cx="13"  cy="2"   r="1.4" fill="rgba(180,178,230,0.7)" />
              <circle cx="2"   cy="13"  r="1.4" fill="rgba(180,178,230,0.7)" />
              <circle cx="13"  cy="13"  r="1.4" fill="rgba(180,178,230,0.7)" />
              <line x1="7.5" y1="7.5" x2="2"  y2="2"  stroke="rgba(120,118,180,0.6)" strokeWidth="0.8"/>
              <line x1="7.5" y1="7.5" x2="13" y2="2"  stroke="rgba(120,118,180,0.6)" strokeWidth="0.8"/>
              <line x1="7.5" y1="7.5" x2="2"  y2="13" stroke="rgba(120,118,180,0.6)" strokeWidth="0.8"/>
              <line x1="7.5" y1="7.5" x2="13" y2="13" stroke="rgba(120,118,180,0.6)" strokeWidth="0.8"/>
            </svg>
            <span style={{
              fontSize: 19,
              fontWeight: 800,
              color: '#F0EDE6',
              letterSpacing: '-0.5px',
            }}>
              TREND MAP
            </span>
          </div>
          <span style={{ fontSize: 10, color: '#5A5A6A' }}>
            드래그·핀치로 탐색
          </span>
        </div>
        <CategoryTabs
          active={category}
          onChange={(cat) => setCategory(cat)}
        />
      </header>

      {/* ── Canvas area ────────────────────────────────────── */}
      <div
        ref={wrapRef}
        style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}
      >
        <canvas
          ref={canvasRef}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            cursor: 'grab',
            touchAction: 'none',
            userSelect: 'none',
          }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
          onWheel={onWheel}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        />

        {/* Loading spinner */}
        {allArticles.length === 0 && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 12, pointerEvents: 'none',
          }}>
            <div style={{
              width: 28, height: 28,
              border: '1.5px solid #5A5A6A',
              borderTopColor: '#A0A0B0',
              borderRadius: '50%',
              animation: 'spin 0.9s linear infinite',
            }} />
            <span style={{ fontSize: 12, color: '#5A5A6A' }}>로딩 중…</span>
          </div>
        )}

        {/* Hover tooltip */}
        {tooltip && (
          <div style={{
            position: 'fixed',
            left: tooltip.x + 14,
            top: tooltip.y - 32,
            background: 'rgba(14,14,22,0.92)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            border: '0.5px solid rgba(255,255,255,0.12)',
            borderRadius: 8,
            padding: '5px 10px',
            pointerEvents: 'none',
            zIndex: 200,
            whiteSpace: 'nowrap',
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#F0EDE6' }}>
              {tooltip.label}
            </span>
            <span style={{
              fontSize: 11, color: '#8B8B9A', marginLeft: 6,
            }}>
              {tooltip.count}회
            </span>
          </div>
        )}

        {/* Zoom controls */}
        <div style={{
          position: 'absolute', right: 14, bottom: 88,
          display: 'flex', flexDirection: 'column', gap: 4, zIndex: 10,
        }}>
          {([{ l: '+', f: 1.3 }, { l: '−', f: 0.77 }] as const).map(({ l, f }) => (
            <button
              key={l}
              onClick={() => { cam.current.scale = Math.max(0.2, Math.min(6, cam.current.scale * f)); }}
              style={zoomBtnStyle}
            >
              {l}
            </button>
          ))}
          <button
            onClick={() => { cam.current = { x: 0, y: 0, scale: 1 }; }}
            title="뷰 초기화"
            style={{ ...zoomBtnStyle, fontSize: 13, color: '#5A5A6A' }}
          >
            ⊙
          </button>
        </div>

        {/* Node count badge */}
        {nodeCount > 0 && (
          <div style={{
            position: 'absolute', left: 14, bottom: 88,
            padding: '4px 10px', borderRadius: 20,
            background: 'rgba(14,14,20,0.75)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            border: '0.5px solid rgba(255,255,255,0.08)',
            fontSize: 10, color: '#5A5A6A', zIndex: 10,
          }}>
            {nodeCount}개 키워드
          </div>
        )}
      </div>

      {/* ── Sheet backdrop ─────────────────────────────────── */}
      {sheet && (
        <div
          onClick={closeSheet}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 100,
            opacity: sheetVisible ? 1 : 0,
            transition: 'opacity 0.3s ease',
          }}
        />
      )}

      {/* ── Bottom Sheet ───────────────────────────────────── */}
      {sheet && (
        <div
          ref={sheetRef}
          onTouchStart={onSheetTS}
          onTouchEnd={onSheetTE}
          style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            zIndex: 101,
            height: '62%',
            background: 'rgba(10,10,15,0.98)',
            borderRadius: '20px 20px 0 0',
            borderTop: '0.5px solid rgba(255,255,255,0.1)',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
            transform: sheetVisible ? 'translateY(0)' : 'translateY(100%)',
            transition: 'transform 0.32s cubic-bezier(0.32,0.72,0,1)',
          }}
        >
          {/* drag handle */}
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10 }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.18)' }} />
          </div>

          {/* sheet header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 16px 12px',
            borderBottom: '0.5px solid rgba(255,255,255,0.08)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 7, height: 7, borderRadius: '50%',
                background: sheet.count >= 4 ? '#fff' : 'rgba(180,178,230,0.8)',
                boxShadow: sheet.count >= 4 ? '0 0 8px rgba(255,255,255,0.5)' : 'none',
              }} />
              <span style={{ fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px' }}>
                #{sheet.keyword}
              </span>
              <span style={{
                fontSize: 11, color: '#8B8B9A',
                background: 'rgba(255,255,255,0.06)',
                padding: '2px 8px', borderRadius: 12,
                border: '0.5px solid rgba(255,255,255,0.1)',
              }}>
                {sheet.count}회 언급
              </span>
            </div>
            <button
              onClick={closeSheet}
              style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'rgba(255,255,255,0.07)', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#fff', fontSize: 16,
              }}
            >×</button>
          </div>

          {/* article list */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '8px 16px 32px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sheet.articles.map((article) => (
                <SheetCard
                  key={article.id}
                  article={article}
                  onClick={() => {
                    trackEvent('Article Clicked', { category: article.category, title: article.hook_title });
                    closeSheet();
                    setTimeout(() => router.push(`/feed/${article.id}`), 50);
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 6. SUB-COMPONENTS & STYLES
// ─────────────────────────────────────────────────────────────
const zoomBtnStyle: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 8,
  background: 'rgba(14,14,20,0.85)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '0.5px solid rgba(255,255,255,0.12)',
  color: '#A0A0B0', fontSize: 18, fontWeight: 300,
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  lineHeight: 1,
};

function SheetCard({ article, onClick }: { article: Article; onClick: () => void }) {
  const [err, setErr] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      style={{
        position: 'relative',
        aspectRatio: '5 / 2',
        overflow: 'hidden',
        borderRadius: 12,
        cursor: 'pointer',
        background: 'rgba(255,255,255,0.04)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
        flexShrink: 0,
      }}
    >
      {!err && article.image_url ? (
        <img
          src={article.image_url}
          alt={article.hook_title}
          onError={() => setErr(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div style={{
          width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28,
        }}>📰</div>
      )}

      {/* gradient */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to right, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.4) 55%, transparent 100%)',
        pointerEvents: 'none',
      }} />

      {/* text */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0, left: 0,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '10px 14px', maxWidth: '68%', gap: 5,
      }}>
        {article.keywords && article.keywords.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {article.keywords.slice(0, 2).map((kw, i) => (
              <span key={i} style={{
                display: 'inline-flex', alignItems: 'center',
                background: 'rgba(255,255,255,0.14)',
                backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
                color: '#fff', fontSize: 10, fontWeight: 600,
                padding: '2px 7px', borderRadius: 20,
              }}>#{kw}</span>
            ))}
          </div>
        )}
        <p style={{
          fontSize: 14, fontWeight: 700, color: '#fff',
          lineHeight: 1.4, letterSpacing: '-0.2px',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          wordBreak: 'keep-all',
          margin: 0,
        }}>
          {article.hook_title}
        </p>
      </div>
    </div>
  );
}
