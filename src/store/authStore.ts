import { create } from 'zustand';
import type { AuthUser, Role } from '../types';

interface AuthState {
  user: AuthUser | null;
  setUser: (user: AuthUser) => void;
  logout: () => void;
}

function loadStoredAuth(): AuthUser | null {
  try {
    const raw = localStorage.getItem('auth');
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    localStorage.removeItem('auth');
    return null;
  }
}

export const useAuthStore = create<AuthState>(set => ({
  user: loadStoredAuth(),
  setUser: user => {
    localStorage.setItem('auth', JSON.stringify(user));
    set({ user });
  },
  logout: () => {
    localStorage.removeItem('auth');
    set({ user: null });
  },
}));

export const useRole = (): Role | null => useAuthStore(s => s.user?.role ?? null);
