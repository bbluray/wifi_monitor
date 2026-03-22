import client from './client';
import type { LoginResponse } from '@/types';

export async function loginApi(payload: { username: string; password: string }) {
  const { data } = await client.post<LoginResponse>('/auth/login', payload);
  return data;
}

export async function fetchCurrentUser() {
  const { data } = await client.get<LoginResponse['user']>('/auth/me');
  return data;
}
