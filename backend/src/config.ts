import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

function toPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const DATA_DIR = path.resolve(dirname, '../data');
export const DB_PATH = process.env.WIFI_MONITOR_DB ?? path.join(DATA_DIR, 'wifi_monitor.db');
export const JWT_SECRET = process.env.WIFI_MONITOR_JWT_SECRET ?? 'wifi-monitor-development-secret';
export const JWT_EXPIRES_IN = process.env.WIFI_MONITOR_JWT_EXPIRES_IN ?? '8h';
export const DEFAULT_SERVER_PORT = toPositiveInt(process.env.WIFI_MONITOR_PORT, 1503);
export const PRESENCE_BUCKET_MINUTES = toPositiveInt(
  process.env.WIFI_MONITOR_BUCKET_MINUTES,
  5,
);
export const ONLINE_THRESHOLD_MINUTES = toPositiveInt(
  process.env.WIFI_MONITOR_ONLINE_THRESHOLD_MINUTES,
  Math.max(PRESENCE_BUCKET_MINUTES * 2, 10),
);
export const OFFLINE_DELAY_COUNT = toPositiveInt(
  process.env.WIFI_MONITOR_OFFLINE_DELAY_COUNT,
  2,
);
export const OFFLINE_DELAY_MINUTES = toPositiveInt(
  process.env.WIFI_MONITOR_OFFLINE_DELAY_MINUTES,
  10,
);

export const DEFAULT_ARP_MAC_OID = '1.3.6.1.2.1.4.22.1.2';
