const { request } = require('./utils/request');

App({
  globalData: {
    user: null,
    currentMode: 'regular',
    currentModeId: 1,
    selectedGameDate: '',
  },
  async onLaunch() {
    try {
      await this.ensureLogin();
    } catch (error) {
      console.error('初始化登录失败', error);
    }
  },
  async ensureLogin() {
    if (this.globalData.user) return this.globalData.user;
    const cached = wx.getStorageSync('user');
    if (cached) {
      this.globalData.user = cached;
      return cached;
    }
    const loginRes = await wx.login();
    const profile = await this.getProfile();
    const payload = {
      code: loginRes.code,
      nickname: (profile && profile.nickName) || `球迷${Date.now().toString().slice(-4)}`,
      avatarUrl: profile && profile.avatarUrl,
    };
    const user = await request({ url: '/users/login', method: 'POST', data: payload });
    wx.setStorageSync('user', user);
    this.globalData.user = user;
    return user;
  },
  updateUserCache(user) {
    this.globalData.user = user;
    wx.setStorageSync('user', user);
  },
  getProfile() {
    return new Promise((resolve) => {
      if (!wx.getUserProfile) return resolve(null);
      wx.getUserProfile({
        desc: '用于展示头像和昵称',
        success: (res) => resolve(res.userInfo),
        fail: () => resolve(null),
      });
    });
  },
});







