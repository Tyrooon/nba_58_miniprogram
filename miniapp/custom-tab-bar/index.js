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
      await this.loadCurrentSelections();
      this.setData({ showModes: true });
    },
    hideModes() {
      this.setData({ showModes: false });
    },
    async loadCurrentSelections() {
      const app = getApp();
      if (!app || !app.globalData || !app.globalData.user) return;
      try {
        const date = this.data.selectedDate || dayjs().format('YYYY-MM-DD');
        const res = await request({
          url: '/selections/current',
          data: { userId: app.globalData.user.id, date }
        });
        const modes = res && res.modes || {};
        this.setData({
          currentSelectionRegular: modes['1'] || modes[1] || null,
          currentSelectionPlus58: modes['2'] || modes[2] || null,
          currentSelectionMinus58: modes['3'] || modes[3] || null,
          canModifySelection: res && res.canModify !== false,
        });
      } catch (e) {
        console.error('加载当前选择失败', e);
      }
    },
    async handleDeleteSelection(e) {
      const modeKey = e.currentTarget.dataset.mode;
      const modeId = MODE_MAP[modeKey];
      if (!modeId) return;

      if (!this.data.canModifySelection) {
        return wx.showToast({ title: '已过修改截止时间', icon: 'none' });
      }

      const app = getApp();
      if (!app || !app.globalData || !app.globalData.user) return;

      wx.showModal({
        title: '取消选择',
        content: '确定要删除当前球员选择吗？',
        success: async (res) => {
          if (!res.confirm) return;
          try {
            await request({
              url: '/selections',
              method: 'DELETE',
              data: {
                userId: app.globalData.user.id,
                playMode: modeId,
                gameDate: this.data.selectedDate,
              }
            });
            wx.showToast({ title: '已取消选择', icon: 'success' });
            await this.loadCurrentSelections();
            this._notifyPageRefresh();
          } catch (error) {
            wx.showToast({ title: error.message || '操作失败', icon: 'none' });
          }
        }
      });
    },
    _notifyPageRefresh() {
      const pages = getCurrentPages();
      if (!pages || !pages.length) return;
      const currentPage = pages[pages.length - 1];
      if (currentPage && typeof currentPage.fetchCurrentSelections === 'function') {
        currentPage.fetchCurrentSelections(this.data.selectedDate);
      }
    },
    async ensureDateOptions() {
      if (this.data.loadingDates) return;
      if (this.data.dateOptions.length > 0) return;
      this.setData({ loadingDates: true });
      try {
        // 优先从全局数据中获取赛程页面已加载的日期
        const app = getApp();
        let dates = app && app.globalData && app.globalData.loadedGameDates;

        // 如果没有已加载的日期，则从后端获取
        if (!dates || dates.length === 0) {
          dates = await request({ url: '/games/upcoming-dates' });
        }

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
      this.loadCurrentSelections();
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
    selectManagerMode() {
      // 经理模式不需要选人，也不受日期影响
      const app = getApp();
      if (app && app.globalData) {
        app.globalData.currentMode = 'manager';
      }
      this.setData({ showModes: false });
      // 跳转到经理模式页面
      wx.navigateTo({
        url: `/pages/manager/manager`
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
