import api from './client';
import type {
  PagedResult, Faculty, Building, Department,
  AdminFaculty, AdminStats,
  AssetManagerAdmin, DeptManagerAdmin,
} from '../types';

// ── Public (used by student registration — no auth required) ──────────────────
export const listPublicFaculties = (search?: string, page = 1, pageSize = 100) =>
  api.get<PagedResult<Faculty>>('/campus/faculties', { params: { search, page, pageSize } })
    .then(r => r.data);

// ── Admin Faculties (rich view with buildings + asset manager) ────────────────
export const listAdminFaculties = (search?: string, page = 1, pageSize = 50) =>
  api.get<PagedResult<AdminFaculty>>('/admin/faculties', { params: { search, page, pageSize } })
    .then(r => r.data);

export const createFaculty = (name: string) =>
  api.post<string>('/admin/faculties', { name }).then(r => r.data);

// ── Stats ──────────────────────────────────────────────────────────────────────
export const getAdminStats = () =>
  api.get<AdminStats>('/admin/stats').then(r => r.data);

// ── Buildings ─────────────────────────────────────────────────────────────────
export const listBuildings = (search?: string, page = 1, pageSize = 50) =>
  api.get<PagedResult<Building>>('/admin/buildings', { params: { search, page, pageSize } })
    .then(r => r.data);

export const createBuilding = (name: string, address: string) =>
  api.post<string>('/admin/buildings', { name, address }).then(r => r.data);

export const linkFacultyToBuilding = (facultyId: string, buildingId: string) =>
  api.post('/admin/link-faculty', { facultyId, buildingId });

export const unlinkFacultyFromBuilding = (facultyId: string, buildingId: string) =>
  api.delete('/admin/unlink-faculty', { data: { facultyId, buildingId } });

// ── Departments ───────────────────────────────────────────────────────────────
export const listDepartments = (search?: string, page = 1, pageSize = 50) =>
  api.get<PagedResult<Department>>('/campus/departments', { params: { search, page, pageSize } })
    .then(r => r.data);

export const createDepartment = (name: string, handles: number) =>
  api.post<string>('/admin/departments', { name, handles }).then(r => r.data);

// ── Asset Managers ────────────────────────────────────────────────────────────
export const listAssetManagers = (search?: string, facultyId?: string, page = 1, pageSize = 30) =>
  api.get<PagedResult<AssetManagerAdmin>>('/admin/asset-managers', {
    params: { search, facultyId, page, pageSize },
  }).then(r => r.data);

export const createAssetManager = (
  email: string, password: string, fullName: string, facultyId: string
) =>
  api.post('/admin/asset-managers', { email, password, fullName, facultyId }).then(r => r.data);

export const reassignAssetManager = (id: string, facultyId: string) =>
  api.put(`/admin/asset-managers/${id}/faculty`, { facultyId });

export const removeAssetManager = (id: string) =>
  api.delete(`/admin/asset-managers/${id}`);

// ── Department Managers ───────────────────────────────────────────────────────
export const listDeptManagers = (search?: string, departmentId?: string, page = 1, pageSize = 30) =>
  api.get<PagedResult<DeptManagerAdmin>>('/admin/dept-managers', {
    params: { search, departmentId, page, pageSize },
  }).then(r => r.data);

export const createDepartmentManager = (
  email: string, password: string, fullName: string, departmentId: string
) =>
  api.post('/admin/department-managers', { email, password, fullName, departmentId })
    .then(r => r.data);

export const reassignDeptManager = (id: string, departmentId: string) =>
  api.put(`/admin/dept-managers/${id}/department`, { DepartmentId: departmentId });

export const removeDeptManager = (id: string) =>
  api.delete(`/admin/dept-managers/${id}`);
