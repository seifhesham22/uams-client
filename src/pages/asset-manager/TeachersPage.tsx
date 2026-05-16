import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, UserMinus, UserPlus, GraduationCap } from 'lucide-react';
import { toast } from 'sonner';
import { getMyTeachers, searchTeachers, assignTeacher, removeTeacher } from '../../api/assetManager';
import { Button } from '../../components/ui/Button';
import type { AMTeacher, AMTeacherSearch } from '../../types';

type Tab = 'my' | 'search';

export default function AMTeachersPage() {
  const qc = useQueryClient();
  const [tab, setTab]       = useState<Tab>('my');
  const [query, setQuery]   = useState('');
  const [unassigned, setUnassigned] = useState(false);

  const { data: myTeachers, isLoading: myLoading } = useQuery({
    queryKey: ['am-my-teachers'],
    queryFn:  getMyTeachers,
    enabled:  tab === 'my',
  });

  const { data: searchResult, isLoading: searchLoading } = useQuery({
    queryKey: ['am-search-teachers', query, unassigned],
    queryFn:  () => searchTeachers(query, unassigned),
    enabled:  tab === 'search',
  });

  const assignMut = useMutation({
    mutationFn: assignTeacher,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['am-my-teachers'] });
      qc.invalidateQueries({ queryKey: ['am-search-teachers'] });
      qc.invalidateQueries({ queryKey: ['am-faculty-info'] });
      toast.success('Teacher assigned to your faculty');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  });

  const removeMut = useMutation({
    mutationFn: removeTeacher,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['am-my-teachers'] });
      qc.invalidateQueries({ queryKey: ['am-faculty-info'] });
      toast.success('Teacher removed from your faculty');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Teachers</h1>
        <p className="text-gray-500 text-sm mt-1">
          {myTeachers?.length ?? 0} teachers in your faculty
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit mb-5">
        {([['my', 'My Faculty Teachers'], ['search', 'Search & Assign']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* My teachers */}
      {tab === 'my' && (
        <TeacherList
          items={myTeachers ?? []}
          loading={myLoading}
          emptyText="No teachers assigned to your faculty yet."
          action={(t: AMTeacher) => (
            <Button variant="ghost" size="sm"
              className="text-red-500 hover:bg-red-50 hover:text-red-600 px-2"
              onClick={() => removeMut.mutate(t.id)}
              loading={removeMut.isPending}
            >
              <UserMinus size={14} />
            </Button>
          )}
          renderSub={(t: AMTeacher) => `Assigned ${new Date(t.assignedAt).toLocaleDateString()}`}
        />
      )}

      {/* Search & assign */}
      {tab === 'search' && (
        <div>
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search by name…"
                className="pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={unassigned}
                onChange={e => setUnassigned(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Show unassigned only
            </label>
          </div>

          <SearchList
            items={searchResult?.items ?? []}
            loading={searchLoading}
            emptyText={query ? 'No teachers found.' : 'Type a name to search.'}
            action={(t: AMTeacherSearch) => (
              <Button size="sm" onClick={() => assignMut.mutate(t.id)} loading={assignMut.isPending}>
                <UserPlus size={13} /> Assign
              </Button>
            )}
          />
        </div>
      )}
    </div>
  );
}

function TeacherList({ items, loading, emptyText, action, renderSub }: {
  items: AMTeacher[];
  loading: boolean;
  emptyText: string;
  action: (t: AMTeacher) => React.ReactNode;
  renderSub: (t: AMTeacher) => string;
}) {
  if (loading) return <Spinner />;
  if (items.length === 0) return <Empty text={emptyText} />;
  return (
    <div className="space-y-2">
      {items.map((t, i) => (
        <motion.div key={t.id}
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
          className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-100 hover:shadow-sm transition-shadow"
        >
          <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 font-semibold text-sm flex-shrink-0">
            {t.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 text-sm">{t.name}</p>
            <p className="text-xs text-gray-400">{renderSub(t)}</p>
          </div>
          {action(t)}
        </motion.div>
      ))}
    </div>
  );
}

function SearchList({ items, loading, emptyText, action }: {
  items: AMTeacherSearch[];
  loading: boolean;
  emptyText: string;
  action: (t: AMTeacherSearch) => React.ReactNode;
}) {
  if (loading) return <Spinner />;
  if (items.length === 0) return <Empty text={emptyText} icon={<GraduationCap size={30} className="mx-auto mb-2 text-gray-200" />} />;
  return (
    <div className="space-y-2">
      {items.map((t, i) => (
        <motion.div key={t.id}
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
          className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-100"
        >
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-sm flex-shrink-0">
            {t.fullName.charAt(0).toUpperCase()}
          </div>
          <p className="flex-1 font-medium text-gray-900 text-sm">{t.fullName}</p>
          {action(t)}
        </motion.div>
      ))}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <svg className="w-6 h-6 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
      </svg>
    </div>
  );
}

function Empty({ text, icon }: { text: string; icon?: React.ReactNode }) {
  return (
    <div className="py-14 text-center text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200">
      {icon}
      <p className="text-sm">{text}</p>
    </div>
  );
}
