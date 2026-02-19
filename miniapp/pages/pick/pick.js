const { request } = require('../../utils/request');
const dayjs = require('../../utils/dayjs.js');

const MODE_NAMES = {
  1: '常规模式',
  2: '正58',
  3: '负58'
};

Page({
  data: {
    mode: 1,
    modeName: '',
    dateStr: '',
    date: '',
    players: [],
    loading: true
  },

  goBack() {
    wx.navigateBack();
  },
  goHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },
  onLoad(options) {
    const app = getApp();
    const mode = options.mode ? parseInt(options.mode) : (app.globalData.currentModeId || 1);
    const selectedDate = options.date || app.globalData.selectedGameDate || dayjs().format('YYYY-MM-DD');
    
    this.setData({
      mode,
      modeName: MODE_NAMES[mode],
      date: selectedDate,
      dateStr: dayjs(selectedDate).format('MM月DD日')
    });

    this.loadNextPlayers();
  },

  async loadNextPlayers() {
    wx.showLoading({ title: '加载球员池...' });
    try {
      const res = await request({ url: '/games/next-players', method: 'GET', data: { date: this.data.date } });
      if (res && res.players) {
        const date = res.date || this.data.date;
        this.setData({
          players: res.players,
          date,
          dateStr: dayjs(date).format('MM月DD日')
        });
      }
    } catch (error) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ loading: false });
    }
  },

  handleSelect(e) {
    const player = e.currentTarget.dataset.player;
    const app = getApp();
    const user = app.globalData.user; // Assuming user is stored here or we fetch it

    if (!user) {
       return wx.showToast({ title: '请先登录', icon: 'none' });
    }

    wx.showModal({
      title: `锁定 ${player.player_name}`,
      content: `确认在 ${this.data.dateStr} 的比赛中选择该球员？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            await request({
              url: '/selections',
              method: 'POST',
              data: {
                userId: user.id,
                playerId: player.player_id,
                playMode: this.data.mode,
                gameDate: this.data.date,
              },
            });
            wx.showToast({ title: '锁定成功', icon: 'success' });
            setTimeout(() => wx.navigateBack(), 1500);
          } catch (error) {
            wx.showToast({ title: error.message || '提交失败', icon: 'none' });
          }
        }
      }
    });
  }
});


