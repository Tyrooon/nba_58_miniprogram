const { request } = require('../../utils/request');

Page({
  data: {
    loading: true,
    activeTab: 'roster', // roster, starters, trades, draft
    roster: [],
    weeklyScores: [],
    currentWeekStart: '',
    starterIds: [],
    pendingTrades: [],
    draftOrder: [],
    showDraftModal: false,
    showReshuffleModal: false,
    retainedPlayers: []
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

      // 获取当前首发
      const starters = (rosterRes?.data || []).filter(p => p.is_starter);

      this.setData({
        roster: rosterRes?.data || [],
        weeklyScores: scoresRes?.data || [],
        currentWeekStart: weekStartStr,
        starterIds: starters.map(p => p.player_id),
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

  // 切换Tab
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });

    if (tab === 'trades') {
      this.loadTrades();
    } else if (tab === 'draft') {
      this.loadDraftOrder();
    }
  },

  // 加载交易列表
  async loadTrades() {
    wx.showLoading({ title: '加载中...' });
    try {
      const res = await request({
        url: '/manager/trades/pending'
      });
      this.setData({ pendingTrades: res?.data || [] });
    } catch (error) {
      console.error('加载交易列表失败', error);
    } finally {
      wx.hideLoading();
    }
  },

  // 加载选秀顺序
  async loadDraftOrder() {
    wx.showLoading({ title: '加载中...' });
    try {
      const res = await request({
        url: '/manager/draft/snake-order'
      });
      this.setData({ draftOrder: res?.data?.draftOrder || [] });
    } catch (error) {
      console.error('加载选秀顺序失败', error);
    } finally {
      wx.hideLoading();
    }
  },

  // 切换首发选择
  toggleStarter(e) {
    const playerId = e.currentTarget.dataset.playerId;
    const { starterIds } = this.data;

    if (starterIds.includes(playerId)) {
      // 取消选择
      this.setData({
        starterIds: starterIds.filter(id => id !== playerId)
      });
    } else if (starterIds.length < 5) {
      // 添加选择（最多5个）
      this.setData({
        starterIds: [...starterIds, playerId]
      });
    } else {
      wx.showToast({ title: '最多选择5名首发', icon: 'none' });
    }
  },

  // 设置首发
  async setStarters() {
    const { starterIds } = this.data;

    if (starterIds.length !== 5) {
      wx.showToast({ title: '请选择5名首发球员', icon: 'none' });
      return;
    }

    const app = getApp();
    wx.showLoading({ title: '设置中...' });
    try {
      await request({
        url: '/manager/starters/set',
        method: 'POST',
        data: {
          userId: app.globalData.user.id,
          starterIds
        }
      });
      wx.showToast({ title: '设置成功', icon: 'success' });
      this.loadData();
    } catch (error) {
      console.error('设置首发失败', error);
      wx.showToast({ title: '设置失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  // 伤病操作
  async handleInjuryAction(e) {
    const { player, action } = e.currentTarget.dataset;
    const app = getApp();

    wx.showLoading({ title: '处理中...' });
    try {
      if (action === 'move') {
        await request({
          url: '/manager/injured/move',
          method: 'POST',
          data: {
            userId: app.globalData.user.id,
            playerId: player.player_id
          }
        });
        wx.showToast({ title: '已移至伤病名单', icon: 'success' });
      } else if (action === 'release') {
        await request({
          url: '/manager/injured/release',
          method: 'POST',
          data: {
            userId: app.globalData.user.id,
            playerId: player.player_id
          }
        });
        wx.showToast({ title: '已从伤病名单移除', icon: 'success' });
      }
      this.loadData();
    } catch (error) {
      console.error('伤病操作失败', error);
      wx.showToast({ title: error?.error || '操作失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  // 移除球员
  async removePlayer(e) {
    const player = e.currentTarget.dataset.player;

    wx.showModal({
      title: '确认移除',
      content: `确定要移除 ${player.player_name} 吗？`,
      success: async (res) => {
        if (res.confirm) {
          const app = getApp();
          wx.showLoading({ title: '处理中...' });
          try {
            await request({
              url: '/manager/roster/remove',
              method: 'POST',
              data: {
                userId: app.globalData.user.id,
                playerId: player.player_id
              }
            });
            wx.showToast({ title: '移除成功', icon: 'success' });
            this.loadData();
          } catch (error) {
            console.error('移除球员失败', error);
            wx.showToast({ title: '移除失败', icon: 'none' });
          } finally {
            wx.hideLoading();
          }
        }
      }
    });
  },

  // 创建交易
  showCreateTrade() {
    wx.showToast({ title: '交易功能开发中', icon: 'none' });
  },

  // 对交易投票
  async voteOnTrade(e) {
    const { tradeId, vote } = e.currentTarget.dataset;
    const app = getApp();

    wx.showLoading({ title: '投票中...' });
    try {
      await request({
        url: '/manager/trade/vote',
        method: 'POST',
        data: {
          tradeId,
          userId: app.globalData.user.id,
          vote
        }
      });
      wx.showToast({ title: '投票成功', icon: 'success' });
      this.loadTrades();
    } catch (error) {
      console.error('投票失败', error);
      wx.showToast({ title: '投票失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  // 打开重选秀弹窗
  showReshuffleModal() {
    const activePlayers = this.data.roster.filter(p => !p.is_injured);
    this.setData({
      showReshuffleModal: true,
      retainedPlayers: []
    });
  },

  // 切换保留球员选择
  toggleRetainPlayer(e) {
    const playerId = e.currentTarget.dataset.playerId;
    let { retainedPlayers } = this.data;

    if (retainedPlayers.includes(playerId)) {
      retainedPlayers = retainedPlayers.filter(id => id !== playerId);
    } else if (retainedPlayers.length < 2) {
      retainedPlayers.push(playerId);
    } else {
      wx.showToast({ title: '最多保留2名球员', icon: 'none' });
      return;
    }

    this.setData({ retainedPlayers });
  },

  // 执行重选秀
  async executeReshuffle() {
    const { retainedPlayers } = this.data;

    if (retainedPlayers.length !== 2) {
      wx.showToast({ title: '请选择2名球员保留', icon: 'none' });
      return;
    }

    const app = getApp();
    wx.showModal({
      title: '确认重选秀',
      content: '重选秀将移除除保留外的所有球员，确定继续？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' });
          try {
            await request({
              url: '/manager/reshuffle',
              method: 'POST',
              data: {
                userId: app.globalData.user.id,
                retainedPlayerIds: retainedPlayers
              }
            });
            wx.showToast({ title: '重选秀成功', icon: 'success' });
            this.setData({ showReshuffleModal: false });
            this.loadData();
          } catch (error) {
            console.error('重选秀失败', error);
            wx.showToast({ title: '重选秀失败', icon: 'none' });
          } finally {
            wx.hideLoading();
          }
        }
      }
    });
  },

  // 关闭弹窗
  closeModal() {
    this.setData({ showReshuffleModal: false });
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
