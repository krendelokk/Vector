import { create } from 'zustand';
import type { CurrentUser, Role } from '../lib/types';

interface AuthState {
  /** Access-токен лише в пам'яті (не в localStorage): захист від крадіжки через XSS-збереження. */
  accessToken: string | null;
  user: CurrentUser | null;
  initialized: boolean;
  setSession: (token: string, user: CurrentUser) => void;
  setToken: (token: string) => void;
  setUser: (user: CurrentUser) => void;
  clear: () => void;
  markInitialized: () => void;
  hasRole: (...roles: Role[]) => boolean;
}

export const useAuth = create<AuthState>((set, get) => ({
  accessToken: null,
  user: null,
  initialized: false,
  setSession: (accessToken, user) => set({ accessToken, user }),
  setToken: (accessToken) => set({ accessToken }),
  setUser: (user) => set({ user }),
  clear: () => set({ accessToken: null, user: null }),
  markInitialized: () => set({ initialized: true }),
  hasRole: (...roles) => {
    const u = get().user;
    return Boolean(u && roles.includes(u.role));
  },
}));
