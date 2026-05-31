import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Ticket as TicketIcon, AlertTriangle, Wrench, CheckCircle2, Archive } from 'lucide-react';
import { getMyTickets } from '../../api/assetManager';
import type { AMTicket } from '../../types';

// Group raw ticket statuses into the four phases the AM cares about for reporting.
const PHASE: Record<string, 'open' | 'inProgress' | 'resolved' | 'closed'> = {
  Open: 'open', InspectionRequested: 'open', InspectionDone: 'open',
  SentForFix: 'inProgress', AwaitingParts: 'inProgress', SentForReplacement: 'inProgress',
  Fixed: 'resolved', Replaced: 'resolved',
  ConfirmedFixed: 'closed', Closed: 'closed', EscalatedExternally: 'closed', Irreparable: 'closed',
};

const STATUS_LABEL: Record<string, string> = {
  Open: 'Open', InspectionRequested: 'Inspection requested', InspectionDone: 'Inspection done',
  SentForFix: 'Sent for fix', AwaitingParts: 'Awaiting parts', SentForReplacement: 'Sent for replacement',
  Fixed: 'Fixed', Replaced: 'Replaced', ConfirmedFixed: 'Confirmed fixed',
  Closed: 'Closed', EscalatedExternally: 'Escalated', Irreparable: 'Irreparable',
};

export default function AMReportsPage() {
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['am-tickets', false],
    queryFn:  () => getMyTickets(false),
  });

  const stats = useMemo(() => {
    const phase = { open: 0, inProgress: 0, resolved: 0, closed: 0 };
    const byStatus: Record<string, number> = {};
    const byDept: Record<string, number> = {};
    for (const t of tickets) {
      phase[PHASE[t.status] ?? 'open']++;
      byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
      const d = t.departmentName ?? 'Unassigned';
      byDept[d] = (byDept[d] ?? 0) + 1;
    }
    const active = phase.open + phase.inProgress + phase.resolved;
    return { phase, byStatus, byDept, active };
  }, [tickets]);

  const cards = [
    { label: 'Total tickets', value: tickets.length,      icon: TicketIcon,    color: 'text-gray-600  bg-gray-100' },
    { label: 'Open',          value: stats.phase.open,     icon: AlertTriangle, color: 'text-amber-700 bg-amber-100' },
    { label: 'In progress',   value: stats.phase.inProgress, icon: Wrench,      color: 'text-blue-700  bg-blue-100' },
    { label: 'Resolved',      value: stats.phase.resolved, icon: CheckCircle2,  color: 'text-green-700 bg-green-100' },
    { label: 'Closed',        value: stats.phase.closed,   icon: Archive,       color: 'text-gray-500  bg-gray-100' },
  ];

  const recent = [...tickets]
    .sort((a, b) => +new Date(b.createdAtUtc) - +new Date(a.createdAtUtc))
    .slice(0, 12);

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <BarChart3 size={22} className="text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-500 text-sm">Overview of all maintenance tickets in your faculty.</p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : tickets.length === 0 ? (
        <div className="py-16 text-center text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200">
          No tickets reported yet.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {cards.map(c => (
              <div key={c.label} className="bg-white rounded-xl border border-gray-100 p-4">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${c.color}`}>
                  <c.icon size={18} />
                </div>
                <p className="text-2xl font-bold text-gray-900">{c.value}</p>
                <p className="text-xs text-gray-500">{c.label}</p>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Breakdown by status */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">By status</h2>
              <div className="space-y-2">
                {Object.entries(stats.byStatus).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
                  <div key={status} className="flex items-center gap-3">
                    <span className="text-xs text-gray-600 w-40 flex-shrink-0">{STATUS_LABEL[status] ?? status}</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-400 rounded-full" style={{ width: `${(count / tickets.length) * 100}%` }} />
                    </div>
                    <span className="text-xs font-medium text-gray-700 w-6 text-right">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Breakdown by department */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">By department</h2>
              <div className="space-y-2">
                {Object.entries(stats.byDept).sort((a, b) => b[1] - a[1]).map(([dept, count]) => (
                  <div key={dept} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 truncate">{dept}</span>
                    <span className="font-medium text-gray-800">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent tickets */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <h2 className="text-sm font-semibold text-gray-700 px-5 py-3 border-b border-gray-50">Recent reports</h2>
            <div className="divide-y divide-gray-50">
              {recent.map((t: AMTicket) => (
                <div key={t.id} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{t.assetName}</p>
                    <p className="text-xs text-gray-400">{t.roomName} · by {t.reportedByName} · {new Date(t.createdAtUtc).toLocaleDateString()}</p>
                  </div>
                  <span className="text-xs text-gray-500 flex-shrink-0">{STATUS_LABEL[t.status] ?? t.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
