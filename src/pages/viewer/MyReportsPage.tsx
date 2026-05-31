import { useQuery } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { getMyReportedTickets } from '../../api/viewer';

// Human label + colour for each ticket status.
const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  Open:                { label: 'Open',                 cls: 'bg-amber-100 text-amber-700' },
  InspectionRequested: { label: 'Inspection requested', cls: 'bg-amber-100 text-amber-700' },
  InspectionDone:      { label: 'Inspection done',      cls: 'bg-amber-100 text-amber-700' },
  SentForFix:          { label: 'Sent for fix',         cls: 'bg-blue-100 text-blue-700' },
  AwaitingParts:       { label: 'Awaiting parts',       cls: 'bg-blue-100 text-blue-700' },
  SentForReplacement:  { label: 'Sent for replacement', cls: 'bg-blue-100 text-blue-700' },
  Fixed:               { label: 'Fixed',                cls: 'bg-green-100 text-green-700' },
  Replaced:            { label: 'Replaced',             cls: 'bg-teal-100 text-teal-700' },
  ConfirmedFixed:      { label: 'Confirmed fixed',      cls: 'bg-green-100 text-green-700' },
  Irreparable:         { label: 'Irreparable',          cls: 'bg-red-100 text-red-700' },
  EscalatedExternally: { label: 'Escalated',            cls: 'bg-purple-100 text-purple-700' },
  Closed:              { label: 'Closed',               cls: 'bg-gray-100 text-gray-600' },
};

export default function MyReportsPage() {
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['my-reports'],
    queryFn:  getMyReportedTickets,
  });

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900">My Reports</h1>
      <p className="text-sm text-gray-500 mt-0.5">Issues you reported and their current status.</p>

      {isLoading ? (
        <p className="text-sm text-gray-400 mt-6">Loading…</p>
      ) : tickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ClipboardList size={32} className="text-gray-300" />
          <p className="text-sm text-gray-400 mt-2">You haven't reported anything yet.</p>
        </div>
      ) : (
        <div className="mt-6 bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
          {tickets.map(t => {
            const s = STATUS_STYLE[t.status] ?? { label: t.status, cls: 'bg-gray-100 text-gray-600' };
            const lastNote = t.notes?.[t.notes.length - 1];
            return (
              <div key={t.id} className="flex items-start gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{t.assetName}</p>
                  <p className="text-xs text-gray-400">{t.roomName} · {new Date(t.createdAtUtc).toLocaleDateString()}</p>
                  {lastNote && <p className="text-xs text-gray-500 mt-1 truncate">“{lastNote.content}”</p>}
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${s.cls}`}>{s.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
