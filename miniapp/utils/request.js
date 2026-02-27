const { API_BASE, CLOUD_HOSTING_CONFIG } = require('../config');

const request = ({ url, method = 'GET', data = {}, header = {} }) =>
  new Promise((resolve, reject) => {
    if (CLOUD_HOSTING_CONFIG.useCloudHosting) {
      // 使用微信云托管
      wx.cloud.callContainer({
        config: {
          env: CLOUD_HOSTING_CONFIG.env,
        },
        path: `/api${url}`,
        method,
        data,
        header: {
          'X-WX-SERVICE': CLOUD_HOSTING_CONFIG.serviceName,
          ...header,
        },
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data);
          } else {
            reject(res.data || { message: '网络错误' });
          }
        },
        fail: (error) => {
          reject(error || { message: '网络请求失败' });
        },
      });
    } else if (CLOUD_HOSTING_CONFIG.usePublicDomain && CLOUD_HOSTING_CONFIG.publicDomain) {
      // 使用云托管公网域名
      wx.request({
        url: `${CLOUD_HOSTING_CONFIG.publicDomain}/api${url}`,
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
    } else {
      // 使用本地开发服务器
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
    }
  });

module.exports = {
  request,
  API_BASE,
};









