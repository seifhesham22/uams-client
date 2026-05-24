import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Trash2, Edit2, CheckSquare, X as XIcon, Save } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  listAssets, createAsset, updateAsset, deleteAsset,
  addChecklistItem, removeChecklistItem, getAsset,
} from '../../api/assets';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Select } from '../../components/ui/Select';
import { Badge, categoryColor, categoryLabel } from '../../components/ui/Badge';
import type { AssetCategory, PlacementLocation, AssetDefinitionListItem, AssetDefinitionDetail } from '../../types';

// Normalise common URL mistakes:
// GitHub "blob" page URL → raw file URL (the blob page is HTML, not an image)
function toDirectUrl(url: string): string {
  const ghBlob = url.match(/https?:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/(.+)/);
  if (ghBlob) return `https://raw.githubusercontent.com/${ghBlob[1]}/${ghBlob[2]}`;
  return url;
}

function AssetImage({ url, alt }: { url: string; alt: string }) {
  const src = toDirectUrl(url);
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className="max-h-full max-w-full object-contain"
      onError={e => {
        const t = e.target as HTMLImageElement;
        t.style.display = 'none';
        const p = t.parentElement;
        if (p) p.innerHTML =
          `<a href="${src}" target="_blank" rel="noreferrer"
             class="text-xs text-blue-400 underline break-all px-2 text-center">
             ⚠ Can't load — click to open URL
           </a>`;
      }}
    />
  );
}

const CATEGORIES: { value: AssetCategory; label: string }[] = [
  { value: 'Electrical',     label: 'Electrical'     },
  { value: 'Plumbing',       label: 'Plumbing'       },
  { value: 'Furniture',      label: 'Furniture'      },
  { value: 'Infrastructure', label: 'Infrastructure' },
];

const LOCATIONS: PlacementLocation[] = ['OnWall', 'OnCeiling', 'OnFloor', 'OnSurface', 'InWall', 'UnderSurface'];

const assetSchema = z.object({
  name:      z.string().min(2, 'Name required'),
  svgUrl:    z.string().min(1, 'SVG URL required'),
  category:  z.string().min(1, 'Select category') as z.ZodType<AssetCategory>,
  locations: z.array(z.string()).min(1, 'Select at least one location'),
});
type AssetForm = z.infer<typeof assetSchema>;

type ModalTab = 'edit' | 'checklist';

