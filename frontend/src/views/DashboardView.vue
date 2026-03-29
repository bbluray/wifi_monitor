<template>
  <div class="page-shell dashboard-shell">
    <div class="page-hero">
      <div>
        <h1 class="page-title">WiFi 设备考勤看板</h1>
        <p class="page-subtitle">
          公开展示已发布设备的 1 天在线图。点击任意行可查看详情并修改设备名称。
        </p>
      </div>
      <n-space>
        <n-tag type="success" round>无需登录</n-tag>
        <n-button tertiary @click="router.push('/login')">管理员入口</n-button>
      </n-space>
    </div>

    <div class="card-grid">
      <n-card class="stat-card" title="公开设备">
        <n-statistic :value="devices.length" />
      </n-card>
      <n-card class="stat-card" title="当前在线">
        <n-statistic :value="onlineCount" />
      </n-card>
      <n-card class="stat-card" title="今日平均在线分钟">
        <n-statistic :value="todayAverageMinutes" />
      </n-card>
      <n-card class="stat-card" title="最近刷新">
        <div>{{ lastLoadedAtText }}</div>
      </n-card>
    </div>

    <n-card>
      <div class="toolbar">
        <n-input
          v-model:value="keyword"
          clearable
          placeholder="搜索设备名称"
          style="max-width: 320px"
        />
        <n-space>
          <n-text depth="3">数据每 60 秒自动刷新，点击列表行可查看详情</n-text>
          <n-button @click="loadDevices" :loading="loading">刷新</n-button>
        </n-space>
      </div>

      <n-data-table
        :columns="columns"
        :data="filteredDevices"
        :loading="loading"
        :row-props="rowProps"
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
          <n-descriptions-item label="1 天在线">{{ formatMinutes(selectedDevice?.onlineMinutes1d ?? 0) }}</n-descriptions-item>
          <n-descriptions-item label="7 天在线">{{ formatMinutes(selectedDevice?.onlineMinutes7d ?? 0) }}</n-descriptions-item>
          <n-descriptions-item label="30 天在线">{{ formatMinutes(selectedDevice?.onlineMinutes30d ?? 0) }}</n-descriptions-item>
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
  </div>
</template>

