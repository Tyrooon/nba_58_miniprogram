

  onRefresh: function(date = dayjs().format('YYYY-MM-DD')) {
    // 使用快速刷新API，只更新比分
    wx.showLoading({ title: '刷新比分...' });

    (async () => {
      try {
        const res = await request({
          url: '/games/refresh-scores',
          method: 'POST',
          data: { date }
        });

        wx.hideLoading();

        if (res && res.updated > 0) {
          wx.showToast({
            title: `已更新${res.updated}场比赛`,
            icon: 'success',
            duration: 2000
          });

          // 重新加载当天数据
          const refreshRes = await request({
            url: '/games/range',
            data: { start: date, end: date }
          });

          if (refreshRes && refreshRes.length > 0) {
            const updatedDay = refreshRes[0];
            const newList = this.data.gameList.map(g => {
              if (g.date === date) {
                return updatedDay;
              }
              return g;
            });

            this.setData({ gameList: newList });
          } else {
            wx.showToast({
              title: '暂无更新',
              icon: 'none',
              duration: 2000
            });
          }
        } else {
          wx.showToast({
            title: '刷新失败',
            icon: 'none',
            duration: 2000
          });
        }
      } catch (error) {
        wx.hideLoading();
        wx.showToast({
          title: '刷新失败',
          icon: 'none',
          duration: 2000
        });
      }
    })();
  }

