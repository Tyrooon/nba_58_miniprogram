const API_BASE = 'http://localhost:4000/api';

// 微信云托管配置
const CLOUD_HOSTING_CONFIG = {
  env: 'prod-6gd4czxs81560b5d',
  serviceName: 'nba58-014',
  useCloudHosting: false, // 临时改为 false，使用公网域名测试
  usePublicDomain: true,  // 使用公网域名模式
  publicDomain: 'https://nba58-203827-6-1389404348.sh.run.tcloudbase.com', // 云托管公网域名
};

module.exports = {
  API_BASE,
  CLOUD_HOSTING_CONFIG,
};









