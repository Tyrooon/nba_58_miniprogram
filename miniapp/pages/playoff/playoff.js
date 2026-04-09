const { request } = require('../../utils/request');

Page({
  data: {
    loading: true,
    activeTab: 'bracket', // bracket, matchup, select, frozen
    playoffStatus: null,
    matchupList: [],
    currentMatchup: null,
    availablePlayers: [],
    frozenPlayers: [],
    selectedPlayerId: null,
    selectedGameDate: '',
    gameDates: [],
  },

  onLoad() {
    this.loadPlayoffStatus();
  },

  onShow() {
    if (this.data.playoffStatus) {
      this.loadPlayoffStatus();
    }
  },

  onShareAppMessage() {
    return {
      title: 'NBA 58 - 季后赛模式',
      path: '/pages/index/index'
    };
  },

  async loadPlayoffStatus() {
    wx.showLoading({ title: '加载中...' });
    try {
      const app = getApp();
      const userId = app.globalData.user ? app.globalData.user.id : '';
      const res = await request({
        url: '/playoff/status',
        data: { userId }
      });

      const status = res && res.data || null;
      this.setData({
        playoffStatus: status,
        matchupList: status && status.matchups || [],
        loading: false
      });
    } catch (error) {
      console.error('加载季后赛状态失败', error);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    } finally {
      wx.hideLoading();
    }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });

    if (tab === 'frozen') {
      this.loadFrozenPlayers();
    }
  },

  // View matchup detail
  async viewMatchup(e) {
    const matchupId = e.currentTarget.dataset.id;
    wx.showLoading({ title: '加载中...' });
    try {
      const app = getApp();
      const userId = app.globalData.user ? app.globalData.user.id : '';
      const res = await request({
        url: `/playoff/matchup/${matchupId}`,
        data: { userId }
      });

      const matchup = res && res.data || null;
      const gameDates = matchup && matchup.gameDates || [];
      this.setData({
        currentMatchup: matchup,
        activeTab: 'matchup',
        gameDates,
        selectedGameDate: gameDates.length > 0 ? gameDates[0] : ''
      });
    } catch (error) {
      console.error('加载对阵详情失败', error);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  // Select game date for picking
  selectGameDate(e) {
    const date = e.currentTarget.dataset.date;
    this.setData({ selectedGameDate: date, selectedPlayerId: null });
  },

  // Go to player selection for a matchup
  async goToSelect() {
    const { currentMatchup, selectedGameDate } = this.data;
    if (!currentMatchup || !selectedGameDate) {
      wx.showToast({ title: '请先选择比赛日', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '加载球员...' });
    try {
      const app = getApp();
      const userId = app.globalData.user ? app.globalData.user.id : '';
      const res = await request({
        url: '/playoff/available-players',
        data: {
          matchupId: currentMatchup.id,
          userId,
          gameDate: selectedGameDate
        }
      });

      this.setData({
        availablePlayers: res && res.data || [],
        activeTab: 'select',
        selectedPlayerId: null
      });
    } catch (error) {
      console.error('加载可选球员失败', error);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  // Select a player
  selectPlayer(e) {
    const playerId = e.currentTarget.dataset.playerId;
    this.setData({ selectedPlayerId: playerId });
  },

  // Confirm selection
  async confirmSelection() {
    const { currentMatchup, selectedPlayerId, selectedGameDate } = this.data;
    if (!selectedPlayerId) {
      wx.showToast({ title: '请选择一名球员', icon: 'none' });
      return;
    }

    const app = getApp();
    const userId = app.globalData.user ? app.globalData.user.id : '';

    wx.showLoading({ title: '提交中...' });
    try {
      await request({
        url: '/playoff/select',
        method: 'POST',
        data: {
          matchupId: currentMatchup.id,
          userId,
          playerId: selectedPlayerId,
          gameDate: selectedGameDate
        }
      });
      wx.showToast({ title: '选人成功', icon: 'success' });
      this.setData({ activeTab: 'matchup', selectedPlayerId: null });
      // Reload matchup detail
      this.viewMatchup({ currentTarget: { dataset: { id: currentMatchup.id } } });
    } catch (error) {
      console.error('选人失败', error);
      wx.showToast({ title: (error && error.message) || '选人失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  // Cancel selection
  async cancelSelection() {
    const { currentMatchup, selectedGameDate } = this.data;
    const app = getApp();
    const userId = app.globalData.user ? app.globalData.user.id : '';

    wx.showModal({
      title: '取消选人',
      content: '确定要取消今天的选人吗？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '取消中...' });
          try {
            await request({
              url: '/playoff/select',
              method: 'DELETE',
              data: {
                matchupId: currentMatchup.id,
                userId,
                gameDate: selectedGameDate
              }
            });
            wx.showToast({ title: '已取消', icon: 'success' });
            this.viewMatchup({ currentTarget: { dataset: { id: currentMatchup.id } } });
          } catch (error) {
            console.error('取消选人失败', error);
            wx.showToast({ title: '取消失败', icon: 'none' });
          } finally {
            wx.hideLoading();
          }
        }
      }
    });
  },

  // Load frozen players
  async loadFrozenPlayers() {
    const app = getApp();
    const userId = app.globalData.user ? app.globalData.user.id : '';
    if (!userId) return;

    try {
      const res = await request({
        url: '/playoff/frozen',
        data: { userId }
      });
      this.setData({ frozenPlayers: res && res.data || [] });
    } catch (error) {
      console.error('加载冷冻名单失败', error);
    }
  },

  onPullDownRefresh() {
    this.loadPlayoffStatus().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  handleBack() {
    wx.navigateBack();
  }
});
