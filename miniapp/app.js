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
  },

  /**
   * 获取已关联的用户（仅本地缓存）。
   * 未关联时返回 null（不会请求后端，也不会写库）。
   */
  async ensureLogin() {
    if (this.globalData.user) return this.globalData.user;
    const cached = wx.getStorageSync('user');
    if (cached) {
      this.globalData.user = cached;
      return cached;
    }
    return null;
  },

  updateUserCache(user) {
    this.globalData.user = user;
    wx.setStorageSync('user', user);
  },
});
