import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, ChevronRight } from 'lucide-react';
import { getTeacherFaculties } from '../../api/viewer';

// Teacher landing: pick one of your faculties to browse its rooms.
export default function FacultiesPage() {
  const navigate = useNavigate();
  const { data: faculties = [], isLoading } = useQuery({
    queryKey: ['teacher-faculties'],
    queryFn:  getTeacherFaculties,
  });

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900">My Faculties</h1>
      <p className="text-sm text-gray-500 mt-0.5">Choose a faculty to view its rooms.</p>

      {isLoading ? (
        <p className="text-sm text-gray-400 mt-6">Loading…</p>
      ) : faculties.length === 0 ? (
        <p className="text-sm text-gray-400 mt-6">You are not assigned to any faculty yet.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-6">
          {faculties.map(f => (
            <button
              key={f.facultyId}
              onClick={() => navigate(`/teacher/faculty/${f.facultyId}`)}
              className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                <GraduationCap size={20} className="text-blue-600" />
              </div>
              <span className="flex-1 min-w-0">
                <span className="block font-medium text-gray-900 truncate">{f.facultyName}</span>
              </span>
              <ChevronRight size={16} className="text-gray-300" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
