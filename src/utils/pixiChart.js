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
      latestPriceLineColor: options.latestPriceLineColor || 0xff4444, // 最新价格线颜色
      animationDuration: options.animationDuration || 800, // 动画持续时间(ms)
      animationEasing: options.animationEasing || 'easeOutCubic', // 缓动函数
      animationEnabled: options.animationEnabled || true,
      showLatestPriceLine: options.showLatestPriceLine !== false, // 默认显示最新价格线
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
    
    // 最新价格线相关
    this.latestPrice = null;
    this.latestPriceLineGraphics = null;
    this.latestPriceLabel = null;
    
    this.timeRange = 60000; // 60秒时间范围
    this.priceRange = { min: 95, max: 105 }; // 初始价格范围
    this.startTime = Date.now();
    
    // 网格更新控制
    this.lastGridUpdate = 0;
    this.gridUpdateInterval = 100; // 网格更新间隔100ms
    
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
    this.latestPriceLineContainer = new PIXI.Container(); // 最新价格线容器
    this.textContainer = new PIXI.Container();
    this.pulseContainer = new PIXI.Container();
    
    // 添加到stage，顺序很重要
    this.app.stage.addChild(this.gridContainer);
    this.app.stage.addChild(this.chartContainer);
    this.app.stage.addChild(this.latestPriceLineContainer); // 最新价格线在图表之上
    this.app.stage.addChild(this.pulseContainer);
    this.app.stage.addChild(this.textContainer);
    
    // 创建图形对象 - 简化为单一线段对象
    this.gridGraphics = new PIXI.Graphics();
    this.lineGraphics = new PIXI.Graphics(); // 统一的线段绘制对象
    this.latestPriceLineGraphics = new PIXI.Graphics(); // 最新价格线绘制对象
    this.pulseGraphics = new PIXI.Graphics();
    
    this.gridContainer.addChild(this.gridGraphics);
    this.chartContainer.addChild(this.lineGraphics);
    this.latestPriceLineContainer.addChild(this.latestPriceLineGraphics);
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
    // 图表容器保持原始缩放，变换通过坐标转换函数处理
    this.chartContainer.position.set(0, 0);
    this.chartContainer.scale.set(1, 1);
    
    // 最新价格线容器也保持原始缩放，跟随图表数据
    this.latestPriceLineContainer.position.set(0, 0);
    this.latestPriceLineContainer.scale.set(1, 1);
    
    // 脉冲容器也保持原始缩放，跟随图表数据
    this.pulseContainer.position.set(0, 0);
    this.pulseContainer.scale.set(1, 1);
    
    // 网格和文本容器保持在屏幕坐标系中，不进行缩放变换
    // 这样网格密度可以根据缩放级别动态调整
    this.gridContainer.position.set(0, 0);
    this.gridContainer.scale.set(1, 1);
    this.textContainer.position.set(0, 0);
    this.textContainer.scale.set(1, 1);
    
    this.drawGrid();
    this.drawChart();
    this.drawLatestPriceLine(); // 绘制最新价格线
  }
  
  drawGrid() {
    this.gridGraphics.clear();
    this.textContainer.removeChildren();
    
    const width = this.options.width;
    const height = this.options.height;
    const currentTime = Date.now();
    
    // 最新时间在四分之三处
    const latestTimeX = width * 0.75;
    
    // 设置网格样式
    this.gridGraphics.lineStyle(1, this.options.gridColor, 0.3);
    
    // 根据缩放级别调整网格密度
    const baseGridSpacing = 100; // 基础网格间距
    const timeGridSpacing = Math.max(20, baseGridSpacing / this.viewState.scaleX); // 时间轴网格间距
    
    // 计算时间间隔（根据缩放调整）
    const baseTimeInterval = 5000; // 基础时间间隔5秒
    const timeInterval = Math.max(1000, baseTimeInterval / this.viewState.scaleX); // 动态时间间隔
    
    // 绘制垂直网格线（时间轴）- 使用与数据相同的坐标转换逻辑
    const numTimeLines = Math.ceil(width / timeGridSpacing) + 4; // 增加网格线数量确保覆盖
    
    // 计算当前可见的时间范围
    const visibleTimeStart = currentTime - this.timeRange / this.viewState.scaleX;
    const visibleTimeEnd = currentTime;
    
    // 根据时间间隔生成网格线
    const startGridTime = Math.floor(visibleTimeStart / timeInterval) * timeInterval;
    const endGridTime = Math.ceil(visibleTimeEnd / timeInterval) * timeInterval;
    
    for (let timestamp = startGridTime; timestamp <= endGridTime + timeInterval; timestamp += timeInterval) {
      // 使用与折线数据相同的坐标转换方法
      const x = this.timeToX(timestamp, currentTime, width);
      
      if (x >= -timeGridSpacing && x <= width + timeGridSpacing) {
        // 绘制垂直线
        this.gridGraphics.moveTo(x, 0);
        this.gridGraphics.lineTo(x, height);
        
        // 添加时间标签
        const timeText = this.formatTimeLabel(timestamp);
        
        // 根据缩放调整字体大小
        const fontSize = Math.max(8, Math.min(16, 12 / Math.sqrt(this.viewState.scaleX)));
        
        const text = new PIXI.Text(timeText, {
          fontFamily: 'Arial',
          fontSize: fontSize,
          fill: this.options.textColor,
          align: 'center'
        });
        
        text.x = x - text.width / 2;
        text.y = height - 20;
        this.textContainer.addChild(text);
      }
    }
    
    // 绘制水平网格线（价格轴）- 使用与数据相同的坐标转换逻辑
    const currentPriceRange = this.priceRange.max - this.priceRange.min;
    const basePriceStep = currentPriceRange / 8;
    const adjustedPriceStep = Math.max(0.01, basePriceStep / this.viewState.scaleY); // 根据缩放调整价格步长
    
    // 计算可见的价格范围（考虑缩放和偏移）
    const visiblePriceMin = this.priceRange.min - currentPriceRange * 0.2;
    const visiblePriceMax = this.priceRange.max + currentPriceRange * 0.2;
    
    // 根据价格步长生成网格线
    const startGridPrice = Math.floor(visiblePriceMin / adjustedPriceStep) * adjustedPriceStep;
    const endGridPrice = Math.ceil(visiblePriceMax / adjustedPriceStep) * adjustedPriceStep;
    
    for (let price = startGridPrice; price <= endGridPrice; price += adjustedPriceStep) {
      // 使用与折线数据相同的坐标转换方法
      const y = this.priceToY(price);
      
      if (y >= -50 && y <= height + 50) {
        // 绘制水平线
        this.gridGraphics.moveTo(0, y);
        this.gridGraphics.lineTo(width, y);
        
        // 添加价格标签，根据缩放调整精度和字体大小
        const precision = this.viewState.scaleY > 2 ? 3 : 2;
        const fontSize = Math.max(8, Math.min(16, 12 / Math.sqrt(this.viewState.scaleY)));
        
        const priceText = new PIXI.Text(price.toFixed(precision), {
          fontFamily: 'Arial',
          fontSize: fontSize,
          fill: this.options.textColor,
          align: 'right'
        });
        
        priceText.x = 5;
        priceText.y = y - 8;
        this.textContainer.addChild(priceText);
      }
    }
  }
  
  drawChart() {
    if (this.data.length === 0) return;
    
    // 清除之前的线条绘制（不清除脉冲效果）
    this.lineGraphics.clear();
    
    // 更新价格范围
    this.updatePriceRange();
    
    const currentTime = Date.now();
    const chartWidth = this.options.width;
    
    // 根据缩放级别调整可见时间范围
    const adjustedTimeRange = this.timeRange / this.viewState.scaleX;
    
    // 获取可见数据，考虑缩放和偏移
    const visibleData = this.data.filter(point => {
      const timeDiff = currentTime - point.timestamp;
      const timeOffset = -this.viewState.offsetX / this.viewState.scaleX / chartWidth * this.timeRange;
      return timeDiff >= timeOffset && timeDiff <= adjustedTimeRange + timeOffset;
    });
    
    if (visibleData.length === 0) return;
    
    // 单点处理
    if (visibleData.length === 1) {
      const point = visibleData[0];
      const x = this.timeToX(point.timestamp, currentTime, chartWidth);
      const y = this.priceToY(point.price);
      this.lastEndPoint = { x, y };
      return;
    }
    
    // 绘制折线
    this.drawSmoothLine(visibleData, currentTime, chartWidth);
  }
  
  drawSmoothLine(visibleData, currentTime, chartWidth) {
    // 设置线条样式 - 使用更现代的样式
    this.lineGraphics.lineStyle(3, this.options.lineColor, 1);
    
    let isFirstPoint = true;
    let lastDrawnPoint = null;
    
    // 确定绘制范围
    let drawToIndex = visibleData.length - 1;
    if (this.options.animationEnabled && this.animationState.isAnimating && visibleData.length > 1) {
      drawToIndex = visibleData.length - 2;
    }
    
    // 绘制静态线段
    for (let i = 0; i <= drawToIndex; i++) {
      const point = visibleData[i];
      const x = this.timeToX(point.timestamp, currentTime, chartWidth);
      const y = this.priceToY(point.price);
      
      // 优化可见性检查
      if (this.isPointVisible(x, y)) {
        if (isFirstPoint) {
          this.lineGraphics.moveTo(x, y);
          isFirstPoint = false;
        } else {
          this.lineGraphics.lineTo(x, y);
        }
        lastDrawnPoint = { x, y };
      }
    }
    
    // 处理动画线段
    if (this.options.animationEnabled && this.animationState.isAnimating && visibleData.length > 1) {
      const animatedPoint = this.calculateAnimatedPoint(visibleData, currentTime, chartWidth);
      if (animatedPoint && lastDrawnPoint) {
        this.lineGraphics.lineTo(animatedPoint.x, animatedPoint.y);
        this.lastEndPoint = animatedPoint;
      }
    } else {
      this.lastEndPoint = lastDrawnPoint;
    }
  }
  
  calculateAnimatedPoint(visibleData, currentTime, chartWidth) {
    const fromDataPoint = visibleData[visibleData.length - 2];
    const toDataPoint = visibleData[visibleData.length - 1];
    
    const fromX = this.timeToX(fromDataPoint.timestamp, currentTime, chartWidth);
    const fromY = this.priceToY(fromDataPoint.price);
    const toX = this.timeToX(toDataPoint.timestamp, currentTime, chartWidth);
    const toY = this.priceToY(toDataPoint.price);
    
    const progress = this.easeOutCubic(this.animationState.currentProgress);
    const currentX = fromX + (toX - fromX) * progress;
    const currentY = fromY + (toY - fromY) * progress;
    
    return { x: currentX, y: currentY };
  }
  
  isPointVisible(x, y) {
    const margin = 50;
    return x >= -margin && x <= this.options.width + margin && 
           y >= -margin && y <= this.options.height + margin;
  }
  
  drawPulseEffect() {
    if (!this.lastEndPoint) return;
    
    const { x, y } = this.lastEndPoint;
    
    // 更精细的脉冲动画
    const pulseSpeed = 0.08;
    this.pulseTime += pulseSpeed;
    
    // 单一脉冲效果，更简洁
    const pulse = (Math.sin(this.pulseTime) + 1) * 0.5;
    const radius = 4 + pulse * 8;
    const alpha = (1 - pulse) * 0.8;
    
    // 绘制脉冲圆环
    this.pulseGraphics.lineStyle(2, this.options.lineColor, alpha);
    this.pulseGraphics.drawCircle(x, y, radius);
    
    // 绘制中心点
    this.pulseGraphics.beginFill(this.options.lineColor, 1);
    this.pulseGraphics.drawCircle(x, y, 2);
    this.pulseGraphics.endFill();
  }
  
  priceToY(price) {
    const normalizedPrice = (price - this.priceRange.min) / (this.priceRange.max - this.priceRange.min);
    const chartTop = this.options.height * 0.1;
    const chartHeight = this.options.height * 0.7; // 留出底部空间给时间标签
    const baseY = chartTop + chartHeight - (normalizedPrice * chartHeight);
    
    // 应用视图变换：先缩放再偏移
    return baseY * this.viewState.scaleY + this.viewState.offsetY;
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
      
      // 计算前一个点和新点的屏幕坐标
      const prevData = this.data[previousDataLength - 1];
      const prevX = this.timeToX(prevData.timestamp, currentTime, chartWidth);
      const prevY = this.priceToY(prevData.price);
      
      const newX = this.timeToX(newData.timestamp, currentTime, chartWidth);
      const newY = this.priceToY(newData.price);
      
      // 检查坐标是否有效
      if (!isNaN(prevX) && !isNaN(prevY) && !isNaN(newX) && !isNaN(newY)) {
        // 只有当两个点都在合理范围内时才启动动画
        if (this.isPointVisible(prevX, prevY) || this.isPointVisible(newX, newY)) {
          this.startLineAnimation(
            { x: prevX, y: prevY },
            { x: newX, y: newY }
          );
        } else {
          // 点不在可见范围内，直接重绘
          this.drawChart();
        }
      }
    } else {
      // 没有动画或第一个数据点，立即重绘
      this.drawChart();
    }
    
    // 保持数据在合理范围内
    const cutoffTime = Date.now() - this.timeRange * 2;
    this.data = this.data.filter(d => d.timestamp > cutoffTime);
  }
  
  // 更新最新价格线位置
  updateLatestPriceLine(price) {
    const y = this.priceToY(price);
    this.latestPrice = { 
      price: price, 
      y: y 
    };
    
    // 创建或更新价格标签
    if (!this.latestPriceLabel) {
      this.latestPriceLabel = new PIXI.Text('', {
        fontFamily: 'Arial',
        fontSize: 12,
        fill: 0xffffff,
        fontWeight: 'bold'
      });
      this.textContainer.addChild(this.latestPriceLabel);
    }
  }
  
  update() {
    // 更新动画状态
    const wasAnimating = this.animationState.isAnimating;
    this.updateAnimation();
    
    // 网格更新控制 - 降低更新频率以提高性能
    const currentTime = Date.now();
    if (currentTime - this.lastGridUpdate > this.gridUpdateInterval) {
      this.drawGrid();
      this.lastGridUpdate = currentTime;
    }
    
    // 优化重绘策略：只在必要时重绘图表
    let needsRedraw = false;
    
    // 检查是否需要重绘图表
    if (this.animationState.isAnimating) {
      // 动画进行中，需要重绘
      needsRedraw = true;
    } else if (wasAnimating && !this.animationState.isAnimating) {
      // 动画刚结束，需要重绘最终状态
      needsRedraw = true;
    }
    
    // 只在需要时重绘图表
    if (needsRedraw) {
      this.drawChart();
    }
    
    // 脉冲效果独立更新（轻量级操作）
    if (this.lastEndPoint) {
      this.pulseGraphics.clear();
      this.drawPulseEffect();
    }
    
    // 最新价格线独立更新
    if (this.data.length > 0) {
      this.drawLatestPriceLine();
    }
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
  
  drawLatestPriceLine() {
    if (!this.options.showLatestPriceLine || !this.data.length || !this.lastEndPoint) return;
    
    // 直接使用折线端点的Y坐标，确保完全同步
    const animatedY = this.lastEndPoint.y;
    const latestData = this.data[this.data.length - 1];
    
    // 更新最新价格信息，使用折线端点的实际位置
    this.latestPrice = { 
      price: latestData.price, 
      y: animatedY,
      x: this.lastEndPoint.x
    };
    
    const width = this.options.width;
    
    this.latestPriceLineGraphics.clear();
    
    // 使用与折线相同的颜色绘制价格线
    this.latestPriceLineGraphics.lineStyle(2, this.options.lineColor, 0.8);
    
    // 绘制虚线效果
    const dashLength = 8;
    const gapLength = 4;
    let currentX = 0;
    
    while (currentX < width) {
      const endX = Math.min(currentX + dashLength, width);
      this.latestPriceLineGraphics.moveTo(currentX, animatedY);
      this.latestPriceLineGraphics.lineTo(endX, animatedY);
      currentX = endX + gapLength;
    }
    
    // 绘制右侧价格标签背景
    if (this.latestPriceLabel) {
      // 先更新标签文本以获取正确的宽度
      this.latestPriceLabel.text = `$${latestData.price.toFixed(2)}`;
      
      const labelWidth = this.latestPriceLabel.width + 16;
      const labelHeight = 20;
      const labelX = width - labelWidth;
      
      // 使用与折线相同的颜色作为标签背景
      this.latestPriceLineGraphics.beginFill(this.options.lineColor, 0.9);
      this.latestPriceLineGraphics.drawRoundedRect(labelX, animatedY - labelHeight/2, labelWidth, labelHeight, 3);
      this.latestPriceLineGraphics.endFill();
      
      // 更新标签位置
      this.latestPriceLabel.x = labelX + 8;
      this.latestPriceLabel.y = animatedY - 8;
    }
  }
  
  // 控制最新价格线显示/隐藏
  setLatestPriceLineVisible(visible) {
    this.options.showLatestPriceLine = visible;
    
    if (!visible) {
      this.latestPriceLineGraphics.clear();
      if (this.latestPriceLabel && this.latestPriceLabel.parent) {
        this.latestPriceLabel.visible = false;
      }
    } else {
      if (this.latestPriceLabel) {
        this.latestPriceLabel.visible = true;
      }
      this.drawLatestPriceLine();
    }
  }
  
  // 获取最新价格线状态
  isLatestPriceLineVisible() {
    return this.options.showLatestPriceLine;
  }
  
  // 统一的时间到X坐标转换方法
  timeToX(timestamp, currentTime, chartWidth) {
    const latestX = chartWidth * 0.75;
    const timeDiff = currentTime - timestamp;
    const baseX = latestX - (timeDiff / this.timeRange) * chartWidth;
    
    // 应用视图变换：先缩放再偏移
    return baseX * this.viewState.scaleX + this.viewState.offsetX;
  }
} 