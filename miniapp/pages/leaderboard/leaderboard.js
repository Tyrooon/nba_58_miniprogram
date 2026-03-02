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
      const list = await request({ url: '/users/all', data: { limit: 100 } });
      // 格式化分数显示
      const leaderboard = (list || []).map((item, index) => ({
        ...item,
        rank: index + 1,
        displayScore: this.formatScore(item.totalScore)
      }));
      this.setData({ leaderboard });
    } catch (error) {
      console.error('加载排行榜失败:', error);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  formatScore(score) {
    const num = Number(score);
    if (Number.isFinite(num)) {
      return num.toFixed(2);
    }
    return '0.00';
  },

  async onPullDownRefresh() {
    await this.loadData();
    wx.stopPullDownRefresh();
  },
});
