<template>
  <div class="page-shell">
    <div class="page-hero">
      <div>
        <h1 class="page-title">WiFi 设备考勤看板</h1>
        <p class="page-subtitle">
          公开展示已发布设备的在线时长统计、当前在线状态与备注信息。点击任意行可查看图形化在线情况。
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
      <n-card class="stat-card" title="今日在线总分钟">
        <n-statistic :value="todayTotalMinutes" />
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
          placeholder="搜索设备名称 / MAC"
          style="max-width: 320px"
        />
        <n-space>
          <n-text depth="3">数据每 60 秒自动刷新，所有人都可以修改公开设备名称</n-text>
          <n-button @click="loadDevices" :loading="loading">刷新</n-button>
        </n-space>
      </div>

      <n-data-table
        :columns="columns"
        :data="filteredDevices"
        :loading="loading"
        :row-props="rowProps"
        :pagination="{ pageSize: 10 }"
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
        <n-descriptions bordered :column="2">
          <n-descriptions-item label="MAC">{{ selectedDevice?.macAddress }}</n-descriptions-item>
          <n-descriptions-item label="当前状态">
            <n-tag :type="selectedDevice?.isOnline ? 'success' : 'default'">
              {{ selectedDevice?.isOnline ? '在线' : '离线' }}
            </n-tag>
          </n-descriptions-item>
          <n-descriptions-item label="1 天在线">{{ formatMinutes(selectedDevice?.onlineMinutes1d ?? 0) }}</n-descriptions-item>
          <n-descriptions-item label="7 天在线">{{ formatMinutes(selectedDevice?.onlineMinutes7d ?? 0) }}</n-descriptions-item>
        </n-descriptions>

        <n-space justify="space-between" align="center" wrap>
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
      v-model:show="renameVisible"
      preset="dialog"
      title="修改设备名称"
      style="width: min(520px, 92vw)"
    >
      <n-input
        v-model:value="renameValue"
        placeholder="请输入设备名称"
        maxlength="64"
        show-count
        @keyup.enter="submitRename"
      />

      <template #action>
        <n-space>
          <n-button @click="renameVisible = false">取消</n-button>
          <n-button type="primary" :loading="renameSaving" @click="submitRename">保存</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, ref } from 'vue';
import dayjs from 'dayjs';
import { useRouter } from 'vue-router';
import { NButton, NInput, NTag, useMessage, type DataTableColumns } from 'naive-ui';
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

const detailVisible = ref(false);
const selectedDevice = ref<DeviceListItem | null>(null);
const timelineRange = ref<'1d' | '7d'>('1d');
const timelineDateValue = ref(dayjs().valueOf());
const timelineLoading = ref(false);
const timelineData = ref<DeviceTimelinePoint[]>([]);
const timelineSegments = ref<DeviceTimelineSegment[]>([]);

const renameVisible = ref(false);
const renameSaving = ref(false);
const renamingDevice = ref<DeviceListItem | null>(null);
const renameValue = ref('');

const filteredDevices = computed(() => {
  const key = keyword.value.trim().toLowerCase();
  if (!key) {
    return devices.value;
  }
  return devices.value.filter((item) => {
    return [item.displayName, item.macAddress]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(key);
  });
});

const onlineCount = computed(() => devices.value.filter((item) => item.isOnline).length);
const todayTotalMinutes = computed(() =>
  devices.value.reduce((sum, item) => sum + item.onlineMinutes1d, 0),
);

const lastLoadedAtText = computed(() =>
  lastLoadedAt.value ? dayjs(lastLoadedAt.value).format('YYYY-MM-DD HH:mm:ss') : '未刷新',
);