export default function AssetDefinitionsPage() {
  const qc = useQueryClient();
  const [search, setSearch]         = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AssetDefinitionDetail | null>(null);
  const [modalTab, setModalTab]     = useState<ModalTab>('edit');
  const [newCheckItem, setNewCheckItem] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['assets', search],
    queryFn:  () => listAssets(search || undefined, undefined, 1, 50),
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: (d: AssetForm) => createAsset({
      name: d.name, svgUrl: d.svgUrl,
      category: d.category as AssetCategory,
      locations: d.locations as PlacementLocation[],
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets'] });
      toast.success('Asset definition created');
      setCreateOpen(false); createReset();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: AssetForm }) =>
      updateAsset(id, {
        name: data.name, svgUrl: data.svgUrl,
        category: data.category as AssetCategory,
        locations: data.locations as PlacementLocation[],
      }),
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ['assets'] });
      // Refresh the detail view
      if (editTarget) {
        const updated = await getAsset(editTarget.id);
        setEditTarget(updated);
      }
      toast.success('Saved');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  });

  const deleteMut = useMutation({
    mutationFn: deleteAsset,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assets'] }); toast.success('Deleted'); },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'In use or failed'),
  });

  const addItemMut = useMutation({
    mutationFn: ({ assetId, desc }: { assetId: string; desc: string }) =>
      addChecklistItem(assetId, desc),
    onSuccess: async () => {
      if (editTarget) setEditTarget(await getAsset(editTarget.id));
      setNewCheckItem('');
      toast.success('Item added');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  });

  const removeItemMut = useMutation({
    mutationFn: ({ assetId, itemId }: { assetId: string; itemId: string }) =>
      removeChecklistItem(assetId, itemId),
    onSuccess: async () => {
      if (editTarget) setEditTarget(await getAsset(editTarget.id));
      toast.success('Item removed');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  });

  // ── Create form ───────────────────────────────────────────────────────────
  const {
    register: createReg, handleSubmit: createSubmit,
    formState: { errors: createErr }, reset: createReset,
    watch: createWatch, setValue: createSetValue,
  } = useForm<AssetForm>({ resolver: zodResolver(assetSchema), defaultValues: { locations: [] } });

  const createLocs = createWatch('locations') ?? [];
  const toggleCreateLoc = (loc: string) =>
    createSetValue(
      'locations',
      createLocs.includes(loc) ? createLocs.filter(l => l !== loc) : [...createLocs, loc],
      { shouldValidate: true }
    );

  // ── Edit form ─────────────────────────────────────────────────────────────
  const {
    register: editReg, handleSubmit: editSubmit,
    formState: { errors: editErr }, reset: editReset,
    watch: editWatch, setValue: editSetValue,
  } = useForm<AssetForm>({ resolver: zodResolver(assetSchema), defaultValues: { locations: [] } });

  const editLocs = editWatch('locations') ?? [];
  const toggleEditLoc = (loc: string) =>
    editSetValue(
      'locations',
      editLocs.includes(loc) ? editLocs.filter(l => l !== loc) : [...editLocs, loc],
      { shouldValidate: true }
    );

  const openEdit = async (asset: AssetDefinitionListItem) => {
    const detail = await getAsset(asset.id);
    setEditTarget(detail);
    setModalTab('edit');
    editReset({
      name:      detail.name,
      svgUrl:    detail.svgUrl,
      category:  detail.category as AssetCategory,
      locations: detail.allowedLocations,
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Asset Definitions</h1>
          <p className="text-gray-500 text-sm mt-1">{data?.total ?? 0} definitions</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Plus size={16} /> New Definition</Button>
      </div>

      <div className="relative mb-5 max-w-xs">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search assets…"
          className="pl-9 pr-3 py-2 w-full text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <svg className="w-8 h-8 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
          </svg>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {(data?.items ?? []).map((asset, i) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              delay={i * 0.04}
              onEdit={() => openEdit(asset)}
              onDelete={() => deleteMut.mutate(asset.id)}
            />
          ))}
          {(data?.items ?? []).length === 0 && (
            <div className="col-span-full py-16 text-center text-gray-400">
              No asset definitions yet. Create your first one!
            </div>
          )}
        </div>
      )}

      {/* ── Create modal ──────────────────────────────────────────────────── */}
      <Modal open={createOpen} onClose={() => { setCreateOpen(false); createReset(); }}
        title="New Asset Definition" width="max-w-xl">
        <form onSubmit={createSubmit(d => createMut.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Name" placeholder="e.g. Ceiling Fan" error={createErr.name?.message} {...createReg('name')} />
            <Select label="Category" placeholder="Select…" options={CATEGORIES} error={createErr.category?.message} {...createReg('category')} />
          </div>
          <Input label="SVG URL" placeholder="/assets/icons/ceiling-fan.svg"
            hint="Path or URL to the SVG icon used in the canvas"
            error={createErr.svgUrl?.message} {...createReg('svgUrl')} />
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Placement Locations</p>
            <div className="flex flex-wrap gap-2">
              {LOCATIONS.map(loc => (
                <button key={loc} type="button" onClick={() => toggleCreateLoc(loc)}
                  className={`px-3 py-1.5 rounded-lg text-sm border font-medium transition-all ${
                    createLocs.includes(loc)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-300 text-gray-600 hover:border-blue-400'
                  }`}>
                  {loc}
                </button>
              ))}
            </div>
            {createErr.locations && <p className="text-xs text-red-600 mt-1">{createErr.locations.message as string}</p>}
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" className="flex-1"
              onClick={() => { setCreateOpen(false); createReset(); }}>Cancel</Button>
            <Button type="submit" className="flex-1" loading={createMut.isPending}>Create</Button>
          </div>
        </form>
      </Modal>

      {/* ── Edit / Checklist modal ─────────────────────────────────────────── */}
      <Modal
        open={!!editTarget}
        onClose={() => { setEditTarget(null); editReset(); setNewCheckItem(''); }}
        title={editTarget?.name ?? 'Asset Definition'}
        width="max-w-xl"
      >
        {editTarget && (
          <div>
            {/* Tab switcher */}
            <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit mb-5">
              {([
                ['edit',      'Edit Details', Edit2       ],
                ['checklist', 'Checklist',    CheckSquare ],
              ] as const).map(([id, label, Icon]) => (
                <button
                  key={id}
                  onClick={() => setModalTab(id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    modalTab === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>

            {/* Edit tab */}
            {modalTab === 'edit' && (
              <form onSubmit={editSubmit(d => updateMut.mutate({ id: editTarget.id, data: d }))}
                className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Name" error={editErr.name?.message} {...editReg('name')} />
                  <Select label="Category" options={CATEGORIES} error={editErr.category?.message} {...editReg('category')} />
                </div>
                <Input label="SVG URL" hint="Path or URL to the SVG icon"
                  error={editErr.svgUrl?.message} {...editReg('svgUrl')} />
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Placement Locations</p>
                  <div className="flex flex-wrap gap-2">
                    {LOCATIONS.map(loc => (
                      <button key={loc} type="button" onClick={() => toggleEditLoc(loc)}
                        className={`px-3 py-1.5 rounded-lg text-sm border font-medium transition-all ${
                          editLocs.includes(loc)
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'border-gray-300 text-gray-600 hover:border-blue-400'
                        }`}>
                        {loc}
                      </button>
                    ))}
                  </div>
                  {editErr.locations && <p className="text-xs text-red-600 mt-1">{editErr.locations.message as string}</p>}
                </div>

                {/* SVG preview */}
                {editTarget.svgUrl && (
                  <div className="bg-gray-50 rounded-xl p-3 flex items-center justify-center">
                    <AssetImage url={editTarget.svgUrl} alt={editTarget.name} />
                  </div>
                )}

                <Button type="submit" className="w-full" loading={updateMut.isPending}>
                  <Save size={15} /> Save Changes
                </Button>
              </form>
            )}

            {/* Checklist tab */}
            {modalTab === 'checklist' && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">
                  These items are copied to every maintenance checklist created for this asset type.
                </p>

                {editTarget.checklistItems.length === 0 && (
                  <p className="text-sm text-gray-400 italic py-4 text-center">
                    No checklist items yet. Add one below.
                  </p>
                )}

                <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-thin pr-1">
                  {editTarget.checklistItems.map((item, i) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="flex items-start gap-2 p-3 bg-gray-50 rounded-xl group"
                    >
                      <span className="w-4 h-4 rounded-full bg-green-500 flex-shrink-0 mt-0.5 flex items-center justify-center">
                        <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                          <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </span>
                      <span className="flex-1 text-sm text-gray-700 leading-snug">{item.description}</span>
                      <button
                        onClick={() => removeItemMut.mutate({ assetId: editTarget.id, itemId: item.id })}
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all flex-shrink-0"
                      >
                        <XIcon size={14} />
                      </button>
                    </motion.div>
                  ))}
                </div>

                {/* Add item */}
                <div className="flex gap-2 pt-1">
                  <input
                    value={newCheckItem}
                    onChange={e => setNewCheckItem(e.target.value)}
                    placeholder="e.g. Check power connection…"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newCheckItem.trim()) {
                        e.preventDefault();
                        addItemMut.mutate({ assetId: editTarget.id, desc: newCheckItem.trim() });
                      }
                    }}
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <Button
                    size="sm"
                    disabled={!newCheckItem.trim()}
                    loading={addItemMut.isPending}
                    onClick={() =>
                      newCheckItem.trim() &&
                      addItemMut.mutate({ assetId: editTarget.id, desc: newCheckItem.trim() })
                    }
                  >
                    Add
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

// ── Asset card ────────────────────────────────────────────────────────────────
function AssetCard({
  asset, delay, onEdit, onDelete,
}: { asset: AssetDefinitionListItem; delay: number; onEdit: () => void; onDelete: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-3 hover:shadow-md transition-shadow"
    >
      <div className="bg-gray-50 rounded-xl p-3 flex items-center justify-center" style={{ minHeight: 72 }}>
        <AssetImage url={asset.svgUrl} alt={asset.name} />
      </div>
      <div className="space-y-1.5">
        <p className="font-semibold text-gray-900 text-sm">{asset.name}</p>
        <Badge label={categoryLabel(asset.category)} color={categoryColor(asset.category)} />
        <div className="flex flex-wrap gap-1 pt-0.5">
          {asset.allowedLocations.map(loc => (
            <span key={loc} className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-md">
              {loc}
            </span>
          ))}
        </div>
      </div>
      <div className="flex gap-2 mt-auto">
        <Button variant="secondary" size="sm" className="flex-1" onClick={onEdit}>
          <Edit2 size={13} /> Edit
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete}
          className="text-red-500 hover:bg-red-50 hover:text-red-600 px-2">
          <Trash2 size={14} />
        </Button>
      </div>
    </motion.div>
  );
}
