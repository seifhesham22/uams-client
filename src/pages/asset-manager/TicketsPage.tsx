import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Ticket, ChevronDown, ChevronUp, MessageSquare, History } from 'lucide-react';
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
type StatusFilter = 'all' | 'open' | 'inProgress' | 'needsConfirmation' | 'closed';
type TimeFilter = 'all' | '7' | '30';
type SortOrder = 'newest' | 'oldest';

// departmentId is conditionally required — validation enforced at mutation time, not schema level,
// because confirm/close/escalate never mount that field so zodResolver always sees it as empty.
const deptSchema = z.object({
  departmentId: z.string().optional(),
  note: z.string().optional(),
  finalCondition: z.string().optional(),
});
type DeptForm = z.infer<typeof deptSchema>;

// The only thing teachers & students need to know: can they use it or not.
// The manager makes this call when escalating / closing / cancelling a ticket.
const FINAL_CONDITION_OPTIONS = [
  { value: 'Usable',  label: '✅ Usable' },
  { value: 'NotUsable', label: '⛔ Not usable' },
];

// ── Status buckets ───────────────────────────────────────────────────────────
// The AM only thinks in three phases. The 12 raw statuses collapse into these.
//   open       → just reported, needs triage
//   inProgress → anything being worked on (incl. Fixed/Replaced awaiting confirmation)
//   closed     → terminal (resolved, written off, or handed to a vendor)
type Bucket = 'open' | 'inProgress' | 'closed';
const STATUS_BUCKET: Record<string, Bucket> = {
  Open:                'open',
  InspectionRequested: 'inProgress',
  InspectionDone:      'inProgress',
  SentForFix:          'inProgress',
  AwaitingParts:       'inProgress',
  SentForReplacement:  'inProgress',
  Fixed:               'inProgress',
  Replaced:            'inProgress',
  ConfirmedFixed:      'closed',
  Closed:              'closed',
  EscalatedExternally: 'closed',
  Irreparable:         'closed',
};
const bucketOf = (status: string): Bucket => STATUS_BUCKET[status] ?? 'inProgress';

// Tickets the maintainer marked done — the AM still has to confirm the fix.
const NEEDS_CONFIRMATION = new Set(['Fixed', 'Replaced']);

const BUCKET_LABEL: Record<Bucket, string> = {
  open: 'Open', inProgress: 'In Progress', closed: 'Closed',
};
const BUCKET_COLOR: Record<Bucket, string> = {
  open:       'bg-amber-100 text-amber-700',
  inProgress: 'bg-blue-100 text-blue-700',
  closed:     'bg-gray-100 text-gray-500',
};

// Detailed labels kept as muted sub-text so the AM still has the full picture.
const STATUS_LABEL: Record<string, string> = {
  Open: 'Open', InspectionRequested: 'Inspection Requested',
  InspectionDone: 'Inspection Done', SentForFix: 'Sent for Fix',
  AwaitingParts: 'Awaiting Parts', Fixed: 'Fixed', Irreparable: 'Irreparable',
  SentForReplacement: 'Sent for Replacement', Replaced: 'Replaced',
  ConfirmedFixed: 'Confirmed Fixed', EscalatedExternally: 'Escalated Externally',
  Closed: 'Closed',
};

type ActionType = 'inspection' | 'fix' | 'replacement' | 'escalate' | 'confirm' | 'close';

