# WiFi Monitor

基于 SNMP 轮询路由器 ARP 表的 WiFi 设备在线监控与考勤看板。

项目提供两套界面：

- 公开看板：无需登录，查看已公开设备的在线状态、在线时长、IP、备注和时间轴图表
- 管理后台：登录后配置路由器、维护设备、控制公开展示，并可手动触发一次采集

## 功能概览

- 定时轮询一个或多个路由器的 SNMP ARP MAC 表
- 通过 OID `1.3.6.1.2.1.4.22.1.2` 识别当前在线设备 MAC
- 自动记录设备最近在线时间、当前在线状态、最近 IP 地址
- 按 1 天 / 7 天维度展示在线时长
- 提供按日期查看的设备在线时间轴图表
- 支持管理员维护设备名称、MAC、备注、公开状态
- 支持公开看板直接修改“已公开设备”的名称
- 支持 `mock` 演示模式，无需真实 SNMP 设备即可本地体验
- 采集器自动写入日志，便于排查 SNMP 连接或采集失败问题

## 技术栈

- Frontend: Vue 3 + Vite + Naive UI + Pinia + ECharts
- Backend: Express + TypeScript + SQLite + better-sqlite3 + net-snmp

## 目录结构

- `backend/`：API、采集调度、SQLite schema、seed 数据
- `backend/data/`：运行时数据目录，默认保存数据库和采集日志
- `frontend/`：公开看板、登录页、管理后台
- `start_wifi_monitor.sh`：本地开发一键启动脚本

## 本地启动

### 1. 安装依赖

```bash
npm --prefix backend install
npm --prefix frontend install
```

### 2. 初始化演示数据

```bash
npm --prefix backend run seed
```

这一步会创建：

- 默认管理员账号 `admin / admin123`
- 一个 `mock` 路由器
- 若干演示设备与近 30 天历史会话数据

### 3. 启动前后端

```bash
bash ./start_wifi_monitor.sh
```

默认访问地址：

- 公开看板：`http://localhost:1504/`
- 管理后台：`http://localhost:1504/login`
- 后端健康检查：`http://localhost:1503/api/health`

默认端口：

- 后端：`1503`
- 前端：`1504`

## 开发命令

### 后端

```bash
npm --prefix backend run dev
npm --prefix backend run build
npm --prefix backend run seed
```

### 前端

```bash
npm --prefix frontend run dev
npm --prefix frontend run build
npm --prefix frontend run preview
```

## 使用说明

### 公开看板

- 仅展示被标记为“公开展示”的设备
- 支持按设备名或 MAC 搜索
- 默认每 60 秒自动刷新一次
- 可查看设备当前在线状态、IP、1 天 / 7 天在线时长
- 点击“查看图表”可查看指定日期的在线时间轴
- 点击“改名”可直接修改公开设备名称

### 管理后台

- 路由器管理：新增、编辑、删除路由器配置
- 设备管理：新增、编辑、删除设备
- 控制设备是否出现在公开看板
- 查看路由器最近采集时间与最近错误
- 点击“立即采集”可手动触发一次全量采集

### 路由器配置字段

- `name`：路由器名称
- `host`：路由器地址或 IP
- `port`：SNMP 端口，默认 `161`
- `snmpVersion`：支持 `1`、`2c`、`mock`
- `community`：SNMP community
- `arpMacOid`：ARP MAC OID，默认 `1.3.6.1.2.1.4.22.1.2`
- `pollIntervalMinutes`：轮询间隔，单位分钟
- `offlineDelayMinutes`：设备离线延迟判定时间，单位分钟
- `isActive`：是否启用该路由器

## 环境变量

后端环境变量：

- `WIFI_MONITOR_PORT`：后端端口，默认 `1503`
- `WIFI_MONITOR_DB`：SQLite 文件路径，默认 `backend/data/wifi_monitor.db`
- `WIFI_MONITOR_JWT_SECRET`：JWT 密钥，默认开发值，生产环境必须修改
- `WIFI_MONITOR_JWT_EXPIRES_IN`：JWT 有效期，默认 `8h`
- `WIFI_MONITOR_BUCKET_MINUTES`：在线统计时间桶粒度，默认 `5`
- `WIFI_MONITOR_ONLINE_THRESHOLD_MINUTES`：在线阈值分钟数，默认至少 `10`
- `WIFI_MONITOR_OFFLINE_DELAY_COUNT`：离线连续缺失次数阈值，默认 `2`
- `WIFI_MONITOR_OFFLINE_DELAY_MINUTES`：全局默认离线延迟分钟数，默认 `10`

说明：

- 路由器级别的 `pollIntervalMinutes` 和 `offlineDelayMinutes` 会在采集逻辑中实际生效
- 启动脚本只显式设置了 `WIFI_MONITOR_PORT`，前端固定使用 `1504`

## 数据与日志

默认运行时文件：

- 数据库：`backend/data/wifi_monitor.db`
- 采集日志：`backend/data/logs/collector-YYYY-MM-DD.log`
- 启动脚本日志：`logs/backend.log`、`logs/frontend.log`

数据库默认启用 SQLite `WAL` 模式。

## 采集与统计说明

本项目采用“轮询采样”而不是持续在线心跳，因此在线时长是估算值，不是秒级精确值。

- 每次采集发现设备在线，会写入一个观察记录
- 统计页面按时间桶累加在线分钟数
- 路由器轮询越稀疏，统计结果越偏近似值
- 设备 IP 来自 ARP 表索引，只有设备被成功识别时才会更新

默认采集 OID：

- `arp_mac`: `1.3.6.1.2.1.4.22.1.2`

如果目标路由器支持该 OID，并且 ARP 表中包含无线终端记录，就可以被系统采集。

## 演示模式

`seed` 后会插入一个 `snmpVersion=mock` 的演示路由器。

这意味着：

- 不需要真实路由器也能启动系统
- 点击“立即采集”会随机生成一组演示设备在线结果
- 适合本地联调页面和验证数据流

## 生产部署建议

- 把 `backend/data/` 放到持久化存储卷
- 修改默认管理员密码和 `WIFI_MONITOR_JWT_SECRET`
- 前端建议放在反向代理后，通过 `/api` 转发到后端 `1503`
- 如果真实设备较多，建议轮询间隔控制在 `1` 到 `5` 分钟之间
- 为 SNMP 访问配置最小权限网络范围，不要直接暴露管理端口

## 当前限制

- 目前只采集单个 ARP MAC OID，不包含更复杂的厂商私有 MIB
- 公开看板允许直接改公开设备名称，如不符合使用场景，需要在接口层额外限制
- 前端开发代理默认把 `/api` 转发到 `http://localhost:1503`
