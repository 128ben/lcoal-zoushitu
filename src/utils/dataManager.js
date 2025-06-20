export class PriceDataManager {
  constructor(maxDataPoints = 2000) {
    this.data = [];
    this.maxDataPoints = maxDataPoints;
    this.listeners = new Set();
    this.stats = {
      totalReceived: 0,
      averageFrequency: 0,
      lastMinuteCount: 0
    };
    
    // 统计最近一分钟的数据频率
    this.frequencyTracker = [];
    this.frequencyInterval = setInterval(() => this.updateFrequencyStats(), 1000);
  }
  
  addData(newData) {
    const dataPoint = {
      ...newData,
      id: `${newData.timestamp}-${Math.random().toString(36).substr(2, 9)}`
    };
    
    this.data.push(dataPoint);
    this.stats.totalReceived++;
    
    // 记录接收时间用于频率统计
    this.frequencyTracker.push(Date.now());
    
    // 保持数据量在限制范围内
    if (this.data.length > this.maxDataPoints) {
      this.data.shift();
    }
    
    // 通知所有监听器
    this.notifyListeners('dataAdded', dataPoint);
  }
  
  updateFrequencyStats() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // 清理超过1分钟的记录
    this.frequencyTracker = this.frequencyTracker.filter(time => time > oneMinuteAgo);
    
    // 计算最近一分钟的数据频率
    this.stats.lastMinuteCount = this.frequencyTracker.length;
    this.stats.averageFrequency = this.stats.lastMinuteCount / 60;
  }
  
  getLatestData(count = 100) {
    return this.data.slice(-count);
  }
  
  getDataInTimeRange(startTime, endTime) {
    return this.data.filter(item => 
      item.timestamp >= startTime && item.timestamp <= endTime
    );
  }
  
  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
  
  notifyListeners(event, data) {
    this.listeners.forEach(callback => {
      try {
        callback(event, data);
      } catch (error) {
        console.error('Data listener error:', error);
      }
    });
  }
  
  getStats() {
    return { ...this.stats };
  }
  
  clear() {
    this.data = [];
    this.frequencyTracker = [];
    this.stats.totalReceived = 0;
    this.notifyListeners('dataCleared');
  }
  
  destroy() {
    if (this.frequencyInterval) {
      clearInterval(this.frequencyInterval);
    }
    this.listeners.clear();
  }
} 