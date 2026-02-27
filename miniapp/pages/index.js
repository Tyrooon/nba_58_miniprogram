$(cat pages/index/index.js | head -n 306 | tail -n +55 | head -1) | wc -l)
EOF
    sed -n '306,360p' 'pages/index/index.js' << 'SEDEOF'
  async handleRefreshToday() {
    wx.showLoading({ title: '刷新比分...' });
    try {
      const today = dayjs().format('YYYY-MM-DD');
      
      // 修复：刷新后只更新数据，不重新加载时间线
      const res = await request({
        url: '/games/refresh-scores',
        method: 'POST',
        data: { date: today }
      });
      
      wx.hideLoading();
      
      if (res && res.updated > 0) {
        wx.showToast({
          title: `已更新${res.updated}场比赛`,
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
      console.error('Refresh scores error:', error);
      wx.showToast({
        title: '刷新失败: ' + (error.message || '网络错误'),
        icon: 'none',
        duration: 3000
      });
    }
  },
EOF
