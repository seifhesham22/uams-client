import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AdminLayout } from './components/layout/AdminLayout';
import { AssetManagerLayout } from './components/layout/AssetManagerLayout';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
// Admin pages
import AdminDashboardPage from './pages/admin/DashboardPage';
import FacultiesPage from './pages/admin/FacultiesPage';
import AdminBuildingsPage from './pages/admin/BuildingsPage';
import DepartmentsPage from './pages/admin/DepartmentsPage';
import ManagersPage from './pages/admin/ManagersPage';
import AssetDefinitionsPage from './pages/admin/AssetDefinitionsPage';
import CompositeDesignerPage from './pages/admin/CompositeDesignerPage';
// Asset Manager pages
import AMDashboardPage from './pages/asset-manager/DashboardPage';
import AMBuildingsPage from './pages/asset-manager/BuildingsPage';
import AMTeachersPage from './pages/asset-manager/TeachersPage';
import AMStudentsPage from './pages/asset-manager/StudentsPage';
import AMTicketsPage  from './pages/asset-manager/TicketsPage';
import CanvasPage from './pages/asset-manager/CanvasPage';
import { DeptManagerLayout } from './components/layout/DeptManagerLayout';
import DMDashboardPage   from './pages/dept-manager/DashboardPage';
import MaintainersPage   from './pages/dept-manager/MaintainersPage';
import DMTicketsPage     from './pages/dept-manager/TicketsPage';
// Teacher / Student (read-only viewer) portal
import { ViewerLayout } from './components/layout/ViewerLayout';
import ViewerFacultiesPage from './pages/viewer/FacultiesPage';
import ViewerRoomsPage     from './pages/viewer/RoomsPage';
import MyReportsPage       from './pages/viewer/MyReportsPage';
import { useAuthStore } from './store/authStore';
import type { Role } from './types';

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function RequireRole({ role, children }: { role: Role; children: React.ReactNode }) {
  const user = useAuthStore(s => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <Toaster richColors position="top-right" />
      <Routes>
        <Route path="/"         element={<LandingPage />} />
        <Route path="/login"    element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* ── Super Admin ─────────────────────────────────────────────────── */}
        <Route path="/admin" element={<RequireRole role="SuperAdmin"><AdminLayout /></RequireRole>}>
          <Route index              element={<AdminDashboardPage />} />
          <Route path="faculties"   element={<FacultiesPage />} />
          <Route path="buildings"   element={<AdminBuildingsPage />} />
          <Route path="departments" element={<DepartmentsPage />} />
          <Route path="managers"    element={<ManagersPage />} />
          <Route path="assets"      element={<AssetDefinitionsPage />} />
          <Route path="composites"  element={<CompositeDesignerPage />} />
        </Route>

        {/* ── Asset Manager ────────────────────────────────────────────────── */}
        <Route path="/asset-manager" element={<RequireRole role="AssetManager"><AssetManagerLayout /></RequireRole>}>
          <Route index              element={<AMDashboardPage />} />
          <Route path="buildings"   element={<AMBuildingsPage />} />
          <Route path="teachers"    element={<AMTeachersPage />} />
          <Route path="students"    element={<AMStudentsPage />} />
          <Route path="tickets"     element={<AMTicketsPage />} />
          {/* Canvas is full-screen — it uses position:fixed to cover the layout */}
          <Route path="rooms/:roomId" element={<CanvasPage />} />
        </Route>

        {/* ── Department Manager ───────────────────────────────────────────── */}
        <Route path="/dept-manager" element={<RequireRole role="DepartmentManager"><DeptManagerLayout /></RequireRole>}>
          <Route index                  element={<DMDashboardPage />} />
          <Route path="maintainers"     element={<MaintainersPage />} />
          <Route path="tickets"         element={<DMTicketsPage />} />
        </Route>

        {/* ── Teacher (read-only) ──────────────────────────────────────────── */}
        <Route path="/teacher" element={<RequireRole role="Teacher"><ViewerLayout role="Teacher" /></RequireRole>}>
          <Route index                    element={<ViewerFacultiesPage />} />
          <Route path="faculty/:facultyId" element={<ViewerRoomsPage basePath="/teacher" />} />
          <Route path="my-reports"        element={<MyReportsPage />} />
          {/* Canvas is full-screen (position:fixed) and covers the layout */}
          <Route path="rooms/:roomId"     element={<CanvasPage />} />
        </Route>

        {/* ── Student (read-only) ──────────────────────────────────────────── */}
        <Route path="/student" element={<RequireRole role="Student"><ViewerLayout role="Student" /></RequireRole>}>
          <Route index                element={<ViewerRoomsPage basePath="/student" />} />
          <Route path="my-reports"    element={<MyReportsPage />} />
          <Route path="rooms/:roomId" element={<CanvasPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </QueryClientProvider>
  );
}
