const { request } = require('../../utils/request');

Page({
  data: {
    records: [],
    loading: true,
    modeMap: {
      1: '每日最高分',
      2: '正58',
      3: '负58',
    },
  },
  async onShow() {
    const app = getApp();
    const user = await app.ensureLogin();
    if (!user) {
      wx.showToast({ title: '请先关联网页端账号', icon: 'none' });
      return wx.switchTab({ url: '/pages/profile/profile' });
    }
    this.setData({ user });
    this.loadHistory();
  },
  goBack() {
    wx.navigateBack();
  },
  goHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },
  async loadHistory() {
    try {
      this.setData({ loading: true });
      const data = await request({
        url: '/selections/history',
        method: 'GET',
        data: { userId: this.data.user.id, limit: 50 },
      });
      this.setData({ records: data });
    } catch (error) {
      wx.showToast({ title: error.message || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },
});

