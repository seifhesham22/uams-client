import { motion, useInView } from 'framer-motion';
import {
  Building2, ClipboardCheck, Settings, ShieldCheck,
  ArrowRight, Layers, Wrench
} from 'lucide-react';
import { useRef } from 'react';
import { Link } from 'react-router-dom';

const features = [
  { icon: Building2,      color: 'blue',   title: 'Campus Management',   desc: 'Organise faculties, buildings, and rooms in one unified platform.' },
  { icon: Layers,         color: 'violet', title: 'Room Design',         desc: 'Drag-and-drop canvas to place and track every asset in every room.' },
  { icon: ClipboardCheck, color: 'green',  title: 'Smart Checklists',    desc: 'Per-asset maintenance checklists tied to each academic year.' },
  { icon: Wrench,         color: 'amber',  title: 'Ticket Workflow',     desc: 'Full lifecycle from report → inspection → fix → confirmation.' },
  { icon: Settings,       color: 'rose',   title: 'Department Routing',  desc: 'Tickets auto-routed to the right department by asset category.' },
  { icon: ShieldCheck,    color: 'teal',   title: 'Role-Based Access',   desc: 'Granular permissions for admins, managers, maintainers, and users.' },
];

const colorMap: Record<string, string> = {
  blue:   'bg-blue-50 text-blue-600',
  violet: 'bg-violet-50 text-violet-600',
  green:  'bg-green-50 text-green-600',
  amber:  'bg-amber-50 text-amber-600',
  rose:   'bg-rose-50 text-rose-600',
  teal:   'bg-teal-50 text-teal-600',
};

function FeatureCard({ icon: Icon, color, title, desc, delay }: typeof features[0] & { delay: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay }}
      className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${colorMap[color]}`}>
        <Icon size={22} />
      </div>
      <h3 className="font-semibold text-gray-900 mb-1.5">{title}</h3>
      <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
    </motion.div>
  );
}

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};
const item = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white overflow-hidden">
      {/* ── Navbar ── */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="fixed top-0 inset-x-0 z-30 bg-white/80 backdrop-blur border-b border-gray-100"
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">U</span>
            </div>
            <span className="font-bold text-gray-900">UAMS</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login"
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-100">
              Sign in
            </Link>
            <Link to="/register"
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
              Get started
            </Link>
          </div>
        </div>
      </motion.nav>

      {/* ── Hero ── */}
      <section className="relative pt-32 pb-24 px-6">
        {/* Background blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-100 rounded-full blur-3xl opacity-50" />
          <div className="absolute top-60 -left-40 w-80 h-80 bg-violet-100 rounded-full blur-3xl opacity-40" />
        </div>

        <div className="max-w-4xl mx-auto text-center relative">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-full text-xs font-medium text-blue-700 mb-6"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            University Asset Management System
          </motion.div>

          <motion.div variants={container} initial="hidden" animate="show">
            <motion.h1
              variants={item}
              className="text-5xl sm:text-6xl font-extrabold text-gray-900 leading-tight tracking-tight mb-6"
            >
              Manage every asset,{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-violet-600">
                every room
              </span>
            </motion.h1>

            <motion.p
              variants={item}
              className="text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed"
            >
              UAMS gives your university complete visibility and control over campus assets —
              from placement to maintenance, all in one place.
            </motion.p>

            <motion.div variants={item} className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                to="/register"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
              >
                Get started free <ArrowRight size={18} />
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center justify-center px-6 py-3 bg-white text-gray-700 font-semibold rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                Sign in
              </Link>
            </motion.div>
          </motion.div>
        </div>

        {/* Hero illustration */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="max-w-5xl mx-auto mt-16 relative"
        >
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-1 shadow-2xl">
            <div className="bg-gray-900 rounded-xl overflow-hidden">
              {/* Fake browser bar */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-700">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <div className="flex-1 mx-4 bg-gray-700 rounded-md h-6 flex items-center px-3">
                  <span className="text-gray-400 text-xs">localhost:5173/admin</span>
                </div>
              </div>
              {/* Fake dashboard content */}
              <div className="p-6 flex gap-4">
                <div className="w-44 space-y-2">
                  {['Dashboard', 'Faculties', 'Buildings', 'Departments', 'Asset Defs'].map(item => (
                    <div key={item} className={`px-3 py-2 rounded-lg text-xs ${item === 'Dashboard' ? 'bg-blue-600 text-white' : 'text-gray-500'}`}>
                      {item}
                    </div>
                  ))}
                </div>
                <div className="flex-1 grid grid-cols-2 gap-3">
                  {[
                    { label: 'Faculties', value: '12', color: 'bg-blue-500' },
                    { label: 'Rooms',     value: '148', color: 'bg-violet-500' },
                    { label: 'Assets',    value: '892', color: 'bg-green-500' },
                    { label: 'Tickets',   value: '23',  color: 'bg-amber-500' },
                  ].map(stat => (
                    <div key={stat.label} className="bg-gray-800 rounded-xl p-4">
                      <div className={`w-6 h-1.5 rounded-full ${stat.color} mb-3`} />
                      <div className="text-xl font-bold text-white">{stat.value}</div>
                      <div className="text-xs text-gray-500 mt-1">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── Features ── */}
      <section className="py-24 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <motion.h2
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4"
            >
              Everything you need
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-gray-500 max-w-xl mx-auto"
            >
              A complete solution for university asset management, from campus setup to day-to-day maintenance.
            </motion.p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f, i) => (
              <FeatureCard key={f.title} {...f} delay={i * 0.07} />
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="max-w-3xl mx-auto bg-gradient-to-br from-blue-600 to-violet-600 rounded-3xl p-12 text-center shadow-xl"
        >
          <h2 className="text-3xl font-bold text-white mb-4">Ready to get started?</h2>
          <p className="text-blue-100 mb-8">Create your account and start managing your campus assets today.</p>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-blue-700 font-semibold rounded-xl hover:bg-blue-50 transition-colors shadow-md"
          >
            Create account <ArrowRight size={18} />
          </Link>
        </motion.div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 py-8 px-6 text-center text-sm text-gray-400">
        © {new Date().getFullYear()} UAMS — University Asset Management System
      </footer>
    </div>
  );
}
