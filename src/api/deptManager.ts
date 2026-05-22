import api from './client';
import type { DeptMaintainer, DeptTicket, PagedResult } from '../types';

export const getMyMaintainers = (page = 1, pageSize = 20) =>
  api.get<PagedResult<DeptMaintainer>>('/departmentmanager/maintainers/my', { params: { page, pageSize } })
    .then(r => r.data);

export const createMaintainer = (email: string, password: string, fullName: string, vkId?: string) =>
  api.post('/departmentmanager/maintainers', { email, password, fullName, vkId: vkId || null }).then(r => r.data);

export const getDeptTickets = (needsAction = false) =>
  api.get<DeptTicket[]>('/departmentmanager/tickets', { params: { needsAction } }).then(r => r.data);

export const getActionCount = () =>
  api.get<{ count: number }>('/departmentmanager/tickets/action-count').then(r => r.data.count);

export const assignMaintainer = (ticketId: string, maintainerId: string) =>
  api.post(`/tickets/${ticketId}/assign-maintainer`, { MaintainerId: maintainerId });

export const reassignMaintainer = (ticketId: string, newMaintainerId: string) =>
  api.post(`/tickets/${ticketId}/reassign-maintainer`, { NewMaintainerId: newMaintainerId });

export const deleteMaintainer = (id: string) =>
  api.delete(`/departmentmanager/maintainers/${id}`);

export const resendVkNotification = (ticketId: string) =>
  api.post<{ sent: boolean }>(`/departmentmanager/tickets/${ticketId}/resend-notification`)
    .then(r => r.data.sent);
