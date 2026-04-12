<template>
  <div class="page-shell section-spacing">
    <div class="page-hero">
      <div>
        <h1 class="page-title">WiFi Monitor 管理台</h1>
        <p class="page-subtitle">配置 SNMP 路由器、控制公开设备、维护备注信息。</p>
      </div>
      <n-space>
        <n-button tertiary @click="router.push('/')">查看公开看板</n-button>
        <n-button @click="refreshAll" :loading="pageLoading">刷新</n-button>
        <n-button type="primary" :loading="collectLoading" @click="handleCollectNow">
          立即采集
        </n-button>
        <n-dropdown :options="accountOptions" @select="handleAccountAction">
          <n-button>{{ auth.user?.displayName || '管理员' }}</n-button>
        </n-dropdown>
      </n-space>
    </div>

    <n-card title="路由器配置">
      <div class="toolbar">
        <n-text depth="3">配置用于采集无线终端 ARP 记录的 IoT 路由器。</n-text>
        <n-button type="primary" @click="openRouterModal()">新增路由器</n-button>
      </div>

      <n-data-table
        :columns="routerColumns"
        :data="routers"
        :loading="pageLoading"
        :pagination="{ pageSize: 6 }"
      />
    </n-card>

    <n-card title="设备管理">
      <div class="toolbar">
        <n-input
          v-model:value="deviceKeyword"
          clearable
          placeholder="搜索设备名称 / MAC / 备注"
          style="max-width: 340px"
        />
        <n-space>
          <n-text depth="3">只有勾选“公开展示”的设备会出现在公开看板。</n-text>
          <n-button @click="openDeviceModal()">新增设备</n-button>
        </n-space>
      </div>

      <n-data-table
        :columns="deviceColumns"
        :data="filteredDevices"
        :loading="pageLoading"
      />
    </n-card>

    <n-modal
      v-model:show="detailVisible"
      preset="card"
      style="width: min(1000px, 96vw)"
      :title="selectedDevice?.displayName || selectedDevice?.macAddress || '设备详情'"
      :bordered="false"
    >
      <n-space vertical size="large">
        <n-descriptions bordered :column="3">
          <n-descriptions-item label="MAC">{{ selectedDevice?.macAddress }}</n-descriptions-item>
          <n-descriptions-item label="IP 地址">{{ selectedDevice?.ipAddress || '—' }}</n-descriptions-item>
          <n-descriptions-item label="当前状态">
            <n-tag :type="selectedDevice?.isOnline ? 'success' : 'default'">
              {{ selectedDevice?.isOnline ? '在线' : '离线' }}
            </n-tag>
          </n-descriptions-item>
          <n-descriptions-item label="1 天在线">{{ formatMinutesDetailed(selectedDevice?.onlineMinutes1d ?? 0) }}</n-descriptions-item>
          <n-descriptions-item label="7 天在线">{{ formatMinutesDetailed(selectedDevice?.onlineMinutes7d ?? 0) }}</n-descriptions-item>
          <n-descriptions-item label="30 天在线">{{ formatMinutesDetailed(selectedDevice?.onlineMinutes30d ?? 0) }}</n-descriptions-item>
        </n-descriptions>

        <n-space justify="space-between" align="center" wrap>
          <n-space align="center" wrap>
            <n-input
              v-model:value="renameValue"
              placeholder="请输入设备名称"
              maxlength="64"
              show-count
              style="width: min(320px, 72vw)"
              @keyup.enter="submitRename"
            />
            <n-button type="primary" :loading="renameSaving" @click="submitRename">保存名称</n-button>
          </n-space>
          <n-space align="center">
            <n-radio-group v-model:value="timelineRange" @update:value="loadTimeline">
              <n-radio-button value="1d">1 天</n-radio-button>
              <n-radio-button value="7d">7 天</n-radio-button>
            </n-radio-group>
            <n-date-picker
              v-model:value="timelineDateValue"
              type="date"
              :clearable="false"
              :is-date-disabled="disableFutureDate"
              @update:value="handleTimelineDateChange"
            />
          </n-space>
          <n-text depth="3">横轴为 00:00 - 24:00，单位：分钟</n-text>
        </n-space>

        <n-spin :show="timelineLoading">
          <v-chart autoresize style="height: 380px" :option="chartOption" />
        </n-spin>
      </n-space>
    </n-modal>

    <n-modal
      v-model:show="routerModalVisible"
      preset="dialog"
      :title="editingRouterId ? '编辑路由器' : '新增路由器'"
      style="width: min(720px, 94vw)"
    >
      <n-form ref="routerFormRef" :model="routerForm" :rules="routerRules" label-placement="top">
        <div class="form-grid">
          <n-form-item label="名称" path="name">
            <n-input v-model:value="routerForm.name" placeholder="例如：1F 会议室路由器" />
          </n-form-item>
          <n-form-item label="主机地址" path="host">
            <n-input v-model:value="routerForm.host" placeholder="例如：192.168.10.1" />
          </n-form-item>
          <n-form-item label="端口" path="port">
            <n-input-number v-model:value="routerForm.port" :min="1" :max="65535" style="width: 100%" />
          </n-form-item>
          <n-form-item label="SNMP 版本" path="snmpVersion">
            <n-select
              v-model:value="routerForm.snmpVersion"
              :options="snmpVersionOptions"
            />
          </n-form-item>
          <n-form-item label="Community" path="community">
            <n-input v-model:value="routerForm.community" placeholder="例如：public" />
          </n-form-item>
          <n-form-item label="轮询间隔（分钟）" path="pollIntervalMinutes">
            <n-input-number
              v-model:value="routerForm.pollIntervalMinutes"
              :min="1"
              :max="60"
              style="width: 100%"
            />
          </n-form-item>
          <n-form-item label="离线延迟（分钟）" path="offlineDelayMinutes">
            <n-input-number
              v-model:value="routerForm.offlineDelayMinutes"
              :min="1"
              :max="60"
              style="width: 100%"
            />
          </n-form-item>
        </div>

        <n-form-item label="ARP MAC OID" path="arpMacOid">
          <n-input v-model:value="routerForm.arpMacOid" />
        </n-form-item>
        <n-form-item label="启用">
          <n-switch v-model:value="routerForm.isActive" />
        </n-form-item>
      </n-form>

      <template #action>
        <n-space>
          <n-button @click="routerModalVisible = false">取消</n-button>
          <n-button type="primary" :loading="routerSaving" @click="submitRouterForm">
            保存
          </n-button>
        </n-space>
      </template>
    </n-modal>

    <n-modal
      v-model:show="deviceModalVisible"
      preset="dialog"
      :title="editingDeviceId ? '编辑设备' : '新增设备'"
      style="width: min(680px, 94vw)"
    >
      <n-form ref="deviceFormRef" :model="deviceForm" :rules="deviceRules" label-placement="top">
        <div class="form-grid">
          <n-form-item label="设备名称" path="name">
            <n-input v-model:value="deviceForm.name" placeholder="例如：张三-手机" />
          </n-form-item>
          <n-form-item label="MAC 地址" path="macAddress">
            <n-input v-model:value="deviceForm.macAddress" placeholder="例如：AA:BB:CC:DD:EE:FF" />
          </n-form-item>
          <n-form-item label="IP 地址" path="ipAddress">
            <n-input v-model:value="deviceForm.ipAddress" placeholder="例如：192.168.1.100" />
          </n-form-item>
        </div>

        <n-form-item label="备注">
          <n-input
            v-model:value="deviceForm.note"
            type="textarea"
            placeholder="例如：部门 / 工位 / 设备用途"
            :autosize="{ minRows: 3, maxRows: 5 }"
          />
        </n-form-item>

        <n-form-item label="公开展示">
          <n-switch v-model:value="deviceForm.isVisible" />
        </n-form-item>
      </n-form>

      <template #action>
        <n-space>
          <n-button @click="deviceModalVisible = false">取消</n-button>
          <n-button type="primary" :loading="deviceSaving" @click="submitDeviceForm">
            保存
          </n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue';
