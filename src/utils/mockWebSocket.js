export class MockWebSocket {
  constructor(url, options = {}) {
    this.url = url;
    this.readyState = WebSocket.CONNECTING;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    
    // 配置参数
    this.config = {
      basePrice: options.basePrice || 100,
      volatility: options.volatility || 0.02, // 2% 波动率
      minDataPerSecond: options.minDataPerSecond || 2,
      maxDataPerSecond: options.maxDataPerSecond || 3,
      ...options
    };
    
    this.currentPrice = this.config.basePrice;
    this.dataCount = 0;
    this.isRunning = false;
    
    // 模拟连接延迟
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      if (this.onopen) this.onopen({ type: 'open' });
      this.startDataStream();
    }, Math.random() * 200 + 100);
  }
  
  startDataStream() {
    if (this.isRunning) return;
    this.isRunning = true;
    
    const generateDataBurst = () => {
      if (!this.isRunning || this.readyState !== WebSocket.OPEN) return;
      
      // 随机确定这一秒要发送的数据条数 (2-3条)
      const dataCount = Math.floor(Math.random() * 
        (this.config.maxDataPerSecond - this.config.minDataPerSecond + 1)) + 
        this.config.minDataPerSecond;
      
      // 生成这一秒内的时间分布点
      const timePoints = this.generateTimeDistribution(1000, dataCount);
      
      timePoints.forEach((delay, index) => {
        setTimeout(() => {
          if (this.isRunning && this.readyState === WebSocket.OPEN) {
            this.sendPriceData();
          }
        }, delay);
      });
      
      // 安排下一秒的数据发送
      setTimeout(generateDataBurst, 1000);
    };
    
    generateDataBurst();
  }
  
  // 生成1秒内的时间分布点
  generateTimeDistribution(totalTime, count) {
    const points = [];
    
    if (count === 1) {
      points.push(Math.random() * totalTime);
    } else {
      // 生成随机时间点并排序
      for (let i = 0; i < count; i++) {
        points.push(Math.random() * totalTime);
      }
      points.sort((a, b) => a - b);
      
      // 确保最小间隔
      const minInterval = 50; // 最小50ms间隔
      for (let i = 1; i < points.length; i++) {
        if (points[i] - points[i-1] < minInterval) {
          points[i] = points[i-1] + minInterval;
        }
      }
    }
    
    return points;
  }
  
  sendPriceData() {
    // 生成价格波动
    const changePercent = (Math.random() - 0.5) * 2 * this.config.volatility;
    const priceChange = this.currentPrice * changePercent;
    this.currentPrice = Math.max(0.01, this.currentPrice + priceChange);
    
    // 生成交易量
    const baseVolume = 1000;
    const volumeVariation = Math.random() * 2000;
    const volume = Math.floor(baseVolume + volumeVariation);
    
    const data = {
      timestamp: Date.now(),
      price: Number(this.currentPrice.toFixed(2)),
      volume: volume,
      change: Number((changePercent * 100).toFixed(2)),
      changePercent: changePercent > 0 ? 'up' : 'down',
      high: Number((this.currentPrice * 1.001).toFixed(2)),
      low: Number((this.currentPrice * 0.999).toFixed(2)),
      sequence: ++this.dataCount
    };
    
    if (this.onmessage) {
      this.onmessage({
        data: JSON.stringify(data),
        type: 'message'
      });
    }
  }
  
  close() {
    this.isRunning = false;
    this.readyState = WebSocket.CLOSED;
    if (this.onclose) this.onclose({ type: 'close' });
  }
  
  send(data) {
    console.log('Mock WebSocket send:', data);
  }
}

// 工厂函数
export function createMockWebSocket(url, options) {
  return new MockWebSocket(url, options);
} 