const { request, API_BASE } = require('../../utils/request');
const { CLOUD_HOSTING_CONFIG } = require('../../config');

const MODE_NAMES = { 1: '常规', 2: '正58', 3: '负58' };

// 格式化分数，保留2位小数
const formatScore = (score) => {
  const num = Number(score);
  return Number.isFinite(num) ? num.toFixed(2) : '0.00';
};

// 处理头像 URL（相对路径转完整路径）
const getFullAvatarUrl = (avatarUrl) => {
  if (!avatarUrl) return '';
  if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) {
    return avatarUrl;
  }
  // 相对路径，  const baseUrl = CLOUD_HOSTING_CONFIG.publicDomain || API_BASE.replace('/api', '');
  return `${baseUrl}${avatarUrl}`;
};

Page({
  data: {
    user: null,
    frozen: [],
    userRank: '--',
    displayScore: '0.00',
    displayBonus: '0.00',
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
        const displayScore = user && user.totalScore != null ? formatScore(user.totalScore) : '0.00';
        const displayBonus = user && user.bonus != null ? formatScore(user.bonus) : '0.00';
        this.setData({ user: user || null, frozen: [], userRank: '--', displayScore, displayBonus });
        if (user) {
          this.loadFrozen();
          this.loadRank();
        }
      })
      .catch((err) => {
        console.error('Profile init error:', err);
      });
  },

  // 分享功能
  onShareAppMessage() {
    return {
      title: 'NBA 58 - 每日球员选择游戏',
      path: '/pages/index/index'
    };
  },

  onShareTimeline() {
    return {
      title: 'NBA 58 - 每日球员选择游戏',
      query: ''
    };
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
      // Sort by bonus (descending), with totalScore as fallback
      const sorted = (leaderboard || []).sort((a, b) => {
        const aBonus = a.bonus ?? a.totalScore ?? 0;
        const bBonus = b.bonus ?? b.totalScore ?? 0;
        return bBonus - aBonus;
      });
      const myRank = sorted.findIndex(u => u.id === this.data.user.id);
      this.setData({ userRank: myRank >= 0 ? myRank + 1 : '--' });
    } catch (error) {
      console.error(error);
    }
  },

  navigate(e) {
    wx.navigateTo({ url: e.currentTarget.dataset.url });
  },

  onTapLoginArea() {
    if (this.data.user) return;
    this.showLinkAccountModal();
  },

  // 阻止事件冒泡（空函数）
  preventBubble() {},

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

      // 拼接完整的头像 URL
      let fullAvatarUrl = uploadRes.avatarUrl;
      if (fullAvatarUrl && fullAvatarUrl.startsWith('/')) {
        const baseUrl = CLOUD_HOSTING_CONFIG.publicDomain || API_BASE.replace('/api', '');
        fullAvatarUrl = `${baseUrl}${fullAvatarUrl}`;
      }

      const updatedUser = {
        ...this.data.user,
        avatarUrl: fullAvatarUrl,
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
        avatarUrl: formatAvatarUrl(result.avatarUrl),
        username: result.username,
        totalScore: result.totalScore,
      };
      const displayScore = formatScore(result.totalScore);

      this.setData({
        user: updatedUser,
        displayScore,
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
