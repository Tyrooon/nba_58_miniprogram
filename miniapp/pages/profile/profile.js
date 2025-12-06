const { request } = require('../../utils/request');

Page({
  data: {
    user: null,
    frozen: [],
    userRank: '--',
  },
  async onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 1
      })
    }

    const app = getApp();
    const user = await app.ensureLogin();
    this.setData({ user });
    this.loadFrozen();
    this.loadRank();
  },
  async loadFrozen() {
    try {
      const list = await request({ url: `/users/${this.data.user.id}/frozen`, method: 'GET' });
      this.setData({ frozen: list });
    } catch (error) {
      console.error(error);
    }
  },
  async loadRank() {
    try {
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
  
  // 选择头像
  chooseAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        
        // 这里可以上传到服务器，目前先使用本地路径
        // 实际项目中需要上传到云存储
        try {
          await this.updateProfile({ avatarUrl: tempFilePath });
          wx.showToast({ title: '头像已更新', icon: 'success' });
        } catch (error) {
          wx.showToast({ title: '更新失败', icon: 'none' });
        }
      }
    });
  },
  
  // 编辑昵称
  editNickname() {
    const currentNickname = this.data.user?.nickname || '';
    wx.showModal({
      title: '修改昵称',
      editable: true,
      placeholderText: '请输入新昵称',
      content: currentNickname,
      success: async (res) => {
        if (res.confirm && res.content) {
          const newNickname = res.content.trim();
          if (newNickname && newNickname !== currentNickname) {
            try {
              await this.updateProfile({ nickname: newNickname });
              wx.showToast({ title: '昵称已更新', icon: 'success' });
            } catch (error) {
              wx.showToast({ title: '更新失败', icon: 'none' });
            }
          }
        }
      }
    });
  },
  
  // 更新用户资料
  async updateProfile(data) {
    const result = await request({
      url: `/users/${this.data.user.id}/profile`,
      method: 'PUT',
      data,
    });
    
    // 更新本地数据和全局数据
    const updatedUser = {
      ...this.data.user,
      nickname: result.nickname,
      avatarUrl: result.avatarUrl,
    };
    this.setData({ user: updatedUser });
    
    const app = getApp();
    if (app.globalData) {
      app.globalData.user = updatedUser;
    }
    
    return result;
  },
});
