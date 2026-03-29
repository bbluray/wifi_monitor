import dayjs from 'dayjs';
import fs from 'node:fs';
import path from 'node:path';
import snmp from 'net-snmp';
import { recordPresenceForMacs } from './deviceService.js';
import { getDueRouters, listRouters, markRouterPollError, markRouterPollSuccess, type RouterRecord } from './routerService.js';
import { DATA_DIR } from '../config.js';
import { db } from '../db.js';

const activeRuns = new Set<number>();
const LOG_DIR = path.join(DATA_DIR, 'logs');

// 确保日志目录存在
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function writeLog(message: string) {
  const timestamp = dayjs().format('YYYY-MM-DD HH:mm:ss');
  const logMessage = `[${timestamp}] ${message}\n`;
  const logFile = path.join(LOG_DIR, `collector-${dayjs().format('YYYY-MM-DD')}.log`);
  fs.appendFileSync(logFile, logMessage);
  console.log(logMessage);
}

function bufferToMac(buffer: Buffer) {
  return Array.from(buffer)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join(':')
    .toUpperCase();
}

interface DeviceDiscovery {
  mac: string;
  ip: string | null;
}

function parseMacFromValue(value: unknown): string | null {
  if (Buffer.isBuffer(value)) {
    return value.length === 6 ? bufferToMac(value) : null;
  }

  if (Array.isArray(value) && value.every((item) => typeof item === 'number')) {
    return value.length === 6 ? bufferToMac(Buffer.from(value)) : null;
  }

  if (typeof value === 'string') {
    const compact = value.replace(/[^0-9a-fA-F]/g, '');
    return compact.length === 12 ? compact.match(/.{1,2}/g)!.join(':').toUpperCase() : null;
  }

  return null;
}

function isAllowedDeviceIp(ip: string) {
  return ip.startsWith('192.');
}

function extractIpFromOid(oid: string, baseOid: string): string | null {
  const normalizedOid = oid.replace(/^iso\./, '1.');
  const normalizedBase = baseOid.replace(/^iso\./, '1.');

  if (!normalizedOid.startsWith(`${normalizedBase}.`)) {
    return null;
  }

  const parts = normalizedOid.slice(normalizedBase.length + 1).split('.').filter(Boolean);
  if (parts.length < 5) {
    return null;
  }

  const ipOctets = parts.slice(1, 5).map((part) => Number.parseInt(part, 10));
  if (ipOctets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }

  const ip = ipOctets.join('.');
  return isAllowedDeviceIp(ip) ? ip : null;
}

function parseDiscoveryFromVarbind(varbind: { oid: string; type?: number; value: unknown }, baseOid: string): DeviceDiscovery | null {
  if (varbind.type !== snmp.ObjectType.OctetString) {
    return null;
  }

  const ip = extractIpFromOid(varbind.oid, baseOid);
  if (!ip) {
    return null;
  }

  const mac = parseMacFromValue(varbind.value);
  if (!mac || mac === '00:00:00:00:00:00') {
    return null;
  }

  return { mac, ip };
}

function walkArpMacTable(router: RouterRecord) {
  return new Promise<DeviceDiscovery[]>((resolve, reject) => {
    const version = router.snmpVersion === '1' ? snmp.Version1 : snmp.Version2c;
    const session = snmp.createSession(router.host, router.community, {
      port: router.port,
      version,
      timeout: 5000,
      retries: 1,
      backoff: 1,
    } as any);

    const results: DeviceDiscovery[] = [];
    const seenMacs = new Set<string>();

    session.walk(
      router.arpMacOid,
      20,
      (varbinds: any[]) => {
        for (const varbind of varbinds) {
          if (snmp.isVarbindError(varbind)) {
            continue;
          }

          const discovery = parseDiscoveryFromVarbind(varbind, router.arpMacOid);
          if (!discovery || seenMacs.has(discovery.mac)) {
            continue;
          }

          seenMacs.add(discovery.mac);
          results.push(discovery);
        }
      },
      (error: Error | null) => {
        session.close();
        if (error) {
          reject(error);
          return;
        }
        resolve(results);
      },
    );
  });
}

