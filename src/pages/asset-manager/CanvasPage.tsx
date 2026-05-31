import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Save, ChevronDown, ChevronRight,
  AlertTriangle, CheckSquare, RotateCw, X as XIcon, Users2, Copy, Ban, CheckCircle2, Eye, Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '../../store/authStore';
import { getRoom, getPlacementRules, saveLayout, reportTicket, getChecklist, updateChecklistEntry, setAssetCondition, getCompositeTemplates, createCompositeTemplate, deleteCompositeTemplate } from '../../api/canvas';
import type { CanvasAsset, PanelCategory, RoomDetail, CompositeTemplate } from '../../types';
import { Button } from '../../components/ui/Button';
import {
  toDirectUrl, ROOM_DEF_ID,
  defaultRoomGeometry, parseGeometry, serializeGeometry, geoBBox, pointInPolygon, nearestEdge,
  type RoomGeometry,
} from './canvasHelpers';
import RoomLayer from './RoomLayer';
import { DoorOpen, AppWindow, Square, Plug, Thermometer } from 'lucide-react';

// ── canvas constants ──────────────────────────────────────────────────────────
const CANVAS_W = 1400;
const CANVAS_H = 900;
const DEFAULT_W = 110;
const DEFAULT_H = 55;
const AUTOSAVE_MS = 15_000;
// Conditions that mean the asset has an open ticket — block re-report / deletion.
const ACTIVE_TICKET_CONDITIONS = new Set(['Pending', 'NotUsable']);
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;

// ── helper ────────────────────────────────────────────────────────────────────
function newId() { return crypto.randomUUID(); }

// Do a footprint (rx,ry,rw,rh) and an asset's rectangle overlap at all?
function rectsOverlap(rx: number, ry: number, rw: number, rh: number, a: CanvasAsset) {
  return rx < a.x + a.w && rx + rw > a.x && ry < a.y + a.h && ry + rh > a.y;
}

