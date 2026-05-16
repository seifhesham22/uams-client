import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Link2, Building2, User, ChevronDown, ChevronUp, X as XIcon, GraduationCap } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  listAdminFaculties, createFaculty, listBuildings,
  linkFacultyToBuilding, unlinkFacultyFromBuilding,
} from '../../api/admin';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import type { AdminFaculty } from '../../types';

const createSchema = z.object({ name: z.string().min(2, 'Name must be at least 2 characters') });
type CreateForm = z.infer<typeof createSchema>;

const linkSchema = z.object({ buildingId: z.string().min(1, 'Select a building') });
type LinkForm = z.infer<typeof linkSchema>;

export default function FacultiesPage() {
  const qc = useQueryClient();
  const [search, setSearch]         = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [linkFaculty, setLinkFaculty] = useState<AdminFaculty | null>(null);
  const [expanded, setExpanded]     = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-faculties', search],
    queryFn:  () => listAdminFaculties(search || undefined),
  });

  const { data: buildings } = useQuery({
    queryKey: ['buildings-all'],
    queryFn:  () => listBuildings(undefined, 1, 200),
    enabled:  !!linkFaculty,
  });

  const createMut = useMutation({
    mutationFn: (name: string) => createFaculty(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-faculties'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
      toast.success('Faculty created');
      setCreateOpen(false);
      reset();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  });

  const linkMut = useMutation({
    mutationFn: ({ facultyId, buildingId }: { facultyId: string; buildingId: string }) =>
      linkFacultyToBuilding(facultyId, buildingId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-faculties'] });
      toast.success('Building linked');
      setLinkFaculty(null);
      resetLink();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to link'),
  });

  const unlinkMut = useMutation({
    mutationFn: ({ facultyId, buildingId }: { facultyId: string; buildingId: string }) =>
      unlinkFacultyFromBuilding(facultyId, buildingId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-faculties'] });
      toast.success('Building unlinked');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  });

  const { register, handleSubmit, formState: { errors }, reset } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
  });
  const { register: regLink, handleSubmit: handleLink, formState: { errors: errLink }, reset: resetLink } =
    useForm<LinkForm>({ resolver: zodResolver(linkSchema) });

  // Filter out already-linked buildings from the dropdown
  const availableBuildings = (buildings?.items ?? []).filter(
    b => !linkFaculty?.buildings.some(lb => lb.id === b.id)
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Faculties</h1>
          <p className="text-gray-500 text-sm mt-1">
            {data?.total ?? 0} faculties registered
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus size={16} /> New Faculty
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-5 max-w-xs">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search faculties…"
          className="pl-9 pr-3 py-2 w-full text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Faculty cards */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <svg className="w-7 h-7 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
          </svg>
        </div>
      ) : (
        <div className="space-y-3">
          {data?.items.length === 0 && (
            <div className="py-16 text-center text-gray-400 bg-white rounded-2xl border border-gray-100">
              No faculties yet. Create the first one!
            </div>
          )}
          {data?.items.map((faculty, i) => (
            <FacultyCard
              key={faculty.id}
              faculty={faculty}
              delay={i * 0.04}
              expanded={expanded === faculty.id}
              onToggle={() => setExpanded(expanded === faculty.id ? null : faculty.id)}
              onLinkBuilding={() => setLinkFaculty(faculty)}
              onUnlinkBuilding={(buildingId) =>
                unlinkMut.mutate({ facultyId: faculty.id, buildingId })
              }
            />
          ))}
        </div>
      )}

      {/* Create Faculty modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Faculty">
        <form onSubmit={handleSubmit(d => createMut.mutate(d.name))} className="space-y-4">
          <Input
            label="Faculty name"
            placeholder="e.g. Faculty of Engineering"
            error={errors.name?.message}
            {...register('name')}
          />
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" loading={createMut.isPending}>
              Create
            </Button>
          </div>
        </form>
      </Modal>

      {/* Link Building modal */}
      <Modal
        open={!!linkFaculty}
        onClose={() => { setLinkFaculty(null); resetLink(); }}
        title={`Link Building — ${linkFaculty?.name ?? ''}`}
      >
        {availableBuildings.length === 0 && buildings ? (
          <div className="py-4 text-center text-gray-500 text-sm">
            All buildings are already linked to this faculty.
          </div>
        ) : (
          <form
            onSubmit={handleLink(d =>
              linkFaculty && linkMut.mutate({ facultyId: linkFaculty.id, buildingId: d.buildingId })
            )}
            className="space-y-4"
          >
            <Select
              label="Building"
              placeholder="Select a building…"
              error={errLink.buildingId?.message}
              options={availableBuildings.map(b => ({
                value: b.id,
                label: `${b.name} — ${b.address}`,
              }))}
              {...regLink('buildingId')}
            />
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="secondary" className="flex-1"
                onClick={() => { setLinkFaculty(null); resetLink(); }}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" loading={linkMut.isPending}>
                Link
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function FacultyCard({
  faculty, delay, expanded, onToggle, onLinkBuilding, onUnlinkBuilding,
}: {
  faculty: AdminFaculty;
  delay: number;
  expanded: boolean;
  onToggle: () => void;
  onLinkBuilding: () => void;
  onUnlinkBuilding: (buildingId: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
    >
      {/* Card header */}
      <div
        className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50/60 transition-colors"
        onClick={onToggle}
      >
        {/* Icon */}
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
          faculty.isActive ? 'bg-blue-50' : 'bg-gray-100'
        }`}>
          <GraduationCap size={20} className={faculty.isActive ? 'text-blue-600' : 'text-gray-400'} />
        </div>

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900">{faculty.name}</span>
            <Badge
              label={faculty.isActive ? 'Active' : 'Archived'}
              color={faculty.isActive ? 'green' : 'gray'}
            />
          </div>
          <div className="flex items-center gap-4 mt-0.5 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <Building2 size={11} />
              {faculty.buildings.length} building{faculty.buildings.length !== 1 ? 's' : ''}
            </span>
            {faculty.assetManagerName && (
              <span className="flex items-center gap-1">
                <User size={11} />
                {faculty.assetManagerName}
              </span>
            )}
            {!faculty.assetManagerName && (
              <span className="flex items-center gap-1 text-amber-400">
                <User size={11} />
                No asset manager
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <Button variant="secondary" size="sm" onClick={onLinkBuilding}>
            <Link2 size={13} /> Link Building
          </Button>
          <button className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Expandable buildings list */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-4 border-t border-gray-50">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-3 mb-2">
                Linked Buildings
              </p>
              {faculty.buildings.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No buildings linked yet.</p>
              ) : (
                <div className="space-y-2">
                  {faculty.buildings.map(b => (
                    <div key={b.id} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl group">
                      <div className="flex items-center gap-2.5">
                        <Building2 size={15} className="text-blue-500 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-gray-800">{b.name}</p>
                          <p className="text-xs text-gray-400">{b.address}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => onUnlinkBuilding(b.id)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
                        title="Unlink building"
                      >
                        <XIcon size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