import dayjs from 'dayjs';
import { CustomChart, HeatmapChart } from 'echarts/charts';
import { GridComponent, TitleComponent, TooltipComponent, VisualMapComponent } from 'echarts/components';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import {
  NButton,
  NPopconfirm,
  NSwitch,
  NTag,
  useMessage,
  type DataTableColumns,
  type DropdownOption,
  type FormInst,
  type FormRules,
} from 'naive-ui';
import VChart from 'vue-echarts';
import { useRouter } from 'vue-router';
import {
  createDevice,
  createRouter,
  fetchAdminDeviceTimeline,
  deleteDevice,
  deleteRouter,
  fetchAdminDevices,
  fetchRouters,
  runCollectorNow,
  updateDevice,
  updateRouter,
} from '@/api/admin';
import type { DeviceAdminRow, DeviceTimelinePoint, DeviceTimelineSegment, RouterItem } from '@/types';
import { useAuthStore } from '@/stores/auth';

use([CanvasRenderer, CustomChart, HeatmapChart, GridComponent, TooltipComponent, TitleComponent, VisualMapComponent]);

const router = useRouter();
const auth = useAuthStore();
const message = useMessage();

const pageLoading = ref(false);
const collectLoading = ref(false);

const routers = ref<RouterItem[]>([]);
const devices = ref<DeviceAdminRow[]>([]);
const deviceKeyword = ref('');

