import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { DoorOpen, ChevronRight, ArrowLeft } from 'lucide-react';
import { getMyRooms } from '../../api/assetManager';
import { useAuthStore } from '../../store/authStore';

// Shared room list for Teacher (faculty from the URL) and Student (their own faculty).
export default function RoomsPage({ basePath }: { basePath: '/teacher' | '/student' }) {
  const navigate = useNavigate();
  const { facultyId: facultyParam } = useParams<{ facultyId: string }>();
  const user = useAuthStore(s => s.user);
  const facultyId = facultyParam ?? user?.facultyId ?? '';

  const { data, isLoading } = useQuery({
    queryKey: ['viewer-rooms', facultyId],
    queryFn:  () => getMyRooms(facultyId),
    enabled:  !!facultyId,
  });

  const rooms = data?.items ?? [];

  return (
    <div>
      {basePath === '/teacher' && (
        <button onClick={() => navigate('/teacher')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-3">
          <ArrowLeft size={15} /> Back to faculties
        </button>
      )}
      <h1 className="text-xl font-bold text-gray-900">Rooms</h1>
      <p className="text-sm text-gray-500 mt-0.5">Open a room to view its layout and report issues.</p>

      {!facultyId ? (
        <p className="text-sm text-gray-400 mt-6">No faculty assigned to your account.</p>
      ) : isLoading ? (
        <p className="text-sm text-gray-400 mt-6">Loading…</p>
      ) : rooms.length === 0 ? (
        <p className="text-sm text-gray-400 mt-6">No rooms in this faculty yet.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-6">
          {rooms.map(room => (
            <button
              key={room.id}
              onClick={() => navigate(`${basePath}/rooms/${room.id}`)}
              className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                <DoorOpen size={20} className="text-blue-600" />
              </div>
              <span className="flex-1 min-w-0">
                <span className="block font-medium text-gray-900 truncate">{room.name}</span>
                <span className="block text-xs text-gray-400">{room.assetCount} assets · {room.status}</span>
              </span>
              <ChevronRight size={16} className="text-gray-300" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
