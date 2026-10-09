import { useSyncExternalStore } from 'react';
import { API, api, applyLogin, clearSession, sessionStore, type LoginResult } from './api';
import type { Permission } from './types';

/** Người đang đăng nhập: { status: 'loading' | 'guest' | 'user', user? } */
export function useSession() {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.get);
}

/** Người đang đăng nhập hoặc null */
export function useCurrentUser() {
  const s = useSession();
  return s.status === 'user' ? s.user : null;
}

export function hasAnyPermission(perms: Permission[] | undefined, needed: Permission[]) {
  return !!perms && needed.some((p) => perms.includes(p));
}

export async function login(email: string, password: string) {
  applyLogin(
    await api<LoginResult>(`${API.user}/auth/login`, { method: 'POST', body: { email, password } }),
  );
}

export async function verifyEmail(email: string, code: string) {
  applyLogin(
    await api<LoginResult>(`${API.user}/auth/verify-email`, {
      method: 'POST',
      body: { email, code },
    }),
  );
}

export async function logout() {
  try {
    await api(`${API.user}/auth/logout`, { method: 'POST' });
  } finally {
    clearSession();
  }
}
