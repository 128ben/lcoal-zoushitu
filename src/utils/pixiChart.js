import * as PIXI from 'pixi.js';

export class PixiChart {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      width: options.width || 800,
      height: options.height || 600,
      backgroundColor: options.backgroundColor || 0x1a1a1a,
      gridColor: options.gridColor || 0x333333,
      lineColor: options.lineColor || 0x00aaff,
      pointColor: options.pointColor || 0xffffff,
      latestPointColor: options.latestPointColor || 0xff4444,
      textColor: options.textColor || 0xcccccc,
      ...options
    };
    
    this.data = [];
    this.viewState = {
      offsetX: 0,
      offsetY: 0,
      scaleX: 1,
      scaleY: 1,
      isDragging: false,
      dragStart: { x: 0, y: 0 }
    };
    
    this.timeRange = 60000; // 60秒时间范围
    this.priceRange = { min: 95, max: 105 }; // 初始价格范围
    this.startTime = Date.now();
    
    this.init();
  }
  
  init() {
    console.log('Initializing PixiChart with dimensions:', this.options.width, 'x', this.options.height);
    
    // 创建PIXI应用
    this.app = new PIXI.Application({
      width: this.options.width,
      height: this.options.height,
      backgroundColor: this.options.backgroundColor,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true
    });
    
    console.log('PIXI Application created');
    
    // 使用canvas而不是view (Pixi.js 7.x兼容性)
    const canvas = this.app.canvas || this.app.view;
    this.container.appendChild(canvas);
    
    console.log('Canvas added to container');
    
    // 创建容器
    this.gridContainer = new PIXI.Container();
    this.chartContainer = new PIXI.Container();
    this.textContainer = new PIXI.Container();
    this.pulseContainer = new PIXI.Container();
    
    // 添加到stage，顺序很重要
    this.app.stage.addChild(this.gridContainer);
    this.app.stage.addChild(this.chartContainer);
    this.app.stage.addChild(this.pulseContainer);
    this.app.stage.addChild(this.textContainer);
    
    // 创建图形对象
    this.gridGraphics = new PIXI.Graphics();
    this.lineGraphics = new PIXI.Graphics();
    this.pulseGraphics = new PIXI.Graphics();
    
    this.gridContainer.addChild(this.gridGraphics);
    this.chartContainer.addChild(this.lineGraphics);
    this.pulseContainer.addChild(this.pulseGraphics);
    
    // 脉冲动画相关
    this.pulseTime = 0;
    this.lastEndPoint = null;
    
    // 设置交互
    this.setupInteraction();
    
    // 启动渲染循环
    this.app.ticker.add(() => this.update());
    
    // 初始化绘制
    this.drawGrid();
    
    console.log('PixiChart initialization complete');
  }
  
  setupInteraction() {
    const canvas = this.app.canvas || this.app.view;
    
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      this.zoom(delta, e.offsetX, e.offsetY);
    });
    
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { // 左键
        this.viewState.isDragging = true;
        this.viewState.dragStart = { x: e.offsetX, y: e.offsetY };
      }
    });
    
    canvas.addEventListener('mousemove', (e) => {
      if (this.viewState.isDragging) {
        const deltaX = e.offsetX - this.viewState.dragStart.x;
        const deltaY = e.offsetY - this.viewState.dragStart.y;
        
        this.viewState.offsetX += deltaX;
        this.viewState.offsetY += deltaY;
        
        this.viewState.dragStart = { x: e.offsetX, y: e.offsetY };
        this.updateView();
      }
    });
    
    canvas.addEventListener('mouseup', () => {
      this.viewState.isDragging = false;
    });
    
    canvas.addEventListener('mouseleave', () => {
      this.viewState.isDragging = false;
    });
  }
  
  zoom(factor, centerX, centerY) {
    const oldScaleX = this.viewState.scaleX;
    const oldScaleY = this.viewState.scaleY;
    
    this.viewState.scaleX = Math.max(0.1, Math.min(10, this.viewState.scaleX * factor));
    this.viewState.scaleY = Math.max(0.1, Math.min(10, this.viewState.scaleY * factor));
    
    // 调整偏移以保持缩放中心
    const scaleFactorX = this.viewState.scaleX / oldScaleX;
    const scaleFactorY = this.viewState.scaleY / oldScaleY;
    
    this.viewState.offsetX = centerX - (centerX - this.viewState.offsetX) * scaleFactorX;
    this.viewState.offsetY = centerY - (centerY - this.viewState.offsetY) * scaleFactorY;
    
    this.updateView();
  }
  
  updateView() {
    this.chartContainer.position.set(this.viewState.offsetX, this.viewState.offsetY);
    this.chartContainer.scale.set(this.viewState.scaleX, this.viewState.scaleY);
    
    this.drawGrid();
    this.drawChart();
  }
  
  drawGrid() {
    this.gridGraphics.clear();
    this.textContainer.removeChildren();
    
    const width = this.options.width;
    const height = this.options.height;
    const currentTime = Date.now();
    const timeOffset = ((currentTime - this.startTime) % 5000) / 5000; // 5秒一个周期
    
    // 最新时间在四分之三处
    const latestTimeX = width * 0.75;
    
    // 设置网格样式
    this.gridGraphics.lineStyle(1, this.options.gridColor, 0.3);
    
    // 绘制流动的垂直网格线（时间轴）
    const gridSpacing = 100; // 网格间距
    const numLines = Math.ceil(width / gridSpacing) + 2;
    
    for (let i = -1; i < numLines; i++) {
      // 以四分之三处为基准计算网格线位置
      const x = latestTimeX + (i * gridSpacing) - (timeOffset * gridSpacing) - (Math.floor(numLines * 0.75) * gridSpacing);
      
      if (x >= -gridSpacing && x <= width + gridSpacing) {
        // 绘制垂直线
        this.gridGraphics.moveTo(x, 0);
        this.gridGraphics.lineTo(x, height);
        
        // 添加时间标签
        const timeOffsetFromLatest = (latestTimeX - x) / gridSpacing * 5000; // 每个网格5秒
        const timeAtLine = currentTime - timeOffsetFromLatest;
        const timeText = this.formatTimeLabel(timeAtLine);
        
        const text = new PIXI.Text(timeText, {
          fontFamily: 'Arial',
          fontSize: 12,
          fill: this.options.textColor,
          align: 'center'
        });
        
        text.x = x - text.width / 2;
        text.y = height - 20;
        this.textContainer.addChild(text);
      }
    }
    
    // 绘制水平网格线（价格轴）
    const priceStep = (this.priceRange.max - this.priceRange.min) / 8;
    for (let i = 0; i <= 8; i++) {
      const price = this.priceRange.min + (i * priceStep);
      const y = this.priceToY(price);
      
      // 绘制水平线
      this.gridGraphics.moveTo(0, y);
      this.gridGraphics.lineTo(width, y);
      
      // 添加价格标签
      const priceText = new PIXI.Text(price.toFixed(2), {
        fontFamily: 'Arial',
        fontSize: 12,
        fill: this.options.textColor,
        align: 'right'
      });
      
      priceText.x = 5;
      priceText.y = y - 8;
      this.textContainer.addChild(priceText);
    }
  }
  
  drawChart() {
    if (this.data.length < 2) return;
    
    // 清除之前的绘制
    this.lineGraphics.clear();
    this.pulseGraphics.clear();
    
    // 更新价格范围
    this.updatePriceRange();
    
    const currentTime = Date.now();
    const chartWidth = this.options.width;
    
    // 获取可见数据
    const visibleData = this.data.filter(point => {
      const timeDiff = currentTime - point.timestamp;
      return timeDiff <= this.timeRange; // 只显示最近60秒的数据
    });
    
    if (visibleData.length < 2) return;
    
    // 只绘制主折线，不绘制动画线段以避免重复
    this.drawMainLine(visibleData, currentTime, chartWidth);
    
    // 绘制端点脉冲效果
    this.drawPulseEffect();
  }
  
  drawMainLine(visibleData, currentTime, chartWidth) {
    // 绘制主要的折线，最新点在四分之三处
    this.lineGraphics.lineStyle(2, this.options.lineColor, 1);
    
    let isFirstPoint = true;
    let endPoint = null;
    
    // 最新点的X位置设在四分之三处
    const latestX = chartWidth * 0.75;
    
    for (let i = 0; i < visibleData.length; i++) {
      const point = visibleData[i];
      const timeDiff = currentTime - point.timestamp;
      
      // 重新计算X坐标：最新点在3/4处，向左延伸
      const x = latestX - (timeDiff / this.timeRange) * chartWidth;
      const y = this.priceToY(point.price);
      
      if (x >= 0 && x <= chartWidth) { // 只绘制可见区域内的点
        if (isFirstPoint) {
          this.lineGraphics.moveTo(x, y);
          isFirstPoint = false;
        } else {
          this.lineGraphics.lineTo(x, y);
        }
        
        // 记录最新的端点（四分之三处的点）
        if (i === visibleData.length - 1) {
          endPoint = { x, y };
        }
      }
    }
    
    // 更新端点位置用于脉冲效果
    this.lastEndPoint = endPoint;
  }
  
  drawPulseEffect() {
    // 使用主折线的端点位置
    if (!this.lastEndPoint) return;
    
    const { x, y } = this.lastEndPoint;
    
    // 计算脉冲动画参数
    const pulseSpeed = 0.05; // 脉冲速度
    this.pulseTime += pulseSpeed;
    
    // 创建多层脉冲效果
    const pulseCount = 3;
    for (let i = 0; i < pulseCount; i++) {
      const phaseOffset = (i * Math.PI * 2) / pulseCount;
      const pulse = Math.sin(this.pulseTime + phaseOffset) * 0.5 + 0.5;
      
      // 脉冲半径和透明度
      const baseRadius = 4;
      const maxRadius = 12;
      const radius = baseRadius + (maxRadius - baseRadius) * pulse;
      const alpha = (1 - pulse) * 0.6;
      
      // 绘制脉冲圆环 - 使用折线颜色
      this.pulseGraphics.lineStyle(2, this.options.lineColor, alpha);
      this.pulseGraphics.drawCircle(x, y, radius);
    }
    
    // 绘制中心点 - 使用折线颜色
    this.pulseGraphics.beginFill(this.options.lineColor, 1);
    this.pulseGraphics.drawCircle(x, y, 3);
    this.pulseGraphics.endFill();
  }
  
  priceToY(price) {
    const normalizedPrice = (price - this.priceRange.min) / (this.priceRange.max - this.priceRange.min);
    const chartTop = this.options.height * 0.1;
    const chartHeight = this.options.height * 0.7; // 留出底部空间给时间标签
    return chartTop + chartHeight - (normalizedPrice * chartHeight);
  }
  
  updatePriceRange() {
    if (this.data.length === 0) return;
    
    const currentTime = Date.now();
    const recentData = this.data.filter(d => (currentTime - d.timestamp) <= this.timeRange);
    
    if (recentData.length === 0) return;
    
    const prices = recentData.map(d => d.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const padding = (max - min) * 0.1 || 1; // 至少1的padding
    
    this.priceRange.min = min - padding;
    this.priceRange.max = max + padding;
  }
  
  formatTimeLabel(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', {
      hour12: false,
      minute: '2-digit',
      second: '2-digit'
    });
  }
  
  addData(newData) {
    this.data.push(newData);
    
    // 保持数据在合理范围内
    const cutoffTime = Date.now() - this.timeRange * 2;
    this.data = this.data.filter(d => d.timestamp > cutoffTime);
  }
  
  update() {
    // 持续更新网格和图表以实现流动效果
    this.drawGrid();
    this.drawChart();
  }
  
  resetView() {
    this.viewState.offsetX = 0;
    this.viewState.offsetY = 0;
    this.viewState.scaleX = 1;
    this.viewState.scaleY = 1;
    this.updateView();
  }
  
  resize(width, height) {
    this.options.width = width;
    this.options.height = height;
    this.app.renderer.resize(width, height);
    this.drawGrid();
    this.drawChart();
  }
  
  destroy() {
    if (this.app) {
      this.app.destroy(true);
    }
  }
} 