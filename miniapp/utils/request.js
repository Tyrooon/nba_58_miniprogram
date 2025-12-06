const { API_BASE } = require('../config');

const request = ({ url, method = 'GET', data = {}, header = {} }) =>
  new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE}${url}`,
      method,
      data,
      header,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          reject(res.data || { message: '网络错误' });
        }
      },
      fail: reject,
    });
  });

module.exports = {
  request,
  API_BASE,
};









