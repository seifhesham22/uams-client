import { motion, AnimatePresence } from 'framer-motion';
import { GraduationCap, BookOpen, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { registerTeacher, registerStudent } from '../../api/auth';
import { listPublicFaculties } from '../../api/admin';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';

type RoleChoice = 'teacher' | 'student';

const baseSchema = z.object({
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  email:    z.string().email('Enter a valid email'),
  password: z.string().min(10, 'Password must be at least 10 characters'),
});

const studentSchema = baseSchema.extend({
  facultyId: z.string().min(1, 'Please select a faculty'),
});

export default function RegisterPage() {
  const navigate     = useNavigate();
  const [role, setRole] = useState<RoleChoice | null>(null);

  const { data: faculties } = useQuery({
    queryKey: ['faculties-public'],
    queryFn:  () => listPublicFaculties(undefined, 1, 100),
    enabled: role === 'student',
  });

  const schema = role === 'student' ? studentSchema : baseSchema;
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: any) => {
    try {
      if (role === 'teacher') {
        await registerTeacher(data.email, data.password, data.fullName);
      } else {
        await registerStudent(data.email, data.password, data.fullName, data.facultyId);
      }
      toast.success('Account created! Please sign in.');
      navigate('/login');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Registration failed');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-violet-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <Link to="/" className="inline-flex items-center gap-2.5 mb-4">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
              <span className="text-white font-bold">U</span>
            </div>
            <span className="font-bold text-xl text-gray-900">UAMS</span>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Create account</h1>
          <p className="text-gray-500 text-sm mt-1">Join your university's platform</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white rounded-2xl shadow-xl shadow-gray-100 border border-gray-100 p-8"
        >
          <AnimatePresence mode="wait">
            {!role ? (
              /* Role selection */
              <motion.div
                key="role"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <p className="text-sm font-medium text-gray-700 mb-4 text-center">I am a…</p>
                <div className="grid grid-cols-2 gap-4">
                  {([
                    { id: 'teacher' as const, Icon: GraduationCap, label: 'Teacher',
                      desc: 'Faculty staff member' },
                    { id: 'student' as const, Icon: BookOpen,      label: 'Student',
                      desc: 'Enrolled student' },
                  ] as const).map(({ id, Icon, label, desc }) => (
                    <motion.button
                      key={id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setRole(id)}
                      className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all group"
                    >
                      <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                        <Icon size={24} className="text-blue-600" />
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-gray-900">{label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            ) : (
              /* Registration form */
              <motion.div
                key="form"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <button
                  onClick={() => setRole(null)}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5 transition-colors"
                >
                  <ArrowLeft size={14} /> Back
                </button>

                <div className="flex items-center gap-2 mb-6 p-3 bg-blue-50 rounded-xl">
                  {role === 'teacher'
                    ? <GraduationCap size={18} className="text-blue-600" />
                    : <BookOpen size={18} className="text-blue-600" />
                  }
                  <span className="text-sm font-medium text-blue-700 capitalize">
                    Registering as {role}
                  </span>
                  <CheckCircle2 size={16} className="text-blue-500 ml-auto" />
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <Input
                    label="Full name"
                    placeholder="Dr. Jane Smith"
                    error={(errors as any).fullName?.message}
                    {...register('fullName')}
                  />
                  <Input
                    label="Email"
                    type="email"
                    placeholder="you@university.edu"
                    error={(errors as any).email?.message}
                    {...register('email')}
                  />
                  <Input
                    label="Password"
                    type="password"
                    placeholder="Min. 10 characters"
                    error={(errors as any).password?.message}
                    hint="Must be at least 10 characters"
                    {...register('password')}
                  />
                  {role === 'student' && (
                    <Select
                      label="Faculty"
                      placeholder="Select your faculty"
                      error={(errors as any).facultyId?.message}
                      options={(faculties?.items ?? []).map((f: { id: string; name: string }) => ({ value: f.id, label: f.name }))}
                      {...register('facultyId')}
                    />
                  )}
                  <Button type="submit" className="w-full mt-2" size="lg" loading={isSubmitting}>
                    Create account
                  </Button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-center text-sm text-gray-500 mt-6"
        >
          Already have an account?{' '}
          <Link to="/login" className="text-blue-600 font-medium hover:text-blue-700">
            Sign in
          </Link>
        </motion.p>
      </div>
    </div>
  );
}
