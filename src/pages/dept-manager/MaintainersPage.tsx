import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Plus, UserCheck, UserX, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { getMyMaintainers, createMaintainer, deleteMaintainer } from '../../api/deptManager';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';

const schema = z.object({
  fullName: z.string().min(2, 'Name required'),
  email:    z.string().email('Valid email required'),
  password: z.string().min(10, 'Password must be at least 10 characters'),
  vkId:     z.string().optional(),
});
type Form = z.infer<typeof schema>;

export default function MaintainersPage() {
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['dept-maintainers', page],
    queryFn: () => getMyMaintainers(page),
  });

  const createMut = useMutation({
    mutationFn: (d: Form) => createMaintainer(d.email, d.password, d.fullName, d.vkId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dept-maintainers'] });
      toast.success('Maintainer created');
      setCreateOpen(false);
      reset();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to create maintainer'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteMaintainer(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dept-maintainers'] }); toast.success('Maintainer removed'); },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to remove'),
  });

  const { register, handleSubmit, formState: { errors }, reset } = useForm<Form>({ resolver: zodResolver(schema) });

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Maintainers</h1>
          <p className="text-gray-500 text-sm mt-1">Manage your department's maintainers</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus size={15} /> New Maintainer
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : (data?.items ?? []).length === 0 ? (
        <div className="py-16 text-center text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200">
          <UserCheck size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="font-medium">No maintainers yet</p>
          <p className="text-sm mt-1">Create the first one for your department</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(data?.items ?? []).map((m, i) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-100 hover:shadow-sm transition-shadow"
            >
              <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 font-semibold text-sm flex-shrink-0">
                {m.fullName[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm">{m.fullName}</p>
              </div>
              <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                m.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {m.isActive ? <UserCheck size={12} /> : <UserX size={12} />}
                {m.isActive ? 'Active' : 'Inactive'}
              </span>
              <button
                onClick={() => deleteMut.mutate(m.id)}
                disabled={deleteMut.isPending}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              >
                <Trash2 size={15} />
              </button>
            </motion.div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <Button size="sm" variant="secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <span className="text-sm text-gray-500">{page} / {totalPages}</span>
          <Button size="sm" variant="secondary" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}

      <Modal open={createOpen} onClose={() => { setCreateOpen(false); reset(); }} title="New Maintainer">
        <form onSubmit={handleSubmit(d => createMut.mutate(d))} className="space-y-4">
          <Input label="Full name" placeholder="e.g. Ahmed Hassan" error={errors.fullName?.message} {...register('fullName')} />
          <Input label="Email" type="email" placeholder="maintainer@university.edu" error={errors.email?.message} {...register('email')} />
          <Input label="Password" type="password" placeholder="Min 10 characters" error={errors.password?.message} {...register('password')} />
          <Input label="VK User ID (optional)" placeholder="e.g. 123456789" error={errors.vkId?.message} {...register('vkId')} />
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => { setCreateOpen(false); reset(); }}>Cancel</Button>
            <Button type="submit" className="flex-1" loading={createMut.isPending}>Create</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
