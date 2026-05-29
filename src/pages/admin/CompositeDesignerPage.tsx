import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, Trash2, Plus, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { getPlacementRules, getCompositeTemplates, createCompositeTemplate, deleteCompositeTemplate } from '../../api/canvas';
import { toDirectUrl } from '../asset-manager/canvasHelpers';

const CW = 900;
const CH = 600;
const DEFAULT_W = 100;
const DEFAULT_H = 55;

function newId() { return crypto.randomUUID(); }

interface DraftAsset {
  id: string;
  assetDefinitionId: string;
  assetName: string;
  svgUrl: string;
  x: number; y: number; w: number; h: number;
}

export default function CompositeDesignerPage() {
  const canvasRef = useRef<HTMLDivElement>(null);
  type Interaction =
    | { type: 'move';   id: string; ox: number; oy: number; mx: number; my: number }
    | { type: 'resize'; id: string; ow: number; oh: number; mx: number; my: number };
  const dragRef = useRef<Interaction | null>(null);

  const [assets,   setAssets]   = useState<DraftAsset[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name,     setName]     = useState('');
  const [saving,   setSaving]   = useState(false);

  const { data: rules }      = useQuery({ queryKey: ['placement-rules'],    queryFn: getPlacementRules });
  const { data: composites = [], refetch } = useQuery({ queryKey: ['composite-templates'], queryFn: getCompositeTemplates });

  // ── mouse move / up ───────────────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.mx;
      const dy = e.clientY - d.my;
      if (d.type === 'move') {
        setAssets(prev => prev.map(a => a.id === d.id
          ? { ...a, x: Math.max(0, Math.min(CW - a.w, d.ox + dx)), y: Math.max(0, Math.min(CH - a.h, d.oy + dy)) }
          : a
        ));
      } else {
        setAssets(prev => prev.map(a => a.id === d.id
          ? { ...a, w: Math.max(30, d.ow + dx), h: Math.max(20, d.oh + dy) }
          : a
        ));
      }
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  // ── drop from panel ───────────────────────────────────────────────────────
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('panel-asset');
    if (!raw) return;
    const def: { id: string; name: string; svgUrl: string } = JSON.parse(raw);
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(CW - DEFAULT_W, e.clientX - rect.left - DEFAULT_W / 2));
    const y = Math.max(0, Math.min(CH - DEFAULT_H, e.clientY - rect.top  - DEFAULT_H / 2));
    const count = assets.filter(a => a.assetDefinitionId === def.id).length;
    setAssets(prev => [...prev, {
      id: newId(), assetDefinitionId: def.id,
      assetName: `${def.name} #${count + 1}`,
      svgUrl: def.svgUrl, x, y, w: DEFAULT_W, h: DEFAULT_H,
    }]);
  };

  // ── save composite ────────────────────────────────────────────────────────
  const save = async () => {
    if (!name.trim())       { toast.error('Enter a name'); return; }
    if (assets.length < 2)  { toast.error('Add at least 2 assets'); return; }
    const minX = Math.min(...assets.map(a => a.x));
    const minY = Math.min(...assets.map(a => a.y));
    setSaving(true);
    try {
      await createCompositeTemplate(name.trim(), assets.map(a => ({
        assetDefinitionId: a.assetDefinitionId,
        relX: a.x - minX, relY: a.y - minY,
        width: a.w, height: a.h, rotation: 0,
      })));
      await refetch();
      toast.success(`"${name.trim()}" saved`);
      setAssets([]);
      setSelected(new Set());
      setName('');
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  const deleteAsset = (id: string) => {
    setAssets(prev => prev.filter(a => a.id !== id));
    setSelected(prev => { const s = new Set(prev); s.delete(id); return s; });
  };

  return (
    <div className="flex gap-6 h-full min-h-0">

      {/* ── Left: canvas ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Composite Designer</h1>
          <p className="text-sm text-gray-500 mt-0.5">Drag assets from the panel, arrange them, then save as a reusable composite.</p>
        </div>

        {/* Canvas area */}
        <div
          ref={canvasRef}
          className="relative bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl overflow-hidden flex-shrink-0"
          style={{ width: CW, height: CH, maxWidth: '100%' }}
          onDrop={onDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => setSelected(new Set())}
        >
          {assets.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p className="text-gray-300 text-base font-medium">Drop assets here to build your composite</p>
            </div>
          )}

          {assets.map(a => (
            <div
              key={a.id}
              style={{ position: 'absolute', left: a.x, top: a.y, width: a.w, height: a.h, zIndex: selected.has(a.id) ? 10 : 1 }}
              className={`rounded border-2 cursor-move overflow-hidden group ${selected.has(a.id) ? 'border-blue-500 shadow-lg' : 'border-transparent hover:border-gray-300'}`}
              onMouseDown={e => {
                e.stopPropagation();
                setSelected(new Set([a.id]));
                dragRef.current = { type: 'move', id: a.id, ox: a.x, oy: a.y, mx: e.clientX, my: e.clientY };
              }}
            >
              <img
                src={toDirectUrl(a.svgUrl)}
                alt={a.assetName}
                draggable={false}
                className="w-full h-full object-fill pointer-events-none"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              {/* Delete button */}
              <button
                className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 flex items-center justify-center pointer-events-auto"
                onMouseDown={e => { e.stopPropagation(); deleteAsset(a.id); }}
              >×</button>
              {/* Resize handle — bottom-right */}
              <div
                className="absolute bottom-0 right-0 w-3 h-3 bg-blue-500 cursor-se-resize opacity-0 group-hover:opacity-100"
                style={{ borderRadius: '2px 0 4px 0' }}
                onMouseDown={e => { e.stopPropagation(); dragRef.current = { type: 'resize', id: a.id, ow: a.w, oh: a.h, mx: e.clientX, my: e.clientY }; }}
              />
              <div className="absolute bottom-0 left-0 right-0 bg-black/40 text-white text-center pointer-events-none" style={{ fontSize: 9 }}>
                {a.assetName}
              </div>
            </div>
          ))}
        </div>

        {/* Save bar */}
        <div className="flex items-center gap-3">
          <input
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
            placeholder="Composite name (e.g. Computer Workstation)"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && save()}
          />
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            <Plus size={15} /> Save Composite
          </button>
          {assets.length > 0 && (
            <button
              onClick={() => { setAssets([]); setSelected(new Set()); }}
              className="text-sm text-gray-400 hover:text-red-500 transition-colors"
            >Clear</button>
          )}
        </div>
      </div>

      {/* ── Right: asset panel + saved composites ────────────────────────── */}
      <div className="w-60 flex flex-col gap-4 flex-shrink-0">

        {/* Saved composites */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <Layers size={14} className="text-purple-500" />
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Saved Composites</p>
          </div>
          <div className="divide-y divide-gray-50 max-h-52 overflow-y-auto">
            {composites.length === 0 && (
              <p className="text-xs text-gray-300 px-4 py-3">None yet</p>
            )}
            {composites.map(c => (
              <div key={c.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 group">
                <div>
                  <p className="text-sm font-medium text-gray-800">{c.name}</p>
                  <p className="text-xs text-gray-400">{c.items.length} assets</p>
                </div>
                <button
                  onClick={async () => { await deleteCompositeTemplate(c.id); refetch(); toast.success('Deleted'); }}
                  className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all"
                ><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>

        {/* Asset panel */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex-1 flex flex-col min-h-0">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Assets</p>
            <p className="text-xs text-gray-400 mt-0.5">Drag onto the canvas</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {(rules?.assetsByCategory ?? []).map(cat => (
              <PanelAccordion key={cat.category} cat={cat} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PanelAccordion({ cat }: { cat: { category: string; assetDefinitions: { id: string; name: string; svgUrl: string; allowedLocations: string[] }[] } }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-50">
      <button onClick={() => setOpen(o => !o)} className="flex items-center justify-between w-full px-4 py-2.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
        <span>{cat.category} <span className="text-gray-400">({cat.assetDefinitions.length})</span></span>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="px-3 pb-2 space-y-1">
              {cat.assetDefinitions.map(def => (
                <div
                  key={def.id}
                  draggable
                  onDragStart={e => e.dataTransfer.setData('panel-asset', JSON.stringify({ ...def, category: cat.category }))}
                  className="flex items-center gap-2 p-1.5 rounded-lg border border-gray-100 hover:border-purple-300 hover:bg-purple-50 cursor-grab select-none"
                >
                  <img src={toDirectUrl(def.svgUrl)} alt={def.name} draggable={false} className="w-8 h-8 object-contain flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  <p className="text-xs text-gray-700 truncate">{def.name}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
