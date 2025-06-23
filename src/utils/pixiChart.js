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
      animationDuration: options.animationDuration || 800, // 动画持续时间(ms)
      animationEasing: options.animationEasing || 'easeOutCubic', // 缓动函数
      animationEnabled: options.animationEnabled || true,
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
    
    // 动画状态管理
    this.animationState = {
      isAnimating: false,
      startTime: 0,
      fromPoint: null,
      toPoint: null,
      currentProgress: 0,
      pendingAnimations: [] // 待执行的动画队列
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
    
    // 创建图形对象 - 简化为单一线段对象
    this.gridGraphics = new PIXI.Graphics();
    this.lineGraphics = new PIXI.Graphics(); // 统一的线段绘制对象
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
    
    // 同步脉冲容器的变换，使其跟随图表容器
    this.pulseContainer.position.set(this.viewState.offsetX, this.viewState.offsetY);
    this.pulseContainer.scale.set(this.viewState.scaleX, this.viewState.scaleY);
    
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
    if (this.data.length === 0) return;
    
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
      return timeDiff <= this.timeRange && timeDiff >= 0;
    });
    
    console.log('总数据:', this.data.length, '可见数据:', visibleData.length, '价格范围:', this.priceRange);
    
    if (visibleData.length === 0) return;
    
    // 如果只有一个数据点，绘制一个点
    if (visibleData.length === 1) {
      const point = visibleData[0];
      const x = this.timeToX(point.timestamp, currentTime, chartWidth);
      const y = this.priceToY(point.price);
      
      this.lineGraphics.beginFill(this.options.lineColor, 1);
      this.lineGraphics.drawCircle(x, y, 3);
      this.lineGraphics.endFill();
      
      this.lastEndPoint = { x, y };
      this.drawPulseEffect();
      return;
    }
    
    // 统一绘制所有线段
    this.drawUnifiedLine(visibleData, currentTime, chartWidth);
    
    // 绘制端点脉冲效果
    this.drawPulseEffect();
  }
  
  drawUnifiedLine(visibleData, currentTime, chartWidth) {
    this.lineGraphics.lineStyle(2, this.options.lineColor, 1);
    
    let isFirstPoint = true;
    let lastDrawnPoint = null;
    
    // 如果有动画在进行，只绘制到倒数第二个点
    let drawToIndex = visibleData.length - 1;
    if (this.options.animationEnabled && this.animationState.isAnimating && visibleData.length > 1) {
      drawToIndex = visibleData.length - 2;
    }
    
    // 绘制所有静态线段
    for (let i = 0; i <= drawToIndex; i++) {
      const point = visibleData[i];
      const x = this.timeToX(point.timestamp, currentTime, chartWidth);
      const y = this.priceToY(point.price);
      
      if (x >= -200 && x <= chartWidth + 200) {
        if (isFirstPoint) {
          this.lineGraphics.moveTo(x, y);
          isFirstPoint = false;
        } else {
          this.lineGraphics.lineTo(x, y);
        }
        lastDrawnPoint = { x, y };
      }
    }
    
    // 如果有动画在进行，绘制动画线段
    if (this.options.animationEnabled && this.animationState.isAnimating && visibleData.length > 1) {
      // 使用当前时间重新计算动画起点和终点，确保与静态线段一致
      const fromDataPoint = visibleData[visibleData.length - 2];
      const toDataPoint = visibleData[visibleData.length - 1];
      
      const fromX = this.timeToX(fromDataPoint.timestamp, currentTime, chartWidth);
      const fromY = this.priceToY(fromDataPoint.price);
      const toX = this.timeToX(toDataPoint.timestamp, currentTime, chartWidth);
      const toY = this.priceToY(toDataPoint.price);
      
      // 计算当前动画位置
      const progress = this.animationState.currentProgress;
      const easedProgress = this.easeOutCubic(progress);
      const currentX = fromX + (toX - fromX) * easedProgress;
      const currentY = fromY + (toY - fromY) * easedProgress;
      
      // 确保从正确的起点开始绘制
      if (lastDrawnPoint) {
        // 验证起点是否匹配
        const startMatches = Math.abs(lastDrawnPoint.x - fromX) < 1 && Math.abs(lastDrawnPoint.y - fromY) < 1;
        
        if (startMatches) {
          // 从静态终点直接绘制到当前动画位置
          this.lineGraphics.lineTo(currentX, currentY);
        } else {
          // 如果不匹配，移动到正确的起点再绘制
          this.lineGraphics.moveTo(fromX, fromY);
          this.lineGraphics.lineTo(currentX, currentY);
        }
      } else {
        // 没有静态点，直接从动画起点开始
        this.lineGraphics.moveTo(fromX, fromY);
        this.lineGraphics.lineTo(currentX, currentY);
      }
      
      // 绘制笔尖效果
      this.lineGraphics.beginFill(this.options.lineColor, 0.8);
      this.lineGraphics.drawCircle(currentX, currentY, 2);
      this.lineGraphics.endFill();
      
      // 更新端点位置
      this.lastEndPoint = { x: currentX, y: currentY };
      
      console.log('重新计算动画坐标:', {
        fromData: { timestamp: fromDataPoint.timestamp, price: fromDataPoint.price },
        toData: { timestamp: toDataPoint.timestamp, price: toDataPoint.price },
        fromCoord: { x: fromX, y: fromY },
        toCoord: { x: toX, y: toY },
        currentCoord: { x: currentX, y: currentY },
        lastDrawnPoint,
        progress,
        currentTime
      });
    } else {
      // 没有动画时，更新端点到最后一个绘制的点
      this.lastEndPoint = lastDrawnPoint;
    }
  }
  
  // 新增：统一的时间到X坐标转换方法
  timeToX(timestamp, currentTime, chartWidth) {
    const latestX = chartWidth * 0.75;
    const timeDiff = currentTime - timestamp;
    return latestX - (timeDiff / this.timeRange) * chartWidth;
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
    const previousDataLength = this.data.length;
    this.data.push(newData);
    
    // 先更新价格范围，确保后续的坐标计算正确
    this.updatePriceRange();
    
    // 如果这不是第一个数据点且动画开启，启动绘制动画
    if (previousDataLength > 0 && this.options.animationEnabled) {
      const currentTime = Date.now();
      const chartWidth = this.options.width;
      
      // 计算前一个点和新点的屏幕坐标 - 使用统一的坐标计算方法
      const prevData = this.data[previousDataLength - 1];
      const prevX = this.timeToX(prevData.timestamp, currentTime, chartWidth);
      const prevY = this.priceToY(prevData.price);
      
      const newX = this.timeToX(newData.timestamp, currentTime, chartWidth);
      const newY = this.priceToY(newData.price);
      
      console.log('动画坐标计算:', {
        prevData: prevData.price,
        newData: newData.price,
        prevCoord: { x: prevX, y: prevY },
        newCoord: { x: newX, y: newY },
        priceRange: this.priceRange,
        timestamps: {
          prev: prevData.timestamp,
          new: newData.timestamp,
          current: currentTime
        }
      });
      
      // 检查坐标是否有效
      if (!isNaN(prevX) && !isNaN(prevY) && !isNaN(newX) && !isNaN(newY)) {
        // 只有当两个点都在合理范围内时才启动动画
        if (prevX >= -100 && prevX <= chartWidth + 100 && newX >= -100 && newX <= chartWidth + 100) {
          this.startLineAnimation(
            { x: prevX, y: prevY },
            { x: newX, y: newY }
          );
        }
      }
    }
    
    // 保持数据在合理范围内
    const cutoffTime = Date.now() - this.timeRange * 2;
    this.data = this.data.filter(d => d.timestamp > cutoffTime);
  }
  
  update() {
    // 更新动画状态
    this.updateAnimation();
    
    // 持续更新网格和图表以实现流动效果
    this.drawGrid();
    this.drawChart();
  }
  
  resetView() {
    this.viewState.offsetX = 0;
    this.viewState.offsetY = 0;
    this.viewState.scaleX = 1;
    this.viewState.scaleY = 1;
    
    // 重置动画状态
    this.animationState.isAnimating = false;
    this.animationState.pendingAnimations = [];
    
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
  
  // 动态控制方法
  setAnimationEnabled(enabled) {
    this.options.animationEnabled = enabled;
    
    // 如果关闭动画，清除当前动画状态并重绘
    if (!enabled) {
      this.animationState.isAnimating = false;
      this.animationState.pendingAnimations = [];
      this.lineGraphics.clear();
      
      // 强制重绘图表以显示完整的线段
      this.drawChart();
    }
  }
  
  setAnimationDuration(duration) {
    this.options.animationDuration = duration;
  }
  
  // 获取动画状态信息
  getAnimationInfo() {
    return {
      isAnimating: this.animationState.isAnimating,
      pendingCount: this.animationState.pendingAnimations.length,
      currentProgress: this.animationState.currentProgress,
      animationEnabled: this.options.animationEnabled,
      animationDuration: this.options.animationDuration
    };
  }
  
  // 缓动函数
  easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }
  
  easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  
  // 启动新线段的绘制动画
  startLineAnimation(fromPoint, toPoint) {
    // 验证坐标有效性
    if (!fromPoint || !toPoint || 
        isNaN(fromPoint.x) || isNaN(fromPoint.y) || 
        isNaN(toPoint.x) || isNaN(toPoint.y)) {
      return;
    }
    
    // 如果已有动画在进行，将新动画加入队列
    if (this.animationState.isAnimating) {
      // 限制队列长度，避免积压过多动画
      if (this.animationState.pendingAnimations.length < 5) {
        this.animationState.pendingAnimations.push({ fromPoint, toPoint });
      }
      return;
    }
    
    this.animationState.isAnimating = true;
    this.animationState.startTime = Date.now();
    this.animationState.fromPoint = fromPoint;
    this.animationState.toPoint = toPoint;
    this.animationState.currentProgress = 0;
  }
  
  // 更新动画状态
  updateAnimation() {
    if (!this.animationState.isAnimating) return;
    
    const elapsed = Date.now() - this.animationState.startTime;
    this.animationState.currentProgress = Math.min(elapsed / this.options.animationDuration, 1);
    
    // 动画完成
    if (this.animationState.currentProgress >= 1) {
      this.animationState.isAnimating = false;
      this.animationState.currentProgress = 0;
      
      // 检查是否有待执行的动画
      if (this.animationState.pendingAnimations.length > 0) {
        const nextAnimation = this.animationState.pendingAnimations.shift();
        this.startLineAnimation(nextAnimation.fromPoint, nextAnimation.toPoint);
      }
    }
  }
} 