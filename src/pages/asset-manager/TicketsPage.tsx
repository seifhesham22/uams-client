import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Ticket, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  getMyTickets, sendForInspection, sendForFix,
  sendForReplacement, escalateTicket, confirmFix, closeTicket,
} from '../../api/assetManager';
import { listDepartments } from '../../api/admin';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Select } from '../../components/ui/Select';
import type { AMTicket } from '../../types';

type Tab = 'action' | 'all';

// departmentId is conditionally required — validation enforced at mutation time, not schema level,
// because confirm/close/escalate never mount that field so zodResolver always sees it as empty.
const deptSchema = z.object({ departmentId: z.string().optional(), note: z.string().optional() });
type DeptForm = z.infer<typeof deptSchema>;

const STATUS_COLOR: Record<string, string> = {
  Open:                'bg-amber-100 text-amber-700',
  InspectionRequested: 'bg-blue-100 text-blue-700',
  InspectionDone:      'bg-indigo-100 text-indigo-700',
  SentForFix:          'bg-orange-100 text-orange-700',
  AwaitingParts:       'bg-orange-100 text-orange-700',
  Fixed:               'bg-green-100 text-green-700',
  Irreparable:         'bg-red-100 text-red-700',
  SentForReplacement:  'bg-orange-100 text-orange-700',
  Replaced:            'bg-teal-100 text-teal-700',
  ConfirmedFixed:      'bg-green-100 text-green-700',
  EscalatedExternally: 'bg-purple-100 text-purple-700',
  Closed:              'bg-gray-100 text-gray-500',
};

const STATUS_LABEL: Record<string, string> = {
  Open: 'Open', InspectionRequested: 'Inspection Requested',
  InspectionDone: 'Inspection Done', SentForFix: 'Sent for Fix',
  AwaitingParts: 'Awaiting Parts', Fixed: 'Fixed', Irreparable: 'Irreparable',
  SentForReplacement: 'Sent for Replacement', Replaced: 'Replaced',
  ConfirmedFixed: 'Confirmed Fixed', EscalatedExternally: 'Escalated',
  Closed: 'Closed',
};

type ActionType = 'inspection' | 'fix' | 'replacement' | 'escalate' | 'confirm' | 'close';

