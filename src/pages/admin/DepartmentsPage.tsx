import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { listDepartments, createDepartment } from '../../api/admin';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Select } from '../../components/ui/Select';
import { Table } from '../../components/ui/Table';
import { Badge, categoryColor, categoryLabel } from '../../components/ui/Badge';
import type { Department } from '../../types';

const CATEGORIES = [
  { value: 0, label: 'Electrical'     },
  { value: 1, label: 'Plumbing'       },
  { value: 2, label: 'Furniture'      },
  { value: 3, label: 'Infrastructure' },
];

const schema = z.object({
  name:     z.string().min(2, 'Name required'),
  handles:  z.string().min(1, 'Select a category'),
});
type Form = z.infer<typeof schema>;

export default function DepartmentsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [open, setOpen]     = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['departments', search],
    queryFn:  () => listDepartments(search || undefined, 1, 50),
  });

  const createMut = useMutation({
    mutationFn: ({ name, handles }: Form) => createDepartment(name, Number(handles)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departments'] });
      toast.success('Department created');
      setOpen(false);
      reset();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  });

  const { register, handleSubmit, formState: { errors }, reset } = useForm<Form>({
    resolver: zodResolver(schema),
  });

  const columns = [
    { key: 'name',     header: 'Name',     render: (r: Department) => <span className="font-medium">{r.name}</span> },
    { key: 'handles',  header: 'Handles',  render: (r: Department) => (
        <Badge label={categoryLabel(r.handles)} color={categoryColor(r.handles)} />
    )},
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Departments</h1>
          <p className="text-gray-500 text-sm mt-1">{data?.total ?? 0} departments</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus size={16} /> New Department</Button>
      </div>

      <div className="relative mb-4 max-w-xs">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search departments…"
          className="pl-9 pr-3 py-2 w-full text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      <Table columns={columns} data={data?.items ?? []} keyFn={r => r.id} loading={isLoading} emptyText="No departments yet" />

      <Modal open={open} onClose={() => setOpen(false)} title="Create Department">
        <form onSubmit={handleSubmit(d => createMut.mutate(d))} className="space-y-4">
          <Input label="Department name" placeholder="e.g. Electrical Maintenance" error={errors.name?.message} {...register('name')} />
          <Select
            label="Handles category"
            placeholder="Select category…"
            options={CATEGORIES}
            error={errors.handles?.message}
            {...register('handles')}
          />
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" className="flex-1" loading={createMut.isPending}>Create</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