const routerModalVisible = ref(false);
const deviceModalVisible = ref(false);
const detailVisible = ref(false);
const editingRouterId = ref<number | null>(null);
const editingDeviceId = ref<number | null>(null);
const routerSaving = ref(false);
const deviceSaving = ref(false);
const timelineLoading = ref(false);
const renameSaving = ref(false);

const routerFormRef = ref<FormInst | null>(null);
const deviceFormRef = ref<FormInst | null>(null);
const selectedDevice = ref<DeviceAdminRow | null>(null);
const timelineRange = ref<'1d' | '7d'>('1d');
const timelineDateValue = ref(dayjs().valueOf());
const timelineData = ref<DeviceTimelinePoint[]>([]);
const timelineSegments = ref<DeviceTimelineSegment[]>([]);
const renameValue = ref('');

const routerForm = reactive({
  name: '',
  host: '',
  port: 161,
  snmpVersion: '2c' as '1' | '2c' | 'mock',
  community: 'public',
  arpMacOid: '1.3.6.1.2.1.4.22.1.2',
  pollIntervalMinutes: 5,
  offlineDelayMinutes: 10,
  isActive: true,
});

const deviceForm = reactive({
  name: '',
  macAddress: '',
  ipAddress: '',
  note: '',
  isVisible: false,
});

const snmpVersionOptions = [
  { label: 'SNMP v2c', value: '2c' },
  { label: 'SNMP v1', value: '1' },
  { label: 'Mock 演示模式', value: 'mock' },
];

const accountOptions: DropdownOption[] = [
  { label: '退出登录', key: 'logout' },
];

const routerRules: FormRules = {
  name: { required: true, message: '请输入名称', trigger: ['blur', 'input'] },
  host: { required: true, message: '请输入主机地址', trigger: ['blur', 'input'] },
  community: { required: true, message: '请输入 community', trigger: ['blur', 'input'] },
};

const deviceRules: FormRules = {
  macAddress: { required: true, message: '请输入 MAC 地址', trigger: ['blur', 'input'] },
};

const statusMeta = {
  online: { color: '#2f9e44', label: '在线' },
  offline: { color: '#f08c00', label: '离线' },
  pending: { color: '#d0d7de', label: '未开始' },
} as const;

function compareLastSeenDesc(left: string | null, right: string | null) {
  if (left && right) {
    return new Date(right).getTime() - new Date(left).getTime();
  }
  if (right) {
    return 1;
  }
  if (left) {
    return -1;
  }
  return 0;
}

const filteredDevices = computed(() => {
  const key = deviceKeyword.value.trim().toLowerCase();
  const result = key
    ? devices.value.filter((item) =>
        [item.displayName, item.macAddress, item.ipAddress, item.note]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(key),
      )
    : [...devices.value];

  return [...result].sort((left, right) => compareLastSeenDesc(left.lastSeenAt, right.lastSeenAt));
});