export default function AMTicketsPage() {
  const [tab, setTab]           = useState<Tab>('action');
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<{ ticket: AMTicket; type: ActionType } | null>(null);
  const qc = useQueryClient();

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['am-tickets', tab === 'action'],
    queryFn:  () => getMyTickets(tab === 'action'),
  });

  const { data: deptPage } = useQuery({
    queryKey: ['departments-all'],
    queryFn:  () => listDepartments(undefined, 1, 200),
  });
  const deptOptions = (deptPage?.items ?? []).map(d => ({ value: d.id, label: `${d.name} (${d.handles})` }));

  const { register, handleSubmit, formState: { errors }, reset } =
    useForm<DeptForm>({ resolver: zodResolver(deptSchema) });

  const actionMut = useMutation({
    mutationFn: async (form: DeptForm) => {
      if (!actionModal) return;
      const { ticket, type } = actionModal;
      switch (type) {
        case 'inspection':
        case 'fix':
        case 'replacement': {
          if (!form.departmentId)
            return Promise.reject({ response: { data: { message: 'Please select a department' } } });
          if (type === 'inspection') return sendForInspection(ticket.id, form.departmentId, form.note);
          if (type === 'fix')        return sendForFix(ticket.id, form.departmentId, form.note);
          return sendForReplacement(ticket.id, form.departmentId, form.note);
        }
        case 'escalate': return escalateTicket(ticket.id, form.note);
        case 'confirm':  return confirmFix(ticket.id);
        case 'close':    return closeTicket(ticket.id, form.note);
      }
    },
    onSuccess: () => {
      toast.success('Ticket updated');
      qc.invalidateQueries({ queryKey: ['am-tickets'] });
      qc.invalidateQueries({ queryKey: ['am-action-count'] });
      setActionModal(null);
      reset();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  });

  const openAction = (ticket: AMTicket, type: ActionType) => {
    setActionModal({ ticket, type });
    reset();
  };

  const needsDept = actionModal?.type === 'inspection' || actionModal?.type === 'fix' || actionModal?.type === 'replacement';

  // ── What actions are available per status ──────────────────────────────────
  const getActions = (t: AMTicket): { label: string; type: ActionType; variant: 'primary' | 'secondary' | 'danger' }[] => {
    switch (t.status) {
      case 'Open':
        return [
          { label: 'Send for Inspection', type: 'inspection', variant: 'primary' },
          { label: 'Send for Fix',         type: 'fix',        variant: 'secondary' },
          { label: 'Send for Replacement', type: 'replacement',variant: 'secondary' },
          { label: 'Escalate Externally',  type: 'escalate',   variant: 'danger' },
        ];
      case 'InspectionDone':
        return [
          { label: 'Send for Fix',         type: 'fix',        variant: 'primary' },
          { label: 'Send for Replacement', type: 'replacement',variant: 'secondary' },
          { label: 'Escalate Externally',  type: 'escalate',   variant: 'danger' },
        ];
      case 'Irreparable':
        return [
          { label: 'Send for Replacement', type: 'replacement',variant: 'primary' },
          { label: 'Escalate Externally',  type: 'escalate',   variant: 'secondary' },
          { label: 'Close (Write Off)',     type: 'close',      variant: 'danger' },
        ];
      case 'Fixed':
      case 'Replaced':
        return [
          { label: 'Confirm Fixed', type: 'confirm', variant: 'primary' },
        ];
      default:
        return [];
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tickets</h1>
        <p className="text-gray-500 text-sm mt-1">Manage your faculty's maintenance tickets</p>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit mb-6">
        {(['action', 'all'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t === 'action' ? 'Needs Action' : 'All Tickets'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : tickets.length === 0 ? (
        <div className="py-16 text-center text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200">
          <Ticket size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="font-medium">{tab === 'action' ? 'No tickets need your action' : 'No tickets yet'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tickets.map((t, i) => {
            const actions = getActions(t);
            const isExpanded = expanded === t.id;
            return (
              <motion.div key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="flex items-center gap-4 p-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{t.assetName}</p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {t.roomName} · Reported by {t.reportedByName}
                      {t.departmentName && ` · ${t.departmentName}`}
                    </p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLOR[t.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {STATUS_LABEL[t.status] ?? t.status}
                  </span>
                  {t.currentMaintainerName && (
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0 hidden sm:block">
                      {t.currentMaintainerName}
                    </span>
                  )}
                  {t.notes.length > 0 && (
                    <button onClick={() => setNotesOpen(notesOpen === t.id ? null : t.id)}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 flex-shrink-0">
                      <MessageSquare size={13} /> {t.notes.length}
                    </button>
                  )}
                  {actions.length > 0 && (
                    <button onClick={() => setExpanded(isExpanded ? null : t.id)}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 flex-shrink-0">
                      Actions {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                  )}
                </div>

                {notesOpen === t.id && t.notes.length > 0 && (
                  <div className="px-4 pb-3 border-t border-gray-50 pt-3 space-y-2">
                    {t.notes.map(n => (
                      <div key={n.id} className="text-xs">
                        <span className={`font-semibold mr-1 ${
                          n.authorRole === 'Reporter'            ? 'text-blue-600'   :
                          n.authorRole === 'Maintainer'          ? 'text-orange-600' :
                          n.authorRole === 'Asset Manager'       ? 'text-green-700'  :
                          n.authorRole === 'Department Manager'  ? 'text-violet-700' :
                          'text-gray-700'
                        }`}>{n.authorRole}:</span>
                        <span className="font-medium text-gray-700">{n.authorName}</span>
                        <span className="text-gray-400 mx-1">·</span>
                        <span className="text-gray-400">{new Date(n.createdAtUtc).toLocaleString()}</span>
                        <p className="text-gray-600 mt-0.5">{n.content}</p>
                      </div>
                    ))}
                  </div>
                )}

                {isExpanded && actions.length > 0 && (
                  <div className="px-4 pb-4 flex flex-wrap gap-2 border-t border-gray-50 pt-3">
                    {actions.map(a => (
                      <Button key={a.type} size="sm" variant={a.variant} onClick={() => openAction(t, a.type)}>
                        {a.label}
                      </Button>
                    ))}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Action modal */}
      <Modal
        open={!!actionModal}
        onClose={() => { setActionModal(null); reset(); }}
        title={actionModal ? `${actionModal.type === 'inspection' ? 'Send for Inspection' : actionModal.type === 'fix' ? 'Send for Fix' : actionModal.type === 'replacement' ? 'Send for Replacement' : actionModal.type === 'escalate' ? 'Escalate Externally' : actionModal.type === 'confirm' ? 'Confirm Fix' : 'Close Ticket'}` : ''}
      >
        {actionModal && (
          <form onSubmit={handleSubmit(d => actionMut.mutate(d))} className="space-y-4">
            <div className="bg-gray-50 rounded-xl p-3 text-sm">
              <p className="font-medium text-gray-800">{actionModal.ticket.assetName}</p>
              <p className="text-gray-500 text-xs mt-0.5">{actionModal.ticket.roomName}</p>
            </div>

            {needsDept && (
              <Select
                label="Department"
                placeholder="Select department…"
                options={deptOptions}
                error={errors.departmentId?.message}
                {...register('departmentId')}
              />
            )}

            {(actionModal.type === 'escalate' || actionModal.type === 'close' || actionModal.type === 'inspection' || actionModal.type === 'fix' || actionModal.type === 'replacement') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
                <textarea
                  {...register('note')}
                  rows={3}
                  placeholder="Add a note…"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => { setActionModal(null); reset(); }}>Cancel</Button>
              <Button type="submit" className="flex-1" loading={actionMut.isPending}>Confirm</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
