import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, ShieldCheck, Wrench, Mail, Building2, Briefcase, UserMinus, RefreshCw } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  listAdminFaculties, listDepartments,
  createAssetManager, createDepartmentManager,
  listAssetManagers, listDeptManagers,
  reassignAssetManager, removeAssetManager,
  reassignDeptManager, removeDeptManager,
} from '../../api/admin';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Select } from '../../components/ui/Select';
import { Badge, categoryColor, categoryLabel } from '../../components/ui/Badge';
import type { AssetManagerAdmin, DeptManagerAdmin } from '../../types';

type Tab = 'asset' | 'dept';

// ── Validation schemas ────────────────────────────────────────────────────────
const amSchema = z.object({
  fullName:  z.string().min(2, 'Name required'),
  email:     z.string().email('Valid email required'),
  password:  z.string().min(10, 'Min 10 characters'),
  facultyId: z.string().min(1, 'Select a faculty'),
});
type AMForm = z.infer<typeof amSchema>;

const dmSchema = z.object({
  fullName:     z.string().min(2, 'Name required'),
  email:        z.string().email('Valid email required'),
  password:     z.string().min(10, 'Min 10 characters'),
  departmentId: z.string().min(1, 'Select a department'),
});
type DMForm = z.infer<typeof dmSchema>;

const reassignSchema   = z.object({ facultyId:   z.string().min(1, 'Select a faculty') });
const reassignDmSchema = z.object({ departmentId: z.string().min(1, 'Select a department') });
type ReassignForm   = z.infer<typeof reassignSchema>;
type ReassignDmForm = z.infer<typeof reassignDmSchema>;

