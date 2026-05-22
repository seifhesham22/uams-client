import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertCircle, Users, Ticket, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getActionCount, getDeptTickets, getMyMaintainers } from '../../api/deptManager';
import { statusColor, statusLabel } from './ticketHelpers';

export default function DeptDashboardPage() {
  const navigate = useNavigate();

  const { data: actionCount = 0 } = useQuery({ queryKey: ['dept-action-count'], queryFn: getActionCount, refetchInterval: 30_000 });
  const { data: maintainers }     = useQuery({ queryKey: ['dept-maintainers', 1], queryFn: () => getMyMaintainers(1, 5) });
  const { data: needsAction = [] } = useQuery({ queryKey: ['dept-tickets', true], queryFn: () => getDeptTickets(true) });

  const activeCount = maintainers?.items.filter(m => m.isActive).length ?? 0;

  const stats = [
    { label: 'Needs Your Action', value: actionCount, icon: AlertCircle, color: 'bg-red-50 text-red-600', ring: 'border-red-100' },
    { label: 'Active Maintainers', value: activeCount,                    icon: Users,        color: 'bg-violet-50 text-violet-600', ring: 'border-violet-100' },
    { label: 'Open Tickets',       value: needsAction.length,             icon: Ticket,       color: 'bg-blue-50 text-blue-600',     ring: 'border-blue-100' },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Department overview</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            className={`bg-white rounded-2xl border p-5 flex items-center gap-4 ${s.ring}`}
          >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${s.color}`}>
              <s.icon size={22} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              <p className="text-sm text-gray-500">{s.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {needsAction.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <h2 className="font-semibold text-gray-800 text-sm">Tickets Needing Your Action</h2>
            <button onClick={() => navigate('/dept-manager/tickets?tab=action')} className="text-xs text-violet-600 hover:underline flex items-center gap-1">
              View all <ChevronRight size={12} />
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {needsAction.slice(0, 5).map(t => (
              <div key={t.id} className="flex items-center gap-4 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{t.assetName}</p>
                  <p className="text-xs text-gray-400 truncate">{t.roomName} · {t.buildingName}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor(t.status)}`}>
                  {statusLabel(t.status)}
                </span>
                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
                  Unassigned
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
