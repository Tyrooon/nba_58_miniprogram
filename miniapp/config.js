const API_BASE = 'http://localhost:4000/api';

// 微信云托管配置
// useCloudHosting=true 时用 callContainer，易出现 Invalid host 错误
// usePublicDomain=true 时用 wx.request 直连公网域名，部署更稳定
const CLOUD_HOSTING_CONFIG = {
  env: 'nba-58-6g2gfl7c61fc6031',
  serviceName: 'nba-58-006',
  useCloudHosting: false,
  usePublicDomain: true,
  publicDomain: 'https://nba-58.zeabur.app',
};

module.exports = {
  API_BASE,
  CLOUD_HOSTING_CONFIG,
};









