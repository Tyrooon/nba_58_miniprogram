// Config - API Base URL
// Change this to your server address
const CONFIG = {
  // API_BASE: window.location.origin + '/api',
  // For local development, use:
  API_BASE: 'http://localhost:4000/api',
  
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