const routerColumns = computed<DataTableColumns<RouterItem>>(() => [
  { title: '名称', key: 'name', minWidth: 160 },
  { title: '主机', key: 'host', minWidth: 140 },
  { title: '版本', key: 'snmpVersion', width: 90 },
  { title: '端口', key: 'port', width: 80 },
  { title: '间隔(分)', key: 'pollIntervalMinutes', width: 100 },
  { title: '离线延迟', key: 'offlineDelayMinutes', minWidth: 120, render(row) { return `${row.offlineDelayMinutes} 分钟`; } },
  {
    title: '状态',
    key: 'isActive',
    width: 70,
    render(row) {
      return h(
        NTag,
        { type: row.isActive ? 'success' : 'default', round: true },
        { default: () => (row.isActive ? '启用' : '停用') },
      );
    },
  },
  {
    title: '最近采集',
    key: 'lastPolledAt',
    width: 170,
    render(row) {
      return row.lastPolledAt ? dayjs(row.lastPolledAt).format('MM-DD HH:mm:ss') : '未采集';
    },
  },
  {
    title: '最近错误',
    key: 'lastError',
    width: 140,
    ellipsis: { tooltip: true },
    render(row) {
      return row.lastError || '—';
    },
  },
  {
    title: '操作',
    key: 'actions',
    width: 150,
    render(row) {
      return h('div', { style: 'display:flex;gap:8px;' }, [
        h(
          NButton,
          {
            size: 'small',
            tertiary: true,
            onClick: () => openRouterModal(row),
          },
          { default: () => '编辑' },
        ),
        h(
          NPopconfirm,
          {
            onPositiveClick: () => handleDeleteRouter(row),
          },
          {
            trigger: () =>
              h(
                NButton,
                {
                  size: 'small',
                  tertiary: true,
                  type: 'error',
                },
                { default: () => '删除' },
              ),
            default: () => '确认删除该路由器？',
          },
        ),
      ]);
    },
  },
]);

const chartOption = computed(() => {
  const titleDate = dayjs(timelineDateValue.value).format('YYYY-MM-DD');
  const titleText = selectedDevice.value
    ? `${selectedDevice.value.displayName} (${selectedDevice.value.macAddress}) 在线情况`
    : '在线情况';

  const dayLabels = timelineRange.value === '7d'
    ? timelineData.value.map((item) => item.label)
    : [dayjs(timelineDateValue.value).format('MM-DD')];

  return createTimelineChartOption({
    segments: timelineSegments.value,
    dayLabels,
    title: `${titleText} · ${timelineRange.value === '7d' ? `${dayLabels[0]} 至 ${dayLabels[dayLabels.length - 1]}` : titleDate}`,
    compact: false,
  });
});

