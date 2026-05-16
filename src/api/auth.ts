import api from './client';

// JWT claim keys emitted by the .NET backend
const CLAIM_USER_ID   = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier';
const CLAIM_ROLE      = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';
const CLAIM_FACULTY   = 'facultyId';
const CLAIM_DEPT      = 'departmentId';

function parseJwt(token: string): Record<string, string> {
  const payload = token.split('.')[1];
  const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(json);
}

export interface LoginResponse {
  token: string;
  role: string;
  userId: string;
  email: string;
  facultyId?: string;
  departmentId?: string;
}

export const login = async (email: string, password: string): Promise<LoginResponse> => {
  const { data } = await api.post<{ token: string; email: string; role: string }>(
    '/auth/login',
    { email, password }
  );
  const claims = parseJwt(data.token);
  return {
    token:        data.token,
    email:        data.email,
    role:         data.role ?? claims[CLAIM_ROLE] ?? '',
    userId:       claims[CLAIM_USER_ID] ?? '',
    facultyId:    claims[CLAIM_FACULTY],
    departmentId: claims[CLAIM_DEPT],
  };
};

export const registerTeacher = (email: string, password: string, fullName: string) =>
  api.post('/auth/register/teacher', { email, password, fullName }).then(r => r.data);

export const registerStudent = (
  email: string, password: string, fullName: string, facultyId: string
) =>
  api.post('/auth/register/student', { email, password, fullName, facultyId }).then(r => r.data);
