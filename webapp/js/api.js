// API Service

const API = {
  // Base request method
  async request(url, options = {}) {
    const { method = 'GET', data = null, headers = {} } = options;
    
    const config = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
    };
    
    if (data && method !== 'GET') {
      config.body = JSON.stringify(data);
    }
    
    // Add userId header if available
    const user = Utils.storage.get('user');
    if (user && user.id) {
      config.headers['X-User-Id'] = user.id;
    }
    
    try {
      const response = await fetch(`${CONFIG.API_BASE}${url}`, config);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: '网络错误' }));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('API Error:', url, error);
      throw error;
    }
  },
  
  // User APIs
  async login(nickname, avatarUrl) {
    // Web 端无微信 code，使用本地持久化的 UUID 作为 openid
    let openid = localStorage.getItem('web_openid');
    if (!openid) {
      openid = 'web_' + crypto.randomUUID();
      localStorage.setItem('web_openid', openid);
    }
    return this.request('/users/login', {
      method: 'POST',
      data: { openid, nickname, avatarUrl }
    });
  },
  
  async getProfile(userId) {
    return this.request(`/users/${userId}/profile`);
  },
  
  async updateProfile(userId, data) {
    return this.request(`/users/${userId}/profile`, {
      method: 'PUT',
      data
    });
  },
  
  async getFrozenPlayers(userId, playMode) {
    const url = playMode !== undefined
      ? `/users/${userId}/frozen?playMode=${playMode}`
      : `/users/${userId}/frozen`;
    return this.request(url);
  },
  
  async getAllUsers(limit = 100) {
    return this.request(`/users/all?limit=${limit}`);
  },
  
  // Games APIs
  async getGamesRange(start, end) {
    return this.request(`/games/range?start=${start}&end=${end}`);
  },
  
  async getTodayGames() {
    return this.request('/games/today');
  },
  
  async syncGames(date) {
    return this.request('/games/sync', {
      method: 'POST',
      data: { date }
    });
  },
  
  async refreshScores(date) {
    return this.request('/games/refresh-scores', {
      method: 'POST',
      data: { date }
    });
  },
  
  async syncSchedule() {
    return this.request('/admin/sync-schedule', {
      method: 'POST'
    });
  },
  
  async getUpcomingDates() {
    return this.request('/games/upcoming-dates');
  },
  
  // Selections APIs
  async submitSelection(data) {
    return this.request('/selections', {
      method: 'POST',
      data
    });
  },
  
  async getCurrentSelections(userId, date) {
    return this.request(`/selections/current?userId=${userId}&date=${date}`);
  },
  
  async getSelectionHistory(userId, limit = 50) {
    return this.request(`/selections/history?userId=${userId}&limit=${limit}`);
  },
  
  // Leaderboard
  async getLeaderboard(scope = 'overall') {
    return this.request(`/leaderboard?scope=${scope}`);
  }
};

window.API = API;
