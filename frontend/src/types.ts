export interface DeviceListItem {
  id: number;
  name: string;
  displayName: string;
  macAddress: string;
  ipAddress: string | null;
  note: string;
  isVisible: boolean;
  lastSeenAt: string | null;
  isOnline: boolean;
  onlineMinutes1d: number;
  onlineMinutes7d: number;
  onlineMinutes30d: number;
}

export interface DeviceTimelinePoint {
  bucketStart: string;
  label: string;
  onlineMinutes: number;
}

export interface DeviceTimelineSegment {
  status: 'online' | 'offline' | 'pending';
  startAt: string;
  endAt: string;
  minutes: number;
  dayLabel?: string;
}

export interface DeviceTimelineResponse {
  device: {
    id: number;
    name: string;
    macAddress: string;
    note: string;
    isVisible: boolean;
    lastSeenAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  range: '1d' | '7d' | '30d';
  timeline: DeviceTimelinePoint[];
  segments?: DeviceTimelineSegment[];
}

export interface RouterItem {
  id: number;
  name: string;
  host: string;
  port: number;
  snmpVersion: '1' | '2c' | 'mock';
  community: string;
  arpMacOid: string;
  pollIntervalMinutes: number;
  offlineDelayCount: number;
  offlineDelayMinutes: number;
  isActive: boolean;
  lastPolledAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceAdminRow extends DeviceListItem {}

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  role: 'admin';
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}