<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, ref } from 'vue';
import dayjs from 'dayjs';
import { useRouter } from 'vue-router';
import { NTag, useMessage, type DataTableColumns } from 'naive-ui';
import { CustomChart, HeatmapChart } from 'echarts/charts';
import { GridComponent, TitleComponent, TooltipComponent, VisualMapComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { use } from 'echarts/core';
import VChart from 'vue-echarts';
import { fetchDeviceTimeline, fetchVisibleDevices, updatePublicDeviceName } from '@/api/public';
import type { DeviceListItem, DeviceTimelinePoint, DeviceTimelineSegment } from '@/types';

use([CanvasRenderer, CustomChart, HeatmapChart, GridComponent, TooltipComponent, TitleComponent, VisualMapComponent]);

const router = useRouter();
const message = useMessage();

const loading = ref(false);
const devices = ref<DeviceListItem[]>([]);
const keyword = ref('');
const lastLoadedAt = ref<string | null>(null);
const timer = ref<number | null>(null);
const dayTimelineRequestToken = ref(0);

const detailVisible = ref(false);
const selectedDevice = ref<DeviceListItem | null>(null);
const timelineRange = ref<'1d' | '7d'>('1d');
const timelineDateValue = ref(dayjs().valueOf());
const timelineLoading = ref(false);
const timelineData = ref<DeviceTimelinePoint[]>([]);
const timelineSegments = ref<DeviceTimelineSegment[]>([]);
const dayTimelineSegments = ref<Record<number, DeviceTimelineSegment[]>>({});
const dayTimelineLoadingIds = ref<number[]>([]);

const renameSaving = ref(false);
const renameValue = ref('');

const filteredDevices = computed(() => {
  const key = keyword.value.trim().toLowerCase();
  if (!key) {
    return devices.value;
  }
  return devices.value.filter((item) => item.displayName.toLowerCase().includes(key));
});

const onlineCount = computed(() => devices.value.filter((item) => item.isOnline).length);
const todayAverageMinutes = computed(() => {
  if (devices.value.length === 0) {
    return 0;
  }

  const totalMinutes = devices.value.reduce((sum, item) => sum + item.onlineMinutes1d, 0);
  return Math.round(totalMinutes / devices.value.length);
});

const lastLoadedAtText = computed(() =>
  lastLoadedAt.value ? dayjs(lastLoadedAt.value).format('YYYY-MM-DD HH:mm:ss') : '未刷新',
);

const statusMeta = {
  online: { color: '#2f9e44', label: '在线' },
  offline: { color: '#f08c00', label: '离线' },
  pending: { color: '#d0d7de', label: '未开始' },
} as const;

const columns = computed<DataTableColumns<DeviceListItem>>(() => [
  {
    title: '设备名称',
    key: 'displayName',
    minWidth: 150,
    render(row) {
      return renderDeviceName(row);
    },
  },
  {
    title: '当前状态',
    key: 'isOnline',
    width: 96,
    render(row) {
      return h(
        NTag,
        { type: row.isOnline ? 'success' : 'default', round: true, size: 'small' },
        { default: () => (row.isOnline ? '在线' : '离线') },
      );
    },
  },
  {
    title: '一天在线图',
    key: 'timeline',
    minWidth: 560,
    render(row) {
      return renderDayTimeline(row);
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

function isDeviceTimelineLoading(deviceId: number) {
  return dayTimelineLoadingIds.value.includes(deviceId);
}

function renderDeviceName(row: DeviceListItem) {
  return h('div', { class: 'device-cell' }, [
    h('div', { class: 'device-title' }, row.displayName),
    h(
      'div',
      { class: 'device-stats' },
      formatMinutes(row.onlineMinutes1d),
    ),
  ]);
}

function renderDayTimeline(row: DeviceListItem) {
  if (isDeviceTimelineLoading(row.id)) {
    return h('div', { class: 'timeline-loading' }, '图形加载中...');
  }

  const segments = dayTimelineSegments.value[row.id] ?? [];
  const option = createTimelineChartOption({
    segments,
    dayLabels: [dayjs().format('MM-DD')],
    compact: true,
  });

  return h('div', { class: 'timeline-cell' }, [
    h(VChart, {
      autoresize: true,
      option,
      style: 'height: 60px; width: 100%;',
    }),
  ]);
}

function rowProps(row: DeviceListItem) {
  return {
    class: 'clickable-row',
    onClick: () => openDetail(row),
  };
}

async function loadDevices() {
  loading.value = true;
  try {
    const result = await fetchVisibleDevices();
    devices.value = result;
    lastLoadedAt.value = new Date().toISOString();
    void loadDayTimelines(result);
  } catch (error) {
    console.error(error);
    message.error('加载设备列表失败');
  } finally {
    loading.value = false;
  }
}

async function loadDayTimelines(deviceList: DeviceListItem[]) {
  const currentToken = dayTimelineRequestToken.value + 1;
  dayTimelineRequestToken.value = currentToken;

  const deviceIds = new Set(deviceList.map((item) => item.id));
  dayTimelineSegments.value = Object.fromEntries(
    Object.entries(dayTimelineSegments.value).filter(([deviceId]) => deviceIds.has(Number(deviceId))),
  );
  dayTimelineLoadingIds.value = deviceList.map((item) => item.id);

  const results = await Promise.allSettled(
    deviceList.map(async (device) => {
      const result = await fetchDeviceTimeline(device.id, '1d', dayjs().format('YYYY-MM-DD'));
      return { id: device.id, segments: result.segments ?? [] };
    }),
  );

  if (dayTimelineRequestToken.value !== currentToken) {
    return;
  }

  const nextMap = { ...dayTimelineSegments.value } as Record<number, DeviceTimelineSegment[]>;
  results.forEach((result, index) => {
    const deviceId = deviceList[index]?.id;
    if (!deviceId) {
      return;
    }
    nextMap[deviceId] = result.status === 'fulfilled' ? result.value.segments : [];
  });

  dayTimelineSegments.value = nextMap;
  dayTimelineLoadingIds.value = [];
}

async function loadTimeline() {
  if (!selectedDevice.value) {
    return;
  }
  timelineLoading.value = true;
  try {
    const result = await fetchDeviceTimeline(
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

function openDetail(device: DeviceListItem) {
  selectedDevice.value = device;
  renameValue.value = device.name || device.displayName || '';
  timelineRange.value = '1d';
  detailVisible.value = true;
  void loadTimeline();
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
    const updated = await updatePublicDeviceName(selectedDevice.value.id, name);
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

onMounted(() => {
  void loadDevices();
  timer.value = window.setInterval(() => {
    void loadDevices();
  }, 60_000);
});

onBeforeUnmount(() => {
  if (timer.value) {
    window.clearInterval(timer.value);
  }
});
</script>

<style scoped>
.dashboard-shell :deep(.n-data-table-th) {
  white-space: nowrap;
}

.device-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.device-title {
  font-weight: 600;
  color: #101828;
}

.device-stats {
  font-size: 12px;
  color: #475467;
}

.timeline-cell {
  min-width: 0;
}

.timeline-loading {
  min-height: 60px;
  display: flex;
  align-items: center;
  color: #98a2b3;
  font-size: 12px;
}
</style>
