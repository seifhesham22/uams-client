import api from './client';
import type { AMTicket } from '../types';

// Teacher: the faculties they're assigned to.
export interface TeacherFaculty {
  facultyId: string;
  facultyName: string;
  assignedAtUtc: string;
}

export const getTeacherFaculties = () =>
  api.get<TeacherFaculty[]>('/teacher/my-faculties').then(r => r.data);

// Tickets the current user reported (teacher / student "my reports").
export const getMyReportedTickets = () =>
  api.get<AMTicket[]>('/tickets/mine').then(r => r.data);
