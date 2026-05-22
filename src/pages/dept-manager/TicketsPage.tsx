import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Ticket, UserPlus, RefreshCw, Send, AlertCircle, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { getDeptTickets, getMyMaintainers, assignMaintainer, reassignMaintainer, resendVkNotification } from '../../api/deptManager';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { statusColor, statusLabel } from './ticketHelpers';
import type { DeptTicket, DeptMaintainer } from '../../types';

type Tab = 'action' | 'all';

export default function TicketsPage() {
  const [tab, setTab]           = useState<Tab>('action');
  const [modal, setModal]       = useState<DeptTicket | null>(null);
  const [selected, setSelected] = useState('');
  const [notesOpen, setNotesOpen] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['dept-tickets', tab === 'action'],
    queryFn:  () => getDeptTickets(tab === 'action'),
  });

  const { data: maintainersPage } = useQuery({
    queryKey: ['dept-maintainers-all'],
    queryFn:  () => getMyMaintainers(1, 100),
  });

  const activeMaintainers: DeptMaintainer[] =
    maintainersPage?.items.filter(m => m.isActive) ?? [];

  const assignMut = useMutation({
    mutationFn: () => {
      if (!modal || !selected) throw new Error('Select a maintainer');
      return modal.currentMaintainerId
        ? reassignMaintainer(modal.id, selected)
        : assignMaintainer(modal.id, selected);
    },
    onSuccess: () => {
      toast.success('Maintainer assigned');
      qc.invalidateQueries({ queryKey: ['dept-tickets'] });
      qc.invalidateQueries({ queryKey: ['dept-action-count'] });
      setModal(null);
      setSelected('');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  });

  const resendMut = useMutation({
    mutationFn: (ticketId: string) => resendVkNotification(ticketId),
    onSuccess: (sent) => {
      if (sent) toast.success('VK notification sent');
      else toast.error('Failed to send VK notification');
      qc.invalidateQueries({ queryKey: ['dept-tickets'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  });

  const openModal = (t: DeptTicket) => {
    setModal(t);
    setSelected(t.currentMaintainerId ?? '');
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tickets</h1>
        <p className="text-gray-500 text-sm mt-1">Manage and assign your department's tickets</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit mb-6">
        {(['action', 'all'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'action' ? 'Needs Action' : 'All Tickets'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : tickets.length === 0 ? (
        <div className="py-16 text-center text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200">
          <Ticket size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="font-medium">
            {tab === 'action' ? 'No tickets need your action' : 'No tickets yet'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {tickets.map((t, i) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="bg-white rounded-xl border border-gray-100 hover:shadow-sm transition-shadow overflow-hidden"
            >
              <div className="flex items-center gap-4 p-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">{t.assetName}</p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    {t.roomName} · {t.buildingName} · {t.facultyName}
                  </p>
                </div>

                <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${statusColor(t.status)}`}>
                  {statusLabel(t.status)}
                </span>

                {t.currentMaintainerName ? (
                  <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0 max-w-[120px] truncate">
                    {t.currentMaintainerName}
                  </span>
                ) : (
                  <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                    Unassigned
                  </span>
                )}

                {t.vkNotificationStatus === 'Sent' && (
                  <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full flex-shrink-0">
                    <Send size={10} /> VK Notified
                  </span>
                )}
                {t.vkNotificationStatus === 'Failed' && (
                  <button
                    onClick={() => resendMut.mutate(t.id)}
                    disabled={resendMut.isPending}
                    className="flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full hover:bg-red-100 transition-colors flex-shrink-0"
                  >
                    <AlertCircle size={10} /> VK Failed — Retry
                  </button>
                )}

                {t.notes.length > 0 && (
                  <button
                    onClick={() => setNotesOpen(notesOpen === t.id ? null : t.id)}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 flex-shrink-0"
                  >
                    <MessageSquare size={13} />
                    {t.notes.length}
                    {notesOpen === t.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                )}

                <button
                  onClick={() => openModal(t)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors flex-shrink-0"
                >
                  {t.currentMaintainerId ? <RefreshCw size={12} /> : <UserPlus size={12} />}
                  {t.currentMaintainerId ? 'Reassign' : 'Assign'}
                </button>
              </div>

              {notesOpen === t.id && t.notes.length > 0 && (
                <div className="px-4 pb-3 border-t border-gray-50 pt-3 space-y-2">
                  {t.notes.map(n => (
                    <div key={n.id} className="text-xs">
                      <span className="font-medium text-gray-700">{n.authorName}</span>
                      <span className="text-gray-400 mx-1">·</span>
                      <span className="text-gray-400">{new Date(n.createdAtUtc).toLocaleString()}</span>
                      <p className="text-gray-600 mt-0.5">{n.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* Assign / Reassign modal */}
      <Modal
        open={!!modal}
        onClose={() => { setModal(null); setSelected(''); }}
        title={modal?.currentMaintainerId ? 'Reassign Maintainer' : 'Assign Maintainer'}
      >
        {modal && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-xl p-3 text-sm">
              <p className="font-medium text-gray-800">{modal.assetName}</p>
              <p className="text-gray-500 text-xs mt-0.5">
                {modal.roomName} · {statusLabel(modal.status)}
              </p>
            </div>

            {activeMaintainers.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                No active maintainers. Create one first.
              </p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {activeMaintainers.map(m => (
                  <label
                    key={m.id}
                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-colors ${
                      selected === m.id
                        ? 'border-violet-300 bg-violet-50'
                        : 'border-gray-100 bg-white hover:border-gray-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="maintainer"
                      value={m.id}
                      checked={selected === m.id}
                      onChange={() => setSelected(m.id)}
                      className="text-violet-600 focus:ring-violet-500"
                    />
                    <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 font-semibold text-sm flex-shrink-0">
                      {m.fullName[0]?.toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-gray-800">{m.fullName}</span>
                  </label>
                ))}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => { setModal(null); setSelected(''); }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={!selected}
                loading={assignMut.isPending}
                onClick={() => assignMut.mutate()}
              >
                {modal.currentMaintainerId ? 'Reassign' : 'Assign'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