// Which room (if any) the canvas point belongs to — used to assign canvasRoomId and
// validate InWall placement. Counts the wall band (plus a small margin) as "inside",
// so dropping something right on a wall still registers as being in the room.
function roomIdAt(list: CanvasAsset[], px: number, py: number): string | null {
  const room = list.find(a => a.assetDefinitionId === ROOM_DEF_ID);
  if (!room) return null;
  const g = parseGeometry(room.metadata);
  if (!g) return null;
  const p = { x: px, y: py };
  if (pointInPolygon(p, g.vertices)) return room.id;
  return nearestEdge(g, p).dist <= g.wall ? room.id : null;
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function CanvasPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate    = useNavigate();
  const user        = useAuthStore(s => s.user);
  // Teachers & students are always view-only. The asset manager can also flip the canvas to
  // view-only via a toggle (and back to edit).
  const isViewer    = user?.role === 'Teacher' || user?.role === 'Student';
  const [manualReadOnly, setManualReadOnly] = useState(false);
  const readOnly    = isViewer || manualReadOnly;

  const qc = useQueryClient();

  const canvasRef     = useRef<HTMLDivElement>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<InteractionState | null>(null);
  const panRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan,  setPan]  = useState({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  const [assets,    setAssets]    = useState<CanvasAsset[]>([]);
  const [selected,  setSelected]  = useState<Set<string>>(new Set());
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [contextMenu, setContextMenu] = useState<{ assetId: string; x: number; y: number } | null>(null);
  const [reportModal, setReportModal]  = useState<{ assetId: string } | null>(null);
  const [reportDesc,  setReportDesc]   = useState('');
  const [checklistModal, setChecklistModal] = useState<{ assetId: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // ── load room ──────────────────────────────────────────────────────────────
  const { data: room, isLoading: roomLoading } = useQuery({
    queryKey: ['room', roomId],
    queryFn:  () => getRoom(roomId!),
    enabled:  !!roomId,
  });

  const { data: rules } = useQuery({
    queryKey: ['placement-rules'],
    queryFn:  getPlacementRules,
  });

  const { data: compositeTemplates = [], refetch: refetchComposites } = useQuery({
    queryKey: ['composite-templates'],
    queryFn:  getCompositeTemplates,
  });

  const [showCreateComposite, setShowCreateComposite] = useState(false);
  const [newCompositeName,    setNewCompositeName]    = useState('');

  // ── structural room (polygon) ───────────────────────────────────────────────
  const [structureTool, setStructureTool] = useState<'none' | 'door' | 'window' | 'socket' | 'radiator'>('none');
  const roomAsset = assets.find(a => a.assetDefinitionId === ROOM_DEF_ID) ?? null;
  const roomGeo   = roomAsset ? parseGeometry(roomAsset.metadata) : null;

  // Assets with any non-"Good" condition — surfaced in the left Issues panel.
  const issueAssets = assets.filter(a => a.condition !== 'Usable' && a.assetDefinitionId !== ROOM_DEF_ID);

  // Track which room object triggered the last full reset so we can tell
  // whether a re-run is caused by `room` changing or only `rules` changing.
  const prevRoomRef = useRef<typeof room | null>(null);

  useEffect(() => {
    if (!room) return;

    const defMap = new Map<string, { svgUrl: string; allowedLocations: string[]; category: string }>();
    rules?.assetsByCategory.forEach(cat =>
      cat.assetDefinitions.forEach(def =>
        defMap.set(def.id, { svgUrl: def.svgUrl, allowedLocations: def.allowedLocations, category: cat.category })
      )
    );

    if (prevRoomRef.current !== room) {
      // Room data changed (initial load or navigate-back refetch) — full reset from server.
      prevRoomRef.current = room;
      setAssets(room.layout.placedAssets.map(p => {
        const def = defMap.get(p.assetDefinitionId);
        return {
          id:                p.id,
          assetDefinitionId: p.assetDefinitionId,
          assetName:         p.assetName,
          svgUrl:            def?.svgUrl ?? '',
          allowedLocations:  def?.allowedLocations ?? [],
          category:          def?.category ?? (p.assetDefinitionId === ROOM_DEF_ID ? 'Infrastructure' : ''),
          x: p.x, y: p.y, w: p.width, h: p.height,
          rotation:   p.rotation,
          groupId:    p.groupId,
          groupLabel: p.groupLabel,
          condition:  p.condition,
          canvasRoomId: p.canvasRoomId,
          compositeId: p.compositeId ?? null,
          metadata:   p.metadata ?? null,
        };
      }));
    } else {
      // Only rules changed (background refetch) — enrich svgUrls without touching positions.
      setAssets(prev => prev.map(a => {
        const def = defMap.get(a.assetDefinitionId);
        return def ? { ...a, svgUrl: def.svgUrl, allowedLocations: def.allowedLocations, category: def.category } : a;
      }));
    }
  }, [room, rules]);

  // ── save ───────────────────────────────────────────────────────────────────
  const doSave = useCallback(async (list?: CanvasAsset[]) => {
    if (!roomId) return;
    setSaveStatus('saving');
    const toSave = list ?? assets;
    try {
      await saveLayout(roomId, toSave);
      setSaveStatus('saved');
      // Sync the RQ cache so navigating away and back shows the just-saved layout immediately.
      qc.setQueryData<RoomDetail>(['room', roomId], old =>
        !old ? old : {
          ...old,
          layout: {
            placedAssets: toSave.map(a => ({
              id: a.id,
              assetDefinitionId: a.assetDefinitionId,
              assetName: a.assetName,
              x: a.x, y: a.y, width: a.w, height: a.h,
              rotation: a.rotation,
              groupId: a.groupId,
              groupLabel: a.groupLabel,
              condition: a.condition,
              canvasRoomId: a.canvasRoomId,
              compositeId: a.compositeId,
              metadata: a.metadata,
            })),
          },
        }
      );
    } catch {
      setSaveStatus('unsaved');
      toast.error('Auto-save failed');
    }
  }, [roomId, assets, qc]);

  // auto-save
  useEffect(() => {
    const timer = setInterval(() => {
      if (saveStatus === 'unsaved') doSave();
    }, AUTOSAVE_MS);
    return () => clearInterval(timer);
  }, [saveStatus, doSave]);

  const markUnsaved = () => setSaveStatus('unsaved');

  // ── undo history ─────────────────────────────────────────────────────────────
  // We never mutate asset objects in place, so snapshotting the array reference
  // before each change is enough to restore it later.
  const historyRef = useRef<CanvasAsset[][]>([]);
  const pushHistory = () => {
    historyRef.current.push(assets);
    if (historyRef.current.length > 60) historyRef.current.shift();
  };
  const undo = () => {
    let prev = historyRef.current.pop();
    while (prev && prev === assets) prev = historyRef.current.pop();  // skip no-op snapshots
    if (!prev) { toast('Nothing to undo'); return; }
    setAssets(prev);
    setSelected(new Set());
    markUnsaved();
  };

  // ── room (polygon) operations ────────────────────────────────────────────────
  const addRoom = () => {
    if (assets.some(a => a.assetDefinitionId === ROOM_DEF_ID)) {
      toast.error('Only one room is allowed on the canvas.');
      return;
    }
    pushHistory();
    const geo = defaultRoomGeometry(CANVAS_W / 2, CANVAS_H / 2);
    const bbox = geoBBox(geo);
    setAssets(prev => [...prev, {
      id: newId(), assetDefinitionId: ROOM_DEF_ID,
      assetName: 'Room', svgUrl: '', allowedLocations: [],
      category: 'Infrastructure',
      x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h, rotation: 0,
      groupId: null, groupLabel: null, condition: 'Usable',
      canvasRoomId: null, compositeId: null,
      metadata: serializeGeometry(geo),
    }]);
    markUnsaved();
  };

  const updateRoomGeometry = (geo: RoomGeometry) => {
    const bbox = geoBBox(geo);
    setAssets(prev => prev.map(a =>
      a.assetDefinitionId === ROOM_DEF_ID
        ? { ...a, metadata: serializeGeometry(geo), x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h }
        : a
    ));
    markUnsaved();
  };

  // Move the whole room and every asset living inside it by (dx, dy).
  const translateRoom = (dx: number, dy: number) => {
    setAssets(prev => {
      const room = prev.find(a => a.assetDefinitionId === ROOM_DEF_ID);
      if (!room) return prev;
      const geo = parseGeometry(room.metadata);
      if (!geo) return prev;
      const moved: RoomGeometry = { ...geo, vertices: geo.vertices.map(v => ({ x: v.x + dx, y: v.y + dy })) };
      const meta = serializeGeometry(moved);
      return prev.map(a => {
        if (a.id === room.id) return { ...a, metadata: meta, x: a.x + dx, y: a.y + dy };
        if (a.canvasRoomId === room.id) return { ...a, x: a.x + dx, y: a.y + dy };
        return a;
      });
    });
    markUnsaved();
  };

  // Capture-phase document listener: zoom canvas on any scroll inside the canvas area.
  // Capture phase fires before passive optimisations on any child element.
  useEffect(() => {
    const handler = (e: WheelEvent) => {
      if (!canvasAreaRef.current?.contains(e.target as Node)) return;
      e.preventDefault();
      setZoom(z => parseFloat(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z - e.deltaY * 0.002)).toFixed(2)));
    };
    document.addEventListener('wheel', handler, { passive: false, capture: true });
    return () => document.removeEventListener('wheel', handler, { capture: true });
  }, []);

  // ── mouse interaction ─────────────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      // Right-click pan
      if (panRef.current) {
        const p = panRef.current;
        setPan({ x: p.startPanX + (e.clientX - p.startX), y: p.startPanY + (e.clientY - p.startY) });
      }

      const ia = interactionRef.current;
      if (!ia) return;
      const dx = (e.clientX - ia.startX) / zoomRef.current;
      const dy = (e.clientY - ia.startY) / zoomRef.current;

      if (ia.type === 'drag') {
        setAssets(prev => prev.map(a => {
          if (!ia.ids.includes(a.id)) return a;
          const orig = ia.origins.find(o => o.id === a.id)!;
          return { ...a, x: orig.x + dx, y: orig.y + dy };
        }));
      } else if (ia.type === 'resize') {
        // Compute new room dimensions once, reuse for both room and children.
        let nx = ia.ox, ny = ia.oy, nw = ia.ow, nh = ia.oh;
        if (ia.dir.includes('e')) nw = Math.max(40, ia.ow + dx);
        if (ia.dir.includes('w')) { nw = Math.max(40, ia.ow - dx); nx = ia.ox + (ia.ow - nw); }
        if (ia.dir.includes('s')) nh = Math.max(20, ia.oh + dy);
        if (ia.dir.includes('n')) { nh = Math.max(20, ia.oh - dy); ny = ia.oy + (ia.oh - nh); }
        const scaleX = nw / ia.ow;
        const scaleY = nh / ia.oh;
        setAssets(prev => prev.map(a => {
          if (a.id === ia.id) return { ...a, x: nx, y: ny, w: nw, h: nh };
          const child = ia.children.find(c => c.id === a.id);
          if (!child) return a;
          return {
            ...a,
            x: nx + (child.x - ia.ox) * scaleX,
            y: ny + (child.y - ia.oy) * scaleY,
            w: Math.max(20, child.w * scaleX),
            h: Math.max(10, child.h * scaleY),
          };
        }));
      } else if (ia.type === 'rotate') {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        setAssets(prev => prev.map(a => {
          if (a.id !== ia.id) return a;
          const cx = rect.left + (a.x + a.w / 2) * zoomRef.current;
          const cy = rect.top  + (a.y + a.h / 2) * zoomRef.current;
          const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI + 90;
          return { ...a, rotation: Math.round(angle) };
        }));
      } else if (ia.type === 'group-resize') {
        const scaleX = Math.max(0.1, (ia.bbox.w + dx) / ia.bbox.w);
        const scaleY = Math.max(0.1, (ia.bbox.h + dy) / ia.bbox.h);
        setAssets(prev => prev.map(a => {
          const orig = ia.origins.find(o => o.id === a.id);
          if (!orig) return a;
          return {
            ...a,
            x: ia.bbox.minX + (orig.x - ia.bbox.minX) * scaleX,
            y: ia.bbox.minY + (orig.y - ia.bbox.minY) * scaleY,
            w: Math.max(40, orig.w * scaleX),
            h: Math.max(20, orig.h * scaleY),
          };
        }));
      } else if (ia.type === 'group-rotate') {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const currentAngle = Math.atan2(e.clientY - rect.top - ia.cy * zoomRef.current, e.clientX - rect.left - ia.cx * zoomRef.current);
        const delta = currentAngle - ia.initialAngle;
        setAssets(prev => prev.map(a => {
          const orig = ia.origins.find(o => o.id === a.id);
          if (!orig) return a;
          const origCx = orig.x + orig.w / 2;
          const origCy = orig.y + orig.h / 2;
          const ddx = origCx - ia.cx;
          const ddy = origCy - ia.cy;
          return {
            ...a,
            x: (ia.cx + ddx * Math.cos(delta) - ddy * Math.sin(delta)) - a.w / 2,
            y: (ia.cy + ddx * Math.sin(delta) + ddy * Math.cos(delta)) - a.h / 2,
            rotation: Math.round(orig.rotation + delta * 180 / Math.PI),
          };
        }));
      }
    };

    const onUp = () => {
      if (interactionRef.current) {
        interactionRef.current = null;
        setAssets(prev => prev.map(a => {
          if (a.assetDefinitionId === ROOM_DEF_ID) return a;
          const newRoomId = roomIdAt(prev, a.x + a.w / 2, a.y + a.h / 2);
          return newRoomId === a.canvasRoomId ? a : { ...a, canvasRoomId: newRoomId };
        }));
        markUnsaved();
      }
      panRef.current = null;
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    };
  }, []);

  // ── drag from panel ────────────────────────────────────────────────────────
  const onCanvasDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (readOnly) return;   // teachers/students can't place assets

    // ── composite template drop ──────────────────────────────────────────────
    const rawComposite = e.dataTransfer.getData('composite-template');
    if (rawComposite) {
      pushHistory();
      const tpl: CompositeTemplate & { items: (CompositeTemplate['items'][0] & { svgUrl: string; allowedLocations: string[]; category: string })[] } = JSON.parse(rawComposite);
      const rect = canvasRef.current!.getBoundingClientRect();
      const ox = (e.clientX - rect.left) / zoomRef.current;
      const oy = (e.clientY - rect.top)  / zoomRef.current;
      const cid = newId();
      const roomUnderId = roomIdAt(assets, ox, oy);
      setAssets(prev => [
        ...prev,
        ...tpl.items.map(item => ({
          id: newId(),
          assetDefinitionId: item.assetDefinitionId,
          assetName: item.assetName,
          svgUrl: item.svgUrl,
          allowedLocations: item.allowedLocations,
          category: item.category,
          x: ox + item.relX, y: oy + item.relY,
          w: item.width, h: item.height,
          rotation: item.rotation,
          groupId: null, groupLabel: null,
          condition: 'Usable' as const,
          canvasRoomId: roomUnderId,
          compositeId: cid,
          metadata: null,
        })),
      ]);
      markUnsaved();
      return;
    }

    // ── single asset drop ────────────────────────────────────────────────────
    const raw = e.dataTransfer.getData('panel-asset');
    if (!raw) return;
    const def: { id: string; name: string; svgUrl: string; allowedLocations: string[]; category: string } = JSON.parse(raw);

    const rect = canvasRef.current!.getBoundingClientRect();
    // Map cursor → canvas coords. No bounds clamp: the working area can extend past the
    // nominal CANVAS_W/H (assets and the room may live anywhere on the plane), and clamping
    // would yank the drop back to the canvas corner.
    const x = (e.clientX - rect.left) / zoomRef.current - DEFAULT_W / 2;
    const y = (e.clientY - rect.top)  / zoomRef.current - DEFAULT_H / 2;

    const dropCx = x + DEFAULT_W / 2;
    const dropCy = y + DEFAULT_H / 2;

    // Placement rule: an OnSurface-only asset must overlap another placed asset
    // (the room floor itself doesn't count as a surface).
    if (def.allowedLocations.includes('OnSurface') &&
        !def.allowedLocations.some(l => l !== 'OnSurface') &&
        !assets.some(a => a.assetDefinitionId !== ROOM_DEF_ID && rectsOverlap(x, y, DEFAULT_W, DEFAULT_H, a))) {
      toast.error(`"${def.name}" can only be placed on top of another asset (OnSurface rule)`);
      return;
    }

    // Which room polygon (if any) the drop lands inside.
    // Used for: InWall validation + auto-assigning canvasRoomId for every asset.
    const roomUnderId = def.category !== 'Infrastructure'
      ? roomIdAt(assets, dropCx, dropCy)
      : null;

    // Placement rule: InWall must be inside a room/wall structure
    const isInWallOnly = def.allowedLocations.includes('InWall') &&
      !def.allowedLocations.some((l: string) => l !== 'InWall');
    if (isInWallOnly && !roomUnderId) {
      toast.error(`"${def.name}" must be placed inside a room or wall structure (InWall rule)`);
      return;
    }

    pushHistory();
    const existingCount = assets.filter(a => a.assetDefinitionId === def.id).length;
    const next: CanvasAsset = {
      id: newId(), assetDefinitionId: def.id,
      assetName: `${def.name} #${existingCount + 1}`,
      svgUrl: def.svgUrl, allowedLocations: def.allowedLocations,
      category: def.category ?? '',
      x, y, w: DEFAULT_W, h: DEFAULT_H, rotation: 0,
      groupId: null, groupLabel: null, condition: 'Usable',
      canvasRoomId: roomUnderId,
      compositeId: null,
      metadata: null,
    };
    setAssets(prev => [...prev, next]);
    markUnsaved();
  };

  // ── select / context menu ─────────────────────────────────────────────────
  const handleAssetMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (e.button !== 0) return;

    // Read-only viewers can select (to report / view checklist) but never drag.
    if (readOnly) { setSelected(new Set([id])); setContextMenu(null); return; }

    const a = assets.find(x => x.id === id)!;
    const compositeMembers = a.compositeId
      ? assets.filter(x => x.compositeId === a.compositeId).map(x => x.id)
      : null;

    if (e.shiftKey) {
      setSelected(prev => {
        const s = new Set(prev);
        if (compositeMembers) {
          const allIn = compositeMembers.every(mid => s.has(mid));
          allIn ? compositeMembers.forEach(mid => s.delete(mid)) : compositeMembers.forEach(mid => s.add(mid));
        } else {
          s.has(id) ? s.delete(id) : s.add(id);
        }
        return s;
      });
    } else {
      if (compositeMembers) {
        setSelected(new Set(compositeMembers));
      } else if (!selected.has(id)) {
        setSelected(new Set([id]));
      }
      const baseIds = compositeMembers ?? (a.groupId
        ? assets.filter(x => x.groupId === a.groupId).map(x => x.id)
        : [id]);
      // If any dragged asset is Infrastructure, pull all assets that live inside it.
      const infraIdSet = new Set(
        baseIds.filter(bid => assets.find(x => x.id === bid)?.category === 'Infrastructure')
      );
      const childIds = infraIdSet.size > 0
        ? assets
            .filter(x => x.canvasRoomId !== null && infraIdSet.has(x.canvasRoomId) && !baseIds.includes(x.id))
            .map(x => x.id)
        : [];
      const dragIds = [...baseIds, ...childIds];
      pushHistory();
      interactionRef.current = {
        type: 'drag',
        ids: dragIds,
        startX: e.clientX, startY: e.clientY,
        origins: assets.filter(x => dragIds.includes(x.id)).map(x => ({ id: x.id, x: x.x, y: x.y })),
      };
    }
    setContextMenu(null);
  };

  const handleAssetDoubleClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    // Double-click singles out this asset (even inside a composite) so its border shows
    // and the context menu acts on it specifically.
    setSelected(new Set([id]));
    const areaRect = canvasAreaRef.current!.getBoundingClientRect();
    setContextMenu({ assetId: id, x: e.clientX - areaRect.left, y: e.clientY - areaRect.top });
  };

  const handleResizeMouseDown = (e: React.MouseEvent, id: string, dir: ResizeDir) => {
    e.stopPropagation();
    const a = assets.find(x => x.id === id)!;
    if (a.compositeId) return;
    pushHistory();
    const children = a.category === 'Infrastructure'
      ? assets.filter(c => c.canvasRoomId === id).map(c => ({ id: c.id, x: c.x, y: c.y, w: c.w, h: c.h }))
      : [];
    interactionRef.current = { type: 'resize', id, startX: e.clientX, startY: e.clientY, ow: a.w, oh: a.h, ox: a.x, oy: a.y, dir, children };
  };

  const handleRotateMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const a = assets.find(x => x.id === id)!;
    if (a.compositeId) return;
    pushHistory();
    interactionRef.current = { type: 'rotate', id, startX: e.clientX, startY: e.clientY };
  };

  const handleGroupResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    pushHistory();
    const sel = assets.filter(a => selected.has(a.id));
    const minX = Math.min(...sel.map(a => a.x));
    const minY = Math.min(...sel.map(a => a.y));
    const maxX = Math.max(...sel.map(a => a.x + a.w));
    const maxY = Math.max(...sel.map(a => a.y + a.h));
    interactionRef.current = {
      type: 'group-resize',
      startX: e.clientX, startY: e.clientY,
      origins: sel.map(a => ({ id: a.id, x: a.x, y: a.y, w: a.w, h: a.h })),
      bbox: { minX, minY, w: maxX - minX, h: maxY - minY },
    };
  };

  const handleGroupRotateMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    pushHistory();
    const sel = assets.filter(a => selected.has(a.id));
    const minX = Math.min(...sel.map(a => a.x));
    const minY = Math.min(...sel.map(a => a.y));
    const maxX = Math.max(...sel.map(a => a.x + a.w));
    const maxY = Math.max(...sel.map(a => a.y + a.h));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    interactionRef.current = {
      type: 'group-rotate',
      startX: e.clientX, startY: e.clientY,
      origins: sel.map(a => ({ id: a.id, x: a.x, y: a.y, w: a.w, h: a.h, rotation: a.rotation })),
      cx, cy,
      initialAngle: Math.atan2(e.clientY - rect.top - cy * zoomRef.current, e.clientX - rect.left - cx * zoomRef.current),
    };
  };

  // ── group ─────────────────────────────────────────────────────────────────
  const groupSelected = () => {
    if (selected.size < 2) { toast('Select at least 2 assets to group'); return; }
    pushHistory();
    const gid = newId();
    const label = `Group ${Date.now().toString().slice(-4)}`;
    setAssets(prev => prev.map(a => selected.has(a.id) ? { ...a, groupId: gid, groupLabel: label } : a));
    markUnsaved();
    toast.success('Assets grouped');
  };

  const ungroupSelected = () => {
    pushHistory();
    setAssets(prev => prev.map(a => selected.has(a.id) ? { ...a, groupId: null, groupLabel: null } : a));
    markUnsaved();
    toast.success('Ungrouped');
  };

  const saveSelectedAsComposite = async (name: string) => {
    if (selected.size < 2) { toast('Select at least 2 assets to create a composite'); return; }
    const sel = assets.filter(a => selected.has(a.id));
    const minX = Math.min(...sel.map(a => a.x));
    const minY = Math.min(...sel.map(a => a.y));
    try {
      await createCompositeTemplate(name, sel.map(a => ({
        assetDefinitionId: a.assetDefinitionId,
        relX: a.x - minX, relY: a.y - minY,
        width: a.w, height: a.h,
        rotation: a.rotation,
      })));
      await refetchComposites();
      toast.success(`Composite "${name}" saved`);
      setShowCreateComposite(false);
      setNewCompositeName('');
    } catch { toast.error('Failed to save composite'); }
  };

  const deleteSelected = () => {
    const selectedList = assets.filter(a => selected.has(a.id));
    const blocked  = selectedList.filter(a => ACTIVE_TICKET_CONDITIONS.has(a.condition));
    const deletable = selectedList.filter(a => !ACTIVE_TICKET_CONDITIONS.has(a.condition));

    if (blocked.length > 0) {
      toast.error(
        blocked.length === 1
          ? `"${blocked[0].assetName}" has an active ticket — resolve it before removing`
          : `${blocked.length} assets have active tickets and cannot be removed`
      );
    }
    if (deletable.length === 0) return;

    pushHistory();
    const deletableIds = new Set(deletable.map(a => a.id));
    setAssets(prev => prev.filter(a => !deletableIds.has(a.id)));
    setSelected(new Set());
    markUnsaved();
  };

  // ── name / rotation edit ──────────────────────────────────────────────────
  const handleNameChange = (id: string, name: string) => {
    setAssets(prev => prev.map(a => a.id === id ? { ...a, assetName: name } : a));
    markUnsaved();
  };

  const handleRotationChange = (id: string, rotation: number) => {
    setAssets(prev => prev.map(a => a.id === id ? { ...a, rotation } : a));
    markUnsaved();
  };

  // ── duplicate ─────────────────────────────────────────────────────────────
  const duplicateAsset = (assetId: string) => {
    const src = assets.find(a => a.id === assetId);
    if (!src) return;
    pushHistory();
    const baseName = src.assetName.replace(/ #\d+$/, '');
    const sameDefCount = assets.filter(a => a.assetDefinitionId === src.assetDefinitionId).length;
    const next: CanvasAsset = {
      ...src,
      id: newId(),
      assetName: `${baseName} #${sameDefCount + 1}`,
      x: Math.min(CANVAS_W - src.w, src.x + 20),
      y: Math.min(CANVAS_H - src.h, src.y + 20),
      condition: 'Usable',
      groupId: null,
      groupLabel: null,
      compositeId: null,
    };
    setAssets(prev => [...prev, next]);
    markUnsaved();
  };

  // Duplicate every selected asset (Ctrl+D). The room can't be duplicated.
  // Group / composite links are remapped so a duplicated group stays its own group.
  const duplicateSelected = () => {
    const sel = assets.filter(a => selected.has(a.id) && a.assetDefinitionId !== ROOM_DEF_ID);
    if (sel.length === 0) return;
    pushHistory();
    const counts = new Map<string, number>();
    assets.forEach(a => counts.set(a.assetDefinitionId, (counts.get(a.assetDefinitionId) ?? 0) + 1));
    const groupMap = new Map<string, string>();
    const compMap  = new Map<string, string>();
    const remap = (map: Map<string, string>, id: string | null) => {
      if (!id) return null;
      if (!map.has(id)) map.set(id, newId());
      return map.get(id)!;
    };
    const dupes: CanvasAsset[] = sel.map(src => {
      const n = (counts.get(src.assetDefinitionId) ?? 0) + 1;
      counts.set(src.assetDefinitionId, n);
      const baseName = src.assetName.replace(/ #\d+$/, '');
      return {
        ...src,
        id: newId(),
        assetName: `${baseName} #${n}`,
        x: src.x + 24, y: src.y + 24,
        condition: 'Usable',
        groupId: remap(groupMap, src.groupId),
        compositeId: remap(compMap, src.compositeId),
      };
    });
    setAssets(prev => [...prev, ...dupes]);
    setSelected(new Set(dupes.map(d => d.id)));
    markUnsaved();
  };

  // Center the view on an asset (and select it) so the user can see it — handy when
  // the working area has drifted far from the origin.
  const focusAsset = (id: string) => {
    const a = assets.find(x => x.id === id);
    if (!a) return;
    const targetZoom = Math.max(zoom, 1);
    const ax = a.x + a.w / 2;
    const ay = a.y + a.h / 2;
    setZoom(targetZoom);
    setPan({ x: -(ax - CANVAS_W / 2) * targetZoom, y: -(ay - CANVAS_H / 2) * targetZoom });
    setSelected(new Set([id]));
    setContextMenu(null);
  };

  // Directly set an asset's usable/not-usable condition on the canvas (always available to the AM,
  // including after a ticket is closed).
  const setCondition = async (assetId: string, condition: 'Usable' | 'NotUsable') => {
    if (!roomId) return;
    const prevAsset = assets.find(a => a.id === assetId);
    setAssets(prev => prev.map(a => a.id === assetId ? { ...a, condition } : a)); // optimistic
    try {
      await setAssetCondition(roomId, assetId, condition);
      qc.setQueryData<RoomDetail>(['room', roomId], old => !old ? old : {
        ...old,
        layout: { ...old.layout, placedAssets: old.layout.placedAssets.map(p => p.id === assetId ? { ...p, condition } : p) },
      });
      toast.success(condition === 'Usable' ? 'Marked usable' : 'Marked not usable');
    } catch (e: any) {
      setAssets(prev => prev.map(a => a.id === assetId ? { ...a, condition: prevAsset?.condition ?? 'Usable' } : a));
      toast.error(e?.response?.data?.message ?? 'Failed to update condition');
    }
  };

  // ── report / checklist ────────────────────────────────────────────────────
  const submitReport = useMutation({
    mutationFn: async () => {
      // Teachers/students can't save the layout (read-only) — and don't need to;
      // the asset already exists server-side. Asset managers persist any pending edits first.
      if (!readOnly) await doSave();
      await reportTicket(reportModal!.assetId, roomId!, room?.facultyId ?? '', reportDesc);
    },
    onSuccess: () => {
      toast.success('Ticket reported');
      setAssets(prev => prev.map(a =>
        a.id === reportModal!.assetId ? { ...a, condition: 'Pending' } : a
      ));
      qc.invalidateQueries({ queryKey: ['am-tickets'] });
      qc.invalidateQueries({ queryKey: ['am-action-count'] });
      setReportModal(null);
      setReportDesc('');
      setContextMenu(null);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to report'),
  });

  // ── keyboard shortcuts: Del = delete, Ctrl/Cmd+Z = undo, Ctrl/Cmd+D = duplicate ──
  const kbRef = useRef({ deleteSelected, duplicateSelected, undo, selectedSize: selected.size });
  kbRef.current = { deleteSelected, duplicateSelected, undo, selectedSize: selected.size };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (readOnly) return;   // teachers/students can't edit
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); kbRef.current.undo(); return; }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); kbRef.current.duplicateSelected(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && kbRef.current.selectedSize > 0) {
        e.preventDefault(); kbRef.current.deleteSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (roomLoading) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-100">
      <svg className="w-8 h-8 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
      </svg>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex overflow-hidden bg-gray-100">
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="fixed top-0 left-0 right-0 z-30 bg-white border-b border-gray-200 h-12 flex items-center gap-3 px-4">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-gray-100">
          <ArrowLeft size={18} />
        </button>
        <span className="font-semibold text-gray-900 text-sm">{room?.name ?? '...'}</span>
        {readOnly ? (
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">View only</span>
        ) : (
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            saveStatus === 'saved'   ? 'bg-green-100 text-green-700' :
            saveStatus === 'saving'  ? 'bg-blue-100 text-blue-700' :
            'bg-amber-100 text-amber-700'}`}>
            {saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'saving' ? 'Saving…' : '● Unsaved'}
          </span>
        )}
        <div className="flex-1" />
        {!readOnly && selected.size >= 2 && (
          <Button size="sm" variant="secondary" onClick={groupSelected}>
            <Users2 size={13} /> Group
          </Button>
        )}
        {!readOnly && selected.size >= 1 && (
          <>
            <Button size="sm" variant="secondary" onClick={ungroupSelected}>Ungroup</Button>
            <Button
              size="sm" variant="danger" onClick={deleteSelected}
              disabled={assets.filter(a => selected.has(a.id)).every(a => ACTIVE_TICKET_CONDITIONS.has(a.condition))}
            >
              Delete
            </Button>
          </>
        )}
        <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-1">
          <button onClick={() => setZoom(z => parseFloat(Math.max(ZOOM_MIN, z - 0.1).toFixed(1)))} className="px-2 py-1 text-sm hover:bg-gray-100 rounded">−</button>
          <button onClick={() => setZoom(1)} className="text-xs text-gray-500 w-10 text-center hover:text-gray-800">{Math.round(zoom * 100)}%</button>
          <button onClick={() => setZoom(z => parseFloat(Math.min(ZOOM_MAX, z + 0.1).toFixed(1)))} className="px-2 py-1 text-sm hover:bg-gray-100 rounded">+</button>
        </div>
        {/* Asset manager: flip between view-only and edit */}
        {!isViewer && (
          <Button size="sm" variant="secondary" onClick={() => { setManualReadOnly(v => !v); setSelected(new Set()); }}>
            {manualReadOnly ? <><Pencil size={13} /> Edit</> : <><Eye size={13} /> View only</>}
          </Button>
        )}
        {!readOnly && (
          <Button size="sm" onClick={() => doSave()}>
            <Save size={13} /> Save
          </Button>
        )}
      </div>

      {/* ── Left panel: reported / problem assets ────────────────────────── */}
      <div className="w-56 bg-white border-r border-gray-200 pt-12 flex flex-col overflow-hidden flex-shrink-0">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
            <AlertTriangle size={13} className="text-amber-500" />
            Issues
            {issueAssets.length > 0 && (
              <span className="ml-auto bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                {issueAssets.length}
              </span>
            )}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">Click to locate the asset</p>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {issueAssets.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-xs text-gray-300">No reported assets</p>
            </div>
          ) : (
            issueAssets.map(a => {
              const s = a.condition === 'Pending'
                ? { label: 'Pending', dot: 'bg-amber-400', text: 'text-amber-700' }
                : { label: 'Not usable', dot: 'bg-red-500', text: 'text-red-600' };
              return (
                <button
                  key={a.id}
                  onClick={() => focusAsset(a.id)}
                  className={`w-full text-left px-4 py-2.5 border-b border-gray-50 hover:bg-gray-50 transition-colors flex items-center gap-2.5 ${
                    selected.has(a.id) ? 'bg-blue-50' : ''
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-gray-800 truncate">{a.assetName}</span>
                    <span className={`text-[11px] ${s.text}`}>{s.label}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Canvas area — fills full viewport, no scroll ─────────────────── */}
      <div
        ref={canvasAreaRef}
        className="flex-1 overflow-hidden pt-12 relative"
        style={{ background: dragOver ? '#dbeafe' : '#e5edf2' }}
        onContextMenu={e => e.preventDefault()}
        onMouseDown={e => {
          if (e.button === 2)
            panRef.current = { startX: e.clientX, startY: e.clientY, startPanX: pan.x, startPanY: pan.y };
        }}
      >
        {/* Grid — full viewport */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#94a3b8" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Canvas — centered, panned and scaled */}
        <div
          ref={canvasRef}
          style={{
            width: CANVAS_W, height: CANVAS_H,
            position: 'absolute',
            left: '50%', top: '50%',
            transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
            transformOrigin: 'center center',
          }}
          onDrop={onCanvasDrop}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onMouseDown={() => { setSelected(new Set()); setContextMenu(null); }}
        >
          {/* Structural room (polygon floor + walls + doors/windows) */}
          {roomAsset && roomGeo && (
            <RoomLayer
              geo={roomGeo}
              zoom={zoom}
              selected={selected.has(roomAsset.id)}
              tool={structureTool}
              width={CANVAS_W}
              height={CANVAS_H}
              onGeometryChange={updateRoomGeometry}
              onTranslate={translateRoom}
              onSelect={() => { if (!readOnly) { setSelected(new Set([roomAsset.id])); setContextMenu(null); } }}
              onToolConsumed={() => setStructureTool('none')}
              onInteractStart={pushHistory}
              readOnly={readOnly}
            />
          )}

          {/* Placed assets (the room is drawn by RoomLayer, so skip it here) */}
          {assets.filter(a => a.assetDefinitionId !== ROOM_DEF_ID).map(a => (
            <PlacedAssetEl
              key={a.id}
              asset={a}
              isSelected={selected.has(a.id)}
              showHandles={!readOnly && selected.size === 1}
              zoom={zoom}
              onMouseDown={handleAssetMouseDown}
              onDoubleClick={handleAssetDoubleClick}
              onResizeMouseDown={handleResizeMouseDown}
              onRotateMouseDown={handleRotateMouseDown}
              onNameChange={handleNameChange}
              onRotationChange={handleRotationChange}
            />
          ))}

          {/* Group selection box — shown when 2+ assets selected */}
          {selected.size > 1 && (
            <GroupSelectionBox
              assets={assets.filter(a => selected.has(a.id))}
              onResizeMouseDown={handleGroupResizeMouseDown}
              onRotateMouseDown={handleGroupRotateMouseDown}
              zoom={zoom}
            />
          )}

          {/* Empty hint */}
          {assets.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p className="text-gray-300 text-lg font-medium">Drag assets from the panel →</p>
            </div>
          )}

        </div>

        {/* Context menu — outside canvasRef so it is never affected by zoom */}
        <AnimatePresence>
          {contextMenu && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{ position: 'absolute', left: contextMenu.x, top: contextMenu.y, zIndex: 50 }}
              className="bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden w-44"
            >
              {(() => {
                const ctxAsset = assets.find(a => a.id === contextMenu.assetId);
                const isInfrastructure = ctxAsset?.category === 'Infrastructure';
                // Teachers/students can only report a usable asset; the asset manager can always report
                // (e.g. an asset she marked not-usable). Backend still blocks a duplicate open ticket.
                const blockReport = isViewer && ctxAsset?.condition !== 'Usable';
                return !isInfrastructure ? (
                  <button
                    disabled={blockReport}
                    className={`flex items-center gap-2.5 w-full px-4 py-3 text-sm transition-colors ${
                      blockReport
                        ? 'opacity-40 cursor-not-allowed text-gray-400'
                        : 'hover:bg-red-50 hover:text-red-600'
                    }`}
                    onClick={() => { if (!blockReport) { setReportModal({ assetId: contextMenu.assetId }); setContextMenu(null); } }}
                  >
                    <AlertTriangle size={15} className={blockReport ? 'text-gray-300' : 'text-red-500'} />
                    {blockReport ? 'Not reportable' : 'Report Issue'}
                  </button>
                ) : null;
              })()}
              {/* Always-available usable/not-usable toggle (AM, regular assets) */}
              {!readOnly && (() => {
                const ctxAsset = assets.find(a => a.id === contextMenu.assetId);
                if (!ctxAsset || ctxAsset.category === 'Infrastructure') return null;
                const usable = ctxAsset.condition === 'Usable';
                return (
                  <button
                    className="flex items-center gap-2.5 w-full px-4 py-3 text-sm transition-colors border-t border-gray-50 hover:bg-gray-50"
                    onClick={() => { setCondition(contextMenu.assetId, usable ? 'NotUsable' : 'Usable'); setContextMenu(null); }}
                  >
                    {usable
                      ? <><Ban size={15} className="text-red-500" /> Mark Not Usable</>
                      : <><CheckCircle2 size={15} className="text-green-600" /> Mark Usable</>}
                  </button>
                );
              })()}
              {!readOnly && (
                <button
                  className="flex items-center gap-2.5 w-full px-4 py-3 text-sm hover:bg-green-50 hover:text-green-600 transition-colors border-t border-gray-50"
                  onClick={() => { duplicateAsset(contextMenu.assetId); setContextMenu(null); }}
                >
                  <Copy size={15} className="text-green-500" /> Duplicate
                </button>
              )}
              <button
                className="flex items-center gap-2.5 w-full px-4 py-3 text-sm hover:bg-blue-50 hover:text-blue-600 transition-colors border-t border-gray-50"
                onClick={async () => { if (!readOnly && saveStatus === 'unsaved') await doSave(); setChecklistModal({ assetId: contextMenu.assetId }); setContextMenu(null); }}
              >
                <CheckSquare size={15} className="text-blue-500" /> View Checklist
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Right panel (editing tools — hidden for read-only viewers) ──────── */}
      {!readOnly && (
      <div className="w-64 bg-white border-l border-gray-200 pt-12 flex flex-col overflow-hidden flex-shrink-0">
        {/* Structure section */}
        <div className="border-b border-gray-100">
          <div className="px-4 py-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Structure</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {roomAsset ? 'Drag corners to reshape · drag walls to add openings' : 'Add a room to start'}
            </p>
          </div>
          <div className="px-3 pb-3 grid grid-cols-3 gap-1.5">
            <button
              onClick={addRoom}
              disabled={!!roomAsset}
              className="flex flex-col items-center gap-1 py-2 rounded-lg border border-gray-200 text-gray-600 hover:border-blue-300 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Square size={16} />
              <span className="text-[11px]">Room</span>
            </button>
            <button
              onClick={() => setStructureTool(t => t === 'door' ? 'none' : 'door')}
              disabled={!roomAsset}
              className={`flex flex-col items-center gap-1 py-2 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                structureTool === 'door' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-blue-300 hover:bg-blue-50'
              }`}
            >
              <DoorOpen size={16} />
              <span className="text-[11px]">Door</span>
            </button>
            <button
              onClick={() => setStructureTool(t => t === 'window' ? 'none' : 'window')}
              disabled={!roomAsset}
              className={`flex flex-col items-center gap-1 py-2 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                structureTool === 'window' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-blue-300 hover:bg-blue-50'
              }`}
            >
              <AppWindow size={16} />
              <span className="text-[11px]">Window</span>
            </button>
            <button
              onClick={() => setStructureTool(t => t === 'socket' ? 'none' : 'socket')}
              disabled={!roomAsset}
              className={`flex flex-col items-center gap-1 py-2 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                structureTool === 'socket' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-600 hover:border-emerald-300 hover:bg-emerald-50'
              }`}
            >
              <Plug size={16} />
              <span className="text-[11px]">Socket</span>
            </button>
            <button
              onClick={() => setStructureTool(t => t === 'radiator' ? 'none' : 'radiator')}
              disabled={!roomAsset}
              className={`flex flex-col items-center gap-1 py-2 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                structureTool === 'radiator' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-600 hover:border-orange-300 hover:bg-orange-50'
              }`}
            >
              <Thermometer size={16} />
              <span className="text-[11px]">Radiator</span>
            </button>
          </div>
          {structureTool !== 'none' && (
            <p className="px-4 pb-3 -mt-1 text-[11px] text-blue-600">
              Click a wall to place the {structureTool}. Double-click it to remove it.
            </p>
          )}
        </div>

        {/* Composites section */}
        <div className="border-b border-gray-100">
          <div className="px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Composites</p>
              <p className="text-xs text-gray-400 mt-0.5">Drag to place a locked group</p>
            </div>
            {user?.role === 'SuperAdmin' && selected.size >= 2 && (
              <button
                onClick={() => setShowCreateComposite(true)}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                title="Save selection as composite"
              >+ Save
              </button>
            )}
          </div>
          {showCreateComposite && (
            <div className="px-3 pb-3 flex gap-1">
              <input
                autoFocus
                className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="Template name…"
                value={newCompositeName}
                onChange={e => setNewCompositeName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveSelectedAsComposite(newCompositeName); if (e.key === 'Escape') { setShowCreateComposite(false); setNewCompositeName(''); } }}
              />
              <button onClick={() => saveSelectedAsComposite(newCompositeName)} className="text-xs bg-blue-500 text-white px-2 rounded hover:bg-blue-600">Save</button>
            </div>
          )}
          <div className="px-3 pb-2 space-y-1 max-h-40 overflow-y-auto">
            {compositeTemplates.map(tpl => {
              const allDefs = rules?.assetsByCategory.flatMap(c => c.assetDefinitions.map(d => ({ ...d, category: c.category }))) ?? [];
              const enriched = {
                ...tpl,
                items: tpl.items.map(item => {
                  const def = allDefs.find(d => d.id === item.assetDefinitionId);
                  return { ...item, svgUrl: def?.svgUrl ?? '', allowedLocations: def?.allowedLocations ?? [], category: def?.category ?? '' };
                }),
              };
              return (
                <div
                  key={tpl.id}
                  draggable
                  onDragStart={e => e.dataTransfer.setData('composite-template', JSON.stringify(enriched))}
                  className="flex items-center justify-between gap-2 p-2 rounded-lg border border-purple-100 bg-purple-50 hover:border-purple-300 cursor-grab active:cursor-grabbing select-none"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-purple-800 truncate">{tpl.name}</p>
                    <p className="text-xs text-purple-400">{tpl.items.length} assets</p>
                  </div>
                  {user?.role === 'SuperAdmin' && (
                    <button
                      onClick={async e => { e.stopPropagation(); await deleteCompositeTemplate(tpl.id); refetchComposites(); }}
                      className="text-purple-300 hover:text-red-400 flex-shrink-0"
                    ><XIcon size={12} /></button>
                  )}
                </div>
              );
            })}
            {compositeTemplates.length === 0 && (
              <p className="text-xs text-gray-300 py-1">No composites yet</p>
            )}
          </div>
        </div>

        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Assets</p>
          <p className="text-xs text-gray-400 mt-0.5">Drag onto the canvas</p>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {(rules?.assetsByCategory ?? []).map(cat => (
            <CategoryAccordion key={cat.category} category={cat} />
          ))}
        </div>
      </div>
      )}

      {/* ── Report modal ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {reportModal && (
          <Modal title="Report Issue" onClose={() => { setReportModal(null); setReportDesc(''); }}>
            <p className="text-sm text-gray-500 mb-4">
              The layout will be saved automatically before submitting the report.
            </p>
            <textarea
              value={reportDesc}
              onChange={e => setReportDesc(e.target.value)}
              placeholder="Describe the issue…"
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            {reportDesc.trim() === '' && submitReport.isError === false && (
              <p className="text-xs text-gray-400 mt-1">A description is required.</p>
            )}
            <div className="flex gap-3 mt-4">
              <Button variant="secondary" className="flex-1" onClick={() => { setReportModal(null); setReportDesc(''); }}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                loading={submitReport.isPending}
                disabled={reportDesc.trim() === ''}
                onClick={() => submitReport.mutate()}
              >
                <AlertTriangle size={14} /> Submit Report
              </Button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* ── Checklist modal ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {checklistModal && (
          <ChecklistModalPanel assetId={checklistModal.assetId} readOnly={readOnly} onClose={() => setChecklistModal(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Group selection box ───────────────────────────────────────────────────────
function GroupSelectionBox({ assets, onResizeMouseDown, onRotateMouseDown, zoom }: {
  assets: CanvasAsset[];
  onResizeMouseDown: (e: React.MouseEvent) => void;
  onRotateMouseDown: (e: React.MouseEvent) => void;
  zoom: number;
}) {
  const minX = Math.min(...assets.map(a => a.x));
  const minY = Math.min(...assets.map(a => a.y));
  const maxX = Math.max(...assets.map(a => a.x + a.w));
  const maxY = Math.max(...assets.map(a => a.y + a.h));
  const pad  = 10 / zoom;
  const rh   = 24 / zoom;
  const rs   = 16 / zoom;
  return (
    <div
      style={{ position: 'absolute', left: minX - pad, top: minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2, zIndex: 25, pointerEvents: 'none' }}
      className="border-2 border-blue-400 border-dashed rounded-lg"
    >
      <div
        style={{ position: 'absolute', top: -(rh + 6 / zoom), left: '50%', transform: 'translateX(-50%)', width: rh, height: rh, borderRadius: '50%', pointerEvents: 'all' }}
        className="bg-blue-500 flex items-center justify-center cursor-grab hover:bg-blue-600 shadow"
        onMouseDown={onRotateMouseDown}
      >
        <RotateCw size={12 / zoom} className="text-white" />
      </div>
      <div
        style={{ position: 'absolute', bottom: -rs / 2, right: -rs / 2, width: rs, height: rs, borderRadius: 2 / zoom, pointerEvents: 'all' }}
        className="bg-blue-500 cursor-se-resize shadow"
        onMouseDown={onResizeMouseDown}
      />
    </div>
  );
}

// ── Placed asset element ──────────────────────────────────────────────────────
interface PlacedAssetElProps {
  asset: CanvasAsset;
  isSelected: boolean;
  showHandles: boolean;
  zoom: number;
  onMouseDown: (e: React.MouseEvent, id: string) => void;
  onDoubleClick: (e: React.MouseEvent, id: string) => void;
  onResizeMouseDown: (e: React.MouseEvent, id: string, dir: ResizeDir) => void;
  onRotateMouseDown: (e: React.MouseEvent, id: string) => void;
  onNameChange: (id: string, name: string) => void;
  onRotationChange: (id: string, rotation: number) => void;
}

function PlacedAssetEl({ asset: a, isSelected, showHandles, zoom, onMouseDown, onDoubleClick, onResizeMouseDown, onRotateMouseDown, onNameChange, onRotationChange }: PlacedAssetElProps) {
  // Three states: usable = no border, pending = amber, not usable = red.
  const conditionBorder = a.condition === 'Usable'  ? 'border-transparent'
    : a.condition === 'Pending'                     ? 'border-amber-400'
    : 'border-red-500';

  const zIndex = a.category === 'Infrastructure'                                        ? 1
    : a.allowedLocations.includes('UnderSurface')                                       ? 3
    : a.allowedLocations.length > 0 && a.allowedLocations.every(l => l === 'OnSurface') ? 10
    : a.allowedLocations.includes('OnCeiling')                                          ? 20
    : 5;

  // Handle sizes in canvas coords so they appear constant on screen regardless of zoom.
  const hs   = 20 / zoom;   // resize handle visible size
  const hit  = 36 / zoom;   // invisible hit area around each handle
  const hito = -18 / zoom;  // hit area offset (half of hit)
  const rh   = 24 / zoom;   // rotation handle diameter
  const rOff = -(rh + 6 / zoom); // rotation handle top offset

  return (
    // Outer wrapper: handles positioning + rotation. NO overflow-hidden so handles are never clipped.
    <div
      style={{
        position: 'absolute',
        left: a.x, top: a.y,
        width: a.w, height: a.h,
        transform: `rotate(${a.rotation}deg)`,
        transformOrigin: 'center center',
        cursor: 'move',
        userSelect: 'none',
        zIndex,
      }}
      onMouseDown={e => onMouseDown(e, a.id)}
      onDoubleClick={e => onDoubleClick(e, a.id)}
    >
      {/* Inner visual container: border + rounded corners + overflow-hidden for the image only.
          A composite member shows its blue border only when singled out (size-1 selection via
          double-click); when the whole composite is selected the group box covers it instead. */}
      <div
        className={`w-full h-full rounded border-2 overflow-hidden transition-shadow ${
          isSelected && (!a.compositeId || showHandles) ? 'border-blue-500 shadow-lg shadow-blue-200' : conditionBorder
        }`}
      >
        <img
          key={a.svgUrl}
          src={toDirectUrl(a.svgUrl)}
          alt={a.assetName}
          draggable={false}
          className="block w-full h-full object-fill pointer-events-none"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      </div>

      {/* Group badge */}
      {a.groupLabel && (
        <div style={{ position: 'absolute', top: -20 / zoom, left: 0 }} className="pointer-events-none">
          <span style={{ fontSize: 12 / zoom, padding: `0 ${4 / zoom}px` }} className="bg-violet-100 text-violet-700 rounded">{a.groupLabel}</span>
        </div>
      )}

      {/* Name + rotation inputs — below the asset (not for composite members) */}
      {isSelected && showHandles && !a.compositeId && (
        <div
          style={{ position: 'absolute', bottom: -(54 / zoom), left: 0, right: 0 }}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        >
          <input
            style={{ fontSize: 12 / zoom, height: 20 / zoom, padding: `0 ${4 / zoom}px`, borderRadius: 4 / zoom, borderWidth: 1 / zoom }}
            className="bg-white border-blue-300 text-center w-full focus:outline-none text-gray-700"
            value={a.assetName}
            onChange={e => onNameChange(a.id, e.target.value)}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 / zoom, marginTop: 3 / zoom }}>
            <input
              type="number"
              style={{ fontSize: 11 / zoom, height: 18 / zoom, padding: `0 ${4 / zoom}px`, borderRadius: 4 / zoom, borderWidth: 1 / zoom, width: 54 / zoom }}
              className="bg-white border-blue-300 text-center focus:outline-none text-gray-700"
              value={a.rotation}
              onChange={e => onRotationChange(a.id, Number(e.target.value))}
            />
            <span style={{ fontSize: 11 / zoom, color: '#9ca3af' }}>°</span>
          </div>
        </div>
      )}

      {/* Handles — outside overflow-hidden so they are fully visible and clickable
          (composite members can't be individually resized/rotated, so no handles) */}
      {isSelected && showHandles && !a.compositeId && (
        <>
          {/* Rotation handle */}
          <div
            style={{ position: 'absolute', top: rOff, left: '50%', transform: 'translateX(-50%)', width: rh, height: rh, borderRadius: '50%' }}
            className="bg-blue-500 flex items-center justify-center cursor-grab hover:bg-blue-600 shadow"
            onMouseDown={e => onRotateMouseDown(e, a.id)}
          >
            <RotateCw size={12 / zoom} className="text-white" />
          </div>
          {/* Resize handles — large transparent hit area wrapping a visible dot */}
          {(['nw','n','ne','e','se','s','sw','w'] as ResizeDir[]).map(dir => {
            const vert  = dir.includes('n') ? { top: hito }  : dir.includes('s') ? { bottom: hito }  : { top: '50%', transform: 'translateY(-50%)' };
            const horiz = dir.includes('w') ? { left: hito } : dir.includes('e') ? { right: hito }   : { left: '50%', transform: dir.includes('n') || dir.includes('s') ? 'translateX(-50%)' : 'translateY(-50%)' };
            return (
              <div
                key={dir}
                style={{ position: 'absolute', width: hit, height: hit, display: 'flex', alignItems: 'center', justifyContent: 'center', ...vert, ...horiz }}
                className={`cursor-${dir}-resize`}
                onMouseDown={e => onResizeMouseDown(e, a.id, dir)}
              >
                <div style={{ width: hs, height: hs, borderRadius: 2 / zoom }} className="bg-blue-500 shadow pointer-events-none" />
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ── Category accordion ────────────────────────────────────────────────────────
function CategoryAccordion({ category }: { category: PanelCategory }) {
  const [open, setOpen] = useState(false);
  const { categoryColor } = useCategoryColor();

  return (
    <div className="border-b border-gray-50">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${categoryColor(category.category)}`} />
          {category.category}
          <span className="text-xs text-gray-400">({category.assetDefinitions.length})</span>
        </div>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2 space-y-1">
              {category.assetDefinitions.map(def => (
                <PanelAsset key={def.id} def={def} category={category.category} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PanelAsset({ def, category }: { def: { id: string; name: string; svgUrl: string; allowedLocations: string[] }; category: string }) {
  return (
    <div
      draggable
      onDragStart={e =>
        e.dataTransfer.setData('panel-asset', JSON.stringify({ ...def, category }))
      }
      className="flex items-center gap-2 p-2 rounded-lg border border-gray-100 hover:border-blue-300 hover:bg-blue-50 cursor-grab active:cursor-grabbing transition-all select-none"
    >
      <div className="w-10 h-10 flex-shrink-0 bg-gray-50 rounded-lg flex items-center justify-center overflow-hidden">
        <img
          src={toDirectUrl(def.svgUrl)}
          alt={def.name}
          className="w-8 h-8 object-contain"
          onError={e => { (e.target as HTMLImageElement).style.opacity = '0'; }}
          draggable={false}
        />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-800 truncate">{def.name}</p>
        <p className="text-xs text-gray-400 truncate">{def.allowedLocations.join(', ')}</p>
      </div>
    </div>
  );
}

// ── Checklist modal ───────────────────────────────────────────────────────────
function ChecklistModalPanel({ assetId, readOnly, onClose }: { assetId: string; readOnly?: boolean; onClose: () => void }) {
  const { data, refetch } = useQuery({
    queryKey: ['checklist', assetId],
    queryFn:  () => getChecklist(assetId),
  });

  const [toggling, setToggling] = useState<string | null>(null);

  const toggle = async (checklistId: string, checklistItemId: string, current: boolean) => {
    setToggling(checklistItemId);
    try {
      await updateChecklistEntry(checklistId, checklistItemId, !current);
      refetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Failed to update checklist');
    } finally {
      setToggling(null);
    }
  };

  return (
    <Modal title="Asset Checklist" onClose={onClose} wide>
      {!data ? (
        <p className="text-sm text-gray-400 py-4 text-center">Loading checklist…</p>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">Study year: <span className="font-medium text-gray-700">{data.studyYear}</span></p>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              data.checkedCount === data.totalCount ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {data.checkedCount}/{data.totalCount} checked
            </span>
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-thin">
            {data.entries.map(entry => (
              <label
                key={entry.id}
                className={`flex items-start gap-3 p-3 rounded-xl transition-colors ${readOnly ? '' : 'cursor-pointer'} ${
                  entry.isChecked ? 'bg-green-50' : 'bg-gray-50 hover:bg-gray-100'
                }`}
              >
                <input
                  type="checkbox"
                  checked={entry.isChecked}
                  disabled={readOnly || toggling === entry.checklistItemId}
                  onChange={() => { if (!readOnly) toggle(data.id, entry.checklistItemId, entry.isChecked); }}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500 flex-shrink-0 cursor-pointer disabled:cursor-not-allowed"
                />
                <div className="flex-1">
                  <p className={`text-sm ${entry.isChecked ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                    {entry.description}
                  </p>
                  {entry.isChecked && entry.checkedAtUtc && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Checked {new Date(entry.checkedAtUtc).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </label>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

// ── Generic modal ─────────────────────────────────────────────────────────────
function Modal({ title, children, onClose, wide }: {
  title: string; children: React.ReactNode; onClose: () => void; wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className={`relative bg-white rounded-2xl shadow-xl ${wide ? 'w-full max-w-lg' : 'w-full max-w-sm'} max-h-[90vh] overflow-y-auto`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <XIcon size={16} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </motion.div>
    </div>
  );
}

// ── Interaction state types ───────────────────────────────────────────────────
type ResizeDir = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
type InteractionState =
  | { type: 'drag';         ids: string[]; startX: number; startY: number; origins: { id: string; x: number; y: number }[] }
  | { type: 'resize';       id: string;   startX: number; startY: number; ow: number; oh: number; ox: number; oy: number; dir: ResizeDir; children: { id: string; x: number; y: number; w: number; h: number }[] }
  | { type: 'rotate';       id: string;   startX: number; startY: number }
  | { type: 'group-resize'; startX: number; startY: number; origins: { id: string; x: number; y: number; w: number; h: number }[]; bbox: { minX: number; minY: number; w: number; h: number } }
  | { type: 'group-rotate'; startX: number; startY: number; origins: { id: string; x: number; y: number; w: number; h: number; rotation: number }[]; cx: number; cy: number; initialAngle: number };

// ── Category colour helper ────────────────────────────────────────────────────
function useCategoryColor() {
  const map: Record<string, string> = {
    Electrical:    'bg-amber-400',
    Electrinical:  'bg-amber-400',
    Plumbing:      'bg-blue-400',
    Furniture:     'bg-green-400',
    Furnuture:     'bg-green-400',
    Infrastructure:'bg-purple-400',
  };
  return { categoryColor: (c: string) => map[c] ?? 'bg-gray-400' };
}
