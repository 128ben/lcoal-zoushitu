<template>
  <div class="price-chart-container">
    <!-- 控制面板 -->
    <div class="control-panel">
      <div class="stats-info">
        <span class="stat-item">
          <span class="label">实时频率:</span>
          <span class="value">{{ currentFrequency.toFixed(1) }}/秒</span>
        </span>
        <span class="stat-item">
          <span class="label">总数据:</span>
          <span class="value">{{ totalData }}</span>
        </span>
        <span class="stat-item">
          <span class="label">当前价格:</span>
          <span class="value" :class="priceChangeClass">${{ currentPrice }}</span>
        </span>
        <span class="stat-item">
          <span class="label">变化:</span>
          <span class="value" :class="priceChangeClass">{{ priceChange }}%</span>
        </span>
      </div>
      <div class="control-buttons">
        <button @click="zoomIn" class="control-btn">
          <span>🔍+</span>
          <span>放大</span>
        </button>
        <button @click="zoomOut" class="control-btn">
          <span>🔍-</span>
          <span>缩小</span>
        </button>
        <button @click="resetView" class="control-btn">
          <span>🎯</span>
          <span>重置</span>
        </button>
        <button @click="togglePause" class="control-btn" :class="{ active: isPaused }">
          <span>{{ isPaused ? '▶️' : '⏸️' }}</span>
          <span>{{ isPaused ? '继续' : '暂停' }}</span>
        </button>
        <button @click="clearData" class="control-btn danger">
          <span>🗑️</span>
          <span>清空</span>
        </button>
      </div>
    </div>
    
    <!-- 图表容器 -->
    <div class="chart-container" ref="chartContainer"></div>
    
    <!-- 连接状态指示器 -->
    <div class="connection-status" :class="connectionStatus">
      <div class="status-dot"></div>
      <span>{{ connectionStatusText }}</span>
    </div>
    
    <!-- 数据详情浮窗 -->
    <div v-if="hoveredData" class="data-tooltip" :style="tooltipStyle">
      <div class="tooltip-header">数据详情</div>
      <div class="tooltip-content">
        <p><strong>时间:</strong> {{ formatTime(hoveredData.timestamp) }}</p>
        <p><strong>价格:</strong> ${{ hoveredData.price }}</p>
        <p><strong>变化:</strong> {{ hoveredData.change }}%</p>
        <p><strong>成交量:</strong> {{ hoveredData.volume.toLocaleString() }}</p>
        <p><strong>序号:</strong> #{{ hoveredData.sequence }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { createMockWebSocket } from '../utils/mockWebSocket.js';
import { PriceDataManager } from '../utils/dataManager.js';
import { PixiChart } from '../utils/pixiChart.js';

// 响应式数据
const chartContainer = ref(null);
const currentPrice = ref(100);
const priceChange = ref(0);
const currentFrequency = ref(0);
const totalData = ref(0);
const isPaused = ref(false);
const hoveredData = ref(null);
const tooltipStyle = ref({});
const connectionStatus = ref('connecting');

// 计算属性
const priceChangeClass = computed(() => {
  return priceChange.value > 0 ? 'price-up' : priceChange.value < 0 ? 'price-down' : '';
});

const connectionStatusText = computed(() => {
  switch (connectionStatus.value) {
    case 'connected': return '已连接';
    case 'connecting': return '连接中...';
    case 'disconnected': return '已断开';
    default: return '未知状态';
  }
});

// 数据管理
let dataManager = null;
let mockWs = null;
let pixiChart = null;
let removeDataListener = null;
let frequencyInterval = null;

// 生命周期
onMounted(async () => {
  await nextTick();
  initializeChart();
  setupWebSocket();
  setupResize();
});

onUnmounted(() => {
  cleanup();
});

// 初始化图表
function initializeChart() {
  if (!chartContainer.value) return;
  
  const rect = chartContainer.value.getBoundingClientRect();
  
  pixiChart = new PixiChart(chartContainer.value, {
    width: rect.width,
    height: rect.height,
    backgroundColor: 0x1a1a1a,
    gridColor: 0x333333,
    lineColor: 0x00aaff,
    pointColor: 0xffffff,
    latestPointColor: 0xff4444
  });
}

