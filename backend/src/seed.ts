import bcrypt from 'bcryptjs';
import dayjs from 'dayjs';
import { db, initializeSchema } from './db.js';
import { DEFAULT_ARP_MAC_OID } from './config.js';

function seedAdmin() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
  if (count.count > 0) {
    console.log('Users already seeded');
    return;
  }

  db.prepare(`
    INSERT INTO users (username, password_hash, display_name, role, created_at)
    VALUES (?, ?, ?, 'admin', ?)
  `).run(
    'admin',
    bcrypt.hashSync('admin123', 10),
    '系统管理员',
    dayjs().toISOString(),
  );

  console.log('Seeded admin user');
}

function seedRouters() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM routers').get() as { count: number };
  if (count.count > 0) {
    console.log('Routers already seeded');
    return;
  }

  db.prepare(`
    INSERT INTO routers (
      name, host, port, snmp_version, community, arp_mac_oid,
      poll_interval_minutes, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    '演示 IoT 路由器',
    '127.0.0.1',
    161,
    'mock',
    'public',
    DEFAULT_ARP_MAC_OID,
    5,
    1,
    dayjs().toISOString(),
    dayjs().toISOString(),
  );

  console.log('Seeded router');
}

function ensureDevice(name: string, macAddress: string, note: string, isVisible = true) {
  const existing = db.prepare('SELECT id FROM devices WHERE mac_address = ?').get(macAddress) as { id: number } | undefined;
  if (existing) {
    db.prepare('UPDATE devices SET name = ?, note = ?, is_visible = ?, updated_at = ? WHERE id = ?').run(
      name,
      note,
      isVisible ? 1 : 0,
      dayjs().toISOString(),
      existing.id,
    );
    return existing.id;
  }

  const result = db.prepare(`
    INSERT INTO devices (name, mac_address, note, is_visible, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    name,
    macAddress,
    note,
    isVisible ? 1 : 0,
    dayjs().toISOString(),
    dayjs().toISOString(),
  );
  return Number(result.lastInsertRowid);
}

function seedDevicesAndObservations() {
  const routerRow = db.prepare('SELECT id FROM routers ORDER BY id ASC LIMIT 1').get() as { id: number } | undefined;
  if (!routerRow) {
    return;
  }

  const sessionCount = db.prepare('SELECT COUNT(*) AS count FROM device_sessions').get() as { count: number };
  if (sessionCount.count > 0) {
    console.log('Sessions already seeded');
    return;
  }

  const devices = [
    {
      name: '张三-手机',
      mac: 'D8:3A:DD:10:20:30',
      note: '研发部 / 常驻办公区',
      dailyWindows: [[9, 12], [13, 18]],
    },
    {
      name: '李四-平板',
      mac: 'AC:BC:32:11:22:33',
      note: '测试部 / 经常外出',
      dailyWindows: [[10, 12], [14, 17]],
    },
    {
      name: '王五-笔记本',
      mac: '28:6C:07:45:56:67',
      note: '产品经理',
      dailyWindows: [[8, 11], [13, 19]],
    },
    {
      name: '访客设备',
      mac: '90:9F:33:78:9A:BC',
      note: '默认隐藏，可由管理员决定是否展示',
      dailyWindows: [[11, 12], [15, 16]],
      visible: false,
    },
  ];

  const deviceIds = new Map<string, number>();
  devices.forEach((item) => {
    const id = ensureDevice(item.name, item.mac, item.note, item.visible ?? true);
    deviceIds.set(item.mac, id);
  });

  const now = dayjs();
  const insertSession = db.prepare(`
    INSERT INTO device_sessions (device_id, status, started_at, ended_at)
    VALUES (?, ?, ?, ?)
  `);

  db.transaction(() => {
    for (let dayOffset = 29; dayOffset >= 0; dayOffset -= 1) {
      const date = now.subtract(dayOffset, 'day').startOf('day');
      const isWeekday = ![0, 6].includes(date.day());

      devices.forEach((device, index) => {
        if (!isWeekday && index !== 3) {
          return;
        }

        const deviceId = deviceIds.get(device.mac);
        if (!deviceId) return;

        device.dailyWindows.forEach(([startHour, endHour]) => {
          const windowStartTime = date.hour(startHour).minute(0).second(0).millisecond(0);
          // 随机偏移开始和结束时间
          const offsetStart = Math.floor(Math.random() * 10) - 5; // -5 到 5 分钟
          const offsetEnd = Math.floor(Math.random() * 10) - 5;
          
          const startTime = windowStartTime.add(offsetStart, 'minute');
          const endTime = windowStartTime.add((endHour - startHour) * 60, 'minute').add(offsetEnd, 'minute');

          // 以一定概率生成在线会话（跳过则生成离线会话）
          const shouldBeOnline = Math.random() > (index === 1 ? 0.25 : 0.12);
          if (shouldBeOnline) {
            insertSession.run(deviceId, 'online', startTime.toISOString(), endTime.toISOString());
          } else {
            // 离线会话通常要么已结束，要么仍在进行
            const isEnded = Math.random() > 0.3;
            const endedAt = isEnded ? endTime.toISOString() : null;
            insertSession.run(deviceId, 'offline', startTime.toISOString(), endedAt);
          }
        });
      });
    }
  })();

  console.log('Seeded devices and sessions');
}

function main() {
  initializeSchema();
  seedAdmin();
  seedRouters();
  seedDevicesAndObservations();
  console.log('Seeding completed');
}

main();
