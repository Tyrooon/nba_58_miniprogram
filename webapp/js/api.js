// API Service

const API = {
  // Base request method
  async request(url, options = {}) {
    const { method = 'GET', data = null, headers = {} } = options;

    if (method === 'GET') {
      const char = url.includes('?') ? '&' : '?';
      url += `${char}_t=${Date.now()}`;
    }

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

  // Auth APIs
  async register(username, password, confirmPassword, nickname) {
    return this.request('/users/register', {
      method: 'POST',
      data: { username, password, confirmPassword, nickname }
    });
  },

  async authLogin(username, password) {
    return this.request('/users/auth-login', {
      method: 'POST',
      data: { username, password }
    });
  },

  // Legacy login (kept for miniapp compatibility)
  async login(nickname, avatarUrl) {
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
    return this.request(`/users/${userId}`);
  },

  async updateProfile(userId, data) {
    return this.request(`/users/${userId}/profile`, {
      method: 'PUT',
      data
    });
  },

  async uploadAvatar(userId, file) {
    const formData = new FormData();
    formData.append('avatar', file);

    const response = await fetch(`${CONFIG.API_BASE}/users/${userId}/avatar`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: '上传失败' }));
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }

    return await response.json();
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

  async deleteSelection(data) {
    return this.request('/selections', {
      method: 'DELETE',
      data
    });
  },

  async getCurrentSelections(userId, date) {
    return this.request(`/selections/current?userId=${userId}&date=${date}`);
  },

  async getSelectionHistory(userId, limit = 50) {
    return this.request(`/selections/history?userId=${userId}&limit=${limit}`);
  },

  async viewUserSelections(userId, limit = 50) {
    return this.request(`/selections/view?userId=${userId}&limit=${limit}`);
  },

  // Leaderboard
  async getLeaderboard(scope = 'overall') {
    return this.request(`/leaderboard?scope=${scope}`);
  },

  async getDailyScoreboard(date) {
    const d = date || window.Utils?.formatDate(new Date(), 'YYYY-MM-DD');
    return this.request(`/admin/daily-scoreboard?date=${d}`);
  },

  // Manager APIs
  async getManagerList() {
    return this.request('/manager/applications');
  },

  async getManagerDetail(applicationId) {
    return this.request(`/manager/applications/${applicationId}`);
  },

  async submitManagerApplication(data) {
    return this.request('/manager/applications', {
      method: 'POST',
      data
    });
  },

  async reviewManager(applicationId, approved, reviewNote) {
    return this.request(`/manager/applications/${applicationId}/review`, {
      method: 'POST',
      data: { approved, reviewNote }
    });
  },

  async deleteManagerApplication(applicationId) {
    return this.request(`/manager/applications/${applicationId}`, {
      method: 'DELETE'
    });
  },

  // Admin APIs
  async getAdminUsers() {
    return this.request('/admin/users');
  },

  async deleteAdminUser(userId) {
    return this.request(`/admin/users/${userId}`, {
      method: 'DELETE'
    });
  },

  async getAdminGroups() {
    return this.request('/admin/groups');
  },

  async createAdminGroup(name, description) {
    return this.request('/admin/groups', {
      method: 'POST',
      data: { name, description }
    });
  },

  async updateAdminGroup(groupId, name, description) {
    return this.request(`/admin/groups/${groupId}`, {
      method: 'PUT',
      data: { name, description }
    });
  },

  async deleteAdminGroup(groupId) {
    return this.request(`/admin/groups/${groupId}`, {
      method: 'DELETE'
    });
  },

  async setAdminUserGroup(userId, groupId) {
    return this.request(`/admin/users/${userId}/group`, {
      method: 'PUT',
      data: { groupId }
    });
  },

  async getAdminDraftOrder(groupId, season) {
    return this.request(`/admin/draft-order?groupId=${groupId}&season=${season}`);
  },

  async setAdminDraftOrder(groupId, season, orderList) {
    return this.request('/admin/draft-order', {
      method: 'PUT',
      data: { groupId, season, orderList }
    });
  },

  async getAdminRosters(userId) {
    return this.request(`/admin/manager/rosters/${userId ? userId : ''}`);
  },

  async adminAddPlayerToRoster(userId, playerId, playerType, isStarter) {
    return this.request('/admin/manager/rosters/add', {
      method: 'POST',
      data: { userId, playerId, playerType, isStarter }
    });
  },

  async adminRemovePlayerFromRoster(userId, playerId) {
    return this.request('/admin/manager/rosters/remove', {
      method: 'POST',
      data: { userId, playerId }
    });
  },

  async adminSetStarters(userId, starterIds) {
    return this.request('/admin/manager/starters/set', {
      method: 'POST',
      data: { userId, starterIds }
    });
  }
};

window.API = API;