async function mockArpMacTable(): Promise<DeviceDiscovery[]> {
  const samplePool: DeviceDiscovery[] = [
    { mac: 'D8:3A:DD:10:20:30', ip: '192.168.1.10' },
    { mac: 'AC:BC:32:11:22:33', ip: '192.168.1.11' },
    { mac: '28:6C:07:45:56:67', ip: '192.168.1.12' },
    { mac: 'F0:18:98:AA:BB:CC', ip: '192.168.1.13' },
    { mac: '90:9F:33:78:9A:BC', ip: '192.168.1.14' },
    { mac: '34:12:98:54:32:10', ip: '192.168.1.15' },
  ];
  const selected = samplePool.filter(() => Math.random() > 0.45);
  return selected.length > 0 ? selected : samplePool.slice(0, 2);
}

async function collectFromRouter(router: RouterRecord) {
  const observedAt = dayjs().toISOString();
  writeLog(`开始采集路由器 [${router.name}] (ID: ${router.id})`);

  try {
    const discoveries = router.snmpVersion === 'mock'
      ? await mockArpMacTable()
      : await walkArpMacTable(router);

    const macList = discoveries.map(d => d.mac).join(', ');
    writeLog(`路由器 [${router.name}] 发现 ${discoveries.length} 个设备: ${macList}`);

    // Record presence and update IP addresses for each device
    let count = 0;
    for (const discovery of discoveries) {
      try {
        count += recordPresenceForMacs(
          router.id,
          [discovery.mac],
          observedAt,
          router.pollIntervalMinutes,
          router.offlineDelayMinutes,
        );
        
        // Update IP address if discovered
        if (discovery.ip) {
          const device = db.prepare('SELECT id FROM devices WHERE mac_address = ?').get(discovery.mac) as { id: number } | undefined;
          if (device) {
            db.prepare('UPDATE devices SET ip_address = ?, updated_at = ? WHERE id = ?')
              .run(discovery.ip, dayjs().toISOString(), device.id);
          }
        }
      } catch (err) {
        writeLog(`处理设备 ${discovery.mac} 失败: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    markRouterPollSuccess(router.id, observedAt);
    writeLog(`路由器 [${router.name}] 采集完成，已处理 ${count} 个设备`);
    return { routerId: router.id, observedAt, count, error: null as string | null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown SNMP error';
    writeLog(`路由器 [${router.name}] 采集失败: ${message}`);
    markRouterPollError(router.id, observedAt, message);
    return { routerId: router.id, observedAt, count: 0, error: message };
  }
}

export async function runCollectorOnce(force = false) {
  const routers = force ? listRouters().filter((item) => item.isActive) : getDueRouters();
  writeLog(`开始采集循环，共 ${routers.length} 个路由器需要采集 (force=${force})`);
  const results: Array<{ routerId: number; observedAt: string; count: number; error: string | null }> = [];

  for (const router of routers) {
    if (activeRuns.has(router.id)) {
      writeLog(`跳过路由器 [${router.name}]，已有采集任务在进行`);
      continue;
    }
    activeRuns.add(router.id);
    try {
      results.push(await collectFromRouter(router));
    } finally {
      activeRuns.delete(router.id);
    }
  }

  const successCount = results.filter((r) => !r.error).length;
  const failCount = results.filter((r) => r.error).length;
  writeLog(`采集循环完成: 成功=${successCount}, 失败=${failCount}`);

  return results;
}

function getNextCollectorDelayMs() {
  const routers = listRouters().filter((router) => router.isActive);
  if (routers.length === 0) {
    return 30 * 1000;
  }

  const now = dayjs();
  let minDelay = Infinity;

  for (const router of routers) {
    if (!router.lastPolledAt) {
      return 0;
    }

    const nextPollAt = dayjs(router.lastPolledAt).add(router.pollIntervalMinutes, 'minute');
    const delay = nextPollAt.diff(now, 'millisecond');
    if (delay < minDelay) {
      minDelay = delay;
    }
  }

  // 最小 1 秒，最大 30 秒（防止太频繁或太迟）
  return Math.max(1000, Math.min(minDelay, 30 * 1000));
}

async function collectorLoop() {
  try {
    await runCollectorOnce(false);
  } catch (error) {
    writeLog(`采集循环异常: ${error instanceof Error ? error.message : String(error)}`);
  }

  const nextDelay = getNextCollectorDelayMs();
  setTimeout(collectorLoop, nextDelay);
}

export function startCollector() {
  writeLog('采集服务启动');
  void collectorLoop();
}

