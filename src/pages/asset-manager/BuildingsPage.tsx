import { motion } from 'framer-motion';
import { Building2, ChevronRight, DoorOpen, Plus, PenLine, Lock, Unlock } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useAuthStore } from '../../store/authStore';
import { getMyBuildings, getMyRooms, createRoom, closeRoom, reopenRoom } from '../../api/assetManager';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import type { AMBuilding, AMRoom } from '../../types';

const roomSchema = z.object({ name: z.string().min(2, 'Name required') });
type RoomForm = z.infer<typeof roomSchema>;

export default function AMBuildingsPage() {
  const facultyId = useAuthStore(s => s.user?.facultyId) ?? '';
  const [selectedBuilding, setSelectedBuilding] = useState<AMBuilding | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const qc = useQueryClient();

  const { data: buildings, isLoading: loadingBuildings } = useQuery({
    queryKey: ['am-buildings', facultyId],
    queryFn:  () => getMyBuildings(facultyId),
    enabled:  !!facultyId,
  });

  const { data: rooms, isLoading: loadingRooms } = useQuery({
    queryKey: ['am-rooms', facultyId, selectedBuilding?.id],
    queryFn:  async () => {
      const all = await getMyRooms(facultyId);
      return selectedBuilding
        ? all.items.filter(r => r.buildingId === selectedBuilding.id)
        : all.items;
    },
    enabled: !!facultyId && !!selectedBuilding,
  });

  const createMut = useMutation({
    mutationFn: (d: RoomForm) => createRoom(facultyId, selectedBuilding!.id, d.name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['am-rooms'] });
      toast.success('Room created');
      setCreateOpen(false);
      reset();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  });

  const { register, handleSubmit, formState: { errors }, reset } = useForm<RoomForm>({
    resolver: zodResolver(roomSchema),
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Buildings & Rooms</h1>
        <p className="text-gray-500 text-sm mt-1">Select a building to manage its rooms</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Buildings list */}
        <div className="lg:col-span-1">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Buildings</h2>
          {loadingBuildings ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
            </div>
          ) : (buildings ?? []).length === 0 ? (
            <div className="py-10 text-center text-gray-400 bg-white rounded-2xl border border-gray-100">
              No buildings linked to your faculty yet.
            </div>
          ) : (
            <div className="space-y-2">
              {(buildings ?? []).map((b, i) => (
                <motion.button
                  key={b.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => setSelectedBuilding(b)}
                  className={`w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-all ${
                    selectedBuilding?.id === b.id
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    selectedBuilding?.id === b.id ? 'bg-blue-100' : 'bg-gray-100'
                  }`}>
                    <Building2 size={18} className={selectedBuilding?.id === b.id ? 'text-blue-600' : 'text-gray-500'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{b.name}</p>
                    <p className="text-xs text-gray-400 truncate">{b.address}</p>
                  </div>
                  <ChevronRight size={14} className={selectedBuilding?.id === b.id ? 'text-blue-400' : 'text-gray-300'} />
                </motion.button>
              ))}
            </div>
          )}
        </div>

        {/* Rooms panel */}
        <div className="lg:col-span-2">
          {!selectedBuilding ? (
            <div className="h-full flex items-center justify-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
              <div className="text-center text-gray-400">
                <Building2 size={36} className="mx-auto mb-3 text-gray-200" />
                <p className="font-medium">Select a building</p>
                <p className="text-sm mt-1">to view and manage its rooms</p>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                  Rooms in {selectedBuilding.name}
                </h2>
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus size={14} /> New Room
                </Button>
              </div>

              {loadingRooms ? (
                <div className="space-y-2">
                  {[1, 2].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
                </div>
              ) : (rooms ?? []).length === 0 ? (
                <div className="py-14 text-center text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200">
                  <DoorOpen size={30} className="mx-auto mb-2 text-gray-200" />
                  <p className="text-sm">No rooms yet — create the first one</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {(rooms ?? []).map((room, i) => (
                    <RoomCard key={room.id} room={room} delay={i * 0.04} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Modal open={createOpen} onClose={() => { setCreateOpen(false); reset(); }}
        title={`New Room in ${selectedBuilding?.name ?? ''}`}>
        <form onSubmit={handleSubmit(d => createMut.mutate(d))} className="space-y-4">
          <Input label="Room name" placeholder="e.g. Lab 101" error={errors.name?.message} {...register('name')} />
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => { setCreateOpen(false); reset(); }}>Cancel</Button>
            <Button type="submit" className="flex-1" loading={createMut.isPending}>Create</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function RoomCard({ room, delay }: { room: AMRoom; delay: number }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [closeOpen, setCloseOpen] = useState(false);
  const [reason, setReason] = useState('');
  const isClosed = room.status === 'Closed';

  const statusColor: Record<string, string> = {
    Open:   'bg-green-100 text-green-700',
    Closed: 'bg-gray-100 text-gray-500',
  };

  const closeMut = useMutation({
    mutationFn: () => closeRoom(room.id, reason.trim()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['am-rooms'] }); toast.success('Room closed'); setCloseOpen(false); setReason(''); },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to close room'),
  });
  const reopenMut = useMutation({
    mutationFn: () => reopenRoom(room.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['am-rooms'] }); toast.success('Room reopened'); },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to reopen room'),
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-100 hover:shadow-sm transition-shadow"
    >
      <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
        <DoorOpen size={18} className="text-blue-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 text-sm">{room.name}</p>
        <p className="text-xs text-gray-400 mt-0.5">{room.assetCount} asset{room.assetCount !== 1 ? 's' : ''} placed</p>
      </div>
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor[room.status] ?? 'bg-gray-100 text-gray-500'}`}>
        {room.status}
      </span>
      {isClosed ? (
        <button
          onClick={() => reopenMut.mutate()}
          disabled={reopenMut.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors flex-shrink-0 disabled:opacity-50"
        >
          <Unlock size={12} /> Reopen
        </button>
      ) : (
        <button
          onClick={() => setCloseOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-amber-50 hover:text-amber-700 transition-colors flex-shrink-0"
        >
          <Lock size={12} /> Close
        </button>
      )}
      <button
        onClick={() => navigate(`/asset-manager/rooms/${room.id}`)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex-shrink-0"
      >
        <PenLine size={12} /> Design
      </button>

      <Modal open={closeOpen} onClose={() => { setCloseOpen(false); setReason(''); }} title={`Close ${room.name}`}>
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Give a reason for closing this room (e.g. renovation, decommissioned). Teachers and students will see it as closed.</p>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            placeholder="Closure reason…"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => { setCloseOpen(false); setReason(''); }}>Cancel</Button>
            <Button type="button" variant="danger" className="flex-1" loading={closeMut.isPending} disabled={reason.trim() === ''} onClick={() => closeMut.mutate()}>
              <Lock size={13} /> Close Room
            </Button>
          </div>
        </div>
      </Modal>
    </motion.div>
  );
}
