import client from './client';
import type { DeviceAdminRow, DeviceTimelineResponse, RouterItem } from '@/types';

export async function fetchRouters() {
  const { data } = await client.get<RouterItem[]>('/admin/routers');
  return data;
}

export async function createRouter(payload: Partial<RouterItem>) {
  const { data } = await client.post<RouterItem>('/admin/routers', payload);
  return data;
}

export async function updateRouter(id: number, payload: Partial<RouterItem>) {
  const { data } = await client.patch<RouterItem>(`/admin/routers/${id}`, payload);
  return data;
}

export async function deleteRouter(id: number) {
  await client.delete(`/admin/routers/${id}`);
}

export async function fetchAdminDevices() {
  const { data } = await client.get<DeviceAdminRow[]>('/admin/devices');
  return data;
}

export async function createDevice(payload: Partial<DeviceAdminRow>) {
  const { data } = await client.post('/admin/devices', payload);
  return data;
}

export async function updateDevice(id: number, payload: Partial<DeviceAdminRow>) {
  const { data } = await client.patch(`/admin/devices/${id}`, payload);
  return data;
}

export async function fetchAdminDeviceTimeline(deviceId: number, range: '1d' | '7d', date?: string) {
  const { data } = await client.get<DeviceTimelineResponse>(`/admin/devices/${deviceId}/timeline`, {
    params: { range, date },
  });
  return data;
}

export async function deleteDevice(id: number) {
  await client.delete(`/admin/devices/${id}`);
}

export async function runCollectorNow() {
  const { data } = await client.post('/admin/collect/run');
  return data;
}