const deviceColumns = computed<DataTableColumns<DeviceAdminRow>>(() => [
  {
    title: '设备',
    key: 'displayName',
    minWidth: 180,
    render(row) {
      return h(
        NButton,
        {
          text: true,
          type: 'primary',
          style: 'justify-content:flex-start;padding:0;height:auto;font-weight:600;',
          onClick: (event: MouseEvent) => {
            event.stopPropagation();
            void openDeviceDetail(row);
          },
        },
        { default: () => row.displayName },
      );
    },
  },
  { title: 'MAC', key: 'macAddress', minWidth: 160 },
  {
    title: 'IP',
    key: 'ipAddress',
    minWidth: 140,
    render(row) {
      return row.ipAddress || '—';
    },
  },
  {
    title: '当前状态',
    key: 'isOnline',
    width: 80,
    render(row) {
      return h(
        NTag,
        { type: row.isOnline ? 'success' : 'default', round: true },
        { default: () => (row.isOnline ? '在线' : '离线') },
      );
    },
  },
  {
    title: '1天',
    key: 'onlineMinutes1d',
    width: 80,
    render(row) {
      return formatMinutes(row.onlineMinutes1d);
    },
  },
  {
    title: '7天',
    key: 'onlineMinutes7d',
    width: 80,
    render(row) {
      return formatMinutes(row.onlineMinutes7d);
    },
  },
  {
    title: '公开展示',
    key: 'isVisible',
    width: 80,
    render(row) {
      return h(NSwitch, {
        value: row.isVisible,
        onUpdateValue: (value: boolean) => quickToggleVisible(row, value),
      });
    },
  },
  {
    title: '备注',
    key: 'note',
    minWidth: 140,
    ellipsis: { tooltip: true },
    render(row) {
      return row.note || '—';
    },
  },
  {
    title: '最后出现',
    key: 'lastSeenAt',
    width: 140,
    render(row) {
      return row.lastSeenAt ? dayjs(row.lastSeenAt).format('MM-DD HH:mm:ss') : '未出现';
    },
  },
  {
    title: '操作',
    key: 'actions',
    width: 180,
    render(row) {
      return h('div', { style: 'display:flex;gap:8px;' }, [
        h(
          NButton,
          {
            size: 'small',
            tertiary: true,
            onClick: (event: MouseEvent) => {
              event.stopPropagation();
              void openDeviceDetail(row);
            },
          },
          { default: () => '详情' },
        ),
        h(
          NButton,
          {
            size: 'small',
            tertiary: true,
            onClick: () => openDeviceModal(row),
          },
          { default: () => '编辑' },
        ),
        h(
          NPopconfirm,
          {
            onPositiveClick: () => handleDeleteDevice(row),
          },
          {
            trigger: () =>
              h(
                NButton,
                {
                  size: 'small',
                  tertiary: true,
                  type: 'error',
                },
                { default: () => '删除' },
              ),
            default: () => '确认删除该设备？',
          },
        ),
      ]);
    },
  },
]);

function createTimelineChartOption(input: {
  segments: DeviceTimelineSegment[];
  dayLabels: string[];
  title?: string;
  compact: boolean;
}) {
  const { segments, dayLabels, title, compact } = input;
  const dayIndexMap = new Map(dayLabels.map((label, index) => [label, dayLabels.length - 1 - index]));

  const chartSegments = segments.map((segment) => {
    const startAt = dayjs(segment.startAt);
    const endAt = dayjs(segment.endAt);
    const dayStart = startAt.startOf('day');
    const meta = statusMeta[segment.status];
    const dayLabel = segment.dayLabel ?? startAt.format('MM-DD');
    const rowIndex = dayIndexMap.get(dayLabel) ?? 0;
    return {
      name: meta.label,
      value: [
        rowIndex,
        startAt.diff(dayStart, 'minute') / 60,
        endAt.diff(dayStart, 'minute') / 60,
      ],
      itemStyle: { color: meta.color },
      minutes: segment.minutes,
      startLabel: startAt.format('MM-DD HH:mm'),
      endLabel: endAt.format('MM-DD HH:mm'),
    };
  });

  return {
    animation: false,
    title: title
      ? {
          text: title,
          left: 'center',
          top: compact ? 4 : 8,
          textStyle: {
            fontSize: compact ? 12 : 16,
            fontWeight: compact ? 'normal' : 'bold',
          },
        }
      : undefined,
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        const data = params.data;
        return `${data.startLabel} - ${data.endLabel}<br/>${data.name}: ${data.minutes} 分钟`;
      },
    },
    grid: compact
      ? {
          left: 12,
          right: 12,
          top: 12,
          bottom: 22,
          containLabel: false,
        }
      : {
          left: '8%',
          right: '8%',
          top: '30%',
          bottom: '18%',
          containLabel: true,
        },
    xAxis: {
      type: 'value',
      min: 0,
      max: 24,
      interval: compact ? 6 : 2,
      axisLabel: {
        show: true,
        fontSize: compact ? 10 : 12,
        formatter: (value: number) => `${String(value).padStart(2, '0')}:00`,
      },
      axisLine: {
        lineStyle: { color: '#d0d7de' },
      },
      axisTick: { show: false },
      splitLine: {
        show: true,
        lineStyle: { color: '#eceff1' },
      },
    },
    yAxis: {
      type: 'category',
      data: dayLabels.length > 1 ? [...dayLabels].reverse() : [''],
      axisLine: { show: false },
      axisLabel: { show: !compact && dayLabels.length > 1 },
      axisTick: { show: false },
      splitLine: { show: false },
    },
    series: [
      {
        type: 'custom',
        coordinateSystem: 'cartesian2d',
        data: chartSegments,
        renderItem(params: any, api: any) {
          const start = api.coord([api.value(1), api.value(0)]);
          const end = api.coord([api.value(2), api.value(0)]);
          const barHeight = compact ? 18 : Math.max(24, api.size([0, 1])[1] * 0.42);
          return {
            type: 'rect',
            shape: {
              x: start[0],
              y: start[1] - barHeight / 2,
              width: Math.max(1, end[0] - start[0]),
              height: barHeight,
              r: compact ? 3 : 0,
            },
            style: api.style(),
          };
        },
      },
    ],
    graphic: compact
      ? undefined
      : [
          { type: 'text', left: '8%', top: '18%', style: { text: '在线', fill: '#2f9e44', fontSize: 12 } },
          { type: 'text', left: '14%', top: '18%', style: { text: '离线', fill: '#f08c00', fontSize: 12 } },
          { type: 'text', left: '20%', top: '18%', style: { text: '未开始', fill: '#98a2b3', fontSize: 12 } },
        ],
  };
}

