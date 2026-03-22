# wifi_monitor

基于 `gpu_monitor` 模板改造的 WiFi 设备考勤项目。

## 功能

- 定期通过 SNMP 轮询物联网路由器
- 使用 `1.3.6.1.2.1.4.22.1.2`（ARP 表 MAC）识别当前在线设备
- 公开看板，无需登录即可查看：
  - 所有已发布设备
  - 当前在线状态
  - 最近 1 天 / 7 天 / 30 天在线时长统计
  - 备注
  - 点击行查看图形化在线情况
- 管理员登录后可：
  - 管理路由器 SNMP 配置
  - 手动补充设备
  - 控制哪些设备对外展示
  - 查看和修改设备备注、名称

## 技术栈

- Frontend: Vue 3 + Vite + Naive UI + Pinia + ECharts
- Backend: Express + TypeScript + SQLite + net-snmp

## 目录

- `backend`：API、采集器、SQLite 数据库
- `frontend`：公开看板与管理员页面

## 快速开始

1. 安装依赖

```bash
npm --prefix backend install
npm --prefix frontend install
```

2. 初始化演示数据

```bash
npm --prefix backend run seed
```

3. 启动

```bash
bash ./start_wifi_monitor.sh
```

默认端口：

- 后端：`1503`
- 前端：`1504`

默认管理员账号（seed 后可用）：

- 用户名：`admin`
- 密码：`admin123`

## 环境变量

- `WIFI_MONITOR_PORT`：后端端口，默认 `1503`
- `WIFI_MONITOR_DB`：SQLite 文件路径
- `WIFI_MONITOR_JWT_SECRET`：JWT 密钥
- `WIFI_MONITOR_BUCKET_MINUTES`：在线时长统计粒度，默认 `5`
- `WIFI_MONITOR_ONLINE_THRESHOLD_MINUTES`：判定“当前在线”的阈值，默认 `10`

## 考勤统计说明

本项目基于“轮询采样”估算在线时长：

- 每次轮询发现设备在线，则记入一个时间桶（默认 5 分钟）
- 1 天 / 7 天 / 30 天在线时长统计为这些时间桶的累计时长
- 若路由器轮询间隔较长，统计值会是近似值而非秒级精确值

## SNMP 说明

默认读取 OID：

- `arp_mac`: `1.3.6.1.2.1.4.22.1.2`

如果路由器支持该 OID，并且 ARP 表中有无线终端的记录，即可被系统采集到。

## 生产建议

- 将数据库目录放在持久化存储
- 为管理员密码和 JWT 密钥设置安全值
- 将前端放在反向代理后提供访问
- 若设备很多，建议将轮询间隔保持在 1 ~ 5 分钟之间
