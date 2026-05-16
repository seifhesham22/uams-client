import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { listBuildings, createBuilding } from '../../api/admin';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Table } from '../../components/ui/Table';
import type { Building } from '../../types';

const schema = z.object({
  name:    z.string().min(2, 'Name required'),
  address: z.string().min(4, 'Address required'),
});
type Form = z.infer<typeof schema>;

export default function BuildingsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [open, setOpen]     = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['buildings', search],
    queryFn:  () => listBuildings(search || undefined, 1, 50),
  });

  const createMut = useMutation({
    mutationFn: ({ name, address }: Form) => createBuilding(name, address),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['buildings'] });
      toast.success('Building created');
      setOpen(false);
      reset();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  });

  const { register, handleSubmit, formState: { errors }, reset } = useForm<Form>({
    resolver: zodResolver(schema),
  });

  const columns = [
    { key: 'name',    header: 'Name',    render: (r: Building) => <span className="font-medium">{r.name}</span> },
    { key: 'address', header: 'Address', render: (r: Building) => <span className="text-gray-500">{r.address}</span> },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Buildings</h1>
          <p className="text-gray-500 text-sm mt-1">{data?.total ?? 0} buildings registered</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus size={16} /> New Building</Button>
      </div>

      <div className="relative mb-4 max-w-xs">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search buildings…"
          className="pl-9 pr-3 py-2 w-full text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <Table columns={columns} data={data?.items ?? []} keyFn={r => r.id} loading={isLoading} emptyText="No buildings yet" />

      <Modal open={open} onClose={() => setOpen(false)} title="Create Building">
        <form onSubmit={handleSubmit(d => createMut.mutate(d))} className="space-y-4">
          <Input label="Building name" placeholder="e.g. Main Campus Block A" error={errors.name?.message} {...register('name')} />
          <Input label="Address"       placeholder="e.g. 12 University Ave"    error={errors.address?.message} {...register('address')} />
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" className="flex-1" loading={createMut.isPending}>Create</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
