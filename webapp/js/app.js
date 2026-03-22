// Main Application

const App = {
  // State
  state: {
    user: null,
    gameList: [],
    loading: true,
    loadingMorePast: false,
    loadingMoreFuture: false,
    activeGameId: null,
    gameLoading: null,
    currentMode: 'regular',
    currentModeId: 1,
    selectedDate: Utils.formatDate(new Date(), 'YYYY-MM-DD'),
    frozenPlayerIds: [],
    selectionInfo: null,
    currentTab: 'schedule',
    dateOptions: [],
    entertainmentExpanded: true
  },

  // DOM Elements cache
  elements: {},

  // Initialize
  async init() {
    this.cacheElements();
    this.bindEvents();
    await this.ensureLogin();
    await this.initTimeline(this.state.selectedDate);
  },

  // Cache DOM elements
  cacheElements() {
    this.elements = {
      // Header
      currentModeName: document.getElementById('currentModeName'),
      currentSelectionName: document.getElementById('currentSelectionName'),
      selectionLockTime: document.getElementById('selectionLockTime'),
      lockTimeRow: document.getElementById('lockTimeRow'),
      lockStatus: document.getElementById('lockStatus'),

      // Timeline
      timelineScroll: document.getElementById('timelineScroll'),
      timelineContent: document.getElementById('timelineContent'),
      loadingContainer: document.getElementById('loadingContainer'),

      // Buttons
      syncScheduleBtn: document.getElementById('syncScheduleBtn'),
      scrollToTodayBtn: document.getElementById('scrollToTodayBtn'),
      refreshScoresBtn: document.getElementById('refreshScoresBtn'),

      // Tab Bar
      openModePanel: document.getElementById('openModePanel'),
      selectedDateLabel: document.getElementById('selectedDateLabel'),
      tabSelectionText: document.getElementById('tabSelectionText'),

      // Mode Sheet
      modeSheetMask: document.getElementById('modeSheetMask'),
      modeSheet: document.getElementById('modeSheet'),
      closeModePanel: document.getElementById('closeModePanel'),
      dateTagList: document.getElementById('dateTagList'),
      regularSelection: document.getElementById('regularSelection'),
      plus58Selection: document.getElementById('plus58Selection'),
      minus58Selection: document.getElementById('minus58Selection'),
      lockTip: document.getElementById('lockTip'),
      entertainmentGroupHeader: document.getElementById('entertainmentGroupHeader'),
      entertainmentExpandIcon: document.getElementById('entertainmentExpandIcon'),
      entertainmentSubList: document.getElementById('entertainmentSubList'),

      // Pages
      profilePage: document.getElementById('profilePage'),
      historyPage: document.getElementById('historyPage'),
      leaderboardPage: document.getElementById('leaderboardPage'),

      // Profile
      userAvatar: document.getElementById('userAvatar'),
      userNickname: document.getElementById('userNickname'),
      userGroupName: document.getElementById('userGroupName'),
      userTotalScore: document.getElementById('userTotalScore'),
      userTotalBonus: document.getElementById('userTotalBonus'),
      userRank: document.getElementById('userRank'),
      frozenList: document.getElementById('frozenList'),
      historyMenuItem: document.getElementById('historyMenuItem'),
      leaderboardMenuItem: document.getElementById('leaderboardMenuItem'),
      historyBackBtn: document.getElementById('historyBackBtn'),
      leaderboardBackBtn: document.getElementById('leaderboardBackBtn'),
      historyList: document.getElementById('historyList'),
      leaderboardList: document.getElementById('leaderboardList'),
      logoutBtn: document.getElementById('logoutBtn'),

      // Scoreboard
      scoreboardMenuItem: document.getElementById('scoreboardMenuItem'),
      scoreboardPage: document.getElementById('scoreboardPage'),
      scoreboardBackBtn: document.getElementById('scoreboardBackBtn'),
      scoreboardDateInput: document.getElementById('scoreboardDateInput'),
      scoreboardTabs: document.getElementById('scoreboardTabs'),
      scoreboardFormula: document.getElementById('scoreboardFormula'),
      scoreboardList: document.getElementById('scoreboardList'),

      // User Picks Modal
      userPicksModal: document.getElementById('userPicksModal'),
      userPicksOverlay: document.getElementById('userPicksOverlay'),
      userPicksClose: document.getElementById('userPicksClose'),
      userPicksTitle: document.getElementById('userPicksTitle'),
      userPicksBody: document.getElementById('userPicksBody'),

      // Auth
      authModal: document.getElementById('authModal'),
      authTabLogin: document.getElementById('authTabLogin'),
      authTabRegister: document.getElementById('authTabRegister'),
      loginForm: document.getElementById('loginForm'),
      registerForm: document.getElementById('registerForm'),
      loginUsername: document.getElementById('loginUsername'),
      loginPassword: document.getElementById('loginPassword'),
      loginSubmitBtn: document.getElementById('loginSubmitBtn'),
      forgotPasswordBtn: document.getElementById('forgotPasswordBtn'),
      regUsername: document.getElementById('regUsername'),
      regPassword: document.getElementById('regPassword'),
      regConfirmPassword: document.getElementById('regConfirmPassword'),
      regNickname: document.getElementById('regNickname'),
      registerSubmitBtn: document.getElementById('registerSubmitBtn'),

      // Nickname modal
      nicknameModal: document.getElementById('nicknameModal'),
      nicknameInput: document.getElementById('nicknameInput'),
      nicknameCancelBtn: document.getElementById('nicknameCancelBtn'),
      nicknameConfirmBtn: document.getElementById('nicknameConfirmBtn'),

      // Avatar
      avatarFileInput: document.getElementById('avatarFileInput'),
      avatarWrapper: document.getElementById('avatarWrapper'),
      editNickname: document.getElementById('editNickname'),

      // Toast
      toast: document.getElementById('toast'),

      // Manager
      managerPage: document.getElementById('managerPage'),
      managerModal: document.getElementById('managerModal'),
      managerOverlay: document.getElementById('managerOverlay'),
      managerClose: document.getElementById('managerClose'),
      managerTitle: document.getElementById('managerTitle'),
      managerBody: document.getElementById('managerBody'),
      managerConfirmBtn: document.getElementById('managerConfirmBtn'),
      managerCancelBtn: document.getElementById('managerCancelBtn')
    };
  },

  // Bind Events
  bindEvents() {
    // Tab bar
    document.querySelectorAll('.tab-bar-item[data-page]').forEach(item => {
      item.addEventListener('click', (e) => this.handleTabSwitch(e.currentTarget.dataset.page));
    });

    // Mode panel
    this.elements.openModePanel.addEventListener('click', () => this.showModePanel());
    this.elements.modeSheetMask.addEventListener('click', () => this.hideModePanel());
    this.elements.closeModePanel.addEventListener('click', () => this.hideModePanel());

    // Entertainment mode group toggle
    if (this.elements.entertainmentGroupHeader) {
      this.elements.entertainmentGroupHeader.addEventListener('click', () => this.toggleEntertainmentMode());
    }

    // Mode items
    document.querySelectorAll('.mode-item').forEach(item => {
      item.addEventListener('click', (e) => this.handleModeSelect(e.currentTarget.dataset.mode));
    });

    // Buttons
    this.elements.syncScheduleBtn.addEventListener('click', () => this.handleSyncSchedule());
    this.elements.scrollToTodayBtn.addEventListener('click', () => this.scrollToToday());

    // Init floating button drag
    this.initDraggableRefreshBtn();

    // Profile menu
    this.elements.historyMenuItem.addEventListener('click', () => this.showHistoryPage());
    this.elements.leaderboardMenuItem.addEventListener('click', () => this.showLeaderboardPage());
    this.elements.scoreboardMenuItem.addEventListener('click', () => this.showScoreboardPage());
    this.elements.historyBackBtn.addEventListener('click', () => this.hideHistoryPage());
    this.elements.leaderboardBackBtn.addEventListener('click', () => this.hideLeaderboardPage());
    this.elements.scoreboardBackBtn.addEventListener('click', () => this.hideScoreboardPage());
    this.elements.logoutBtn.addEventListener('click', () => this.handleLogout());

    // User picks modal
    this.elements.userPicksOverlay.addEventListener('click', () => this.hideUserPicks());
    this.elements.userPicksClose.addEventListener('click', () => this.hideUserPicks());

    // Manager mode
    this.elements.managerOverlay.addEventListener('click', () => this.hideManagerModal());
    this.elements.managerClose.addEventListener('click', () => this.hideManagerModal());
    this.elements.managerConfirmBtn.addEventListener('click', () => this.handleManagerConfirm());
    this.elements.managerCancelBtn.addEventListener('click', () => this.hideManagerModal());

    // Manager list events (delegation)
    document.addEventListener('click', (e) => {
      // Manager item click
      const managerItem = e.target.closest('.manager-item');
      if (managerItem) {
        const id = managerItem.dataset.id;
        this.openManagerModal(id);
        return;
      }

      // Manager action buttons
      const actionBtn = e.target.closest('.manager-action-btn');
      if (actionBtn) {
        const action = actionBtn.dataset.action;
        const id = actionBtn.dataset.id;
        if (action === 'accept') {
          this.openManagerModal(id);
        } else if (action === 'reject') {
          this.handleManagerReject(id);
        }
      }
    });

    // Profile edit
    this.elements.editNickname.addEventListener('click', () => this.showNicknameModal());
    this.elements.avatarWrapper.addEventListener('click', () => this.elements.avatarFileInput.click());
    this.elements.avatarFileInput.addEventListener('change', (e) => this.handleAvatarUpload(e));
    this.elements.nicknameCancelBtn.addEventListener('click', () => this.hideNicknameModal());
    this.elements.nicknameConfirmBtn.addEventListener('click', () => this.handleNicknameSubmit());
    this.elements.nicknameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleNicknameSubmit();
    });

    // Auth tabs
    this.elements.authTabLogin.addEventListener('click', () => this.switchAuthTab('login'));
    this.elements.authTabRegister.addEventListener('click', () => this.switchAuthTab('register'));
    this.elements.loginSubmitBtn.addEventListener('click', () => this.handleAuthLogin());
    this.elements.registerSubmitBtn.addEventListener('click', () => this.handleRegister());
    this.elements.forgotPasswordBtn.addEventListener('click', () => {
      alert('请联系管理员重置密码。');
    });
    this.elements.loginPassword.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleAuthLogin();
    });
    this.elements.regNickname.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleRegister();
    });
    // Auto-fill nickname from username
    this.elements.regUsername.addEventListener('input', () => {
      if (!this.elements.regNickname.value || this.elements.regNickname.value === this._lastAutoNickname) {
        this._lastAutoNickname = this.elements.regUsername.value;
        this.elements.regNickname.value = this.elements.regUsername.value;
      }
    });

    // Scroll events for infinite scroll
    this.elements.timelineScroll.addEventListener('scroll', Utils.debounce(() => {
      const { scrollTop, scrollHeight, clientHeight } = this.elements.timelineScroll;

      if (scrollTop < 50) {
        this.handleScrollToUpper();
      }

      if (scrollTop + clientHeight >= scrollHeight - 50) {
        this.handleScrollToLower();
      }
    }, 200));
  },

  // Auth
  _lastAutoNickname: '',

  async ensureLogin() {
    let user = Utils.storage.get('user');

    if (!user) {
      this.showAuthModal();
      return new Promise((resolve) => {
        this._loginResolve = resolve;
      });
    }

    this.state.user = user;
    return user;
  },

  showAuthModal() {
    this.elements.authModal.style.display = 'flex';
    this.switchAuthTab('login');
    this.elements.loginUsername.focus();
  },

  hideAuthModal() {
    this.elements.authModal.style.display = 'none';
  },

  switchAuthTab(tab) {
    const isLogin = tab === 'login';
    this.elements.authTabLogin.classList.toggle('active', isLogin);
    this.elements.authTabRegister.classList.toggle('active', !isLogin);
    this.elements.loginForm.style.display = isLogin ? 'block' : 'none';
    this.elements.registerForm.style.display = isLogin ? 'none' : 'block';
    if (isLogin) {
      this.elements.loginUsername.focus();
    } else {
      this.elements.regUsername.focus();
    }
  },

  async handleAuthLogin() {
    const username = this.elements.loginUsername.value.trim();
    const password = this.elements.loginPassword.value;

    if (!username) { this.showToast('请输入用户ID'); return; }
    if (!password) { this.showToast('请输入密码'); return; }

    this.elements.loginSubmitBtn.disabled = true;
    this.elements.loginSubmitBtn.textContent = '登录中...';

    try {
      const user = await API.authLogin(username, password);
      Utils.storage.set('user', user);
      this.state.user = user;
      this.hideAuthModal();
      if (this._loginResolve) this._loginResolve(user);
    } catch (error) {
      this.showToast(error.message || '登录失败');
    } finally {
      this.elements.loginSubmitBtn.disabled = false;
      this.elements.loginSubmitBtn.textContent = '登 录';
    }
  },

  async handleRegister() {
    const username = this.elements.regUsername.value.trim();
    const password = this.elements.regPassword.value;
    const confirmPassword = this.elements.regConfirmPassword.value;
    const nickname = this.elements.regNickname.value.trim();

    if (!username) { this.showToast('请输入用户ID'); return; }
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
      this.showToast('用户ID仅支持3-20位英文、数字、下划线');
      return;
    }
    if (!password || password.length < 6) { this.showToast('密码至少6位'); return; }
    if (password !== confirmPassword) { this.showToast('两次密码不一致'); return; }

    this.elements.registerSubmitBtn.disabled = true;
    this.elements.registerSubmitBtn.textContent = '注册中...';

    try {
      const user = await API.register(username, password, confirmPassword, nickname || username);
      Utils.storage.set('user', user);
      this.state.user = user;
      this.hideAuthModal();
      this.showToast('注册成功！');
      if (this._loginResolve) this._loginResolve(user);
    } catch (error) {
      this.showToast(error.message || '注册失败');
    } finally {
      this.elements.registerSubmitBtn.disabled = false;
      this.elements.registerSubmitBtn.textContent = '注 册';
    }
  },

  initDraggableRefreshBtn() {
    const btn = this.elements.refreshScoresBtn;
    let isDragging = false;
    let startX = 0, startY = 0;
    let initialX = 0, initialY = 0;

    const savedPos = Utils.storage.get('refreshBtnPos');
    if (savedPos) {
      btn.style.right = 'auto';
      btn.style.bottom = 'auto';
      btn.style.left = savedPos.x + 'px';
      btn.style.top = savedPos.y + 'px';
    }

    btn.addEventListener('pointerdown', (e) => {
      isDragging = false;
      startX = e.clientX;
      startY = e.clientY;
      const rect = btn.getBoundingClientRect();
      initialX = rect.left;
      initialY = rect.top;
      btn.classList.add('dragging');
      btn.setPointerCapture(e.pointerId);
    });

    btn.addEventListener('pointermove', (e) => {
      if (!btn.hasPointerCapture(e.pointerId)) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        isDragging = true;
        btn.style.right = 'auto';
        btn.style.bottom = 'auto';
        let newX = initialX + dx;
        let newY = initialY + dy;

        const maxW = window.innerWidth - btn.offsetWidth;
        const maxH = window.innerHeight - btn.offsetHeight;
        newX = Math.max(0, Math.min(newX, maxW));
        newY = Math.max(0, Math.min(newY, maxH));

        btn.style.left = newX + 'px';
        btn.style.top = newY + 'px';
      }
    });

    btn.addEventListener('pointerup', (e) => {
      btn.classList.remove('dragging');
      btn.releasePointerCapture(e.pointerId);
      if (isDragging) {
        Utils.storage.set('refreshBtnPos', {
          x: parseInt(btn.style.left),
          y: parseInt(btn.style.top)
        });
      } else {
        this.handleRefreshToday();
      }
    });
  },

  handleLogout() {
    if (!confirm('确定要退出登录吗？')) return;
    Utils.storage.remove('user');
    this.state.user = null;
    this.handleTabSwitch('schedule');
    location.reload();
  },

  // Timeline
  async initTimeline(focusDate) {
    this.showLoading();

    try {
      // 默认加载3天：t-1 + t + t+1
      const start = this.addDays(focusDate, -1);
      const end = this.addDays(focusDate, 1);

      await this.fetchGameRange(start, end, 'initial');

      // Scroll to focus date
      setTimeout(() => {
        const dateEl = document.getElementById(`date-${focusDate}`);
        if (dateEl) {
          dateEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);

      // Load date options
      await this.loadDateOptions();

      // Load current selections
      await this.fetchCurrentSelections(focusDate);
      await this.fetchFrozenList(this.state.currentModeId);

    } catch (error) {
      console.error('Init timeline error:', error);
      this.showToast('加载失败');
    } finally {
      this.hideLoading();
      this.state.loading = false;
    }
  },

  async fetchGameRange(start, end, type = 'initial') {
    const res = await API.getGamesRange(start, end);

    if (!res) return;

    const newGroups = res.map(g => {
      const d = new Date(g.date);
      return {
        ...g,
        dateStr: Utils.formatDate(d, 'MM月DD日'),
        weekStr: Utils.formatDate(d, 'WW'),
        isToday: Utils.isToday(g.date),
        games: g.games.map(game => Utils.formatGame(game))
      };
    });

    if (type === 'initial') {
      this.state.gameList = newGroups;
    } else if (type === 'prepend') {
      this.state.gameList = [...newGroups, ...this.state.gameList];
      this.state.loadingMorePast = false;
    } else if (type === 'append') {
      this.state.gameList = [...this.state.gameList, ...newGroups];
      this.state.loadingMoreFuture = false;
    }

    this.renderTimeline();
  },

  renderTimeline() {
    let html = '';

    this.state.gameList.forEach(dayGroup => {
      html += `
        <div class="date-group" id="date-${dayGroup.date}">
          <div class="date-header ${dayGroup.isToday ? 'is-today' : ''}">
            <span class="day-text">${dayGroup.dateStr}</span>
            <span class="week-text">${dayGroup.weekStr}</span>
            ${dayGroup.isToday ? '<span class="today-tag">今日</span>' : ''}
          </div>
      `;

      if (dayGroup.games.length) {
        dayGroup.games.forEach(game => {
          html += this.renderGameCard(game, dayGroup.date);
        });
      } else {
        html += `
          <div class="no-games-day">本日无比赛</div>
        `;
      }

      html += '</div>';
    });

    // Add loading indicators
    if (this.state.loadingMorePast) {
      html = `<div class="loading-more"><div class="spinner"></div></div>` + html;
    }

    if (this.state.loadingMoreFuture) {
      html += `<div class="loading-more"><div class="spinner"></div></div>`;
    }

    this.elements.timelineContent.innerHTML = html;
    this.bindGameCardEvents();
  },

  renderGameCard(game, date) {
    const isExpanded = this.state.activeGameId === game.external_id;
    const hasScore = game.status === 'Final' || game.status === 'InProgress' || (game.home_score ?? 0) > 0;

    let html = `
      <div class="game-card ${isExpanded ? 'expanded' : ''}" data-game-id="${game.external_id}" data-date="${date}" data-has-players="${game.hasPlayers}">
        <div class="game-summary">
          <div class="team-block visitor">
            <img class="team-logo" src="https://cdn.nba.com/logos/nba/${game.visitor_team_id}/global/L/logo.svg" alt="${game.visitor_team_name}">
            <div class="team-name">${game.visitor_team_name}</div>
          </div>

          <div class="score-board">
            <div class="score-line">
              ${hasScore ? `
                <span class="score-num ${game.status === 'InProgress' ? 'live' : ''} ${game.visitor_score > game.home_score ? 'win' : ''}">${game.visitor_score}</span>
                <span class="score-divider">:</span>
                <span class="score-num ${game.status === 'InProgress' ? 'live' : ''} ${game.home_score > game.visitor_score ? 'win' : ''}">${game.home_score}</span>
              ` : `<span class="vs-text">VS</span>`}
            </div>
            <div class="game-status-row">
              <span class="status-text">${game.status}</span>
              <span class="time-text">${game.tipoff_time_short}</span>
            </div>
          </div>

          <div class="team-block home">
            <img class="team-logo" src="https://cdn.nba.com/logos/nba/${game.home_team_id}/global/L/logo.svg" alt="${game.home_team_name}">
            <div class="team-name">${game.home_team_name}</div>
          </div>

          <div class="expand-tag">${isExpanded ? '▲' : '▼'}</div>
        </div>
    `;

    if (isExpanded) {
      html += this.renderPlayersSection(game, date);
    }

    html += '</div>';
    return html;
  },

  renderPlayersSection(game, date) {
    const isLive = game.status === 'InProgress' || game.status === 'Final';
    const sectionTitle = isLive ? '技术统计' : '选择球员';

    let html = `
      <div class="players-section">
        <div class="divider"></div>
        <div class="section-label">
          <span>${sectionTitle} (${CONFIG.MODE_NAMES[this.state.currentModeId]})</span>
          <span class="refresh-text sync-day-btn" data-date="${date}">刷新</span>
        </div>
    `;

    if (this.state.gameLoading === game.external_id) {
      html += `
        <div class="card-loading">
          <div class="spinner"></div>
          <span>正在同步数据...</span>
        </div>
      `;
    } else if (game.hasPlayers) {
      html += `
        <div class="players-columns">
          ${this.renderTeamColumn(game, 'visitor', date)}
          ${this.renderTeamColumn(game, 'home', date)}
        </div>
      `;
    } else {
      html += `
        <div class="no-players">
          <span>暂无数据</span>
          <button class="mini-sync-btn sync-day-btn" data-date="${date}">刷新数据</button>
        </div>
      `;
    }

    html += '</div>';
    return html;
  },

  renderTeamColumn(game, type, date) {
    const isVisitor = type === 'visitor';
    const teamName = isVisitor ? game.visitor_team_name : game.home_team_name;
    const players = isVisitor ? game.visitorPlayersSorted : game.homePlayersSorted;
    const columnClass = isVisitor ? 'visitor-column' : 'home-column';
    const subText = isVisitor ? '客队' : '主队';
    const isLive = game.status === 'InProgress' || game.status === 'Final';

    let html = `
      <div class="team-column ${columnClass}">
        <div class="team-column-header">
          <span class="team-column-name">${teamName}</span>
          <span class="team-column-sub">${subText}</span>
        </div>
        <div class="team-column-list">
    `;

    if (players.length) {
      players.forEach(player => {
        const isFrozen = this.state.frozenPlayerIds.includes(player.player_id);
        html += `
          <div class="player-chip ${isFrozen ? 'disabled' : ''}" data-player='${JSON.stringify(player)}' data-date="${date}">
            <div class="player-info">
              <div class="p-name">${player.player_name}</div>
              <div class="p-team">${player.team_name}</div>
              <div class="p-avg-inline">均 ${player.seasonAvgDisplay || '--'}</div>
            </div>
            <div class="p-stat">
              ${isLive ? `
                <span class="p-live-score ${player.stats_points >= 10 ? 'high' : ''}">${player.stats_points}</span>
                <span class="p-live-sub">分</span>
              ` : `<span class="p-avg">均 ${player.seasonAvgDisplay || '--'}</span>`}
            </div>
          </div>
        `;
      });
    } else {
      html += `<div class="no-players-mini">暂无数据</div>`;
    }

    html += '</div></div>';
    return html;
  },

  bindGameCardEvents() {
    // Game card toggle
    document.querySelectorAll('.game-summary').forEach(el => {
      el.addEventListener('click', (e) => {
        const card = e.currentTarget.closest('.game-card');
        const gameId = card.dataset.gameId;
        const date = card.dataset.date;
        const hasPlayers = card.dataset.hasPlayers === 'true';
        this.toggleGame(gameId, date, hasPlayers);
      });
    });

    // Sync day buttons
    document.querySelectorAll('.sync-day-btn').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const date = e.currentTarget.dataset.date;
        this.syncGameData(date);
      });
    });

    // Player chips
    document.querySelectorAll('.player-chip:not(.disabled)').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const playerData = JSON.parse(e.currentTarget.dataset.player);
        const date = e.currentTarget.dataset.date;
        this.handleSelectPlayer(playerData, date);
      });
    });
  },

  toggleGame(gameId, date, hasPlayers) {
    if (this.state.activeGameId === gameId) {
      this.state.activeGameId = null;
    } else {
      this.state.activeGameId = gameId;

      if (!hasPlayers) {
        this.syncGameData(date);
      }
    }
    this.renderTimeline();
  },

  async syncGameData(date) {
    const gameId = this.state.activeGameId;
    this.state.gameLoading = gameId;
    this.renderTimeline();

    try {
      await API.syncGames(date);
      await this.refreshDateInList(date);
    } catch (error) {
      this.showToast('同步失败');
    } finally {
      this.state.gameLoading = null;
      this.renderTimeline();
    }
  },

  async refreshDateInList(date) {
    const res = await API.getGamesRange(date, date);
    if (!res || !res.length) return;

    const newGroup = res.map(g => {
      const d = new Date(g.date);
      return {
        ...g,
        dateStr: Utils.formatDate(d, 'MM月DD日'),
        weekStr: Utils.formatDate(d, 'WW'),
        isToday: Utils.isToday(g.date),
        games: g.games.map(game => Utils.formatGame(game))
      };
    });

    const idx = this.state.gameList.findIndex(g => g.date === date);
    if (idx >= 0) {
      this.state.gameList.splice(idx, 1, ...newGroup);
    } else {
      this.state.gameList.push(...newGroup);
      this.state.gameList.sort((a, b) => a.date.localeCompare(b.date));
    }
    this.renderTimeline();

    // Re-fetch current selections so right panel un-locks or updates score if selected date matches
    if (this.state.selectedDate === date) {
      this.fetchCurrentSelections(date);
    }
  },

  async handleSelectPlayer(player, date) {
    if (!this.state.user) {
      this.showToast('请先登录');
      return;
    }

    if (this.state.selectionInfo &&
      this.state.selectionInfo.date === date &&
      this.state.selectionInfo.canModify === false) {
      this.showToast('已超过锁定时间，无法修改');
      return;
    }

    if (this.state.frozenPlayerIds.includes(player.player_id)) {
      this.showToast('该球员在冷冻期');
      return;
    }

    const confirmed = confirm(`确认以「${CONFIG.MODE_NAMES[this.state.currentModeId]}」玩法锁定 ${player.player_name}？`);
    if (!confirmed) return;

    try {
      await API.submitSelection({
        userId: this.state.user.id,
        playerId: player.player_id,
        playMode: this.state.currentModeId,
        gameDate: date
      });

      this.showToast('锁定成功');
      await this.fetchFrozenList(this.state.currentModeId);
      await this.fetchCurrentSelections(date);
    } catch (error) {
      this.showToast(error.message || '提交失败');
    }
  },

  async fetchCurrentSelections(date) {
    if (!this.state.user) return;

    try {
      const targetDate = date || this.state.selectedDate || Utils.formatDate(new Date(), 'YYYY-MM-DD');
      const res = await API.getCurrentSelections(this.state.user.id, targetDate);
      const currentSelection = res?.modes ? res.modes[String(this.state.currentModeId)] : null;

      this.state.selectionInfo = res;

      this.elements.currentSelectionName.textContent = currentSelection ? currentSelection.player_name : '未选择';

      if (res?.deadline) {
        this.elements.lockTimeRow.style.display = 'flex';
        this.elements.selectionLockTime.textContent = Utils.formatDate(new Date(res.deadline), 'MM-DD HH:mm');
        this.elements.lockStatus.textContent = res.canModify === false ? '已锁定' : '';
      } else {
        this.elements.lockTimeRow.style.display = 'none';
      }

      // Update tab bar
      this.elements.tabSelectionText.textContent = currentSelection ? `已选：${currentSelection.player_name}` : '未选择';

      // Update mode panel selections
      this.updateModePanelSelections(res);

    } catch (error) {
      console.error('Fetch selections error:', error);
    }
  },

  updateModePanelSelections(res) {
    const modes = res?.modes || {};
    const canModify = res?.canModify !== false;

    this._updateModeRow('regular', 'regularSelection', modes['1'], canModify);
    this._updateModeRow('plus58', 'plus58Selection', modes['2'], canModify);
    this._updateModeRow('minus58', 'minus58Selection', modes['3'], canModify);

    if (!canModify) {
      this.elements.lockTip.style.display = 'block';
    } else {
      this.elements.lockTip.style.display = 'none';
    }
  },

  _updateModeRow(modeKey, selectionElId, selection, canModify) {
    const el = this.elements[selectionElId];
    if (!el) return;

    if (selection) {
      el.textContent = `已选：${selection.player_name}`;
      el.classList.add('has-selection');
    } else {
      el.textContent = '未选择';
      el.classList.remove('has-selection');
    }

    const modeItem = el.closest('.mode-item');
    if (!modeItem) return;

    const existingBtn = modeItem.querySelector('.mode-delete-btn');
    if (existingBtn) existingBtn.remove();

    if (selection && canModify) {
      const btn = document.createElement('button');
      btn.className = 'mode-delete-btn';
      btn.textContent = '✕';
      btn.dataset.mode = modeKey;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleDeleteSelection(modeKey);
      });
      modeItem.appendChild(btn);
    }
  },

  async handleDeleteSelection(modeKey) {
    const modeId = CONFIG.MODE_MAP[modeKey];
    if (!modeId || !this.state.user) return;

    const confirmed = confirm('确定要取消当前球员选择吗？');
    if (!confirmed) return;

    try {
      await API.deleteSelection({
        userId: this.state.user.id,
        playMode: modeId,
        gameDate: this.state.selectedDate,
      });
      this.showToast('已取消选择');
      await this.fetchCurrentSelections(this.state.selectedDate);
      await this.fetchFrozenList(this.state.currentModeId);
    } catch (error) {
      this.showToast(error.message || '操作失败');
    }
  },

  async fetchFrozenList(modeId) {
    if (!this.state.user) return;

    try {
      const list = await API.getFrozenPlayers(this.state.user.id, modeId);
      this.state.frozenPlayerIds = (list || []).map(item => item.player_id);
    } catch (error) {
      console.error('Fetch frozen error:', error);
    }
  },

  // Mode Panel
  _entertainmentExpanded: false,

  async showModePanel() {
    await this.loadDateOptions();
    await this.fetchCurrentSelections(this.state.selectedDate);
    this.elements.modeSheetMask.classList.add('show');
    this.elements.modeSheet.classList.add('show');
    
    // 绑定娱乐模式分组点击事件
    this.bindEntertainmentGroup();
  },

  bindEntertainmentGroup() {
    const header = document.getElementById('entertainmentGroupHeader');
    const subList = document.getElementById('entertainmentSubList');
    const expandIcon = document.getElementById('entertainmentExpandIcon');
    
    if (!header || !subList || !expandIcon) return;
    
    // 移除旧的事件监听器
    const newHeader = header.cloneNode(true);
    header.parentNode.replaceChild(newHeader, header);
    
    newHeader.addEventListener('click', () => {
      this._entertainmentExpanded = !this._entertainmentExpanded;
      
      if (this._entertainmentExpanded) {
        subList.classList.add('show');
        expandIcon.classList.add('expanded');
      } else {
        subList.classList.remove('show');
        expandIcon.classList.remove('expanded');
      }
    });
  },

  hideModePanel() {
    this.elements.modeSheetMask.classList.remove('show');
    this.elements.modeSheet.classList.remove('show');
  },

  async loadDateOptions() {
    if (this.state.dateOptions.length > 0) return;

    try {
      const dates = await API.getUpcomingDates();
      const options = (dates || []).map(date => {
        const d = new Date(date);
        const label = Utils.isToday(date)
          ? `今日 ${Utils.formatDate(d, 'MM-DD')}`
          : `${Utils.formatDate(d, 'MM-DD')} ${Utils.formatDate(d, 'WW')}`;
        return { date, label };
      });

      this.state.dateOptions = options;
      this.renderDateOptions();
    } catch (error) {
      console.error('Load date options error:', error);
    }
  },

  renderDateOptions() {
    let html = '';

    this.state.dateOptions.forEach(option => {
      const isActive = option.date === this.state.selectedDate;
      html += `
        <div class="date-tag ${isActive ? 'active' : ''}" data-date="${option.date}">
          ${option.label}
        </div>
      `;
    });

    if (!this.state.dateOptions.length) {
      html = '<div class="date-empty">暂无可选比赛日</div>';
    }

    this.elements.dateTagList.innerHTML = html;

    // Bind events
    document.querySelectorAll('.date-tag').forEach(el => {
      el.addEventListener('click', (e) => {
        this.selectDate(e.currentTarget.dataset.date);
      });
    });
  },

  selectDate(date) {
    this.state.selectedDate = date;
    const option = this.state.dateOptions.find(o => o.date === date);
    this.elements.selectedDateLabel.textContent = option ? option.label : Utils.formatDate(new Date(date), 'MM-DD');
    this.renderDateOptions();
    this.fetchCurrentSelections(date);
    this.fetchFrozenList(this.state.currentModeId);
  },

  handleModeSelect(modeKey) {
    // 经理模式特殊处理
    if (modeKey === 'manager') {
      this.state.currentMode = 'manager';
      this.hideModePanel();
      this.showManagerPage();
      return;
    }

    const modeId = CONFIG.MODE_MAP[modeKey];
    if (!modeId) return;

    if (this.state.selectionInfo?.canModify === false) {
      this.showToast('今日已锁定');
      return;
    }

    this.state.currentMode = modeKey;
    this.state.currentModeId = modeId;
    this.elements.currentModeName.textContent = CONFIG.MODE_NAMES[modeId];

    this.hideModePanel();
    this.fetchCurrentSelections(this.state.selectedDate);
    this.fetchFrozenList(modeId);
  },

  // Infinite scroll
  handleScrollToUpper() {
    if (this.state.loadingMorePast || !this.state.gameList.length) return;
    this.state.loadingMorePast = true;

    const firstDate = this.state.gameList[0].date;
    const start = this.addDays(firstDate, -4);
    const end = this.addDays(firstDate, -1);

    this.fetchGameRange(start, end, 'prepend');
  },

  handleScrollToLower() {
    if (this.state.loadingMoreFuture || !this.state.gameList.length) return;
    this.state.loadingMoreFuture = true;

    const lastDate = this.state.gameList[this.state.gameList.length - 1].date;
    const start = this.addDays(lastDate, 1);
    const end = this.addDays(lastDate, 4);

    this.fetchGameRange(start, end, 'append');
  },

  // Actions
  async handleSyncSchedule() {
    // Check if user is admin
    const user = this.state.user;
    if (!user || !user.is_admin) {
      this.showToast('需要管理员权限');
      return;
    }

    this.showToast('正在更新赛程...');

    try {
      const res = await API.syncSchedule();
      const count = res.games || res.totalGames || 0;
      this.showToast(`已更新${count}场比赛`);

      const today = Utils.formatDate(new Date(), 'YYYY-MM-DD');
      await this.initTimeline(today);
    } catch (error) {
      this.showToast('更新失败');
    }
  },

  scrollToToday() {
    const today = Utils.formatDate(new Date(), 'YYYY-MM-DD');
    const inList = this.state.gameList.find(g => g.date === today);

    if (!inList) {
      this.initTimeline(today);
    } else {
      const dateEl = document.getElementById(`date-${today}`);
      if (dateEl) {
        dateEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  },

  async handleRefreshToday() {
    const btn = this.elements.refreshScoresBtn;
    if (btn.classList.contains('spinning')) return;

    btn.classList.add('spinning');
    const today = Utils.formatDate(new Date(), 'YYYY-MM-DD');
    const yesterday = this.addDays(today, -1);

    try {
      const resToday = await API.refreshScores(today);
      const resYesterday = await API.refreshScores(yesterday);

      const totalUpdated = (resToday?.updated || 0) + (resYesterday?.updated || 0);

      if (totalUpdated > 0) {
        this.showToast(`已刷新${totalUpdated}场比赛`);
        await this.refreshDateInList(today);
        if (this.state.selectedDate === yesterday) {
          await this.refreshDateInList(yesterday);
        }
        await this.updateUserProfile();
      } else {
        this.showToast('比分已同步');
        // Still fetch it just in case!
        await this.updateUserProfile();
      }
    } catch (error) {
      this.showToast('刷新失败');
    } finally {
      setTimeout(() => btn.classList.remove('spinning'), 500);
    }
  },

  // Tab switching
  handleTabSwitch(page) {
    document.querySelectorAll('.tab-bar-item .text').forEach(el => el.classList.remove('active'));
    const clickedTab = document.querySelector(`.tab-bar-item[data-page="${page}"] .text`);
    if (clickedTab) clickedTab.classList.add('active');

    this.elements.profilePage.style.display = 'none';
    this.elements.historyPage.style.display = 'none';
    this.elements.leaderboardPage.style.display = 'none';
    this.elements.scoreboardPage.style.display = 'none';
    this.elements.managerPage.style.display = 'none';

    if (page === 'schedule') {
      this.elements.timelineScroll.style.display = 'block';
      document.querySelector('.header').style.display = 'block';
    } else if (page === 'profile') {
      this.elements.timelineScroll.style.display = 'none';
      document.querySelector('.header').style.display = 'none';
      this.showProfile();
    } else if (page === 'manager') {
      this.elements.timelineScroll.style.display = 'none';
      document.querySelector('.header').style.display = 'none';
      this.showManagerPage();
    }

    this.state.currentTab = page;
  },

  async updateUserProfile() {
    if (!this.state.user) return;
    try {
      const res = await API.getProfile(this.state.user.id);
      if (res) {
        this.state.user = { ...this.state.user, ...res };
        Utils.storage.set('user', this.state.user);
        if (this.state.currentTab === 'profile') {
          this.showProfile();
        }
      }
    } catch (e) { }
  },

  // Profile
  async showProfile() {
    this.elements.profilePage.style.display = 'block';

    if (this.state.user) {
      this.elements.userNickname.textContent = this.state.user.nickname || '球迷';
      this.elements.userAvatar.src = this._resolveAvatarUrl(this.state.user.avatarUrl);
      this.elements.userTotalScore.textContent = Utils.formatScore(this.state.user.totalScore || 0);
      if (this.elements.userTotalBonus) {
        this.elements.userTotalBonus.textContent = Utils.formatScore(this.state.user.bonus || 0);
      }
      if (this.elements.userGroupName) {
        this.elements.userGroupName.textContent = this.state.user.groupName || '默认小组';
      }

      this.loadUserRank();
      this.loadFrozenPlayers();
    }
  },

  _resolveAvatarUrl(url) {
    if (!url) return 'https://img.yzcdn.cn/vant/cat.jpeg';
    if (url.startsWith('http')) return url;
    return `${CONFIG.API_BASE.replace('/api', '')}${url}`;
  },

  _syncUserToStorage() {
    if (this.state.user) {
      Utils.storage.set('user', this.state.user);
    }
  },

  // Nickname edit
  showNicknameModal() {
    this.elements.nicknameInput.value = this.state.user?.nickname || '';
    this.elements.nicknameModal.style.display = 'flex';
    this.elements.nicknameInput.focus();
  },

  hideNicknameModal() {
    this.elements.nicknameModal.style.display = 'none';
  },

  async handleNicknameSubmit() {
    const nickname = this.elements.nicknameInput.value.trim();
    if (!nickname) {
      this.showToast('昵称不能为空');
      return;
    }
    if (nickname.length > 20) {
      this.showToast('昵称不能超过20个字符');
      return;
    }

    try {
      const res = await API.updateProfile(this.state.user.id, { nickname });
      this.state.user.nickname = res.nickname;
      this._syncUserToStorage();
      this.elements.userNickname.textContent = res.nickname;
      this.hideNicknameModal();
      this.showToast('昵称修改成功');
    } catch (error) {
      this.showToast(error.message || '修改失败');
    }
  },

  // Avatar upload
  async handleAvatarUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      this.showToast('图片大小不能超过 2MB');
      e.target.value = '';
      return;
    }

    if (!/^image\/(jpeg|png|gif|webp)$/.test(file.type)) {
      this.showToast('仅支持 jpg/png/gif/webp 格式');
      e.target.value = '';
      return;
    }

    this.elements.avatarWrapper.classList.add('avatar-uploading');
    try {
      const res = await API.uploadAvatar(this.state.user.id, file);
      const newUrl = this._resolveAvatarUrl(res.avatarUrl);
      this.state.user.avatarUrl = res.avatarUrl;
      this._syncUserToStorage();
      this.elements.userAvatar.src = newUrl;
      this.showToast('头像更新成功');
    } catch (error) {
      this.showToast(error.message || '上传失败');
    } finally {
      this.elements.avatarWrapper.classList.remove('avatar-uploading');
      e.target.value = '';
    }
  },

  async loadUserRank() {
    try {
      const res = await API.getLeaderboard('overall');
      const list = res?.data || res || [];
      // Sort by bonus (descending), with totalScore as fallback
      const sorted = list.sort((a, b) => {
        const aBonus = a.bonus ?? a.totalScore ?? 0;
        const bBonus = b.bonus ?? b.totalScore ?? 0;
        return bBonus - aBonus;
      });
      const myRank = sorted.findIndex(u => u.userId === this.state.user.id || u.id === this.state.user.id);
      this.elements.userRank.textContent = myRank >= 0 ? myRank + 1 : '--';
    } catch (error) {
      console.error('Load rank error:', error);
    }
  },

  async loadFrozenPlayers() {
    try {
      const list = await API.getFrozenPlayers(this.state.user.id);

      if (list && list.length) {
        let html = '';
        list.forEach(item => {
          const modeName = CONFIG.MODE_NAMES[item.play_mode] || '常规模式';
          html += `
            <div class="frozen-card">
              <div class="frozen-info">
                <div class="frozen-name-row">
                  <span class="frozen-name">${item.player_name}</span>
                  <span class="frozen-mode-tag">${modeName}</span>
                </div>
                <div class="frozen-date">解冻: ${item.expires_at}</div>
              </div>
              <div class="frozen-status">❄️</div>
            </div>
          `;
        });
        this.elements.frozenList.innerHTML = html;
      } else {
        this.elements.frozenList.innerHTML = `
          <div class="empty-frozen">
            <div class="empty-text">暂无冷冻球员</div>
          </div>
        `;
      }
    } catch (error) {
      console.error('Load frozen error:', error);
    }
  },

  // History
  _historyTab: 'entertainment', // 'entertainment' | 'manager'
  _historyBound: false,

  async showHistoryPage() {
    this.elements.historyPage.style.display = 'block';
    
    // 绑定 Tab 切换事件（只绑定一次）
    if (!this._historyBound) {
      const tabs = document.querySelectorAll('#historyTabs .history-tab');
      tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
          tabs.forEach(t => t.classList.remove('active'));
          e.currentTarget.classList.add('active');
          this._historyTab = e.currentTarget.dataset.tab;
          this.renderHistory();
        });
      });
      this._historyBound = true;
    }
    
    await this.loadHistory();
  },

  hideHistoryPage() {
    this.elements.historyPage.style.display = 'none';
  },

  async loadHistory() {
    try {
      const data = await API.getSelectionHistory(this.state.user.id, 50);
      this._allHistoryData = data || [];
      this.renderHistory();
    } catch (error) {
      console.error('Load history error:', error);
      this.elements.historyList.innerHTML = '<div class="no-players">加载失败</div>';
    }
  },

  renderHistory() {
    const tab = this._historyTab;
    let filteredData = [];

    if (tab === 'entertainment') {
      // 娱乐模式：play_mode 为 1/2/3
      filteredData = this._allHistoryData.filter(r => 
        r.play_mode === 1 || r.play_mode === 2 || r.play_mode === 3
      );
    } else {
      // 经理模式：play_mode 为 4 或 'manager'
      filteredData = this._allHistoryData.filter(r => 
        r.play_mode === 4 || r.play_mode === 'manager'
      );
    }

    if (filteredData.length) {
      let html = '';
      filteredData.forEach(record => {
        const date = new Date(record.game_date);
        
        if (tab === 'entertainment') {
          html += `
            <div class="history-card">
              <div class="history-header">
                <span class="history-date">${Utils.formatDate(date, 'YYYY-MM-DD')}</span>
                <span class="history-mode">${CONFIG.MODE_NAMES[record.play_mode] || '常规模式'}</span>
              </div>
              <div class="history-player">${record.player_name}</div>
              <div class="history-stats">
                <span>场均: ${Utils.formatSeasonAvg(record.player_season_avg)}</span>
                <span class="history-score">实际: ${record.player_actual_score ?? '--'} 分</span>
              </div>
            </div>
          `;
        } else {
          // 经理模式显示
          html += `
            <div class="history-card manager-card">
              <div class="history-header">
                <span class="history-date">${Utils.formatDate(date, 'YYYY-MM-DD')}</span>
                <span class="history-mode">经理模式 · 第${record.week_number || '--'}周</span>
              </div>
              <div class="history-player">首发阵容</div>
              <div class="history-stats">
                <span class="history-score">总得分: ${record.total_score || '--'} 分</span>
              </div>
            </div>
          `;
        }
      });
      this.elements.historyList.innerHTML = html;
    } else {
      const emptyText = tab === 'entertainment' ? '暂无娱乐模式战绩' : '暂无经理模式战绩';
      this.elements.historyList.innerHTML = `<div class="no-players">${emptyText}</div>`;
    }
  },

  // Leaderboard
  async showLeaderboardPage() {
    this.elements.leaderboardPage.style.display = 'block';
    await this.loadLeaderboard();
  },

  hideLeaderboardPage() {
    this.elements.leaderboardPage.style.display = 'none';
  },

  // Scoreboard
  _scoreboardBound: false,
  _scoreboardData: { 1: [], 2: [], 3: [] },
  _scoreboardMainTab: 'entertainment', // 'entertainment' | 'manager'
  _scoreboardSubMode: 1, // 1=常规, 2=正58, 3=负58

  async showScoreboardPage() {
    this.elements.scoreboardPage.style.display = 'block';
    const targetDate = this.state.selectedDate || window.Utils?.formatDate(new Date(), 'YYYY-MM-DD');
    this.elements.scoreboardDateInput.value = targetDate;

    if (!this._scoreboardBound) {
      // 主Tab切换（娱乐模式/经理模式）
      const mainTabs = document.querySelectorAll('#scoreboardMainTabs .sb-main-tab');
      mainTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
          mainTabs.forEach(t => t.classList.remove('active'));
          e.currentTarget.classList.add('active');
          this._scoreboardMainTab = e.currentTarget.dataset.tab;
          
          // 显示/隐藏子Tab
          const subTabsContainer = document.getElementById('scoreboardTabs');
          if (this._scoreboardMainTab === 'entertainment') {
            subTabsContainer.style.display = 'flex';
          } else {
            subTabsContainer.style.display = 'none';
          }
          
          this.renderScoreboard();
        });
      });

      // 子Tab切换（常规/正58/负58）
      this.elements.scoreboardTabs.querySelectorAll('.sb-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
          this.elements.scoreboardTabs.querySelectorAll('.sb-tab').forEach(t => t.classList.remove('active'));
          e.currentTarget.classList.add('active');
          this._scoreboardSubMode = parseInt(e.currentTarget.dataset.mode);
          this.renderScoreboard();
        });
      });

      this.elements.scoreboardDateInput.addEventListener('change', (e) => {
        this.loadDailyScoreboard(e.target.value);
      });
      this._scoreboardBound = true;
    }

    await this.loadDailyScoreboard(targetDate);
  },

  hideScoreboardPage() {
    this.elements.scoreboardPage.style.display = 'none';
  },

  // Manager Mode
  async showManagerPage() {
    // Hide all pages first
    this.elements.timelineScroll.style.display = 'none';
    document.querySelector('.header').style.display = 'none';
    this.elements.profilePage.style.display = 'none';
    this.elements.historyPage.style.display = 'none';
    this.elements.leaderboardPage.style.display = 'none';
    this.elements.scoreboardPage.style.display = 'none';

    // Show manager page
    this.elements.managerPage.style.display = 'block';
    this.state.currentTab = 'manager';

    await this.loadManagerList();
  },

  async loadManagerList() {
    const section = document.getElementById('managerSection');
    section.innerHTML = '<div class="loading-container"><div class="spinner"></div></div>';

    try {
      // 获取经理列表
      const managers = await API.getManagerList();

      if (!managers || managers.length === 0) {
        section.innerHTML = `
          <div class="manager-empty">
            <div class="manager-empty-icon">👔</div>
            <div class="manager-empty-text">暂无经理申请</div>
          </div>
        `;
        return;
      }

      const html = managers.map(m => this.renderManagerItem(m)).join('');
      section.innerHTML = `<div class="manager-list">${html}</div>`;
    } catch (error) {
      console.error('Load manager list error:', error);
      section.innerHTML = '<div class="manager-empty">加载失败</div>';
    }
  },

  renderManagerItem(manager) {
    const statusClass = manager.status || 'pending';
    const statusText = {
      'pending': '待确认',
      'confirmed': '已通过',
      'rejected': '已拒绝'
    }[statusClass] || statusClass;

    const playersHtml = manager.players && manager.players.length > 0
      ? manager.players.map(p => `<span class="manager-player-icon">🏀</span>`).join('')
      : '';

    return `
      <div class="manager-item" data-id="${manager.id}">
        <img class="manager-avatar" src="${manager.avatarUrl || 'https://img.yzcdn.cn/vant/cat.jpeg'}" alt="avatar">
        <div class="manager-info">
          <div class="manager-name">${manager.nickname || '球迷'}</div>
          <div class="manager-meta">
            <span class="manager-players">${playersHtml}</span>
            <span class="manager-count">${manager.players?.length || 0}人</span>
            <span class="manager-status ${statusClass}">${statusText}</span>
          </div>
        </div>
        ${this.renderManagerActions(manager)}
      </div>
    `;
  },

  renderManagerActions(manager) {
    if (manager.status === 'pending') {
      return `
        <div class="manager-actions">
          <button class="manager-action-btn accept" data-action="accept" data-id="${manager.id}">通过</button>
          <button class="manager-action-btn reject" data-action="reject" data-id="${manager.id}">拒绝</button>
        </div>
      `;
    }
    return '';
  },

  openManagerModal(managerId) {
    this.elements.managerModal.style.display = 'flex';
    this.loadManagerDetail(managerId);
  },

  async loadManagerDetail(managerId) {
    this.elements.managerBody.innerHTML = '<div class="loading-container"><div class="spinner"></div></div>';

    try {
      const detail = await API.getManagerDetail(managerId);
      if (!detail) {
        this.elements.managerBody.innerHTML = '<div class="manager-empty">加载失败</div>';
        return;
      }

      this.elements.managerTitle.textContent = `${detail.nickname || '球迷'} 的申请`;
      this.renderManagerDetail(detail);
    } catch (error) {
      console.error('Load manager detail error:', error);
      this.elements.managerBody.innerHTML = '<div class="manager-empty">加载失败</div>';
    }
  },

  renderManagerDetail(detail) {
    const statusClass = detail.status || 'pending';
    const statusText = {
      'pending': '待审核',
      'confirmed': '已通过',
      'rejected': '已拒绝'
    }[statusClass] || statusClass;

    let playersHtml = '';
    if (detail.players && detail.players.length > 0) {
      playersHtml = detail.players.map(p => `
        <div class="manager-player-item">
          <div class="manager-player-icon">🏀</div>
          <div class="manager-player-data">
            <div class="manager-player-name">${p.playerName}</div>
            <div class="manager-player-team">${p.teamName || ''}</div>
            <div class="manager-player-stats">场均: ${p.seasonAvg || 0}</div>
          </div>
        </div>
      `).join('');
    }

    this.elements.managerBody.innerHTML = `
      <div class="manager-detail-section">
        <div class="manager-detail-header">
          <img class="manager-detail-avatar" src="${detail.avatarUrl || 'https://img.yzcdn.cn/vant/cat.jpeg'}" alt="avatar">
          <div class="manager-detail-info">
            <div class="manager-detail-name">${detail.nickname || '球迷'}</div>
            <div class="manager-detail-meta">
              <span>申请时间: ${detail.createdAt || ''}</span>
              <span>状态: <span class="manager-status ${statusClass}">${statusText}</span></span>
            </div>
          </div>
        </div>
      </div>

      <div class="manager-detail-section">
        <div class="manager-detail-title">选择的球员 (${detail.players?.length || 0})</div>
        ${playersHtml || '<div class="manager-empty-text">未选择球员</div>'}
      </div>

      <div class="manager-detail-section">
        <div class="manager-detail-title">备注</div>
        <div class="manager-note">
          ${detail.note || '<div class="manager-empty-text">无备注</div>'}
        </div>
      </div>

      ${detail.status === 'pending' ? `
      <div class="manager-detail-section">
        <div class="manager-detail-title">审核意见</div>
        <div class="manager-note">
          <textarea id="managerReviewNote" placeholder="请输入审核意见（可选）"></textarea>
        </div>
      </div>
      ` : ''}
    `;
  },

  hideManagerModal() {
    this.elements.managerModal.style.display = 'none';
  },

  async handleManagerConfirm() {
    const reviewNote = document.getElementById('managerReviewNote')?.value || '';

    // 从当前加载的详情中获取managerId
    const titleText = this.elements.managerTitle.textContent;
    const match = titleText.match(/(\d+)$/);
    if (!match) {
      this.showToast('无法获取申请ID');
      return;
    }

    const managerId = parseInt(match[1]);

    try {
      await API.reviewManager(managerId, true, reviewNote);
      this.showToast('已通过申请');
      this.hideManagerModal();
      await this.loadManagerList();
    } catch (error) {
      console.error('Review manager error:', error);
      this.showToast('操作失败');
    }
  },

  async handleManagerReject(managerId) {
    if (!confirm('确定要拒绝该申请吗？')) return;

    const reviewNote = prompt('请输入拒绝原因（可选）') || '';

    try {
      await API.reviewManager(managerId, false, reviewNote);
      this.showToast('已拒绝申请');
      await this.loadManagerList();
    } catch (error) {
      console.error('Reject manager error:', error);
      this.showToast('操作失败');
    }
  },

  async loadDailyScoreboard(date) {
    this.elements.scoreboardList.innerHTML = '<div class="loading-container"><div class="spinner"></div></div>';
    try {
      const res = await API.getDailyScoreboard(date);
      this._scoreboardData = res?.modes || { 1: [], 2: [], 3: [] };
      this._scoreboardManagerData = res?.manager || [];
      this.renderScoreboard();
    } catch (error) {
      console.error('Scoreboard load error:', error);
      this.elements.scoreboardList.innerHTML = '<div class="no-players">加载失败</div>';
    }
  },

  renderScoreboard() {
    const mainTab = this._scoreboardMainTab;
    let data = [];
    let formula = '';

    if (mainTab === 'entertainment') {
      // 娱乐模式：根据子Tab选择数据
      const mode = this._scoreboardSubMode;
      data = this._scoreboardData[mode] || [];
      
      if (mode === 1) formula = '常规模式：实际得分 + 排名加分';
      else if (mode === 2) formula = '正58模式：10 + 5.8 × (实际得分 - 赛季均分)';
      else if (mode === 3) formula = '负58模式：10 - 5.8 × (实际得分 - 赛季均分)';
    } else {
      // 经理模式：显示经理模式数据
      data = this._scoreboardManagerData || [];
      formula = '经理模式：每日首发球员总得分';
    }

    this.elements.scoreboardFormula.textContent = formula;

    if (!data.length) {
      const emptyText = mainTab === 'entertainment' ? '暂无选择' : '暂无经理模式数据';
      this.elements.scoreboardList.innerHTML = `<div class="no-players">${emptyText}</div>`;
      return;
    }

    let html = '';
    data.forEach(row => {
      const scoreNum = row.total_score !== null ? Utils.formatScore(row.total_score) : '--';
      const actualText = row.actual_score !== null ? `实际 ${Utils.formatScore(row.actual_score)}分` : '未结算';
      const avgText = row.season_avg ? ` (均 ${Utils.formatScore(row.season_avg)})` : '';

      let calcDetail = '';
      if (mainTab === 'entertainment' && row.total_score !== null) {
        const mode = this._scoreboardSubMode;
        if (mode === 1) calcDetail = `${row.base_score}原始 + ${row.bonus_score}奖惩`;
        else {
          const sign = mode === 2 ? '+' : '-';
          calcDetail = `10 ${sign} 5.8 × (${row.actual_score} - ${row.season_avg})`;
        }
      } else if (mainTab === 'manager') {
        calcDetail = `首发球员总得分：${row.total_score || 0}分`;
      }

      html += `
        <div class="sc-card ${mainTab === 'manager' ? 'manager-card' : ''}">
          <div class="sc-header">
            <span class="sc-user">${row.user_name}</span>
            <span class="sc-total ${row.total_score !== null && row.total_score >= 0 ? 'positive' : 'negative'}">${scoreNum}</span>
          </div>
          <div class="sc-body">
            <div class="sc-player">${mainTab === 'manager' ? '首发阵容' : '选择: ' + row.player_name}${avgText}</div>
            <div class="sc-actual">${actualText}</div>
          </div>
          ${calcDetail ? `<div class="sc-calc">${calcDetail}</div>` : ''}
        </div>
      `;
    });
    this.elements.scoreboardList.innerHTML = html;
  },

  async loadLeaderboard() {
    try {
      const data = await API.getAllUsers(100);

      if (data && data.length) {
        // Sort by bonus (descending), with totalScore as fallback
        const sorted = data.sort((a, b) => {
          const aBonus = a.bonus ?? a.total_bonus ?? a.bonus_score ?? a.totalScore ?? 0;
          const bBonus = b.bonus ?? b.total_bonus ?? b.bonus_score ?? b.totalScore ?? 0;
          return bBonus - aBonus;
        });

        let html = '';
        sorted.forEach((user, index) => {
          const rank = index + 1;
          const isCurrentUser = user.id === this.state.user.id;
          const rankClass = rank <= 3 ? `top-${rank}` : 'normal';
          const score = user.totalScore || 0;
          const bonus = user.bonus ?? user.total_bonus ?? user.bonus_score ?? user.totalScore ?? 0;

          html += `
            <div class="leaderboard-item ${isCurrentUser ? 'current-user' : ''}" data-user-id="${user.id}" data-user-name="${user.nickname || '球迷'}">
              <div class="rank-num ${rankClass}">${rank}</div>
              <img class="leaderboard-avatar" src="${user.avatarUrl || 'https://img.yzcdn.cn/vant/cat.jpeg'}" alt="${user.nickname}">
              <div class="leaderboard-info">
                <div class="leaderboard-name">${user.nickname || '球迷'}</div>
              </div>
              <div class="leaderboard-scores">
                <div class="score-item"><span class="label">积分</span><span class="value">${Utils.formatScore(score)}</span></div>
                <div class="score-item highlight"><span class="label">Bonus</span><span class="value">${Utils.formatScore(bonus)}</span></div>
              </div>
            </div>
          `;
        });
        this.elements.leaderboardList.innerHTML = html;

        this.elements.leaderboardList.querySelectorAll('.leaderboard-item').forEach(el => {
          el.addEventListener('click', () => {
            const userId = el.dataset.userId;
            const userName = el.dataset.userName;
            if (userId) this.showUserPicks(Number(userId), userName);
          });
        });
      } else {
        this.elements.leaderboardList.innerHTML = '<div class="no-players">暂无数据</div>';
      }
    } catch (error) {
      console.error('Load leaderboard error:', error);
      this.elements.leaderboardList.innerHTML = '<div class="no-players">加载失败</div>';
    }
  },

  async showUserPicks(userId, userName) {
    this.elements.userPicksModal.style.display = 'block';
    this.elements.userPicksTitle.textContent = `${userName} 的选人记录`;
    this.elements.userPicksBody.innerHTML = '<div class="loading-container"><div class="spinner"></div></div>';

    try {
      const picks = await API.viewUserSelections(userId, 50);
      if (!picks || picks.length === 0) {
        this.elements.userPicksBody.innerHTML = '<div class="picks-empty">暂无选人记录</div>';
        return;
      }

      const modeNames = { 1: '常规', 2: '正58', 3: '负58' };
      const grouped = {};
      picks.forEach(p => {
        if (!grouped[p.gameDate]) grouped[p.gameDate] = [];
        grouped[p.gameDate].push(p);
      });

      let html = '';
      Object.keys(grouped).sort().reverse().forEach(date => {
        html += `<div class="picks-date-group">`;
        html += `<div class="picks-date-label">${date}</div>`;
        grouped[date].forEach(p => {
          const hasResult = p.actualScore !== null && p.actualScore !== undefined;
          const scoreVal = hasResult ? (p.totalScore || 0) : null;
          const scoreClass = scoreVal === null ? 'pending' : (scoreVal >= 0 ? 'positive' : 'negative');
          const scoreText = scoreVal === null ? '待结算' : (scoreVal >= 0 ? `+${Utils.formatScore(scoreVal)}` : `${Utils.formatScore(scoreVal)}`);
          const actualText = hasResult ? `实际 ${p.actualScore} 分` : '';
          const avgText = p.seasonAvg ? `均 ${Utils.formatScore(p.seasonAvg)}` : '';
          html += `
            <div class="picks-row">
              <span class="picks-mode-tag mode-${p.playMode}">${modeNames[p.playMode] || '?'}</span>
              <div class="picks-player">
                <div class="picks-player-name">${p.playerName}</div>
                <div class="picks-player-team">${p.teamName || ''} ${avgText}</div>
              </div>
              <div class="picks-scores">
                <div class="picks-actual ${scoreClass}">${scoreText}</div>
                ${actualText ? `<div class="picks-detail">${actualText}</div>` : ''}
              </div>
            </div>
          `;
        });
        html += `</div>`;
      });

      this.elements.userPicksBody.innerHTML = html;
    } catch (error) {
      console.error('Load user picks error:', error);
      this.elements.userPicksBody.innerHTML = '<div class="picks-empty">加载失败</div>';
    }
  },

  hideUserPicks() {
    this.elements.userPicksModal.style.display = 'none';
  },

  // Utilities
  addDays(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return Utils.formatDate(d, 'YYYY-MM-DD');
  },

  showLoading() {
    this.elements.loadingContainer.innerHTML = `
      <div class="spinner"></div>
      <p>加载中...</p>
    `;
    this.elements.loadingContainer.style.display = 'flex';
  },

  hideLoading() {
    this.elements.loadingContainer.style.display = 'none';
  },

  showToast(message, duration = 2000) {
    this.elements.toast.textContent = message;
    this.elements.toast.classList.add('show');

    setTimeout(() => {
      this.elements.toast.classList.remove('show');
    }, duration);
  }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
