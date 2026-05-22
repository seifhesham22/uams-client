import { motion } from 'framer-motion';
import { LayoutDashboard, Users, Ticket, LogOut, ChevronRight, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useQuery } from '@tanstack/react-query';
import { getActionCount } from '../../api/deptManager';

const NAV = [
  { to: '/dept-manager',             icon: LayoutDashboard, label: 'Dashboard',   end: true },
  { to: '/dept-manager/maintainers', icon: Users,           label: 'Maintainers'         },
  { to: '/dept-manager/tickets',     icon: Ticket,          label: 'Tickets'             },
];

export function DeptManagerLayout() {
  const { user, logout }  = useAuthStore();
  const navigate           = useNavigate();
  const { pathname }       = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: actionCount = 0 } = useQuery({
    queryKey: ['dept-action-count'],
    queryFn: getActionCount,
    refetchInterval: 30_000,
  });

  const handleLogout = () => { logout(); navigate('/login'); };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="px-6 py-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">U</span>
          </div>
          <div>
            <p className="font-bold text-gray-900 text-sm leading-none">UAMS</p>
            <p className="text-xs text-gray-400 mt-0.5">Dept. Manager</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
                isActive ? 'bg-violet-50 text-violet-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={18} className={isActive ? 'text-violet-600' : 'text-gray-400 group-hover:text-gray-600'} />
                <span className="flex-1">{label}</span>
                {label === 'Tickets' && actionCount > 0 && (
                  <span className="text-xs bg-red-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">
                    {actionCount}
                  </span>
                )}
                {isActive && <ChevronRight size={14} className="text-violet-400" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-gray-100">
        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 font-semibold text-sm">
            {user?.email?.[0]?.toUpperCase() ?? 'D'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{user?.email}</p>
            <p className="text-xs text-gray-400">Dept. Manager</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="hidden lg:flex flex-col w-60 bg-white border-r border-gray-200 flex-shrink-0">
        <SidebarContent />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <motion.aside
            initial={{ x: -240 }} animate={{ x: 0 }} exit={{ x: -240 }}
            className="absolute left-0 top-0 bottom-0 w-60 bg-white border-r border-gray-200"
          >
            <SidebarContent />
          </motion.aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="lg:hidden flex items-center gap-4 px-4 py-3 bg-white border-b border-gray-200">
          <button onClick={() => setMobileOpen(!mobileOpen)} className="p-1.5 rounded-lg hover:bg-gray-100">
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <span className="font-semibold text-gray-900">UAMS</span>
        </header>

        <main className="flex-1 overflow-y-auto">
          {pathname.startsWith('/dept-manager/rooms/') ? (
            <Outlet />
          ) : (
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="p-6"
            >
              <Outlet />
            </motion.div>
          )}
        </main>
      </div>
    </div>
  );
}
