// components/floating-refresh.js
// 可拖拽的浮动刷新按钮组件

Component({
  properties: {
    pagePath: {  // 组件所在页面路径，用于判断显示位置
      type: String,
      value: ''
    }
  },

  data: {
    // 按钮位置
    buttonX: 280,  // 默认显示在右侧
    buttonY: 150,
    savedX: 0,
    savedY: 0,

    // 拖拽状态
    dragging: false,
    startX: 0,
    startY: 0,
    rotating: false,

    // 页面状态
    pageIndex: 0,  // 0: index(赛程), 1: profile, 2: history, 3: leaderboard, 4: manager
  },

  lifetimes: {
    attached() {
      this.loadSavedPosition();
      this.setupDragListeners();
    },

    detached() {
      this.removeDragListeners();
    }
  },

  methods: {
    // 加载保存的位置
    loadSavedPosition() {
      const savedPosition = wx.getStorageSync(`floating_refresh_position_${this.data.pageIndex}`);
      if (savedPosition) {
        this.setData({
          buttonX: parseFloat(savedPosition.x) || 0,
          buttonY: parseFloat(savedPosition.y) || 0,
          savedX: parseFloat(savedPosition.x) || 0,
          savedY: parseFloat(savedPosition.y) || 0
        });
      }
    },

    // 保存当前位置
    savePosition() {
      wx.setStorageSync(`floating_refresh_position_${this.data.pageIndex}`, {
        x: this.data.buttonX,
        y: this.data.buttonY
      });
    },

    // 设置拖拽监听
    setupDragListeners() {
      const systemInfo = wx.getSystemInfoSync();
      const { windowWidth, windowHeight, statusBarHeight } = systemInfo;

      this.setData({
        windowWidth,
        windowHeight,
        statusBarHeight
      });
    },

    // 移除拖拽监听
    removeDragListeners() {
      // 微信小程序组件不支持直接移除监听器
      // 清理逻辑在 detached 中处理
    },

    // 触摸开始 - 处理组件内的拖拽
    handleTouchStart(e) {
      const touch = e.touches[0];
      if (!touch) return;

      this.setData({
        dragging: true,
        startX: touch.clientX,
        startY: touch.clientY,
        buttonX: this.data.buttonX,
        buttonY: this.data.buttonY
      });

      wx.vibrateShort({
        type: 'light'
      });
    },

    // 触摸移动
    handleTouchMove(e) {
      if (!this.data.dragging) return;

      const touch = e.touches[0];
      if (!touch) return;

      const deltaX = touch.clientX - this.data.startX;
      const deltaY = touch.clientY - this.data.startY;

      let newX = this.data.buttonX + deltaX;
      let newY = this.data.buttonY + deltaY;

      // 限制拖拽范围
      const { windowWidth, windowHeight, statusBarHeight } = this.data;
      const safeAreaWidth = windowWidth - 60; // 预留左右各30px边距
      const safeAreaHeight = windowHeight - statusBarHeight - 120; // 预留底部120px

      // 限制在安全区域内
      newX = Math.max(20, Math.min(newX, safeAreaWidth - 56)); // 最小20px，最大为屏幕宽度-按钮宽度-边距
      newY = Math.max(20, Math.min(newY, safeAreaHeight - 76)); // 最小20px，最大为安全区域高度-按钮高度-边距

      this.setData({
        buttonX: newX,
        buttonY: newY
      });
    },

    // 触摸结束
    handleTouchEnd() {
      if (!this.data.dragging) return;

      // 震动反馈
      wx.vibrateShort({
        type: 'light'
      });

      // 保存位置
      this.savePosition();

      this.setData({
        dragging: false
      });
    },

    // 触发刷新
    triggerRefresh(e) {
      // 防止触发时触发刷新
      if (this.preventTrigger(e)) {
        return;
      }

      wx.vibrateShort({
        type: 'heavy'
      });

      // 通知页面刷新
      const pages = getCurrentPages();
      const currentPage = pages[pages.length - 1];
      const refreshMethod = currentPage?.onRefresh && typeof currentPage.onRefresh === 'function';

      if (refreshMethod) {
        currentPage.onRefresh();
      } else {
        wx.showToast({
          title: '正在刷新...',
          icon: 'loading'
        });
      }

      // 旋转动画
      this.rotateButton();
    },

    // 防止事件冒泡
    preventTrigger(e) {
      if (e && e.timeStamp) {
        const now = Date.now();
        if (now - e.timeStamp < 50) { // 50ms内的重复点击
          return true;
        }
      }
      return false;
    },

    // 旋转动画
    rotateButton() {
      this.setData({
        rotating: true
      });

      setTimeout(() => {
        this.setData({
          rotating: false
        });
      }, 500);
    }
  }
});
