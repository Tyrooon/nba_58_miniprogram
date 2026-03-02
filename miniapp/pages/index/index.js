const { request } = require('../../utils/request');
const dayjs = require('../../utils/dayjs.js');

const app = getApp();

const MODE_MAP = {
  regular: 1,
  plus58: 2,
  minus58: 3
};

const MODE_NAMES = {
  1: '常规模式',
  2: '正58',
  3: '负58'
};

const MODE_KEYS = {
  1: 'regular',
  2: 'plus58',
  3: 'minus58'
};

const formatSeasonAvg = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(1) : '--';
};

const sortPlayersByPoints = (players = []) => {
  return (players || []).slice().sort((a, b) => {
    const pointsA = (a && a.stats_points) || 0;
    const pointsB = (b && b.stats_points) || 0;
    return pointsB - pointsA;
  });
};

const decoratePlayers = (players = []) =>
  sortPlayersByPoints(players).map((player) => ({
    ...player,
    seasonAvgDisplay: formatSeasonAvg(player.season_avg)
  }));

const formatGame = (game) => {
  const visitorPlayersSorted = decoratePlayers(game.visitor_players);
  const homePlayersSorted = decoratePlayers(game.home_players);
  return {
    ...game,
    tipoff_time_short: dayjs(game.tipoff).format('HH:mm'),
    visitorPlayersSorted,
    homePlayersSorted,
    hasPlayers: visitorPlayersSorted.length > 0 || homePlayersSorted.length > 0,
  };
};