// 设置WebSocket连接
function setupWebSocket() {
  dataManager = new PriceDataManager(2000);
  
  // 监听数据变化
  removeDataListener = dataManager.addListener((event, data) => {
    if (event === 'dataAdded' && !isPaused.value) {
      currentPrice.value = data.price;
      priceChange.value = data.change;
      totalData.value = dataManager.stats.totalReceived;
      
      // 更新图表
      if (pixiChart) {
        pixiChart.addData(data);
      }
    }
  });
  
  // 定期更新频率显示
  frequencyInterval = setInterval(() => {
    const stats = dataManager.getStats();
    currentFrequency.value = stats.averageFrequency;
  }, 1000);
  
  // 创建Mock WebSocket
  mockWs = createMockWebSocket('ws://localhost:8080/price', {
    basePrice: 100,
    volatility: 0.025,
    minDataPerSecond: 2,
    maxDataPerSecond: 3
  });
  
  mockWs.onopen = () => {
    connectionStatus.value = 'connected';
    console.log('Mock WebSocket 连接已建立');
  };
  
  mockWs.onmessage = (event) => {
    if (!isPaused.value) {
      const data = JSON.parse(event.data);
      dataManager.addData(data);
    }
  };
  
  mockWs.onerror = (error) => {
    connectionStatus.value = 'disconnected';
    console.error('Mock WebSocket 错误:', error);
  };
  
  mockWs.onclose = () => {
    connectionStatus.value = 'disconnected';
    console.log('Mock WebSocket 连接已关闭');
  };
}

// 设置窗口大小调整
function setupResize() {
  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      if (pixiChart && width > 0 && height > 0) {
        pixiChart.resize(width, height);
      }
    }
  });
  
  if (chartContainer.value) {
    resizeObserver.observe(chartContainer.value);
  }
}

// 控制函数
function zoomIn() {
  if (pixiChart) {
    pixiChart.zoom(1.2, pixiChart.options.width / 2, pixiChart.options.height / 2);
  }
}

function zoomOut() {
  if (pixiChart) {
    pixiChart.zoom(0.8, pixiChart.options.width / 2, pixiChart.options.height / 2);
  }
}

function resetView() {
  if (pixiChart) {
    pixiChart.resetView();
  }
}

function togglePause() {
  isPaused.value = !isPaused.value;
}

function clearData() {
  if (dataManager) {
    dataManager.clear();
    totalData.value = 0;
  }
  if (pixiChart) {
    pixiChart.data = [];
  }
}

// 工具函数
function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function cleanup() {
  if (mockWs) {
    mockWs.close();
  }
  if (removeDataListener) {
    removeDataListener();
  }
  if (frequencyInterval) {
    clearInterval(frequencyInterval);
  }
  if (dataManager) {
    dataManager.destroy();
  }
  if (pixiChart) {
    pixiChart.destroy();
  }
}
</script>

<style scoped>
.price-chart-container {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #1a1a1a;
  position: relative;
}

.control-panel {
  padding: 12px 20px;
  background: linear-gradient(135deg, #2a2a2a 0%, #1e1e1e 100%);
  border-bottom: 1px solid #333;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.stats-info {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 5px;
}

.label {
  color: #888;
  font-size: 12px;
}

.value {
  color: #fff;
  font-weight: bold;
  font-size: 14px;
}

.price-up {
  color: #00ff88;
}

.price-down {
  color: #ff4444;
}

.control-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.control-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 12px;
  border: none;
  background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
  color: white;
  border-radius: 6px;
  cursor: pointer;
  font-size: 10px;
  transition: all 0.2s ease;
  min-width: 50px;
}

.control-btn:hover {
  background: linear-gradient(135deg, #0056b3 0%, #004085 100%);
  transform: translateY(-1px);
}

.control-btn.active {
  background: linear-gradient(135deg, #28a745 0%, #1e7e34 100%);
}

.control-btn.danger {
  background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
}

.control-btn span:first-child {
  font-size: 16px;
}

.chart-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.connection-status {
  position: absolute;
  top: 80px;
  right: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.8);
  border-radius: 20px;
  font-size: 12px;
  backdrop-filter: blur(10px);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  animation: pulse 2s infinite;
}

.connection-status.connected .status-dot {
  background-color: #00ff88;
}

.connection-status.connecting .status-dot {
  background-color: #ffa500;
}

.connection-status.disconnected .status-dot {
  background-color: #ff4444;
}

.data-tooltip {
  position: absolute;
  background: rgba(0, 0, 0, 0.9);
  color: white;
  padding: 12px;
  border-radius: 8px;
  font-size: 12px;
  pointer-events: none;
  z-index: 1000;
  backdrop-filter: blur(10px);
  border: 1px solid #333;
}

.tooltip-header {
  font-weight: bold;
  margin-bottom: 8px;
  color: #00aaff;
  border-bottom: 1px solid #333;
  padding-bottom: 4px;
}

.tooltip-content p {
  margin: 4px 0;
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

@keyframes pulse {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
  100% {
    opacity: 1;
  }
}

@media (max-width: 768px) {
  .control-panel {
    flex-direction: column;
    gap: 10px;
  }
  
  .stats-info {
    justify-content: center;
  }
  
  .control-buttons {
    justify-content: center;
  }
  
  .control-btn {
    min-width: 45px;
    padding: 6px 8px;
  }
}
</style> 