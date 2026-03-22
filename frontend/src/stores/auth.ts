import { defineStore } from 'pinia';

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  role: 'admin';
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
}

const STORAGE_KEY = 'wifi-monitor-auth';

function loadPersistedState(): AuthState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { token: null, user: null };
    }
    return JSON.parse(raw) as AuthState;
  } catch {
    return { token: null, user: null };
  }
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => loadPersistedState(),
  getters: {
    isAuthenticated: (state) => Boolean(state.token),
  },
  actions: {
    setAuth(payload: { token: string; user: AuthUser }) {
      this.token = payload.token;
      this.user = payload.user;
      this.persist();
    },
    logout() {
      this.token = null;
      this.user = null;
      localStorage.removeItem(STORAGE_KEY);
    },
    persist() {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          token: this.token,
          user: this.user,
        } satisfies AuthState),
      );
    },
  },
});
