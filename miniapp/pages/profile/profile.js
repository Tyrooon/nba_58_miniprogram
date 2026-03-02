const { request, API_BASE } = require('../../utils/request');
const { CLOUD_HOSTING_CONFIG } = require('../../config');

const MODE_NAMES = { 1: '常规', 2: '正58', 3: '负58' };

Page({
  data: {
    user: null,
    frozen: [],
    userRank: '--',
    // 关联账号相关
    showLinkModal: false,
    linkUsername: '',
    linkPassword: '',
    linking: false,
  },

  onShow() {
    this._initTabBar();

    const app = getApp();
    Promise.resolve(app.ensureLogin())
      .then((user) => {
        this.setData({ user: user || null, frozen: [], userRank: '--' });
        if (user) {
          this.loadFrozen();
          this.loadRank();
        }
      })
      .catch((err) => {
        console.error('Profile init error:', err);
      });
  },

  _initTabBar() {
    const setTab = () => {
      if (typeof this.getTabBar === 'function' && this.getTabBar()) {
        this.getTabBar().setData({ selected: 1 });
      }
    };
    setTab();
    setTimeout(setTab, 100);
  },

  async loadFrozen() {
    try {
      if (!this.data.user) return;
      const list = await request({ url: `/users/${this.data.user.id}/frozen`, method: 'GET' });
      const decorated = (list || []).map(item => ({
        ...item,
        modeName: MODE_NAMES[item.play_mode] || '常规',
      }));
      this.setData({ frozen: decorated });
    } catch (error) {
      console.error(error);
    }
  },

  async loadRank() {
    try {
      if (!this.data.user) return;
      const leaderboard = await request({ url: '/users/leaderboard', method: 'GET' });
      const myRank = leaderboard.findIndex(u => u.id === this.data.user.id);
      this.setData({ userRank: myRank >= 0 ? myRank + 1 : '--' });
    } catch (error) {
      console.error(error);
    }
  },

  navigate(e) {
    wx.navigateTo({ url: e.currentTarget.dataset.url });
  },

  async onChooseAvatar(e) {
    if (!this.data.user) {
      return wx.showToast({ title: '请先关联网页端账号', icon: 'none' });
    }
    const { avatarUrl } = e.detail;
    if (!avatarUrl) return;

    wx.showLoading({ title: '更新中...' });
    try {
      let uploadUrl;
      if (CLOUD_HOSTING_CONFIG.usePublicDomain && CLOUD_HOSTING_CONFIG.publicDomain) {
        uploadUrl = `${CLOUD_HOSTING_CONFIG.publicDomain}/api/users/${this.data.user.id}/avatar`;
      } else {
        uploadUrl = `${API_BASE}/users/${this.data.user.id}/avatar`;
      }

      const uploadRes = await new Promise((resolve, reject) => {
        wx.uploadFile({
          url: uploadUrl,
          filePath: avatarUrl,
          name: 'avatar',
          success: (res) => {
            if (res.statusCode === 200) {
              resolve(JSON.parse(res.data));
            } else {
              reject(new Error('上传失败'));
            }
          },
          fail: reject,
        });
      });

      const updatedUser = {
        ...this.data.user,
        avatarUrl: uploadRes.avatarUrl,
      };
      this.setData({ user: updatedUser });

      const app = getApp();
      if (app.globalData) {
        app.globalData.user = updatedUser;
        wx.setStorageSync('user', updatedUser);
      }

      wx.hideLoading();
      wx.showToast({ title: '头像已更新', icon: 'success' });
    } catch (error) {
      wx.hideLoading();
      console.error('上传头像失败:', error);
      wx.showToast({ title: '更新失败', icon: 'none' });
    }
  },

  async onNicknameInput(e) {
    if (!this.data.user) return;
    const newNickname = e.detail.value?.trim();
    if (!newNickname || newNickname === this.data.user?.nickname) return;

    try {
      await this.updateProfile({ nickname: newNickname });
      wx.showToast({ title: '昵称已更新', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: '更新失败', icon: 'none' });
    }
  },

  // ========== 关联账号相关 ==========
  showLinkAccountModal() {
    this.setData({
      showLinkModal: true,
      linkUsername: '',
      linkPassword: '',
    });
  },

  hideLinkAccountModal() {
    this.setData({
      showLinkModal: false,
      linkUsername: '',
      linkPassword: '',
    });
  },

  onLinkUsernameInput(e) {
    this.setData({ linkUsername: e.detail.value });
  },

  onLinkPasswordInput(e) {
    this.setData({ linkPassword: e.detail.value });
  },

  async confirmLinkAccount() {
    const { linkUsername, linkPassword } = this.data;

    if (!linkUsername.trim()) {
      return wx.showToast({ title: '请输入用户名', icon: 'none' });
    }
    if (!linkPassword) {
      return wx.showToast({ title: '请输入密码', icon: 'none' });
    }

    this.setData({ linking: true });

    try {
      const loginRes = await wx.login();
      const result = await request({
        url: `/users/link-account`,
        method: 'POST',
        data: {
          code: loginRes.code,
          username: linkUsername.trim(),
          password: linkPassword,
        },
      });

      const updatedUser = {
        id: result.id,
        nickname: result.nickname,
        avatarUrl: result.avatarUrl,
        username: result.username,
        totalScore: result.totalScore,
      };

      this.setData({
        user: updatedUser,
        showLinkModal: false,
        linkUsername: '',
        linkPassword: '',
      });

      const app = getApp();
      if (app.globalData) {
        app.globalData.user = updatedUser;
        wx.setStorageSync('user', updatedUser);
      }

      wx.showToast({ title: '关联成功', icon: 'success' });
      this.loadFrozen();
      this.loadRank();
    } catch (error) {
      console.error('关联账号失败:', error);
      wx.showToast({
        title: error.message || '关联失败',
        icon: 'none',
      });
    } finally {
      this.setData({ linking: false });
    }
  },

  async updateProfile(data) {
    if (!this.data.user) throw new Error('未登录');
    const result = await request({
      url: `/users/${this.data.user.id}/profile`,
      method: 'PUT',
      data,
    });

    const updatedUser = {
      ...this.data.user,
      nickname: result.nickname,
      avatarUrl: result.avatarUrl,
    };
    this.setData({ user: updatedUser });

    const app = getApp();
    if (app.globalData) {
      app.globalData.user = updatedUser;
      wx.setStorageSync('user', updatedUser);
    }

    return result;
  },
});