function formatMinutes(minutes: number) {
  if (minutes <= 0) return '0分';
  const hours = Math.floor(minutes / 60);
  const remain = minutes % 60;
  if (hours <= 0) return `${minutes}分`;
  if (remain === 0) return `${hours}小时`;
  return `${hours}小时${remain}分`;
}

function formatMinutesDetailed(minutes: number) {
  if (minutes <= 0) {
    return '0 分钟';
  }
  const hours = Math.floor(minutes / 60);
  const remain = minutes % 60;
  if (hours <= 0) {
    return `${minutes} 分钟`;
  }
  if (remain === 0) {
    return `${hours} 小时`;
  }
  return `${hours} 小时 ${remain} 分`;
}

function disableFutureDate(timestamp: number) {
  return dayjs(timestamp).isAfter(dayjs(), 'day');
}

function handleTimelineDateChange() {
  void loadTimeline();
}

function resetRouterForm() {
  editingRouterId.value = null;
  Object.assign(routerForm, {
    name: '',
    host: '',
    port: 161,
    snmpVersion: '2c',
    community: 'public',
    arpMacOid: '1.3.6.1.2.1.4.22.1.2',
    pollIntervalMinutes: 5,
    offlineDelayMinutes: 10,
    isActive: true,
  });
}

function resetDeviceForm() {
  editingDeviceId.value = null;
  Object.assign(deviceForm, {
    name: '',
    macAddress: '',
    ipAddress: '',
    note: '',
    isVisible: false,
  });
}

function openRouterModal(row?: RouterItem) {
  if (!row) {
    resetRouterForm();
  } else {
    editingRouterId.value = row.id;
    Object.assign(routerForm, {
      name: row.name,
      host: row.host,
      port: row.port,
      snmpVersion: row.snmpVersion,
      community: row.community,
      arpMacOid: row.arpMacOid,
      pollIntervalMinutes: row.pollIntervalMinutes,
      offlineDelayMinutes: row.offlineDelayMinutes ?? 10,
      isActive: row.isActive,
    });
  }
  routerModalVisible.value = true;
}

function openDeviceModal(row?: DeviceAdminRow) {
  if (!row) {
    resetDeviceForm();
  } else {
    editingDeviceId.value = row.id;
    Object.assign(deviceForm, {
      name: row.name,
      macAddress: row.macAddress,
      ipAddress: row.ipAddress || '',
      note: row.note,
      isVisible: row.isVisible,
    });
  }
  deviceModalVisible.value = true;
}

async function openDeviceDetail(row: DeviceAdminRow) {
  selectedDevice.value = row;
  renameValue.value = row.name || row.displayName || '';
  timelineRange.value = '1d';
  detailVisible.value = true;
  await loadTimeline();
}