export default function ManagersPage() {
  const qc = useQueryClient();
  const [tab, setTab]           = useState<Tab>('asset');
  const [amSearch, setAmSearch] = useState('');
  const [dmSearch, setDmSearch] = useState('');
  const [amFaculty, setAmFaculty] = useState('');
  const [dmDept,    setDmDept]    = useState('');

  const [amOpen, setAmOpen]         = useState(false);
  const [dmOpen, setDmOpen]         = useState(false);
  const [reassignTarget,   setReassignTarget]   = useState<AssetManagerAdmin | null>(null);
  const [reassignDmTarget, setReassignDmTarget] = useState<DeptManagerAdmin | null>(null);

  // ── Data queries ──────────────────────────────────────────────────────────
  const { data: assetManagers, isLoading: amLoading } = useQuery({
    queryKey: ['asset-managers', amSearch, amFaculty],
    queryFn:  () => listAssetManagers(amSearch || undefined, amFaculty || undefined),
  });

  const { data: deptManagers, isLoading: dmLoading } = useQuery({
    queryKey: ['dept-managers', dmSearch, dmDept],
    queryFn:  () => listDeptManagers(dmSearch || undefined, dmDept || undefined),
  });

  const { data: faculties   } = useQuery({
    queryKey: ['faculties-all'],
    queryFn:  () => listAdminFaculties(undefined, 1, 200),
  });
  const { data: departments } = useQuery({
    queryKey: ['departments-all'],
    queryFn:  () => listDepartments(undefined, 1, 200),
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const amMut = useMutation({
    mutationFn: (d: AMForm) => createAssetManager(d.email, d.password, d.fullName, d.facultyId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asset-managers'] });
      qc.invalidateQueries({ queryKey: ['admin-faculties'] });
      toast.success('Asset manager created');
      setAmOpen(false); amReset();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  });

  const dmMut = useMutation({
    mutationFn: (d: DMForm) => createDepartmentManager(d.email, d.password, d.fullName, d.departmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dept-managers'] });
      toast.success('Department manager created');
      setDmOpen(false); dmReset();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  });

  const reassignMut = useMutation({
    mutationFn: ({ id, facultyId }: { id: string; facultyId: string }) =>
      reassignAssetManager(id, facultyId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asset-managers'] });
      qc.invalidateQueries({ queryKey: ['admin-faculties'] });
      toast.success('Reassigned successfully');
      setReassignTarget(null); reassignReset();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => removeAssetManager(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asset-managers'] });
      qc.invalidateQueries({ queryKey: ['admin-faculties'] });
      toast.success('Asset manager removed');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  });

  const reassignDmMut = useMutation({
    mutationFn: ({ id, departmentId }: { id: string; departmentId: string }) =>
      reassignDeptManager(id, departmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dept-managers'] });
      toast.success('Reassigned successfully');
      setReassignDmTarget(null); reassignDmReset();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  });

  const removeDmMut = useMutation({
    mutationFn: (id: string) => removeDeptManager(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dept-managers'] });
      toast.success('Department manager removed');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  });

  // ── Forms ─────────────────────────────────────────────────────────────────
  const { register: amReg, handleSubmit: amSubmit, formState: { errors: amErr }, reset: amReset } =
    useForm<AMForm>({ resolver: zodResolver(amSchema) });

  const { register: dmReg, handleSubmit: dmSubmit, formState: { errors: dmErr }, reset: dmReset } =
    useForm<DMForm>({ resolver: zodResolver(dmSchema) });

  const { register: rrReg,  handleSubmit: rrSubmit,  formState: { errors: rrErr },  reset: reassignReset }   =
    useForm<ReassignForm>({ resolver: zodResolver(reassignSchema) });

  const { register: rdrReg, handleSubmit: rdrSubmit, formState: { errors: rdrErr }, reset: reassignDmReset } =
    useForm<ReassignDmForm>({ resolver: zodResolver(reassignDmSchema) });

  const facultyOptions = (faculties?.items ?? []).map(f => ({ value: f.id, label: f.name }));
  const deptOptions    = (departments?.items ?? []).map(d => ({ value: d.id, label: `${d.name} (${d.handles})` }));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Managers</h1>
          <p className="text-gray-500 text-sm mt-1">
            {tab === 'asset'
              ? `${assetManagers?.total ?? 0} asset managers`
              : `${deptManagers?.total ?? 0} department managers`}
          </p>
        </div>
        <Button onClick={() => tab === 'asset' ? setAmOpen(true) : setDmOpen(true)}>
          <Plus size={16} /> New {tab === 'asset' ? 'Asset Manager' : 'Dept. Manager'}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit mb-5">
        {([
          ['asset', 'Asset Managers',       ShieldCheck],
          ['dept',  'Department Managers',  Wrench],
        ] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {/* ── Asset Managers tab ─────────────────────────────────────────────── */}
      {tab === 'asset' && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={amSearch}
                onChange={e => setAmSearch(e.target.value)}
                placeholder="Search name or email…"
                className="pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
              />
            </div>
            <select
              value={amFaculty}
              onChange={e => setAmFaculty(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">All faculties</option>
              {facultyOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <ManagerTable<AssetManagerAdmin>
            items={assetManagers?.items ?? []}
            loading={amLoading}
            emptyText="No asset managers yet"
            columns={[
              {
                header: 'Name',
                render: m => (
                  <div>
                    <p className="font-medium text-gray-900">{m.fullName}</p>
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                      <Mail size={11} /> {m.email}
                    </p>
                  </div>
                ),
              },
              {
                header: 'Faculty',
                render: m => (
                  <span className="flex items-center gap-1.5 text-sm text-gray-600">
                    <Building2 size={13} className="text-blue-400" /> {m.facultyName}
                  </span>
                ),
              },
              {
                header: '',
                render: m => (
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="secondary" size="sm"
                      onClick={() => setReassignTarget(m)}
                    >
                      <RefreshCw size={13} /> Reassign
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      className="text-red-500 hover:bg-red-50 hover:text-red-600 px-2"
                      onClick={() => removeMut.mutate(m.id)}
                      loading={removeMut.isPending}
                    >
                      <UserMinus size={14} />
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </>
      )}

      {/* ── Department Managers tab ────────────────────────────────────────── */}
      {tab === 'dept' && (
        <>
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={dmSearch}
                onChange={e => setDmSearch(e.target.value)}
                placeholder="Search name or email…"
                className="pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
              />
            </div>
            <select
              value={dmDept}
              onChange={e => setDmDept(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">All departments</option>
              {deptOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <ManagerTable<DeptManagerAdmin>
            items={deptManagers?.items ?? []}
            loading={dmLoading}
            emptyText="No department managers yet"
            columns={[
              {
                header: 'Name',
                render: m => (
                  <div>
                    <p className="font-medium text-gray-900">{m.fullName}</p>
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                      <Mail size={11} /> {m.email}
                    </p>
                  </div>
                ),
              },
              {
                header: 'Department',
                render: m => (
                  <div className="flex items-center gap-2">
                    <Briefcase size={13} className="text-amber-400" />
                    <span className="text-sm text-gray-600">{m.departmentName}</span>
                    <Badge label={categoryLabel(m.category)} color={categoryColor(m.category)} />
                  </div>
                ),
              },
              {
                header: '',
                render: m => (
                  <div className="flex gap-2 justify-end">
                    <Button variant="secondary" size="sm" onClick={() => setReassignDmTarget(m)}>
                      <RefreshCw size={13} /> Reassign
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      className="text-red-500 hover:bg-red-50 hover:text-red-600 px-2"
                      onClick={() => removeDmMut.mutate(m.id)}
                      loading={removeDmMut.isPending}
                    >
                      <UserMinus size={14} />
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </>
      )}

      {/* ── Create Asset Manager modal ─────────────────────────────────────── */}
      <Modal open={amOpen} onClose={() => { setAmOpen(false); amReset(); }} title="Create Asset Manager">
        <form onSubmit={amSubmit(d => amMut.mutate(d))} className="space-y-4">
          <Input label="Full name" placeholder="Jane Smith"        error={amErr.fullName?.message}  {...amReg('fullName')} />
          <Input label="Email"     type="email" placeholder="manager@uni.edu" error={amErr.email?.message} {...amReg('email')} />
          <Input label="Password"  type="password" placeholder="Min. 10 characters" error={amErr.password?.message} {...amReg('password')} />
          <Select label="Faculty"  placeholder="Assign to faculty…" options={facultyOptions} error={amErr.facultyId?.message} {...amReg('facultyId')} />
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => { setAmOpen(false); amReset(); }}>Cancel</Button>
            <Button type="submit"  className="flex-1" loading={amMut.isPending}>Create</Button>
          </div>
        </form>
      </Modal>

      {/* ── Create Dept Manager modal ──────────────────────────────────────── */}
      <Modal open={dmOpen} onClose={() => { setDmOpen(false); dmReset(); }} title="Create Department Manager">
        <form onSubmit={dmSubmit(d => dmMut.mutate(d))} className="space-y-4">
          <Input label="Full name"   placeholder="John Doe"           error={dmErr.fullName?.message}     {...dmReg('fullName')} />
          <Input label="Email"       type="email" placeholder="deptmgr@uni.edu" error={dmErr.email?.message} {...dmReg('email')} />
          <Input label="Password"    type="password" placeholder="Min. 10 characters" error={dmErr.password?.message} {...dmReg('password')} />
          <Select label="Department" placeholder="Assign to department…" options={deptOptions} error={dmErr.departmentId?.message} {...dmReg('departmentId')} />
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => { setDmOpen(false); dmReset(); }}>Cancel</Button>
            <Button type="submit"  className="flex-1" loading={dmMut.isPending}>Create</Button>
          </div>
        </form>
      </Modal>

      {/* ── Reassign Dept Manager modal ───────────────────────────────────── */}
      <Modal
        open={!!reassignDmTarget}
        onClose={() => { setReassignDmTarget(null); reassignDmReset(); }}
        title={`Reassign — ${reassignDmTarget?.fullName ?? ''}`}
      >
        {reassignDmTarget && (
          <>
            <div className="mb-4 p-3 bg-amber-50 rounded-xl text-sm text-amber-700">
              Currently assigned to <strong>{reassignDmTarget.departmentName}</strong>
            </div>
            <form
              onSubmit={rdrSubmit(d =>
                reassignDmMut.mutate({ id: reassignDmTarget.id, departmentId: d.departmentId })
              )}
              className="space-y-4"
            >
              <Select
                label="New department"
                placeholder="Select new department…"
                options={deptOptions.filter(d => d.value !== reassignDmTarget.departmentId)}
                error={rdrErr.departmentId?.message}
                {...rdrReg('departmentId')}
              />
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="secondary" className="flex-1"
                  onClick={() => { setReassignDmTarget(null); reassignDmReset(); }}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" loading={reassignDmMut.isPending}>
                  Reassign
                </Button>
              </div>
            </form>
          </>
        )}
      </Modal>

      {/* ── Reassign Asset Manager modal ───────────────────────────────────── */}
      <Modal
        open={!!reassignTarget}
        onClose={() => { setReassignTarget(null); reassignReset(); }}
        title={`Reassign — ${reassignTarget?.fullName ?? ''}`}
      >
        {reassignTarget && (
          <>
            <div className="mb-4 p-3 bg-blue-50 rounded-xl text-sm text-blue-700">
              Currently assigned to <strong>{reassignTarget.facultyName}</strong>
            </div>
            <form
              onSubmit={rrSubmit(d =>
                reassignMut.mutate({ id: reassignTarget.id, facultyId: d.facultyId })
              )}
              className="space-y-4"
            >
              <Select
                label="New faculty"
                placeholder="Select new faculty…"
                options={facultyOptions.filter(f => f.value !== reassignTarget.facultyId)}
                error={rrErr.facultyId?.message}
                {...rrReg('facultyId')}
              />
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="secondary" className="flex-1"
                  onClick={() => { setReassignTarget(null); reassignReset(); }}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" loading={reassignMut.isPending}>
                  Reassign
                </Button>
              </div>
            </form>
          </>
        )}
      </Modal>
    </div>
  );
}

// ── Generic manager table ─────────────────────────────────────────────────────
interface Col<T> { header: string; render: (item: T) => React.ReactNode; }

function ManagerTable<T extends { id: string }>({
  items, loading, emptyText, columns,
}: { items: T[]; loading: boolean; emptyText: string; columns: Col<T>[] }) {
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <svg className="w-7 h-7 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
        </svg>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="py-16 text-center text-gray-400 bg-white rounded-2xl border border-gray-100">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            {columns.map((c, i) => (
              <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <motion.tr
              key={item.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors"
            >
              {columns.map((c, j) => (
                <td key={j} className="px-4 py-3">{c.render(item)}</td>
              ))}
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
