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

  // 分享功能
  onShareAppMessage() {
    return {
      title: 'NBA 58 - 排行榜',
      path: '/pages/index/index'
    };
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      const list = await request({ url: '/users/all', data: { limit: 100 } });
      // Sort by bonus (descending), with totalScore as fallback
      const sorted = (list || []).sort((a, b) => {
        const aBonus = a.bonus ?? a.totalScore ?? 0;
        const bBonus = b.bonus ?? b.totalScore ?? 0;
        return bBonus - aBonus;
      });
      // Format and add display fields for sorted
      const leaderboard = sorted.map((item, index) => ({
        ...item,
        rank: index + 1,
        displayScore: this.formatScore(item.totalScore ?? 0),
        displayBonus: this.formatScore(item.bonus ?? item.totalScore ?? 0)
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
