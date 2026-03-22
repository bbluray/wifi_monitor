import client from './client';
import type { DeviceListItem, DeviceTimelineResponse } from '@/types';

export async function fetchVisibleDevices() {
  const { data } = await client.get<DeviceListItem[]>('/public/devices');
  return data;
}

export async function fetchDeviceTimeline(deviceId: number, range: '1d' | '7d', date?: string) {
  const { data } = await client.get<DeviceTimelineResponse>(`/public/devices/${deviceId}/timeline`, {
    params: { range, date },
  });
  return data;
}


export async function updatePublicDeviceName(deviceId: number, name: string) {
  const { data } = await client.patch(`/public/devices/${deviceId}/name`, { name });
  return data;
}
