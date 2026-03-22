// Config - API Base URL
// Change this to your server address
const CONFIG = {
  API_BASE: window.location.hostname === 'localhost'
    ? 'http://localhost:80/api'
    : window.location.origin + '/api',
  
  MODE_MAP: {
    regular: 1,
    plus58: 2,
    minus58: 3
  },
  
  MODE_NAMES: {
    1: '常规模式',
    2: '正58',
    3: '负58'
  },
  
  MODE_KEYS: {
    1: 'regular',
    2: 'plus58',
    3: 'minus58'
  }
};

// Make it globally available
window.CONFIG = CONFIG;
