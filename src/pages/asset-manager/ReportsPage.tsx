import { BarChart3 } from 'lucide-react';

// Intentionally left blank — the reporting experience is being redesigned with the
// asset manager. Keep an empty, calm layout here until that meeting happens.
export default function AMReportsPage() {
  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <BarChart3 size={22} className="text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-500 text-sm">Coming soon.</p>
        </div>
      </div>

      <div className="py-24 text-center text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200">
        <BarChart3 size={36} className="mx-auto mb-3 text-gray-200" />
        <p className="font-medium text-gray-500">Reports are being redesigned</p>
        <p className="text-sm mt-1">This section will return after we finalize what the asset manager needs.</p>
      </div>
    </div>
  );
}