const columns = computed<DataTableColumns<DeviceListItem>>(() => [
  {
    title: '设备名称',
    key: 'displayName',
    width: 120,
  },
  {
    title: 'MAC',
    key: 'macAddress',
    width: 120,
  },
  {
    title: 'IP',
    key: 'ipAddress',
    width: 120,
    render(row) {
      return row.ipAddress || '—';
    },
  },
  {
    title: '当前状态',
    key: 'isOnline',
    width: 100,
    render(row) {
      return h(
        NTag,
        { type: row.isOnline ? 'success' : 'default', round: true },
        { default: () => (row.isOnline ? '在线' : '离线') },
      );
    },
  },
  {
    title: '1 天在线',
    key: 'onlineMinutes1d',
    width: 100,
    render(row) {
      return formatMinutes(row.onlineMinutes1d);
    },
  },
  {
    title: '7 天在线',
    key: 'onlineMinutes7d',
    width: 100,
    render(row) {
      return formatMinutes(row.onlineMinutes7d);
    },
  },
  {
    title: '操作',
    key: 'actions',
    width: 170,
    render(row) {
      return h('div', { style: 'display:flex;gap:8px;' }, [
        h(
          NButton,
          {
            size: 'small',
            tertiary: true,
            onClick: (event: MouseEvent) => {
              event.stopPropagation();
              openRename(row);
            },
          },
          { default: () => '改名' },
        ),
        h(
          NButton,
          {
            size: 'small',
            tertiary: true,
            onClick: (event: MouseEvent) => {
              event.stopPropagation();
              openDetail(row);
            },
          },
          { default: () => '查看图表' },
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
  const statusMeta = {
    online: { color: '#2f9e44', label: '在线' },
    offline: { color: '#f08c00', label: '离线' },
    pending: { color: '#d0d7de', label: '未开始' },
  } as const;

  const dayLabels = timelineRange.value === '7d'
    ? timelineData.value.map((item) => item.label)
    : [dayjs(timelineDateValue.value).format('MM-DD')];

  const dayIndexMap = new Map(dayLabels.map((label, index) => [label, dayLabels.length - 1 - index]));

  const chartSegments = timelineSegments.value.map((segment) => {
    const startAt = dayjs(segment.startAt);
    const endAt = dayjs(segment.endAt);
    const meta = statusMeta[segment.status];
    const dayLabel = segment.dayLabel ?? startAt.format('MM-DD');
    const rowIndex = dayIndexMap.get(dayLabel) ?? 0;
    return {
      name: meta.label,
      value: [rowIndex, startAt.hour() + startAt.minute() / 60, endAt.hour() + endAt.minute() / 60],
      itemStyle: { color: meta.color },
      minutes: segment.minutes,
      startLabel: startAt.format('MM-DD HH:mm'),
      endLabel: endAt.format('MM-DD HH:mm'),
    };
  });

  if (timelineRange.value === '1d' || timelineRange.value === '7d') {
    return {
      title: {
        text: `${titleText} · ${timelineRange.value === '7d' ? `${dayLabels[0]} 至 ${dayLabels[dayLabels.length - 1]}` : titleDate}`,
        left: 'center',
      },
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const data = params.data;
          return `${data.startLabel} - ${data.endLabel}<br/>${data.name}: ${data.minutes} 分钟`;
        },
      },
      grid: {
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
        interval: 2,
        axisLabel: {
          formatter: (value: number) => `${String(value).padStart(2, '0')}:00`,
        },
        splitLine: {
          show: true,
          lineStyle: { color: '#eceff1' },
        },
      },
      yAxis: {
        type: 'category',
        data: timelineRange.value === '7d' ? [...dayLabels].reverse() : [''],
        axisLine: { show: false },
        axisLabel: { show: timelineRange.value === '7d' },
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
            const barHeight = Math.max(24, api.size([0, 1])[1] * 0.42);
            return {
              type: 'rect',
              shape: {
                x: start[0],
                y: start[1] - barHeight / 2,
                width: Math.max(1, end[0] - start[0]),
                height: barHeight,
              },
              style: api.style(),
            };
          },
        },
      ],
      graphic: [
        { type: 'text', left: '8%', top: '18%', style: { text: '在线', fill: '#2f9e44', fontSize: 12 } },
        { type: 'text', left: '14%', top: '18%', style: { text: '离线', fill: '#f08c00', fontSize: 12 } },
        { type: 'text', left: '20%', top: '18%', style: { text: '未开始', fill: '#98a2b3', fontSize: 12 } },
      ],
    };
  }

  return {};
});

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

function rowProps(row: DeviceListItem) {
  return {
    class: 'clickable-row',
    onClick: () => openDetail(row),
  };
}

async function loadDevices() {
  loading.value = true;
  try {
    devices.value = await fetchVisibleDevices();
    lastLoadedAt.value = new Date().toISOString();
  } catch (error) {
    console.error(error);
    message.error('加载设备列表失败');
  } finally {
    loading.value = false;
  }
}

async function loadTimeline() {
  if (!selectedDevice.value) {
    return;
  }
  timelineLoading.value = true;
  try {
    const result = await fetchDeviceTimeline(selectedDevice.value.id, timelineRange.value, dayjs(timelineDateValue.value).format('YYYY-MM-DD'));
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
  timelineRange.value = '1d';
  detailVisible.value = true;
  void loadTimeline();
}

function openRename(device: DeviceListItem) {
  renamingDevice.value = device;
  renameValue.value = device.name || device.displayName || '';
  renameVisible.value = true;
}

async function submitRename() {
  if (!renamingDevice.value) {
    return;
  }

  const name = renameValue.value.trim();
  if (!name) {
    message.error('设备名称不能为空');
    return;
  }

  renameSaving.value = true;
  try {
    const updated = await updatePublicDeviceName(renamingDevice.value.id, name);
    const nextName = typeof updated.name === 'string' && updated.name.trim() ? updated.name.trim() : name;

    devices.value = devices.value.map((item) =>
      item.id === renamingDevice.value?.id
        ? { ...item, name: nextName, displayName: nextName }
        : item,
    );

    if (selectedDevice.value?.id === renamingDevice.value.id) {
      selectedDevice.value = { ...selectedDevice.value, name: nextName, displayName: nextName };
    }

    renamingDevice.value = null;
    renameVisible.value = false;
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
