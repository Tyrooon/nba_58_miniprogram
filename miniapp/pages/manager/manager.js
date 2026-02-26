const { request } = require('../../utils/request');

Page({
  data: {
    loading: true,
    roster: [],
    weeklyScores: [],
    currentWeekStart: '',
  },

  onLoad() {
    this.loadData();
  },

  async loadData() {
    wx.showLoading({ title: '加载中...' });
    try {
      const app = getApp();
      if (!app.globalData.user) {
        wx.showToast({ title: '请先登录', icon: 'none' });
        return;
      }

      // 获取当前周的开始日期（周日）
      const today = new Date();
      const dayOfWeek = today.getDay();
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - dayOfWeek);
      const weekStartStr = weekStart.toISOString().split('T')[0];

      // 获取阵容
      const rosterRes = await request({
        url: '/manager/roster',
        data: { userId: app.globalData.user.id }
      });

      // 获取周得分
      const scoresRes = await request({
        url: '/manager/weekly/scores',
        data: { week_start: weekStartStr }
      });

      this.setData({
        roster: rosterRes?.data || [],
        weeklyScores: scoresRes?.data || [],
        currentWeekStart: weekStartStr,
        loading: false
      });
    } catch (error) {
      console.error('加载经理模式数据失败', error);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    } finally {
      wx.hideLoading();
    }
  },

  // 查看阵容详情
  handleRosterClick(e) {
    const player = e.currentTarget.dataset.player;
    wx.showModal({
      title: player.player_name || '球员详情',
      content: `球队: ${player.team_name || '未知'}\n位置: ${player.position || '未知'}\n类型: ${player.player_type === 'rookie' ? '新秀' : '常规球员'}`,
      showCancel: false
    });
  },

  // 查看周得分详情
  handleScoreClick(e) {
    const score = e.currentTarget.dataset.score;
    wx.showModal({
      title: `${score.nickname} 本周得分`,
      content: `周得分: ${score.total_points || 0}\n排名: ${score.rank || '-'}`,
      showCancel: false
    });
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadData().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 返回
  handleBack() {
    wx.navigateBack();
  }
});
