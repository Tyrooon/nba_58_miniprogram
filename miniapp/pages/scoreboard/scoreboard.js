const { request } = require('../../utils/request');
const dayjs = require('../../utils/dayjs.js');

Page({
  data: {
    loading: false,
    scoreboardDate: dayjs().format('YYYY-MM-DD'),
    scoreboardDateText: '',
    scoreboardMode: 1,
    scoreboardData: [],
    scoreboardFormula: '常规模式：实际得分 + 排名加分',
  },

  onLoad() {
    this.formatDateText();
    this.loadDailyScoreboard();
  },

  // 分享功能
  onShareAppMessage() {
    return {
      title: 'NBA 58 - 每日得分看板',
      path: '/pages/index/index'
    };
  },

  goBack() {
    wx.navigateBack();
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  formatDateText() {
    const today = dayjs().format('YYYY-MM-DD');
    const weekdayLabels = ['周日','周一','周二','周三','周四','周五','周六'];
    const date = this.data.scoreboardDate;
    const label = date === today
      ? `今日 ${dayjs(date).format('MM-DD')}`
      : `${dayjs(date).format('MM-DD')} ${weekdayLabels[dayjs(date).day()]}`;
    this.setData({ scoreboardDateText: label });
  },

  onDateChange(e) {
    const date = e.detail.value;
    this.setData({
      scoreboardDate: date,
      scoreboardData: []
    });
    this.formatDateText();
    this.loadDailyScoreboard();
  },

  switchMode(e) {
    const mode = parseInt(e.currentTarget.dataset.mode);
    this.setData({
      scoreboardMode: mode,
      scoreboardData: []
    });
    this.updateFormula();
    this.renderScoreboard();
  },

  updateFormula() {
    const mode = this.data.scoreboardMode;
    let formula = '';
    if (mode === 1) {
      formula = '常规模式：实际得分 + 排名加分';
    } else if (mode === 2) {
      formula = '正58模式：10 + 5.8 × (实际得分 - 赛季均分)';
    } else if (mode === 3) {
      formula = '负58模式：10 - 5.8 × (实际得分 - 赛季均分)';
    }
    this.setData({ scoreboardFormula: formula });
  },

  async loadDailyScoreboard() {
    this.setData({ loading: true });

    try {
      const res = await request({
        url: `/admin/daily-scoreboard?date=${this.data.scoreboardDate}`,
      });

      const modes = res?.modes || { 1: [], 2: [], 3: [] };

      // 预处理数据
      [1, 2, 3].forEach(mode => {
        modes[mode] = (modes[mode] || []).map(row => {
          let calcDetail = '';
          if (row.total_score !== null) {
            if (mode === 1) {
              calcDetail = `${row.base_score || 0}原始 + ${row.bonus_score || 0}奖惩`;
            } else {
              const sign = mode === 2 ? '+' : '-';
              calcDetail = `10 ${sign} 5.8 × (${row.actual_score} - ${row.season_avg})`;
            }
          }
          return {
            ...row,
            calcDetail,
            displayScore: this.formatScore(row.total_score)
          };
        });
      });

      this._scoreboardData = modes;
      this.updateFormula();
      this.renderScoreboard();
    } catch (error) {
      console.error('Scoreboard load error:', error);
      this.setData({ scoreboardData: [] });
    } finally {
      this.setData({ loading: false });
    }
  },

  renderScoreboard() {
    const mode = this.data.scoreboardMode;
    const data = this._scoreboardData?.[mode] || [];
    this.setData({ scoreboardData: data });
  },

  formatScore(score) {
    const num = Number(score);
    if (Number.isFinite(num)) {
      return num.toFixed(2);
    }
    return '0.00';
  },

  async onPullDownRefresh() {
    await this.loadDailyScoreboard();
    wx.stopPullDownRefresh();
  },
});