export default function AMTicketsPage() {
  const [tab, setTab]             = useState<Tab>('action');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [roomFilter, setRoomFilter]     = useState<string>('');
  const [timeFilter, setTimeFilter]     = useState<TimeFilter>('all');
  const [sort, setSort]                 = useState<SortOrder>('newest');
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState<string | null>(null);
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

  // Rooms present in the current ticket set — drives the room filter dropdown.
  const roomOptions = useMemo(() => {
    const names = Array.from(new Set(tickets.map(t => t.roomName).filter(Boolean))).sort();
    return [{ value: '', label: 'All rooms' }, ...names.map(n => ({ value: n, label: n }))];
  }, [tickets]);

  // ── Apply filters + sort (only the "All" tab is filterable) ─────────────────
  const visibleTickets = useMemo(() => {
    if (tab === 'action') return tickets;
    const now = Date.now();
    const cutoff = timeFilter === 'all' ? 0 : now - Number(timeFilter) * 24 * 60 * 60 * 1000;
    const filtered = tickets.filter(t => {
      if (statusFilter === 'needsConfirmation') {
        if (!NEEDS_CONFIRMATION.has(t.status)) return false;
      } else if (statusFilter !== 'all') {
        if (bucketOf(t.status) !== statusFilter) return false;
      }
      if (roomFilter && t.roomName !== roomFilter) return false;
      if (cutoff && +new Date(t.createdAtUtc) < cutoff) return false;
      return true;
    });
    return filtered.sort((a, b) =>
      sort === 'newest'
        ? +new Date(b.createdAtUtc) - +new Date(a.createdAtUtc)
        : +new Date(a.createdAtUtc) - +new Date(b.createdAtUtc),
    );
  }, [tickets, tab, statusFilter, roomFilter, timeFilter, sort]);

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
        case 'escalate': return escalateTicket(ticket.id, form.finalCondition || 'Usable', form.note);
        case 'confirm':  return confirmFix(ticket.id);
        case 'close':    return closeTicket(ticket.id, form.finalCondition || 'Usable', form.note);
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
    reset({ finalCondition: 'Usable' });
  };

  const needsDept = actionModal?.type === 'inspection' || actionModal?.type === 'fix' || actionModal?.type === 'replacement';

  // ── What actions are available per status ──────────────────────────────────
  type Action = { label: string; type: ActionType; variant: 'primary' | 'secondary' | 'danger' };
  const TERMINAL = ['ConfirmedFixed', 'Closed', 'EscalatedExternally'];

  const getActions = (t: AMTicket): Action[] => {
    const actions = baseActions(t);
    // The AM can always cancel/close an active ticket (e.g. reported by mistake) and set
    // whether the asset stays usable — unless it's already terminal or has its own close.
    if (!TERMINAL.includes(t.status) && !actions.some(a => a.type === 'close')) {
      actions.push({ label: 'Cancel / Close', type: 'close', variant: 'secondary' });
    }
    return actions;
  };

  const baseActions = (t: AMTicket): Action[] => {
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
      // Vendor / external party finished — let the AM set the final asset condition
      // (e.g. mark it working again) and close the ticket.
      case 'EscalatedExternally':
        return [
          { label: 'Resolve & Set Condition', type: 'close', variant: 'primary' },
        ];
      default:
        return [];
    }
  };

  const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
    { value: 'all',              label: 'All' },
    { value: 'open',             label: 'Open' },
    { value: 'inProgress',       label: 'In Progress' },
    { value: 'needsConfirmation', label: 'Needs Confirmation' },
    { value: 'closed',           label: 'Closed' },
  ];

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
            {t === 'action' ? 'Needs Your Action' : 'All Tickets'}
          </button>
        ))}
      </div>

      {/* Filters — only meaningful on the "All Tickets" tab */}
      {tab === 'all' && (
        <div className="mb-5 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map(f => (
              <button key={f.value} onClick={() => setStatusFilter(f.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  statusFilter === f.value
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="w-48">
              <Select options={roomOptions} value={roomFilter}
                onChange={e => setRoomFilter(e.target.value)} />
            </div>
            <div className="w-44">
              <Select
                options={[
                  { value: 'all', label: 'All time' },
                  { value: '7',   label: 'Last 7 days' },
                  { value: '30',  label: 'Last 30 days' },
                ]}
                value={timeFilter}
                onChange={e => setTimeFilter(e.target.value as TimeFilter)}
              />
            </div>
            <div className="w-44">
              <Select
                options={[
                  { value: 'newest', label: 'Newest first' },
                  { value: 'oldest', label: 'Oldest first' },
                ]}
                value={sort}
                onChange={e => setSort(e.target.value as SortOrder)}
              />
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : visibleTickets.length === 0 ? (
        <div className="py-16 text-center text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200">
          <Ticket size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="font-medium">{tab === 'action' ? 'No tickets need your action' : 'No tickets match these filters'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleTickets.map((t, i) => {
            const actions = getActions(t);
            const isExpanded = expanded === t.id;
            const bucket = bucketOf(t.status);
            return (
              <motion.div key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="flex items-center gap-4 p-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{t.assetName}</p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {t.roomName} · Reported by {t.reportedByName}
                      {t.departmentName && ` · ${t.departmentName}`}
                      <span className="mx-1">·</span>
                      {new Date(t.createdAtUtc).toLocaleDateString()}
                      <span className="text-gray-300"> · {STATUS_LABEL[t.status] ?? t.status}</span>
                    </p>
                  </div>
                  {NEEDS_CONFIRMATION.has(t.status) && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 bg-green-100 text-green-700 hidden sm:block">
                      Needs confirmation
                    </span>
                  )}
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${BUCKET_COLOR[bucket]}`}>
                    {BUCKET_LABEL[bucket]}
                  </span>
                  {t.currentMaintainerName && (
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0 hidden sm:block">
                      {t.currentMaintainerName}
                    </span>
                  )}
                  <button onClick={() => setHistoryOpen(historyOpen === t.id ? null : t.id)}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 flex-shrink-0">
                    <History size={13} /> History{t.notes.length > 0 && ` (${t.notes.length})`}
                  </button>
                  {actions.length > 0 && (
                    <button onClick={() => setExpanded(isExpanded ? null : t.id)}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 flex-shrink-0">
                      Actions {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                  )}
                </div>

                {historyOpen === t.id && (
                  <div className="px-4 pb-3 border-t border-gray-50 pt-3">
                    {/* Ticket timeline — reported → every note in chronological order */}
                    <ol className="relative border-l border-gray-200 ml-1 space-y-3">
                      <li className="ml-4">
                        <div className="absolute -left-[5px] mt-1 w-2.5 h-2.5 rounded-full bg-blue-500" />
                        <p className="text-xs">
                          <span className="font-semibold text-blue-600 mr-1">Reported</span>
                          <span className="font-medium text-gray-700">{t.reportedByName}</span>
                          <span className="text-gray-400 mx-1">·</span>
                          <span className="text-gray-400">{new Date(t.createdAtUtc).toLocaleString()}</span>
                        </p>
                      </li>
                      {t.notes.map(n => (
                        <li key={n.id} className="ml-4">
                          <div className="absolute -left-[5px] mt-1 w-2.5 h-2.5 rounded-full bg-gray-300" />
                          <p className="text-xs">
                            <span className={`font-semibold mr-1 ${
                              n.authorRole === 'Reporter'           ? 'text-blue-600'   :
                              n.authorRole === 'Maintainer'         ? 'text-orange-600' :
                              n.authorRole === 'Asset Manager'      ? 'text-green-700'  :
                              n.authorRole === 'Department Manager' ? 'text-violet-700' :
                              'text-gray-700'
                            }`}>{n.authorRole}:</span>
                            <span className="font-medium text-gray-700">{n.authorName}</span>
                            <span className="text-gray-400 mx-1">·</span>
                            <span className="text-gray-400">{new Date(n.createdAtUtc).toLocaleString()}</span>
                          </p>
                          <p className="text-gray-600 mt-0.5 text-xs">{n.content}</p>
                        </li>
                      ))}
                    </ol>
                    {t.notes.length === 0 && (
                      <p className="text-xs text-gray-400 mt-2 ml-1 flex items-center gap-1">
                        <MessageSquare size={12} /> No activity yet beyond the initial report.
                      </p>
                    )}
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

            {(actionModal.type === 'escalate' || actionModal.type === 'close') && (
              <Select
                label="Leave the asset as"
                options={FINAL_CONDITION_OPTIONS}
                {...register('finalCondition')}
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
