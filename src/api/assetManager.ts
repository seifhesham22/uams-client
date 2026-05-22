import api from './client';
import type { PagedResult, FacultyInfo, AMBuilding, AMRoom, AMTeacher, AMTeacherSearch, AMStudent, AMTicket } from '../types';

// Base path matches the C# controller name: AssetManagerController → /api/assetmanager
const AM = '/assetmanager';

export const getMyFacultyInfo = () =>
  api.get<FacultyInfo>(`${AM}/my-faculty`).then(r => r.data);

export const getMyBuildings = (facultyId: string) =>
  api.get<AMBuilding[]>(`/campus/faculty/buildings/${facultyId}`).then(r => r.data);

export const getMyRooms = (facultyId: string, page = 1, pageSize = 50) =>
  api.get<PagedResult<AMRoom>>(`/room-design/rooms/faculty/${facultyId}`, {
    params: { page, pageSize },
  }).then(r => r.data);

export const createRoom = (facultyId: string, buildingId: string, name: string) =>
  api.post<string>('/room-design/rooms', { facultyId, buildingId, name }).then(r => r.data);

export const getMyTeachers = () =>
  api.get<AMTeacher[]>(`${AM}/teachers/faculties/my`).then(r => r.data);

export const searchTeachers = (search: string, unAssigned: boolean, page = 1, pageSize = 20) =>
  api.get<PagedResult<AMTeacherSearch>>(`${AM}/teachers/faculties`, {
    params: { search, unAssigned, page, pageSize },
  }).then(r => r.data);

export const assignTeacher = (teacherId: string) =>
  api.post(`${AM}/teachers/${teacherId}/faculties`);

export const removeTeacher = (teacherId: string) =>
  api.delete(`${AM}/teachers/${teacherId}/faculties`);

export const getMyStudents = (page = 1, pageSize = 20) =>
  api.get<PagedResult<AMStudent>>(`${AM}/student/my`, {
    params: { page, pageSize },
  }).then(r => r.data);

// ── Tickets ───────────────────────────────────────────────────────────────────
export const getMyTickets = (needsAction = false) =>
  api.get<AMTicket[]>(`${AM}/tickets`, { params: { needsAction } }).then(r => r.data);

export const getAmActionCount = () =>
  api.get<{ count: number }>(`${AM}/tickets/action-count`).then(r => r.data.count);

export const sendForInspection = (ticketId: string, departmentId: string, note?: string) =>
  api.post(`/tickets/${ticketId}/send-for-inspection`, { DepartmentId: departmentId, Note: note });

export const sendForFix = (ticketId: string, departmentId: string, note?: string) =>
  api.post(`/tickets/${ticketId}/send-for-fix`, { DepartmentId: departmentId, Note: note });

export const sendForReplacement = (ticketId: string, departmentId: string, note?: string) =>
  api.post(`/tickets/${ticketId}/send-for-replacement`, { DepartmentId: departmentId, Note: note });

export const escalateTicket = (ticketId: string, note?: string) =>
  api.post(`/tickets/${ticketId}/escalate`, { Note: note });

export const confirmFix = (ticketId: string) =>
  api.post(`/tickets/${ticketId}/confirm-fix`);

export const closeTicket = (ticketId: string, note?: string) =>
  api.post(`/tickets/${ticketId}/close`, { Note: note });
