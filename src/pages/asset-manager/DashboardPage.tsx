import { motion } from 'framer-motion';
import { Building2, GraduationCap, Users, Package } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getMyFacultyInfo } from '../../api/assetManager';

const card = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

function StatCard({ icon: Icon, label, value, color, delay }: {
  icon: React.ElementType; label: string; value?: number; color: string; delay: number;
}) {
  return (
    <motion.div variants={card} transition={{ delay }}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center gap-4">
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

export default function AMDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['am-faculty-info'],
    queryFn:  getMyFacultyInfo,
  });

  return (
    <div>
      <div className="mb-8">
        {isLoading ? (
          <div className="h-8 w-56 bg-gray-100 rounded-lg animate-pulse" />
        ) : (
          <>
            <h1 className="text-2xl font-bold text-gray-900">{data?.facultyName}</h1>
            <p className="text-gray-500 mt-1 text-sm">Your faculty overview</p>
          </>
        )}
      </div>

      <motion.div
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
        initial="hidden" animate="show"
        className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8"
      >
        <StatCard icon={Building2}      label="Buildings" value={data?.buildingCount} color="bg-blue-500"   delay={0}    />
        <StatCard icon={GraduationCap}  label="Teachers"  value={data?.teacherCount}  color="bg-violet-500" delay={0.06} />
        <StatCard icon={Users}          label="Students"  value={data?.studentCount}  color="bg-green-500"  delay={0.12} />
      </motion.div>

      {/* Quick links */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Quick actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { to: '/asset-manager/buildings', icon: Building2,     label: 'View Buildings & Rooms', color: 'text-blue-600 bg-blue-50'   },
            { to: '/asset-manager/teachers',  icon: GraduationCap, label: 'Manage Teachers',        color: 'text-violet-600 bg-violet-50' },
            { to: '/asset-manager/students',  icon: Users,          label: 'View Students',          color: 'text-green-600 bg-green-50'  },
          ].map(({ to, icon: Icon, label, color }) => (
            <Link key={to} to={to}
              className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
                <Icon size={18} />
              </div>
              <span className="text-sm font-medium text-gray-700">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
