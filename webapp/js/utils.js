// Utility Functions

const Utils = {
  // Dayjs-like date formatting (simplified)
  formatDate(date, format) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    
    return format
      .replace('YYYY', year)
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hours)
      .replace('mm', minutes)
      .replace('WW', weekdays[d.getDay()]);
  },
  
  isToday(dateStr) {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return dateStr === todayStr;
  },
  
  formatSeasonAvg(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(1) : '--';
  },
  
  sortPlayersByPoints(players) {
    return (players || []).slice().sort((a, b) => {
      const pointsA = a?.stats_points ?? 0;
      const pointsB = b?.stats_points ?? 0;
      return pointsB - pointsA;
    });
  },
  
  decoratePlayers(players) {
    return this.sortPlayersByPoints(players).map(player => ({
      ...player,
      seasonAvgDisplay: this.formatSeasonAvg(player.season_avg)
    }));
  },
  
  formatGame(game) {
    const visitorPlayersSorted = this.decoratePlayers(game.visitor_players);
    const homePlayersSorted = this.decoratePlayers(game.home_players);
    const tipoffDate = new Date(game.tipoff);
    const hours = String(tipoffDate.getHours()).padStart(2, '0');
    const minutes = String(tipoffDate.getMinutes()).padStart(2, '0');
    
    return {
      ...game,
      tipoff_time_short: `${hours}:${minutes}`,
      visitorPlayersSorted,
      homePlayersSorted,
      hasPlayers: visitorPlayersSorted.length > 0 || homePlayersSorted.length > 0,
    };
  },
  
  // Generate random nickname
  generateNickname() {
    const adjectives = ['快乐的', '热情的', '冷静的', '聪明的', '勇敢的'];
    const nouns = ['球迷', '射手', '传球手', '防守者', '得分手'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(Math.random() * 1000);
    return `${adj}${noun}${num}`;
  },
  
  // Storage helpers
  storage: {
    get(key) {
      try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : null;
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        console.error('Storage error:', e);
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        console.error('Storage error:', e);
      }
    }
  },
  
  // Debounce
  debounce(fn, delay) {
    let timer = null;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }
};

window.Utils = Utils;