async function loadTimeline() {
  if (!selectedDevice.value) {
    return;
  }
  timelineLoading.value = true;
  try {
    const result = await fetchAdminDeviceTimeline(
      selectedDevice.value.id,
      timelineRange.value,
      dayjs(timelineDateValue.value).format('YYYY-MM-DD'),
    );
    timelineData.value = result.timeline;
    timelineSegments.value = result.segments ?? [];
  } catch (error) {
    console.error(error);
    message.error('加载图表失败');
  } finally {
    timelineLoading.value = false;
  }
}

async function submitRename() {
  if (!selectedDevice.value) {
    return;
  }

  const name = renameValue.value.trim();
  if (!name) {
    message.error('设备名称不能为空');
    return;
  }

  renameSaving.value = true;
  try {
    const updated = await updateDevice(selectedDevice.value.id, { name });
    const nextName = typeof updated.name === 'string' && updated.name.trim() ? updated.name.trim() : name;

    devices.value = devices.value.map((item) =>
      item.id === selectedDevice.value?.id
        ? { ...item, name: nextName, displayName: nextName }
        : item,
    );

    selectedDevice.value = { ...selectedDevice.value, name: nextName, displayName: nextName };
    message.success('设备名称已更新');
  } catch (error) {
    console.error(error);
    message.error('修改设备名称失败');
  } finally {
    renameSaving.value = false;
  }
}

async function loadData() {
  pageLoading.value = true;
  try {
    const [routerList, deviceList] = await Promise.all([fetchRouters(), fetchAdminDevices()]);
    routers.value = routerList;
    devices.value = deviceList;
  } catch (error) {
    console.error(error);
    message.error('加载管理数据失败');
  } finally {
    pageLoading.value = false;
  }
}

async function refreshAll() {
  await loadData();
}

async function submitRouterForm() {
  await routerFormRef.value?.validate();
  routerSaving.value = true;
  try {
    if (editingRouterId.value) {
      await updateRouter(editingRouterId.value, { ...routerForm });
      message.success('路由器已更新');
    } else {
      await createRouter({ ...routerForm });
      message.success('路由器已创建');
    }
    routerModalVisible.value = false;
    await loadData();
  } catch (error) {
    console.error(error);
    message.error('保存路由器失败');
  } finally {
    routerSaving.value = false;
  }
}

async function submitDeviceForm() {
  await deviceFormRef.value?.validate();
  deviceSaving.value = true;
  try {
    if (editingDeviceId.value) {
      await updateDevice(editingDeviceId.value, { ...deviceForm });
      message.success('设备已更新');
    } else {
      await createDevice({ ...deviceForm });
      message.success('设备已创建');
    }
    deviceModalVisible.value = false;
    await loadData();
  } catch (error) {
    console.error(error);
    message.error('保存设备失败');
  } finally {
    deviceSaving.value = false;
  }
}

async function handleDeleteRouter(row: RouterItem) {
  try {
    await deleteRouter(row.id);
    message.success('路由器已删除');
    await loadData();
  } catch (error) {
    console.error(error);
    message.error('删除路由器失败');
  }
}

async function handleDeleteDevice(row: DeviceAdminRow) {
  try {
    await deleteDevice(row.id);
    message.success('设备已删除');
    await loadData();
  } catch (error) {
    console.error(error);
    message.error('删除设备失败');
  }
}

async function quickToggleVisible(row: DeviceAdminRow, isVisible: boolean) {
  try {
    await updateDevice(row.id, { isVisible });
    row.isVisible = isVisible;
    message.success(isVisible ? '已公开展示' : '已取消公开展示');
  } catch (error) {
    console.error(error);
    message.error('更新展示状态失败');
    await loadData();
  }
}

async function handleCollectNow() {
  collectLoading.value = true;
  try {
    const result = await runCollectorNow();
    message.success(`已执行 ${result.count} 个路由器采集任务`);
    await loadData();
  } catch (error) {
    console.error(error);
    message.error('执行采集失败');
  } finally {
    collectLoading.value = false;
  }
}

function handleAccountAction(key: string) {
  if (key === 'logout') {
    auth.logout();
    router.replace('/login');
  }
}

onMounted(() => {
  void loadData();
});
</script>
