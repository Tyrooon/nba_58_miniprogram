// NBA 58 Admin Panel

const AdminApp = {
  currentUser: null,
  currentSection: 'users',
  users: [],
  groups: [],
  draftOrder: [],
  editingGroupId: null,
  selectedUserId: null,
  currentRosterUserId: null,

  // ==================== Initialization ====================

  init() {
    this.bindEvents();
    this.checkSession();
  },

  bindEvents() {
    // Login
    document.getElementById('adminLoginBtn').addEventListener('click', () => this.login());
    document.getElementById('adminPassword').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.login();
    });

    // Logout
    document.getElementById('adminLogoutBtn').addEventListener('click', () => this.logout());

    // Menu navigation
    document.querySelectorAll('.sidebar-menu .menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const section = e.currentTarget.dataset.section;
        this.switchSection(section);
      });
    });

    // User management
    document.getElementById('userSearch').addEventListener('input', (e) => this.filterUsers(e.target.value));

    // Group management
    document.getElementById('createGroupBtn').addEventListener('click', () => this.openGroupModal());
    document.getElementById('closeGroupModal').addEventListener('click', () => this.closeGroupModal());
    document.getElementById('cancelGroupBtn').addEventListener('click', () => this.closeGroupModal());
    document.getElementById('confirmGroupBtn').addEventListener('click', () => this.saveGroup());

    // Draft order
    document.getElementById('draftGroupSelect').addEventListener('change', () => this.loadDraftOrder());
    document.getElementById('draftSeasonSelect').addEventListener('change', () => this.loadDraftOrder());
    document.getElementById('saveDraftOrderBtn').addEventListener('click', () => this.saveDraftOrder());

    // Roster management
    document.getElementById('rosterUserSelect').addEventListener('change', (e) => this.loadUserRoster(e.target.value));
    document.getElementById('addPlayerBtn').addEventListener('click', () => this.openPlayerModal());
    document.getElementById('closePlayerModal').addEventListener('click', () => this.closePlayerModal());
    document.getElementById('cancelPlayerBtn').addEventListener('click', () => this.closePlayerModal());
    document.getElementById('confirmPlayerBtn').addEventListener('click', () => this.addPlayerToRoster());

    // User group modal
    document.getElementById('closeUserGroupModal').addEventListener('click', () => this.closeUserGroupModal());
    document.getElementById('cancelUserGroupBtn').addEventListener('click', () => this.closeUserGroupModal());
    document.getElementById('confirmUserGroupBtn').addEventListener('click', () => this.saveUserGroup());

    // Confirm dialog
    document.getElementById('confirmCancelBtn').addEventListener('click', () => this.closeConfirmModal());

    // Sync
    document.getElementById('syncScheduleBtn').addEventListener('click', () => this.syncSchedule());
    document.getElementById('syncDailyBtn').addEventListener('click', () => this.syncDaily());
    document.getElementById('computeScoresBtn').addEventListener('click', () => this.computeScores());

    // Set default dates
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('syncDateInput').value = today;
    document.getElementById('computeDateInput').value = today;
  },

  checkSession() {
    const savedUser = Utils.storage.get('adminUser');
    if (savedUser && savedUser.is_admin) {
      this.currentUser = savedUser;
      this.showPanel();
    }
  },

  // ==================== Auth ====================

  async login() {
    const username = document.getElementById('adminUsername').value.trim();
    const password = document.getElementById('adminPassword').value;

    if (!username || !password) {
      this.showError('请输入用户名和密码');
      return;
    }

    try {
      const user = await this.apiRequest('/users/auth-login', {
        method: 'POST',
        data: { username, password }
      });

      if (!user.is_admin) {
        this.showError('该账号不是管理员');
        return;
      }

      this.currentUser = user;
      Utils.storage.set('adminUser', user);
      this.showPanel();
      this.toast('登录成功', 'success');
    } catch (error) {
      this.showError(error.message || '登录失败');
    }
  },

  logout() {
    this.currentUser = null;
    Utils.storage.remove('adminUser');
    document.getElementById('adminLogin').style.display = 'flex';
    document.getElementById('adminPanel').style.display = 'none';
    this.toast('已退出登录');
  },

  showPanel() {
    document.getElementById('adminLogin').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'flex';
    this.loadSectionData('users');
  },

  showError(message) {
    const errorEl = document.getElementById('loginError');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  },

  // ==================== Navigation ====================

  switchSection(section) {
    this.currentSection = section;

    // Update menu
    document.querySelectorAll('.sidebar-menu .menu-item').forEach(item => {
      item.classList.toggle('active', item.dataset.section === section);
    });

    // Update title
    const titles = {
      users: '用户管理',
      groups: '小组管理',
      draft: '选秀顺序',
      rosters: '经理阵容',
      sync: '数据同步'
    };
    document.getElementById('sectionTitle').textContent = titles[section] || section;

    // Show section
    document.querySelectorAll('.admin-section').forEach(el => {
      el.style.display = 'none';
    });
    document.getElementById(`${section}Section`).style.display = 'block';

    // Load data
    this.loadSectionData(section);
  },

  async loadSectionData(section) {
    switch (section) {
      case 'users':
        await this.loadUsers();
        break;
      case 'groups':
        await this.loadGroups();
        break;
      case 'draft':
        await this.loadGroups();
        await this.loadDraftOrder();
        break;
      case 'rosters':
        await this.loadUsers();
        this.populateRosterUserSelect();
        break;
      case 'sync':
        // No initial data needed
        break;
    }
  },

  // ==================== Users ====================

  async loadUsers() {
    try {
      const result = await this.apiRequest('/admin/users');
      this.users = result.data || [];
      this.renderUsersTable();
    } catch (error) {
      this.toast('加载用户失败: ' + error.message, 'error');
    }
  },

  renderUsersTable() {
    const tbody = document.getElementById('usersTableBody');

    if (this.users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="loading-cell">暂无数据</td></tr>';
      return;
    }

    tbody.innerHTML = this.users.map(user => `
      <tr>
        <td>${user.id}</td>
        <td>${user.username || '-'}</td>
        <td>${user.nickname || '-'}</td>
        <td>${user.group_name || '默认小组'}</td>
        <td>${Utils.formatScore(user.total_score || 0)}</td>
        <td>${user.is_admin ? '<span class="admin-badge">管理员</span>' : '-'}</td>
        <td>${user.created_at ? Utils.formatDate(user.created_at, 'YYYY-MM-DD') : '-'}</td>
        <td>
          ${!user.is_admin ? `
            <button class="action-btn edit" onclick="AdminApp.openUserGroupModal(${user.id})">设置小组</button>
            <button class="action-btn danger" onclick="AdminApp.deleteUser(${user.id}, '${user.nickname || user.username}')">删除</button>
          ` : '-'}
        </td>
      </tr>
    `).join('');
  },

  filterUsers(keyword) {
    const lowerKeyword = keyword.toLowerCase();
    const filtered = this.users.filter(user =>
      (user.username && user.username.toLowerCase().includes(lowerKeyword)) ||
      (user.nickname && user.nickname.toLowerCase().includes(lowerKeyword))
    );
    this.renderFilteredUsers(filtered);
  },

  renderFilteredUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    if (users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="loading-cell">未找到匹配的用户</td></tr>';
      return;
    }

    tbody.innerHTML = users.map(user => `
      <tr>
        <td>${user.id}</td>
        <td>${user.username || '-'}</td>
        <td>${user.nickname || '-'}</td>
        <td>${user.group_name || '默认小组'}</td>
        <td>${Utils.formatScore(user.total_score || 0)}</td>
        <td>${user.is_admin ? '<span class="admin-badge">管理员</span>' : '-'}</td>
        <td>${user.created_at ? Utils.formatDate(user.created_at, 'YYYY-MM-DD') : '-'}</td>
        <td>
          ${!user.is_admin ? `
            <button class="action-btn edit" onclick="AdminApp.openUserGroupModal(${user.id})">设置小组</button>
            <button class="action-btn danger" onclick="AdminApp.deleteUser(${user.id}, '${user.nickname || user.username}')">删除</button>
          ` : '-'}
        </td>
      </tr>
    `).join('');
  },

  deleteUser(userId, userName) {
    this.showConfirm(`确定要删除用户 "${userName}" 吗？此操作不可恢复。`, async () => {
      try {
        await this.apiRequest(`/admin/users/${userId}`, { method: 'DELETE' });
        this.toast('用户已删除', 'success');
        await this.loadUsers();
      } catch (error) {
        this.toast('删除失败: ' + error.message, 'error');
      }
    });
  },

  // ==================== Groups ====================

  async loadGroups() {
    try {
      const result = await this.apiRequest('/admin/groups');
      this.groups = result.data || [];
      this.renderGroups();
      this.updateGroupSelects();
    } catch (error) {
      this.toast('加载小组失败: ' + error.message, 'error');
    }
  },

  renderGroups() {
    const container = document.getElementById('groupsGrid');

    if (this.groups.length === 0) {
      container.innerHTML = '<div class="hint-text">暂无小组</div>';
      return;
    }

    container.innerHTML = this.groups.map(group => `
      <div class="group-card">
        <div class="group-card-header">
          <div class="group-card-title">${group.name}</div>
          ${group.id !== 1 ? `
            <div class="group-card-actions">
              <button class="action-btn edit" onclick="AdminApp.editGroup(${group.id}, '${group.name}', '${group.description || ''}')">编辑</button>
              <button class="action-btn danger" onclick="AdminApp.deleteGroup(${group.id}, '${group.name}')">删除</button>
            </div>
          ` : ''}
        </div>
        <div class="group-card-desc">${group.description || '暂无描述'}</div>
        <div class="group-card-meta">成员: ${group.member_count || 0} 人</div>
      </div>
    `).join('');
  },

  updateGroupSelects() {
    const options = this.groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
    document.getElementById('draftGroupSelect').innerHTML = options;
    document.getElementById('userGroupSelect').innerHTML = options;
  },

  openGroupModal() {
    this.editingGroupId = null;
    document.getElementById('groupModalTitle').textContent = '新建小组';
    document.getElementById('groupNameInput').value = '';
    document.getElementById('groupDescInput').value = '';
    document.getElementById('groupModal').style.display = 'flex';
  },

  editGroup(groupId, name, description) {
    this.editingGroupId = groupId;
    document.getElementById('groupModalTitle').textContent = '编辑小组';
    document.getElementById('groupNameInput').value = name;
    document.getElementById('groupDescInput').value = description;
    document.getElementById('groupModal').style.display = 'flex';
  },

  closeGroupModal() {
    document.getElementById('groupModal').style.display = 'none';
    this.editingGroupId = null;
  },

  async saveGroup() {
    const name = document.getElementById('groupNameInput').value.trim();
    const description = document.getElementById('groupDescInput').value.trim();

    if (!name) {
      this.toast('请输入小组名称', 'error');
      return;
    }

    try {
      if (this.editingGroupId) {
        await this.apiRequest(`/admin/groups/${this.editingGroupId}`, {
          method: 'PUT',
          data: { name, description }
        });
        this.toast('小组已更新', 'success');
      } else {
        await this.apiRequest('/admin/groups', {
          method: 'POST',
          data: { name, description }
        });
        this.toast('小组已创建', 'success');
      }
      this.closeGroupModal();
      await this.loadGroups();
    } catch (error) {
      this.toast('操作失败: ' + error.message, 'error');
    }
  },

  deleteGroup(groupId, groupName) {
    this.showConfirm(`确定要删除小组 "${groupName}" 吗？小组成员将被移至默认小组。`, async () => {
      try {
        await this.apiRequest(`/admin/groups/${groupId}`, { method: 'DELETE' });
        this.toast('小组已删除', 'success');
        await this.loadGroups();
      } catch (error) {
        this.toast('删除失败: ' + error.message, 'error');
      }
    });
  },

  // ==================== User Group ====================

  openUserGroupModal(userId) {
    this.selectedUserId = userId;
    const user = this.users.find(u => u.id === userId);
    document.getElementById('userGroupUserName').textContent = user?.nickname || user?.username || userId;
    document.getElementById('userGroupSelect').value = user?.group_id || 1;
    document.getElementById('userGroupModal').style.display = 'flex';
  },

  closeUserGroupModal() {
    document.getElementById('userGroupModal').style.display = 'none';
    this.selectedUserId = null;
  },

  async saveUserGroup() {
    const groupId = document.getElementById('userGroupSelect').value;

    try {
      await this.apiRequest(`/admin/users/${this.selectedUserId}/group`, {
        method: 'PUT',
        data: { groupId: Number(groupId) }
      });
      this.toast('用户小组已更新', 'success');
      this.closeUserGroupModal();
      await this.loadUsers();
    } catch (error) {
      this.toast('更新失败: ' + error.message, 'error');
    }
  },

  // ==================== Draft Order ====================

  async loadDraftOrder() {
    const groupId = document.getElementById('draftGroupSelect').value;
    const season = document.getElementById('draftSeasonSelect').value;
    const container = document.getElementById('draftOrderList');

    try {
      const result = await this.apiRequest(`/admin/draft-order?groupId=${groupId}&season=${season}`);
      this.draftOrder = result.data || [];
      this.renderDraftOrder();
    } catch (error) {
      container.innerHTML = `<div class="hint-text">加载失败: ${error.message}</div>`;
    }
  },

  renderDraftOrder() {
    const container = document.getElementById('draftOrderList');

    if (this.draftOrder.length === 0) {
      container.innerHTML = '<div class="hint-text">暂无选秀顺序，请先添加用户到小组</div>';
      return;
    }

    container.innerHTML = this.draftOrder.map((item, index) => `
      <div class="draft-item" draggable="true" data-user-id="${item.user_id}" data-index="${index}">
        <span class="drag-handle">⋮⋮</span>
        <span class="draft-order-num">${index + 1}</span>
        <span class="draft-user-name">${item.nickname || item.username || 'Unknown'}</span>
      </div>
    `).join('');

    // Add drag events
    this.initDragAndDrop();
  },

  initDragAndDrop() {
    const items = document.querySelectorAll('.draft-item');
    let draggedItem = null;

    items.forEach(item => {
      item.addEventListener('dragstart', (e) => {
        draggedItem = item;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        draggedItem = null;
        this.updateDraftOrderFromDOM();
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        if (draggedItem && draggedItem !== item) {
          const container = document.getElementById('draftOrderList');
          const allItems = [...container.querySelectorAll('.draft-item')];
          const draggedIndex = allItems.indexOf(draggedItem);
          const targetIndex = allItems.indexOf(item);

          if (draggedIndex < targetIndex) {
            item.parentNode.insertBefore(draggedItem, item.nextSibling);
          } else {
            item.parentNode.insertBefore(draggedItem, item);
          }
        }
      });
    });
  },

  updateDraftOrderFromDOM() {
    const items = document.querySelectorAll('.draft-item');
    const newOrder = [];
    items.forEach((item, index) => {
      const userId = item.dataset.userId;
      const orderItem = this.draftOrder.find(o => String(o.user_id) === userId);
      if (orderItem) {
        newOrder.push({ ...orderItem });
      }
    });
    this.draftOrder = newOrder;
    this.renderDraftOrder();
  },

  async saveDraftOrder() {
    const groupId = document.getElementById('draftGroupSelect').value;
    const season = document.getElementById('draftSeasonSelect').value;

    const orderList = this.draftOrder.map((item, index) => ({
      userId: item.user_id,
      orderIndex: index + 1,
      round: item.round || 1
    }));

    try {
      await this.apiRequest('/admin/draft-order', {
        method: 'PUT',
        data: { groupId: Number(groupId), season: Number(season), orderList }
      });
      this.toast('选秀顺序已保存', 'success');
    } catch (error) {
      this.toast('保存失败: ' + error.message, 'error');
    }
  },

  // ==================== Rosters ====================

  populateRosterUserSelect() {
    const select = document.getElementById('rosterUserSelect');
    select.innerHTML = '<option value="">选择用户...</option>' +
      this.users.map(u => `<option value="${u.id}">${u.nickname || u.username} (${u.id})</option>`).join('');
  },

  async loadUserRoster(userId) {
    if (!userId) {
      document.getElementById('rosterDisplay').innerHTML = '<p class="hint-text">请选择一个用户查看阵容</p>';
      return;
    }

    this.currentRosterUserId = userId;
    const container = document.getElementById('rosterDisplay');

    try {
      const result = await this.apiRequest(`/admin/manager/rosters/${userId}`);
      const roster = result.data || [];
      this.renderRoster(roster);
    } catch (error) {
      container.innerHTML = `<p class="hint-text">加载失败: ${error.message}</p>`;
    }
  },

  renderRoster(roster) {
    const container = document.getElementById('rosterDisplay');

    if (roster.length === 0) {
      container.innerHTML = '<p class="hint-text">该用户暂无阵容数据</p>';
      return;
    }

    const starters = roster.filter(p => p.is_starter);
    const bench = roster.filter(p => !p.is_starter);

    container.innerHTML = `
      <div class="roster-section">
        <div class="roster-section-title">🌟 首发阵容 (${starters.length})</div>
        <div class="roster-players">
          ${starters.map(p => this.renderPlayerCard(p)).join('') || '<p class="hint-text">暂无首发</p>'}
        </div>
      </div>
      <div class="roster-section">
        <div class="roster-section-title">📋 替补阵容 (${bench.length})</div>
        <div class="roster-players">
          ${bench.map(p => this.renderPlayerCard(p)).join('') || '<p class="hint-text">暂无替补</p>'}
        </div>
      </div>
    `;
  },

  renderPlayerCard(player) {
    const typeText = player.player_type === 'rookie' ? '新秀' : '常规';
    const injuredText = player.is_injured ? ' (伤病)' : '';

    return `
      <div class="roster-player-card ${player.is_starter ? 'starter' : ''}">
        <div class="player-info">
          <div class="player-name">${player.player_name || player.player_id}</div>
          <div class="player-type">${typeText}${injuredText}</div>
        </div>
        <div class="player-actions">
          <button class="action-btn ${player.is_starter ? 'danger' : 'success'}"
            onclick="AdminApp.toggleStarter('${player.player_id}', ${!player.is_starter})">
            ${player.is_starter ? '取消首发' : '设为首发'}
          </button>
          <button class="action-btn danger" onclick="AdminApp.removePlayer('${player.player_id}')">移除</button>
        </div>
      </div>
    `;
  },

  openPlayerModal() {
    if (!this.currentRosterUserId) {
      this.toast('请先选择用户', 'error');
      return;
    }
    document.getElementById('playerIdInput').value = '';
    document.getElementById('playerTypeSelect').value = 'regular';
    document.getElementById('isStarterCheckbox').checked = false;
    document.getElementById('playerModal').style.display = 'flex';
  },

  closePlayerModal() {
    document.getElementById('playerModal').style.display = 'none';
  },

  async addPlayerToRoster() {
    const playerId = document.getElementById('playerIdInput').value.trim();
    const playerType = document.getElementById('playerTypeSelect').value;
    const isStarter = document.getElementById('isStarterCheckbox').checked;

    if (!playerId) {
      this.toast('请输入球员ID', 'error');
      return;
    }

    try {
      await this.apiRequest('/admin/manager/rosters/add', {
        method: 'POST',
        data: {
          userId: this.currentRosterUserId,
          playerId,
          playerType,
          isStarter
        }
      });
      this.toast('球员已添加', 'success');
      this.closePlayerModal();
      await this.loadUserRoster(this.currentRosterUserId);
    } catch (error) {
      this.toast('添加失败: ' + error.message, 'error');
    }
  },

  async toggleStarter(playerId, isStarter) {
    try {
      const result = await this.apiRequest(`/admin/manager/rosters/${this.currentRosterUserId}`);
      const roster = result.data || [];

      let starterIds;
      if (isStarter) {
        starterIds = roster.filter(p => p.is_starter).map(p => p.player_id);
        if (!starterIds.includes(playerId)) {
          starterIds.push(playerId);
        }
      } else {
        starterIds = roster.filter(p => p.is_starter && p.player_id !== playerId).map(p => p.player_id);
      }

      await this.apiRequest('/admin/manager/starters/set', {
        method: 'POST',
        data: {
          userId: this.currentRosterUserId,
          starterIds
        }
      });
      this.toast(isStarter ? '已设为首发' : '已取消首发', 'success');
      await this.loadUserRoster(this.currentRosterUserId);
    } catch (error) {
      this.toast('操作失败: ' + error.message, 'error');
    }
  },

  async removePlayer(playerId) {
    this.showConfirm('确定要从阵容中移除该球员吗？', async () => {
      try {
        await this.apiRequest('/admin/manager/rosters/remove', {
          method: 'POST',
          data: {
            userId: this.currentRosterUserId,
            playerId
          }
        });
        this.toast('球员已移除', 'success');
        await this.loadUserRoster(this.currentRosterUserId);
      } catch (error) {
        this.toast('移除失败: ' + error.message, 'error');
      }
    });
  },

  // ==================== Sync ====================

  async syncSchedule() {
    this.log('开始同步赛程...', 'info');
    try {
      const result = await this.apiRequest('/admin/sync-schedule', { method: 'POST' });
      this.log(`赛程同步完成: ${JSON.stringify(result)}`, 'success');
      this.toast('赛程同步完成', 'success');
    } catch (error) {
      this.log(`赛程同步失败: ${error.message}`, 'error');
      this.toast('同步失败', 'error');
    }
  },

  async syncDaily() {
    const date = document.getElementById('syncDateInput').value;
    this.log(`开始同步 ${date} 的数据...`, 'info');
    try {
      const result = await this.apiRequest('/admin/sync', {
        method: 'POST',
        data: { date }
      });
      this.log(`数据同步完成: ${JSON.stringify(result)}`, 'success');
      this.toast('数据同步完成', 'success');
    } catch (error) {
      this.log(`数据同步失败: ${error.message}`, 'error');
      this.toast('同步失败', 'error');
    }
  },

  async computeScores() {
    const date = document.getElementById('computeDateInput').value;
    this.log(`开始计算 ${date} 的得分...`, 'info');
    try {
      const result = await this.apiRequest('/admin/compute', {
        method: 'POST',
        data: { date }
      });
      this.log(`得分计算完成: ${JSON.stringify(result)}`, 'success');
      this.toast('得分计算完成', 'success');
    } catch (error) {
      this.log(`得分计算失败: ${error.message}`, 'error');
      this.toast('计算失败', 'error');
    }
  },

  log(message, type = 'info') {
    const container = document.getElementById('logContent');
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${time}] ${message}`;
    container.insertBefore(entry, container.firstChild);
  },

  // ==================== Utilities ====================

  async apiRequest(url, options = {}) {
    const { method = 'GET', data = null } = options;

    const config = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': this.currentUser?.id || ''
      }
    };

    if (data && method !== 'GET') {
      config.body = JSON.stringify(data);
    }

    const response = await fetch(`${CONFIG.API_BASE}${url}`, config);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Network error' }));
      throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
    }

    return await response.json();
  },

  toast(message, type = '') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  },

  showConfirm(message, onConfirm) {
    document.getElementById('confirmMessage').textContent = message;
    document.getElementById('confirmModal').style.display = 'flex';

    const okBtn = document.getElementById('confirmOkBtn');
    const newOkBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);

    newOkBtn.addEventListener('click', () => {
      this.closeConfirmModal();
      onConfirm();
    });
  },

  closeConfirmModal() {
    document.getElementById('confirmModal').style.display = 'none';
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  AdminApp.init();
});
