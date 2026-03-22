const { request } = require('../../utils/request');

Page({
  data: {
    records: [],
    loading: true,
    currentTab: 'entertainment', // 'entertainment' | 'manager'
    modeMap: {
      1: '每日最高分',
      2: '正58',
      3: '负58',
      'manager': '经理模式',
    },
    user: null,
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

  // 分享功能
  onShareAppMessage() {
    return {
      title: 'NBA 58 - 每日球员选择游戏',
      path: '/pages/index/index'
    };
  },

  goBack() {
    wx.navigateBack();
  },
  goHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  // 切换Tab
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ currentTab: tab });
  },

  async loadHistory() {
    try {
      this.setData({ loading: true });
      const data = await request({
        url: '/selections/history',
        method: 'GET',
        data: { userId: this.data.user.id, limit: 50 },
      });

      // 分离娱乐模式和经理模式数据
      const entertainmentRecords = (data || []).filter(r =>
        r.play_mode === 1 || r.play_mode === 2 || r.play_mode === 3
      );
      const managerRecords = (data || []).filter(r =>
        r.play_mode === 'manager' || r.play_mode === 4
      );

      this.setData({
        records: data,
        entertainmentRecords,
        managerRecords,
      });
    } catch (error) {
      wx.showToast({ title: error.message || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 获取当前显示的记录
  getCurrentRecords() {
    return this.data.currentTab === 'entertainment'
      ? this.data.entertainmentRecords
      : this.data.managerRecords;
  },
});
