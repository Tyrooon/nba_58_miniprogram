const { request } = require('../../utils/request');

Page({
  data: {
    leaderboard: [],
    loading: true,
    currentUserId: null,
  },
  goBack() {
    wx.navigateBack();
  },
  goHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },
  onLoad() {
    const app = getApp();
    if (app.globalData && app.globalData.user) {
      this.setData({ currentUserId: app.globalData.user.id });
    }
  },
  onShow() {
    this.loadData();
  },
  async loadData() {
    this.setData({ loading: true });
    try {
      // 获取所有用户排行榜
      const leaderboard = await request({ url: '/users/all', data: { limit: 100 } });
      this.setData({ leaderboard: leaderboard || [] });
    } catch (error) {
      console.error('加载排行榜失败:', error);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },
  async onPullDownRefresh() {
    await this.loadData();
    wx.stopPullDownRefresh();
  },
});









