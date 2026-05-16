import { motion } from 'framer-motion';
import { Building2, GraduationCap, Briefcase, Package, Users, TrendingUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getAdminStats } from '../../api/admin';
import { listAssets } from '../../api/assets';

const card = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0 },
};

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value?: number;
  color: string;
  delay: number;
}

function StatCard({ icon: Icon, label, value, color, delay }: StatCardProps) {
  return (
    <motion.div
      variants={card}
      transition={{ delay }}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center gap-4"
    >
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5">
          {value ?? <span className="text-gray-300">—</span>}
        </p>
      </div>
    </motion.div>
  );
}

export default function DashboardPage() {
  const { data: stats  } = useQuery({ queryKey: ['admin-stats'],  queryFn: getAdminStats });
  const { data: assets } = useQuery({ queryKey: ['assets'],       queryFn: () => listAssets(undefined, undefined, 1, 1) });

  const statCards = [
    { icon: GraduationCap, label: 'Faculties',        value: stats?.facultyCount,    color: 'bg-blue-500',   delay: 0    },
    { icon: Building2,     label: 'Buildings',         value: stats?.buildingCount,   color: 'bg-violet-500', delay: 0.05 },
    { icon: Briefcase,     label: 'Departments',       value: stats?.departmentCount, color: 'bg-amber-500',  delay: 0.10 },
    { icon: Package,       label: 'Asset Definitions', value: assets?.total,          color: 'bg-green-500',  delay: 0.15 },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Overview of your campus configuration</p>
      </div>

      <motion.div
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
      >
        {statCards.map(s => <StatCard key={s.label} {...s} />)}
      </motion.div>

      {/* Quick actions */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-5">
          <TrendingUp size={18} className="text-blue-600" />
          <h2 className="font-semibold text-gray-900">Quick actions</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { href: '/admin/faculties',   icon: GraduationCap, label: 'Add Faculty',    color: 'text-blue-600 bg-blue-50'     },
            { href: '/admin/buildings',   icon: Building2,      label: 'Add Building',  color: 'text-violet-600 bg-violet-50' },
            { href: '/admin/departments', icon: Briefcase,      label: 'Add Department',color: 'text-amber-600 bg-amber-50'   },
            { href: '/admin/managers',    icon: Users,          label: 'Add Manager',   color: 'text-green-600 bg-green-50'   },
            { href: '/admin/assets',      icon: Package,        label: 'Define Asset',  color: 'text-rose-600 bg-rose-50'     },
          ].map(({ href, icon: Icon, label, color }) => (
            <a key={href} href={href}
              className="flex items-center gap-3 p-3 rounded-xl hover:shadow-sm border border-gray-100 hover:border-gray-200 transition-all"
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
                <Icon size={18} />
              </div>
              <span className="text-sm font-medium text-gray-700">{label}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
