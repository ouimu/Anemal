// ==============================================
// stores/auth.store.ts — Zustand Auth Store
// ==============================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import apiClient from '../utils/api';

interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'doctor' | 'staff';
  tenantId: number;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,

      login: async (email: string, password: string) => {
        const res = await apiClient.post('/auth/login', { email, password });
        const { accessToken, user } = res.data.data;

        set({ user, accessToken, isAuthenticated: true });
      },

      logout: () => {
        set({ user: null, accessToken: null, isAuthenticated: false });
        localStorage.removeItem('auth-storage');
        window.location.href = '/login';
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