Page({
  data: {
    gameList: [],
    loading: true,
    loadingMorePast: false,
    loadingMoreFuture: false,
    noMorePast: false,
    noMoreFuture: false,
    activeGameId: null,
    gameLoading: null,
    currentSeason: '2025-2026',
    seasonType: '常规赛',
    seasons: ['2023-2024', '2024-2025', '2025-2026'],
    toView: '',
    currentModeName: '常规模式',
    frozenPlayerIds: [],
    selectedMode: 1,
    selectionInfo: null,
    currentModeSelectionName: '',
    selectionLockTime: '',
    selectionLockDateText: '',
    canModifySelection: true,
    selectedSelectionDate: dayjs().format('YYYY-MM-DD'),
    selectedSelectionDateText: '',
    modeCardCollapsed: false,
  },

  onLoad() {
    const today = dayjs().format('YYYY-MM-DD');
    this.initTimeline(today);
  },

  async initTimeline(focusDate) {
    wx.showLoading({ title: '加载中...' });
    try {
      // 默认加载5天：前1天 + 当天 + 后3天（与「我的」页中间选择栏保持一致）
      const start = dayjs(focusDate).subtract(1, 'day').format('YYYY-MM-DD');
      const end = dayjs(focusDate).add(3, 'day').format('YYYY-MM-DD');

      await this.fetchGameRange(start, end, 'initial');

      // Scroll to "today" after rendering
      setTimeout(() => {
        this.setData({ toView: `date-${focusDate}` });
      }, 500);

    } catch (error) {
      console.error(error);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ loading: false });
    }
  },

  async fetchGameRange(start, end, type = 'initial') {
    // type: 'initial' | 'prepend' | 'append'
    const res = await request({
      url: '/games/range',
      data: { start, end }
    });

    if (!res) return;

    // Format dates
    const newGroups = res.map(g => {
      const d = dayjs(g.date);
      return {
        ...g,
        dateStr: d.format('MM月DD日'),
        weekStr: ['周日','周一','周二','周三','周四','周五','周六'][d.day()],
        isToday: g.date === dayjs().format('YYYY-MM-DD'),
        games: g.games.map(formatGame)
      };
    });

    if (type === 'initial') {
      this.setData({ gameList: newGroups });
      // 更新全局数据中的已加载日期列表
      this.updateGlobalLoadedDates(newGroups);
    } else if (type === 'prepend') {
      // 检查是否有新数据
      if (newGroups.length === 0) {
        this.setData({
          loadingMorePast: false,
          noMorePast: true
        });
        return;
      }
      this.setData({
        gameList: [...newGroups, ...this.data.gameList],
        loadingMorePast: false
      });
      this.updateGlobalLoadedDates([...newGroups, ...this.data.gameList]);
    } else if (type === 'append') {
      // 检查是否有新数据
      if (newGroups.length === 0) {
        this.setData({
          loadingMoreFuture: false,
          noMoreFuture: true
        });
        return;
      }
      this.setData({
        gameList: [...this.data.gameList, ...newGroups],
        loadingMoreFuture: false
      });
      this.updateGlobalLoadedDates([...this.data.gameList, ...newGroups]);
    }
  },

  // 更新全局数据中的已加载日期列表
  updateGlobalLoadedDates(gameList) {
    const dates = (gameList || []).map(g => g.date).filter(Boolean);
    const app = getApp();
    if (app && app.globalData) {
      app.globalData.loadedGameDates = dates;
    }
  },

  async fetchCurrentSelections(targetDate) {
    if (!app.globalData.user) return;
    const date = targetDate || this.data.selectedSelectionDate || dayjs().format('YYYY-MM-DD');
    try {
      const res = await request({
        url: '/selections/current',
        data: {
          userId: app.globalData.user.id,
          date
        }
      });
      const modeId = this.data.selectedMode || MODE_MAP[app.globalData.currentMode] || app.globalData.currentModeId || 1;
      const currentSelection = res && res.modes ? res.modes[String(modeId)] : null;
      const lockDateText = res && res.lockDate ? dayjs(res.lockDate).format('MM-DD') : '';

      // 格式化日期显示
      const today = dayjs().format('YYYY-MM-DD');
      const weekdayLabels = ['周日','周一','周二','周三','周四','周五','周六'];
      const dateLabel = date === today ? `今日` : `${dayjs(date).format('MM-DD')} ${weekdayLabels[dayjs(date).day()]}`;

      this.setData({
        selectionInfo: res,
        currentModeSelectionName: currentSelection ? currentSelection.player_name : '',
        selectionLockTime: res && res.deadline ? dayjs(res.deadline).format('HH:mm') : '',
        selectionLockDateText: lockDateText,
        canModifySelection: res && res.canModify !== false,
        selectedSelectionDate: date,
        selectedSelectionDateText: dateLabel
      });
      this.updateTabBarSelectionState(res, modeId, date);
    } catch (error) {
      console.error('获取当前选择失败', error);
    }
  },

  async fetchFrozenList(modeId) {
    if (!app.globalData.user) return;
    try {
      const list = await request({
        url: `/users/${app.globalData.user.id}/frozen`,
        data: { playMode: modeId }
      });
      this.setData({
        frozenPlayerIds: (list || []).map((item) => item.player_id)
      });
    } catch (error) {
      console.error('获取冷冻列表失败', error);
    }
  },

  updateTabBarSelectionState(summary, activeModeId, date) {
    if (typeof this.getTabBar !== 'function') return;
    const tabBar = this.getTabBar();
    if (!tabBar) return;
    const modes = summary && summary.modes ? summary.modes : {};
    const currentSelection = modes[String(activeModeId)] || modes[activeModeId];
    const selectionRegular = modes['1'] || modes[1] || null;
    const selectionPlus58 = modes['2'] || modes[2] || null;
    const selectionMinus58 = modes['3'] || modes[3] || null;
    const today = dayjs().format('YYYY-MM-DD');
    const weekdayLabels = ['周日','周一','周二','周三','周四','周五','周六'];
    const dateLabel = date === today ? `今日 ${dayjs(date).format('MM-DD')}` : `${dayjs(date).format('MM-DD')} ${weekdayLabels[dayjs(date).day()]}`;
    tabBar.setData({
      activeModeId,
      currentSelectionRegular: selectionRegular,
      currentSelectionPlus58: selectionPlus58,
      currentSelectionMinus58: selectionMinus58,
      currentSelectionText: currentSelection ? `已选：${currentSelection.player_name}` : '未选择',
      canModifySelection: summary && summary.canModify !== false,
      selectionDeadline: summary && summary.deadline || null,
      selectedDate: date,
      selectedDateLabel: dateLabel
    });
  },

  handleScrollToUpper() {
    if (this.data.loadingMorePast) return;
    this.setData({ loadingMorePast: true });

    const firstDate = this.data.gameList[0]?.date;
    if (!firstDate) {
      this.setData({ loadingMorePast: false });
      return;
    }

    // 向前加载2天
    const end = dayjs(firstDate).subtract(1, 'day').format('YYYY-MM-DD');
    const start = dayjs(firstDate).subtract(2, 'day').format('YYYY-MM-DD');

    this.fetchGameRange(start, end, 'prepend');
  },

  handleScrollToLower() {
    if (this.data.loadingMoreFuture) return;
    this.setData({ loadingMoreFuture: true });

    const lastDate = this.data.gameList[this.data.gameList.length - 1]?.date;
    if (!lastDate) {
      this.setData({ loadingMoreFuture: false });
      return;
    }

    // 向后加载2天
    const start = dayjs(lastDate).add(1, 'day').format('YYYY-MM-DD');
    const end = dayjs(lastDate).add(2, 'day').format('YYYY-MM-DD');

    this.fetchGameRange(start, end, 'append');
  },

  toggleGame(e) {
    const { id, date, hasData } = e.currentTarget.dataset;
    const hasDataRaw = e.currentTarget.dataset.hasData;
    const hasDataBool = hasDataRaw === true || hasDataRaw === 'true';

    if (this.data.activeGameId === id) {
      this.setData({ activeGameId: null });
    } else {
      this.setData({ activeGameId: id });
      if (!hasDataBool) {
        this.syncGameData(date, id);
      }
    }
  },

  async syncGameData(date, gameId) {
    this.setData({ gameLoading: gameId });
    try {
      await request({
        url: '/games/sync',
        method: 'POST',
        data: { date }
      });

      const res = await request({
        url: '/games/range',
        data: { start: date, end: date }
      });

      if (res && res.length > 0) {
        const updatedDay = res[0];
        const newList = this.data.gameList.map(g => {
          if (g.date === date) {
            const d = dayjs(updatedDay.date);
            return {
              ...updatedDay,
              dateStr: d.format('MM月DD日'),
              weekStr: ['周日','周一','周二','周三','周四','周五','周六'][d.day()],
              isToday: updatedDay.date === dayjs().format('YYYY-MM-DD'),
              games: updatedDay.games.map(formatGame)
            };
          }
          return g;
        });
        this.setData({ gameList: newList });
      }
    } catch (e) {
      wx.showToast({ title: '同步失败', icon: 'none' });
    } finally {
      this.setData({ gameLoading: null });
    }
  },

  handleSyncDay(e) {
    const { date } = e.currentTarget.dataset;
    this.syncGameData(date, this.data.activeGameId);
  },

  // 刷新当前显示的所有比赛的得分
  async handleRefreshVisible() {
    wx.showLoading({ title: '刷新比分...' });

    try {
      // 获取当前显示的所有日期
      const dates = this.data.gameList.map(g => g.date);

      // 批量刷新所有日期的比分
      let updatedCount = 0;
      for (const date of dates) {
        try {
          const res = await request({
            url: '/games/refresh-scores',
            method: 'POST',
            data: { date }
          });
          if (res && res.updated > 0) {
            updatedCount += res.updated;

            // 更新本地数据
            const refreshRes = await request({
              url: '/games/range',
              data: { start: date, end: date, includePlayers: false }
            });

            if (refreshRes && refreshRes.length > 0) {
              const updatedDay = refreshRes[0];
              const newList = this.data.gameList.map(g => {
                if (g.date === date) {
                  const existingGames = g.games || [];
                  const refreshedGames = updatedDay.games || [];
                  const mergedGames = existingGames.map(existing => {
                    const refreshed = refreshedGames.find(u => u.external_id === existing.external_id);
                    if (refreshed) {
                      return {
                        ...existing,
                        home_score: refreshed.home_score,
                        visitor_score: refreshed.visitor_score,
                        status: refreshed.status,
                      };
                    }
                    return existing;
                  });
                  return { ...g, games: mergedGames };
                }
                return g;
              });
              this.setData({ gameList: newList });
            }
          }
        } catch (err) {
          console.error(`刷新 ${date} 失败:`, err);
        }
      }

      wx.hideLoading();

      if (updatedCount > 0) {
        wx.showToast({
          title: `已更新${updatedCount}场比赛`,
          icon: 'success',
          duration: 2000
        });
      } else {
        wx.showToast({
          title: '暂无更新',
          icon: 'none',
          duration: 2000
        });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('Refresh error:', error);
      wx.showToast({
        title: '刷新失败',
        icon: 'none',
        duration: 2000
      });
    }
  },

  handleSeasonChange(e) {
    // 预留赛季切换逻辑
  },

  toggleModeCard() {
    this.setData({ modeCardCollapsed: !this.data.modeCardCollapsed });
  },

  handleSelectPlayer(e) {
    const player = e.currentTarget.dataset.player;
    const date = e.currentTarget.dataset.date;

    if (!player) return;

    if (!app.globalData.user) {
      return wx.showToast({ title: '请先登录', icon: 'none' });
    }

    if (this.data.selectionInfo && this.data.selectionInfo.date === date && this.data.selectionInfo.canModify === false) {
      return wx.showToast({ title: '已超过锁定时间，无法修改', icon: 'none' });
    }

    if (this.data.frozenPlayerIds.includes(player.player_id)) {
      return wx.showToast({ title: '该球员在冷冻期', icon: 'none' });
    }

    const playMode = this.data.selectedMode || MODE_MAP[app.globalData.currentMode] || app.globalData.currentModeId || 1;

    wx.showModal({
      title: `选择 ${player.player_name}`,
      content: `确认以「${this.data.currentModeName}」玩法锁定该球员？`,
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await request({
            url: '/selections',
            method: 'POST',
            data: {
              userId: app.globalData.user.id,
              playerId: player.player_id,
              playMode,
              gameDate: date,
            },
          });
          wx.showToast({ title: '锁定成功', icon: 'success' });
          app.globalData.selectedGameDate = date;
          await this.fetchFrozenList(playMode);
          this.fetchCurrentSelections(date);
        } catch (error) {
          wx.showToast({ title: error.message || '提交失败', icon: 'none' });
        }
      },
    });
  },

  async onShow() {
    const tabBar = typeof this.getTabBar === 'function' ? this.getTabBar() : null;
    if (tabBar) {
      tabBar.setData({ selected: 0 });
    }

    let modeId = 1;
    if (app && app.globalData) {
      if (app.globalData.currentModeId) {
        modeId = app.globalData.currentModeId;
      } else if (app.globalData.currentMode) {
        modeId = MODE_MAP[app.globalData.currentMode] || 1;
      }
    }
    const modeName = MODE_NAMES[modeId] || MODE_NAMES[1];
    const selectedDate = app.globalData.selectedGameDate || this.data.selectedSelectionDate || dayjs().format('YYYY-MM-DD');

    if (this.data.selectedMode !== modeId || this.data.currentModeName !== modeName) {
      this.setData({
        selectedMode: modeId,
        currentModeName: modeName
      });
    }
    if (this.data.selectedSelectionDate !== selectedDate) {
      this.setData({ selectedSelectionDate: selectedDate });
    }

    if (app.globalData.user) {
      await this.fetchCurrentSelections(selectedDate);
      await this.fetchFrozenList(modeId);
      this.setData({ user: app.globalData.user });
    }
  },

  handleSelectionDateChange(date) {
    if (!date) return;
    if (app && app.globalData) {
      app.globalData.selectedGameDate = date;
    }
    this.setData({ selectedSelectionDate: date });
    if (app.globalData.user) {
      this.fetchCurrentSelections(date);
      this.fetchFrozenList(this.data.selectedMode || 1);
    }
  },

  handleModeChange(modeId) {
    if (!MODE_NAMES[modeId]) return;
    if (app && app.globalData) {
      app.globalData.currentModeId = modeId;
      app.globalData.currentMode = MODE_KEYS[modeId] || 'regular';
    }
    if (this.data.selectedMode !== modeId || this.data.currentModeName !== MODE_NAMES[modeId]) {
      this.setData({
        selectedMode: modeId,
        currentModeName: MODE_NAMES[modeId]
      });
    }
    if (app.globalData.user) {
      this.fetchCurrentSelections(this.data.selectedSelectionDate);
      this.fetchFrozenList(modeId);
    }
  }
});
