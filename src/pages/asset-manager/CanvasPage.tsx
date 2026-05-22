import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Save, ChevronDown, ChevronRight,
  AlertTriangle, CheckSquare, RotateCw, X as XIcon, Users2
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '../../store/authStore';
import { getRoom, getPlacementRules, saveLayout, reportTicket, getChecklist, updateChecklistEntry } from '../../api/canvas';
import type { CanvasAsset, PanelCategory } from '../../types';
import { Button } from '../../components/ui/Button';
import { toDirectUrl } from './canvasHelpers';

// ── canvas constants ──────────────────────────────────────────────────────────
const CANVAS_W = 1400;
const CANVAS_H = 900;
const DEFAULT_W = 110;
const DEFAULT_H = 55;
const AUTOSAVE_MS = 15_000;
const ACTIVE_TICKET_CONDITIONS = new Set(['Reported', 'UnderMaintenance']);
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;

// ── helper ────────────────────────────────────────────────────────────────────
function newId() { return crypto.randomUUID(); }

function rectContains(a: CanvasAsset, px: number, py: number) {
  return px >= a.x && px <= a.x + a.w && py >= a.y && py <= a.y + a.h;
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function CanvasPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate    = useNavigate();
  const user        = useAuthStore(s => s.user);
  const facultyId   = user?.facultyId ?? '';

  const canvasRef     = useRef<HTMLDivElement>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<InteractionState | null>(null);
  const [zoom, setZoom] = useState(1);
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

  useEffect(() => {
    if (!room) return;
    setAssets(room.layout.placedAssets.map(p => ({
      id:                p.id,
      assetDefinitionId: p.assetDefinitionId,
      assetName:         p.assetName,
      svgUrl:            '',
      allowedLocations:  [],
      x: p.x, y: p.y, w: p.width, h: p.height,
      rotation: p.rotation,
      groupId:   p.groupId,
      groupLabel: p.groupLabel,
      condition: p.condition,
    })));
  }, [room]);

  // Enrich assets with svgUrl + allowedLocations from placement rules
  useEffect(() => {
    if (!rules) return;
    const defMap = new Map<string, { svgUrl: string; allowedLocations: string[] }>();
    rules.assetsByCategory.forEach(cat =>
      cat.assetDefinitions.forEach(def =>
        defMap.set(def.id, { svgUrl: def.svgUrl, allowedLocations: def.allowedLocations })
      )
    );
    setAssets(prev => prev.map(a => {
      const def = defMap.get(a.assetDefinitionId);
      return def ? { ...a, svgUrl: def.svgUrl, allowedLocations: def.allowedLocations } : a;
    }));
  }, [rules]);

  // ── save ───────────────────────────────────────────────────────────────────
  const doSave = useCallback(async (list?: CanvasAsset[]) => {
    if (!roomId) return;
    setSaveStatus('saving');
    try {
      await saveLayout(roomId, list ?? assets);
      setSaveStatus('saved');
    } catch {
      setSaveStatus('unsaved');
      toast.error('Auto-save failed');
    }
  }, [roomId, assets]);

  // auto-save
  useEffect(() => {
    const timer = setInterval(() => {
      if (saveStatus === 'unsaved') doSave();
    }, AUTOSAVE_MS);
    return () => clearInterval(timer);
  }, [saveStatus, doSave]);

  const markUnsaved = () => setSaveStatus('unsaved');

  // ── wheel zoom (Ctrl+scroll) ──────────────────────────────────────────────
  useEffect(() => {
    const el = canvasAreaRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom(z => parseFloat(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z - e.deltaY * 0.001)).toFixed(2)));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // ── mouse interaction ─────────────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
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
        setAssets(prev => prev.map(a => {
          if (a.id !== ia.id) return a;
          const nw = Math.max(40, ia.ow + dx);
          const nh = Math.max(20, ia.oh + dy);
          return { ...a, w: nw, h: nh };
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
      if (interactionRef.current) { interactionRef.current = null; markUnsaved(); }
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
    const raw = e.dataTransfer.getData('panel-asset');
    if (!raw) return;
    const def: { id: string; name: string; svgUrl: string; allowedLocations: string[] } = JSON.parse(raw);

    const rect = canvasRef.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(CANVAS_W - DEFAULT_W, (e.clientX - rect.left) / zoomRef.current - DEFAULT_W / 2));
    const y = Math.max(0, Math.min(CANVAS_H - DEFAULT_H, (e.clientY - rect.top)  / zoomRef.current - DEFAULT_H / 2));

    // Placement rule: OnSurface must land on another asset
    if (def.allowedLocations.includes('OnSurface') &&
        !def.allowedLocations.some(l => l !== 'OnSurface') &&
        !assets.some(a => rectContains(a, x + DEFAULT_W / 2, y + DEFAULT_H / 2))) {
      toast.error(`"${def.name}" can only be placed on top of another asset (OnSurface rule)`);
      return;
    }

    const next: CanvasAsset = {
      id: newId(), assetDefinitionId: def.id, assetName: def.name,
      svgUrl: def.svgUrl, allowedLocations: def.allowedLocations,
      x, y, w: DEFAULT_W, h: DEFAULT_H, rotation: 0,
      groupId: null, groupLabel: null, condition: 'Good',
    };
    setAssets(prev => [...prev, next]);
    markUnsaved();
  };

  // ── select / context menu ─────────────────────────────────────────────────
  const handleAssetMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (e.button !== 0) return;

    if (e.shiftKey) {
      setSelected(prev => {
        const s = new Set(prev);
        s.has(id) ? s.delete(id) : s.add(id);
        return s;
      });
    } else {
      if (!selected.has(id)) setSelected(new Set([id]));
      const a = assets.find(x => x.id === id)!;
      const groupIds = a.groupId
        ? assets.filter(x => x.groupId === a.groupId).map(x => x.id)
        : [id];
      interactionRef.current = {
        type: 'drag',
        ids: groupIds,
        startX: e.clientX, startY: e.clientY,
        origins: assets.filter(x => groupIds.includes(x.id)).map(x => ({ id: x.id, x: x.x, y: x.y })),
      };
    }
    setContextMenu(null);
  };

  const handleAssetDoubleClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const rect = canvasRef.current!.getBoundingClientRect();
    setContextMenu({ assetId: id, x: (e.clientX - rect.left) / zoomRef.current, y: (e.clientY - rect.top) / zoomRef.current });
  };

  const handleResizeMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const a = assets.find(x => x.id === id)!;
    interactionRef.current = { type: 'resize', id, startX: e.clientX, startY: e.clientY, ow: a.w, oh: a.h };
  };

  const handleRotateMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    interactionRef.current = { type: 'rotate', id, startX: e.clientX, startY: e.clientY };
  };

  const handleGroupResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
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
    const sel = assets.filter(a => selected.has(a.id));
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
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
    const gid = newId();
    const label = `Group ${Date.now().toString().slice(-4)}`;
    setAssets(prev => prev.map(a => selected.has(a.id) ? { ...a, groupId: gid, groupLabel: label } : a));
    markUnsaved();
    toast.success('Assets grouped');
  };

  const ungroupSelected = () => {
    setAssets(prev => prev.map(a => selected.has(a.id) ? { ...a, groupId: null, groupLabel: null } : a));
    markUnsaved();
    toast.success('Ungrouped');
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

    const deletableIds = new Set(deletable.map(a => a.id));
    setAssets(prev => prev.filter(a => !deletableIds.has(a.id)));
    setSelected(new Set());
    markUnsaved();
  };

  // ── report / checklist ────────────────────────────────────────────────────
  const submitReport = useMutation({
    mutationFn: async () => {
      await doSave();
      await reportTicket(reportModal!.assetId, roomId!, facultyId, reportDesc);
    },
    onSuccess: () => {
      toast.success('Ticket reported');
      // reflect the new condition immediately without a page refresh
      setAssets(prev => prev.map(a =>
        a.id === reportModal!.assetId ? { ...a, condition: 'Reported' } : a
      ));
      setReportModal(null);
      setReportDesc('');
      setContextMenu(null);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to report'),
  });

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
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          saveStatus === 'saved'   ? 'bg-green-100 text-green-700' :
          saveStatus === 'saving'  ? 'bg-blue-100 text-blue-700' :
          'bg-amber-100 text-amber-700'}`}>
          {saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'saving' ? 'Saving…' : '● Unsaved'}
        </span>
        <div className="flex-1" />
        {selected.size >= 2 && (
          <Button size="sm" variant="secondary" onClick={groupSelected}>
            <Users2 size={13} /> Group
          </Button>
        )}
        {selected.size >= 1 && (
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
        <Button size="sm" onClick={() => doSave()}>
          <Save size={13} /> Save
        </Button>
      </div>

      {/* ── Canvas area ───────────────────────────────────────────────────── */}
      <div ref={canvasAreaRef} className="flex-1 overflow-auto pt-12">
        <div className="flex items-center justify-center p-8" style={{ minHeight: '100%' }}>
          {/* Space-reservation div so the scroll area grows with zoom */}
          <div style={{ width: CANVAS_W * zoom, height: CANVAS_H * zoom, position: 'relative', flexShrink: 0 }}>
          <div
            ref={canvasRef}
            style={{ width: CANVAS_W, height: CANVAS_H, position: 'absolute', top: 0, left: 0, transform: `scale(${zoom})`, transformOrigin: '0 0', backgroundColor: dragOver ? '#dbeafe' : '#e5edf2' }}
            className={`rounded-xl shadow-lg border-2 transition-colors ${dragOver ? 'border-blue-400' : 'border-transparent'}`}
            onDrop={onCanvasDrop}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onMouseDown={() => { setSelected(new Set()); setContextMenu(null); }}
          >
            {/* Grid lines */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#94a3b8" strokeWidth="0.5"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>

            {/* Placed assets */}
            {assets.map(a => (
              <PlacedAssetEl
                key={a.id}
                asset={a}
                isSelected={selected.has(a.id)}
                showHandles={selected.size === 1}
                onMouseDown={handleAssetMouseDown}
                onDoubleClick={handleAssetDoubleClick}
                onResizeMouseDown={handleResizeMouseDown}
                onRotateMouseDown={handleRotateMouseDown}
              />
            ))}

            {/* Group selection box — shown when 2+ assets selected */}
            {selected.size > 1 && (
              <GroupSelectionBox
                assets={assets.filter(a => selected.has(a.id))}
                onResizeMouseDown={handleGroupResizeMouseDown}
                onRotateMouseDown={handleGroupRotateMouseDown}
              />
            )}

            {/* Empty hint */}
            {assets.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p className="text-gray-300 text-lg font-medium">Drag assets from the panel →</p>
              </div>
            )}

            {/* Context menu */}
            <AnimatePresence>
              {contextMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  style={{ position: 'absolute', left: contextMenu.x, top: contextMenu.y, zIndex: 50 }}
                  className="bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden w-44"
                >
                  {(() => {
                    const ctxAsset = assets.find(a => a.id === contextMenu.assetId);
                    const hasActiveTicket = ctxAsset && ACTIVE_TICKET_CONDITIONS.has(ctxAsset.condition);
                    return (
                      <button
                        disabled={!!hasActiveTicket}
                        className={`flex items-center gap-2.5 w-full px-4 py-3 text-sm transition-colors ${
                          hasActiveTicket
                            ? 'opacity-40 cursor-not-allowed text-gray-400'
                            : 'hover:bg-red-50 hover:text-red-600'
                        }`}
                        onClick={() => { if (!hasActiveTicket) { setReportModal({ assetId: contextMenu.assetId }); setContextMenu(null); } }}
                      >
                        <AlertTriangle size={15} className={hasActiveTicket ? 'text-gray-300' : 'text-red-500'} />
                        {hasActiveTicket ? 'Already Reported' : 'Report Issue'}
                      </button>
                    );
                  })()}
                  <button
                    className="flex items-center gap-2.5 w-full px-4 py-3 text-sm hover:bg-blue-50 hover:text-blue-600 transition-colors border-t border-gray-50"
                    onClick={async () => { if (saveStatus === 'unsaved') await doSave(); setChecklistModal({ assetId: contextMenu.assetId }); setContextMenu(null); }}
                  >
                    <CheckSquare size={15} className="text-blue-500" /> View Checklist
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          </div>{/* end space-reservation */}
        </div>
      </div>

      {/* ── Right panel ───────────────────────────────────────────────────── */}
      <div className="w-64 bg-white border-l border-gray-200 pt-12 flex flex-col overflow-hidden flex-shrink-0">
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
            <div className="flex gap-3 mt-4">
              <Button variant="secondary" className="flex-1" onClick={() => { setReportModal(null); setReportDesc(''); }}>
                Cancel
              </Button>
              <Button className="flex-1" loading={submitReport.isPending} onClick={() => submitReport.mutate()}>
                <AlertTriangle size={14} /> Submit Report
              </Button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* ── Checklist modal ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {checklistModal && (
          <ChecklistModalPanel assetId={checklistModal.assetId} onClose={() => setChecklistModal(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Group selection box ───────────────────────────────────────────────────────
function GroupSelectionBox({ assets, onResizeMouseDown, onRotateMouseDown }: {
  assets: CanvasAsset[];
  onResizeMouseDown: (e: React.MouseEvent) => void;
  onRotateMouseDown: (e: React.MouseEvent) => void;
}) {
  const minX = Math.min(...assets.map(a => a.x));
  const minY = Math.min(...assets.map(a => a.y));
  const maxX = Math.max(...assets.map(a => a.x + a.w));
  const maxY = Math.max(...assets.map(a => a.y + a.h));
  const pad  = 10;
  return (
    <div
      style={{ position: 'absolute', left: minX - pad, top: minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2, zIndex: 25, pointerEvents: 'none' }}
      className="border-2 border-blue-400 border-dashed rounded-lg"
    >
      <div
        style={{ position: 'absolute', top: -24, left: '50%', transform: 'translateX(-50%)', pointerEvents: 'all' }}
        className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center cursor-grab hover:bg-blue-600 shadow"
        onMouseDown={onRotateMouseDown}
      >
        <RotateCw size={12} className="text-white" />
      </div>
      <div
        style={{ position: 'absolute', bottom: -5, right: -5, pointerEvents: 'all' }}
        className="w-4 h-4 rounded-sm bg-blue-500 cursor-se-resize shadow"
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
  onMouseDown: (e: React.MouseEvent, id: string) => void;
  onDoubleClick: (e: React.MouseEvent, id: string) => void;
  onResizeMouseDown: (e: React.MouseEvent, id: string) => void;
  onRotateMouseDown: (e: React.MouseEvent, id: string) => void;
}

function PlacedAssetEl({ asset: a, isSelected, showHandles, onMouseDown, onDoubleClick, onResizeMouseDown, onRotateMouseDown }: PlacedAssetElProps) {
  const conditionBorder: Record<string, string> = {
    Good:     'border-transparent',
    Reported: 'border-red-400',
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: a.x, top: a.y,
        width: a.w, height: a.h,
        transform: `rotate(${a.rotation}deg)`,
        transformOrigin: 'center center',
        cursor: 'move',
        userSelect: 'none',
        zIndex: isSelected ? 20 : 10,
      }}
      className={`rounded border-2 transition-shadow ${
        isSelected ? 'border-blue-500 shadow-lg shadow-blue-200' : (conditionBorder[a.condition] ?? 'border-transparent')
      }`}
      onMouseDown={e => onMouseDown(e, a.id)}
      onDoubleClick={e => onDoubleClick(e, a.id)}
    >
      {/* SVG image */}
      <img
        src={toDirectUrl(a.svgUrl)}
        alt={a.assetName}
        draggable={false}
        className="w-full h-full object-contain p-1 pointer-events-none"
        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />

      {/* Label */}
      <div className="absolute -bottom-5 left-0 right-0 text-center pointer-events-none">
        <span className="text-xs text-gray-500 bg-white/80 px-1 rounded">{a.assetName}</span>
      </div>

      {/* Group badge */}
      {a.groupLabel && (
        <div className="absolute -top-5 left-0 pointer-events-none">
          <span className="text-xs bg-violet-100 text-violet-700 px-1 rounded">{a.groupLabel}</span>
        </div>
      )}

      {/* Reported badge */}
      {a.condition === 'Reported' && (
        <div className="absolute top-0 right-0 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center pointer-events-none">
          <span className="text-white text-xs leading-none font-bold">!</span>
        </div>
      )}

      {isSelected && showHandles && (
        <>
          {/* Rotation handle */}
          <div
            style={{ position: 'absolute', top: -24, left: '50%', transform: 'translateX(-50%)' }}
            className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center cursor-grab hover:bg-blue-600 shadow"
            onMouseDown={e => onRotateMouseDown(e, a.id)}
          >
            <RotateCw size={12} className="text-white" />
          </div>
          {/* Resize handle (bottom-right) */}
          <div
            style={{ position: 'absolute', bottom: -5, right: -5 }}
            className="w-4 h-4 rounded-sm bg-blue-500 cursor-se-resize shadow"
            onMouseDown={e => onResizeMouseDown(e, a.id)}
          />
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
                <PanelAsset key={def.id} def={def} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PanelAsset({ def }: { def: { id: string; name: string; svgUrl: string; allowedLocations: string[] } }) {
  return (
    <div
      draggable
      onDragStart={e =>
        e.dataTransfer.setData('panel-asset', JSON.stringify(def))
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
function ChecklistModalPanel({ assetId, onClose }: { assetId: string; onClose: () => void }) {
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
                className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                  entry.isChecked ? 'bg-green-50' : 'bg-gray-50 hover:bg-gray-100'
                }`}
              >
                <input
                  type="checkbox"
                  checked={entry.isChecked}
                  disabled={toggling === entry.checklistItemId}
                  onChange={() => toggle(data.id, entry.checklistItemId, entry.isChecked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500 flex-shrink-0 cursor-pointer disabled:cursor-wait"
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
type InteractionState =
  | { type: 'drag';         ids: string[]; startX: number; startY: number; origins: { id: string; x: number; y: number }[] }
  | { type: 'resize';       id: string;   startX: number; startY: number; ow: number; oh: number }
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
