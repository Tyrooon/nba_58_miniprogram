const { request } = require('./utils/request');

App({
  globalData: {
    user: null,
    currentMode: 'regular',
    currentModeId: 1,
    selectedGameDate: '',
    loadedGameDates: [],
  },

  async onLaunch() {
    // 初始化微信云开发，连接到云托管环境
    wx.cloud.init({
      env: 'nba-58-6g2gfl7c61fc6031',
    });

    // 全局错误监听
    this.setupErrorHandlers();
  },

  setupErrorHandlers() {
    // 监听小程序错误
    wx.onError((error) => {
      console.error('=== 全局错误 ===', error);
      // 可以上报到监控平台
    });

    // 监听 Promise 未捕获的 rejection
    wx.onUnhandledRejection((res) => {
      console.error('=== 未捕获的 Promise Rejection ===', res.reason);
    });
  },

  /**
   * 获取已关联的用户。
   * 会验证本地缓存是否仍然有效（是否已关联网页端账号）。
   * 未关联或缓存失效时返回 null。
   */
  async ensureLogin() {
    // 优先返回内存中的用户
    if (this.globalData.user) return this.globalData.user;

    // 检查本地缓存
    const cached = wx.getStorageSync('user');
    if (!cached) return null;

    // 验证缓存的用户是否仍然有效（是否有 username，即已关联网页端账号）
    // 如果没有 username，说明是旧的无效缓存，需要清除
    if (!cached.username) {
      console.log('[app] 清除无效的用户缓存（未关联账号）');
      this.clearUserCache();
      return null;
    }

    // 可选：向后端验证用户是否仍然存在
    try {
      const res = await request({ url: `/users/${cached.id}` });
      if (res && res.id) {
        // 用户有效，更新缓存
        const validUser = {
          id: res.id,
          nickname: res.nickname,
          avatarUrl: res.avatarUrl,
          username: res.username,
          totalScore: res.totalScore,
          totalBonus: res.totalBonus,
        };
        this.globalData.user = validUser;
        wx.setStorageSync('user', validUser);
        return validUser;
      }
    } catch (error) {
      console.error('[app] 验证用户失败:', error);
      // 验证失败，清除缓存
      this.clearUserCache();
      return null;
    }

    return cached;
  },

  updateUserCache(user) {
    this.globalData.user = user;
    wx.setStorageSync('user', user);
  },

  clearUserCache() {
    this.globalData.user = null;
    wx.removeStorageSync('user');
  },
});
