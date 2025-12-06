const { request } = require('../utils/request');
const dayjs = require('../utils/dayjs.js');

const MODE_MAP = {
  regular: 1,
  plus58: 2,
  minus58: 3
};

Component({
  data: {
    selected: 0,
    color: "#9CA3AF",
    selectedColor: "#3B82F6",
    list: [{
      pagePath: "/pages/index/index",
      text: "赛程"
    }, {
      pagePath: "/pages/profile/profile",
      text: "我的"
    }],
    showModes: false,
    currentSelectionText: '未选择',
    canModifySelection: true,
    selectionDeadline: null,
    currentSelectionRegular: null,
    currentSelectionPlus58: null,
    currentSelectionMinus58: null,
    activeModeId: 1,
    dateOptions: [],
    selectedDate: dayjs().format('YYYY-MM-DD'),
    selectedDateLabel: '',
    loadingDates: false
  },
  lifetimes: {
    attached() {
      this.ensureDateOptions();
    }
  },
  methods: {
    switchTab(e) {
      const data = e.currentTarget.dataset;
      const url = data.path;
      wx.switchTab({ url });
      this.setData({ selected: data.index });
    },
    async showGameModes() {
      await this.ensureDateOptions();
      this.setData({ showModes: true });
    },
    hideModes() {
      this.setData({ showModes: false });
    },
    async ensureDateOptions() {
      if (this.data.loadingDates) return;
      if (this.data.dateOptions.length > 0) return;
      this.setData({ loadingDates: true });
      try {
        const dates = await request({ url: '/games/upcoming-dates' });
        const options = (dates || []).map((date) => {
          const d = dayjs(date);
          const today = dayjs().format('YYYY-MM-DD');
          const weekdayLabels = ['周日','周一','周二','周三','周四','周五','周六'];
          const label = date === today ? `今日 ${d.format('MM-DD')}` : `${d.format('MM-DD')} ${weekdayLabels[d.day()]}`;
          return { date, label };
        });
        const fallbackDate = this.data.selectedDate || dayjs().format('YYYY-MM-DD');
        const firstOption = options[0] || { date: fallbackDate, label: dayjs(fallbackDate).format('MM-DD') };
        const selectedDate = options.length ? firstOption.date : fallbackDate;
        const selectedDateLabel = options.length ? firstOption.label : dayjs(selectedDate).format('MM-DD');
        const app = getApp();
        if (app && app.globalData) {
          app.globalData.selectedGameDate = selectedDate;
        }
        this.setData({
          dateOptions: options,
          selectedDate,
          selectedDateLabel
        });
      } catch (error) {
        console.error('获取比赛日期失败', error);
      } finally {
        this.setData({ loadingDates: false });
      }
    },
    selectDate(e) {
      const { date } = e.currentTarget.dataset;
      if (!date) return;
      const option = this.data.dateOptions.find((item) => item.date === date);
      const label = option ? option.label : dayjs(date).format('MM-DD');
      const app = getApp();
      if (app && app.globalData) {
        app.globalData.selectedGameDate = date;
      }
      this.setData({
        selectedDate: date,
        selectedDateLabel: label
      });
      this.notifyDateChange(date);
    },
    notifyDateChange(date) {
      const pages = getCurrentPages();
      if (!pages || !pages.length) return;
      const currentPage = pages[pages.length - 1];
      if (currentPage && typeof currentPage.handleSelectionDateChange === 'function') {
        currentPage.handleSelectionDateChange(date);
      }
    },
    selectMode(e) {
      const modeKey = e.currentTarget.dataset.mode || 'regular';
      const selectedMode = MODE_MAP[modeKey] || 1;
      if (!this.data.canModifySelection) {
        wx.showToast({ title: '今日已锁定', icon: 'none' });
        return;
      }
      const app = getApp();
      if (app && app.globalData) {
        app.globalData.currentMode = modeKey;
        app.globalData.currentModeId = selectedMode;
        if (!app.globalData.selectedGameDate) {
          app.globalData.selectedGameDate = this.data.selectedDate;
        }
      }
      const targetDate = this.data.selectedDate || dayjs().format('YYYY-MM-DD');
      this.setData({ showModes: false, activeModeId: selectedMode });
      this.notifyModeChange(selectedMode);
      wx.navigateTo({
        url: `/pages/pick/pick?mode=${selectedMode}&date=${targetDate}`
      });
    },
    notifyModeChange(modeId) {
      const pages = getCurrentPages();
      if (!pages || !pages.length) return;
      const currentPage = pages[pages.length - 1];
      if (currentPage && typeof currentPage.handleModeChange === 'function') {
        currentPage.handleModeChange(modeId);
      }
    }
  }
})
