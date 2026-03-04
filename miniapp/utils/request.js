const { API_BASE, CLOUD_HOSTING_CONFIG } = require('../config');

const request = ({ url, method = 'GET', data = {}, header = {}, timeout = 15000 }) =>
  new Promise((resolve, reject) => {
    const requestConfig = {
      method,
      data,
      header,
      timeout,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          const error = res.data || { message: `请求失败: ${res.statusCode}` };
          console.error(`API Error [${method} ${url}]:`, error);
          reject(error);
        }
      },
      fail: (error) => {
        console.error(`Network Error [${method} ${url}]:`, error);
        reject(error || { message: '网络请求失败' });
      },
    };

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
        success: requestConfig.success,
        fail: requestConfig.fail,
      });
    } else if (CLOUD_HOSTING_CONFIG.usePublicDomain && CLOUD_HOSTING_CONFIG.publicDomain) {
      // 使用云托管公网域名
      wx.request({
        url: `${CLOUD_HOSTING_CONFIG.publicDomain}/api${url}`,
        ...requestConfig,
      });
    } else {
      // 使用本地开发服务器
      wx.request({
        url: `${API_BASE}${url}`,
        ...requestConfig,
      });
    }
  });

module.exports = {
  request,
  API_BASE,
};









