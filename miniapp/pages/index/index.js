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
  try {
    const visitorPlayersSorted = decoratePlayers(game.visitor_players || []);
    const homePlayersSorted = decoratePlayers(game.home_players || []);
    return {
      ...game,
      tipoff_time_short: game.tipoff ? dayjs(game.tipoff).format('HH:mm') : '--:--',
      visitorPlayersSorted,
      homePlayersSorted,
      hasPlayers: visitorPlayersSorted.length > 0 || homePlayersSorted.length > 0,
    };
  } catch (e) {
    console.error('formatGame error:', e, game);
    return {
      ...game,
      tipoff_time_short: '--:--',
      visitorPlayersSorted: [],
      homePlayersSorted: [],
      hasPlayers: false,
    };
  }
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
    // 下拉刷新状态
    pullDownDistance: 0,
    pullDownStatus: 'idle', // idle, pulling, ready, loading
    pullDownText: '下拉加载更早比赛',
    // 上拉加载状态
    pullUpDistance: 0,
    pullUpStatus: 'idle',
    pullUpText: '上拉加载更多比赛',
  },

  onLoad() {
    const today = dayjs().format('YYYY-MM-DD');
    this.initTimeline(today);
    // 初始化触摸相关变量
    this._startY = 0;
    this._scrollTop = 0;
    this._scrollHeight = 0;
    this._clientHeight = 0;
  },

  // 分享功能
  onShareAppMessage() {
    return {
      title: 'NBA 58 - 每日球员选择游戏',
      path: '/pages/index/index'
    };
  },

  // 分享到朋友圈
  onShareTimeline() {
    return {
      title: 'NBA 58 - 每日球员选择游戏',
      query: ''
    };
  },

  async initTimeline(focusDate) {
    console.log('[index] initTimeline start, focusDate:', focusDate);
    wx.showLoading({ title: '加载中...' });
    try {
      // 默认加载5天：前1天 + 当天 + 后3天（与「我的」页中间选择栏保持一致）
      const start = dayjs(focusDate).subtract(1, 'day').format('YYYY-MM-DD');
      const end = dayjs(focusDate).add(3, 'day').format('YYYY-MM-DD');
      console.log('[index] fetchGameRange:', start, '-', end);

      await this.fetchGameRange(start, end, 'initial');

      console.log('[index] fetchGameRange done, gameList length:', this.data.gameList.length);

      // Scroll to "today" after rendering
      setTimeout(() => {
        this.setData({ toView: `date-${focusDate}` });
      }, 500);

    } catch (error) {
      console.error('[index] initTimeline error:', error);
      wx.showToast({ title: error.message || '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ loading: false });
    }
  },

  async fetchGameRange(start, end, type = 'initial') {
    // type: 'initial' | 'prepend' | 'append'
    try {
      const res = await request({
        url: '/games/range',
        data: { start, end }
      });

      if (!res || !Array.isArray(res)) {
        console.warn('fetchGameRange: invalid response', res);
        if (type === 'initial') {
          this.setData({ gameList: [] });
        }
        return;
      }

      // Format dates
      const newGroups = res.map(g => {
        try {
          const d = dayjs(g.date);
          return {
            ...g,
            dateStr: d.format('MM月DD日'),
            weekStr: ['周日','周一','周二','周三','周四','周五','周六'][d.day()],
            isToday: g.date === dayjs().format('YYYY-MM-DD'),
            games: (g.games || []).map(formatGame)
          };
        } catch (e) {
          console.error('format date group error:', e, g);
          return {
            ...g,
            dateStr: g.date || '',
            weekStr: '',
            isToday: false,
            games: []
          };
        }
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
    } catch (error) {
      console.error('fetchGameRange error:', error);
      if (type === 'initial') {
        this.setData({ gameList: [] });
      } else if (type === 'prepend') {
        this.setData({ loadingMorePast: false });
      } else if (type === 'append') {
        this.setData({ loadingMoreFuture: false });
      }
      throw error;
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
    // 使用新的下拉刷新逻辑，这里只标记到达顶部
    this._isAtTop = true;
  },

  handleScrollToLower() {
    // 使用新的上拉加载逻辑，这里只标记到达底部
    this._isAtBottom = true;
  },

  // 滚动事件
  handleScroll(e) {
    this._scrollTop = e.detail.scrollTop;
    this._scrollHeight = e.detail.scrollHeight;
    this._clientHeight = e.detail.clientHeight || this._clientHeight;

    // 检测是否到达顶部或底部
    const isAtTop = this._scrollTop <= 5;
    const isAtBottom = this._scrollTop + this._clientHeight >= this._scrollHeight - 5;

    this._isAtTop = isAtTop;
    this._isAtBottom = isAtBottom;
  },

  // 触摸开始
  handleTouchStart(e) {
    if (e.touches.length === 1) {
      this._startY = e.touches[0].clientY;
      this._isDragging = false;
    }
  },

  // 触摸移动 - 实现阻尼效果
  handleTouchMove(e) {
    if (e.touches.length !== 1) return;

    const currentY = e.touches[0].clientY;
    const deltaY = currentY - this._startY;

    // 下拉刷新（到达顶部且向下拉）
    if (this._isAtTop && deltaY > 0 && !this.data.loadingMorePast && !this.data.noMorePast) {
      this._isDragging = true;

      // 阻尼效果：距离越大，阻力越大
      const resistance = 0.4;
      const maxDistance = 150;
      let pullDistance = deltaY * resistance;
      pullDistance = Math.min(pullDistance, maxDistance);

      // 计算状态
      const threshold = 80;
      let status = 'pulling';
      let text = '下拉加载更早比赛';

      if (pullDistance >= threshold) {
        status = 'ready';
        text = '释放加载更早比赛';
      }

      this.setData({
        pullDownDistance: pullDistance,
        pullDownStatus: status,
        pullDownText: text
      });
    }

    // 上拉加载（到达底部且向上拉）
    if (this._isAtBottom && deltaY < 0 && !this.data.loadingMoreFuture && !this.data.noMoreFuture) {
      this._isDragging = true;

      // 阻尼效果
      const resistance = 0.4;
      const maxDistance = 150;
      let pullDistance = Math.abs(deltaY) * resistance;
      pullDistance = Math.min(pullDistance, maxDistance);

      // 计算状态
      const threshold = 80;
      let status = 'pulling';
      let text = '上拉加载更多比赛';

      if (pullDistance >= threshold) {
        status = 'ready';
        text = '释放加载更多比赛';
      }

      this.setData({
        pullUpDistance: pullDistance,
        pullUpStatus: status,
        pullUpText: text
      });
    }
  },

  // 触摸结束
  handleTouchEnd() {
    // 下拉刷新触发
    if (this.data.pullDownStatus === 'ready' && !this.data.loadingMorePast) {
      this.setData({
        pullDownStatus: 'loading',
        pullDownText: '加载中...',
        pullDownDistance: 60
      });

      this._loadPastData();
    } else {
      // 重置下拉状态
      this.setData({
        pullDownDistance: 0,
        pullDownStatus: 'idle',
        pullDownText: '下拉加载更早比赛'
      });
    }

    // 上拉加载触发
    if (this.data.pullUpStatus === 'ready' && !this.data.loadingMoreFuture) {
      this.setData({
        pullUpStatus: 'loading',
        pullUpText: '加载中...',
        pullUpDistance: 60
      });

      this._loadFutureData();
    } else {
      // 重置上拉状态
      this.setData({
        pullUpDistance: 0,
        pullUpStatus: 'idle',
        pullUpText: '上拉加载更多比赛'
      });
    }

    this._isDragging = false;
  },

  // 加载更早的比赛
  async _loadPastData() {
    const now = Date.now();
    if (this._loadPastCooldown && now - this._loadPastCooldown < 2000) {
      this.setData({
        pullDownDistance: 0,
        pullDownStatus: 'idle',
        pullDownText: '下拉加载更早比赛'
      });
      return;
    }

    this._loadPastCooldown = now;

    const firstDate = this.data.gameList[0]?.date;
    if (!firstDate) {
      this.setData({
        pullDownDistance: 0,
        pullDownStatus: 'idle',
        loadingMorePast: false
      });
      return;
    }

    // 向前加载2天
    const end = dayjs(firstDate).subtract(1, 'day').format('YYYY-MM-DD');
    const start = dayjs(firstDate).subtract(2, 'day').format('YYYY-MM-DD');

    try {
      await this.fetchGameRange(start, end, 'prepend');
    } finally {
      this.setData({
        pullDownDistance: 0,
        pullDownStatus: 'idle',
        pullDownText: '下拉加载更早比赛'
      });
    }
  },

  // 加载更多比赛
  async _loadFutureData() {
    const now = Date.now();
    if (this._loadFutureCooldown && now - this._loadFutureCooldown < 2000) {
      this.setData({
        pullUpDistance: 0,
        pullUpStatus: 'idle',
        pullUpText: '上拉加载更多比赛'
      });
      return;
    }

    this._loadFutureCooldown = now;

    const lastDate = this.data.gameList[this.data.gameList.length - 1]?.date;
    if (!lastDate) {
      this.setData({
        pullUpDistance: 0,
        pullUpStatus: 'idle',
        loadingMoreFuture: false
      });
      return;
    }

    // 向后加载2天
    const start = dayjs(lastDate).add(1, 'day').format('YYYY-MM-DD');
    const end = dayjs(lastDate).add(2, 'day').format('YYYY-MM-DD');

    try {
      await this.fetchGameRange(start, end, 'append');
    } finally {
      this.setData({
        pullUpDistance: 0,
        pullUpStatus: 'idle',
        pullUpText: '上拉加载更多比赛'
      });
    }
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
