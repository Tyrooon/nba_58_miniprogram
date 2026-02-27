const API_BASE = 'http://localhost:4000/api';

// 微信云托管配置
const CLOUD_HOSTING_CONFIG = {
  env: 'nba-58-6g2gfl7c61fc6031',
  serviceName: 'nba-58-005',
  useCloudHosting: true, // 临时改为 false，使用公网域名测试
  usePublicDomain: false,  // 使用公网域名模式
  publicDomain: 'https://nba-58-228151-9-1389404348.sh.run.tcloudbase.com', // 云托管公网域名
};

module.exports = {
  API_BASE,
  CLOUD_HOSTING_CONFIG,
};









