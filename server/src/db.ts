import sqlite3 from 'sqlite3';
import { paths } from './config';
import fs from 'fs';

// Ensure data directory exists
if (!fs.existsSync(paths.data)) {
  fs.mkdirSync(paths.data, { recursive: true });
}

const dbRaw = new sqlite3.Database(paths.dbFile);

// Promise wrapper for sqlite3
export const db = {
  run(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
    return new Promise((resolve, reject) => {
      dbRaw.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  },
  get(sql: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      dbRaw.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },
  all(sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      dbRaw.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },
  exec(sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
      dbRaw.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  },
  prepare(sql: string) {
    const stmt = dbRaw.prepare(sql);
    return {
      run(params: any[] = []): Promise<{ lastID: number; changes: number }> {
        return new Promise((resolve, reject) => {
          stmt.run(params, function (err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
          });
        });
      },
      get(params: any[] = []): Promise<any> {
        return new Promise((resolve, reject) => {
          stmt.get(params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });
      },
      all(params: any[] = []): Promise<any[]> {
        return new Promise((resolve, reject) => {
          stmt.all(params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });
      },
      finalize(): Promise<void> {
        return new Promise((resolve, reject) => {
          stmt.finalize((err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
    };
  }
};

const bootstrap = async () => {
  try {
    // Create tables
    await db.exec(`
      -- Users table
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nickname TEXT,
        avatar TEXT,
        avatar_url TEXT,
        openid TEXT NOT NULL UNIQUE,
        phone TEXT,
        username TEXT UNIQUE,
        password_hash TEXT,
        score INTEGER DEFAULT 0,
        total_score INTEGER DEFAULT 0,
        last_active TEXT,
        is_admin INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- Games table
      CREATE TABLE IF NOT EXISTS games (
        external_id TEXT PRIMARY KEY,
        game_date TEXT NOT NULL,
        status TEXT DEFAULT 'scheduled',
        tipoff TEXT,
        home_team_id TEXT,
        home_team_name TEXT,
        visitor_team_id TEXT,
        visitor_team_name TEXT,
        home_score INTEGER,
        visitor_score INTEGER,
        season INTEGER,
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- Selections table
      CREATE TABLE IF NOT EXISTS selections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        game_id TEXT,
        game_date TEXT NOT NULL,
        play_mode INTEGER NOT NULL,
        player_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        team_id INTEGER,
        team_name TEXT,
        player_season_avg REAL,
        player_actual_score REAL,
        base_score REAL,
        bonus_score REAL DEFAULT 0,
        total_score REAL,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE (user_id, game_date, play_mode),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      -- Player game log table
      CREATE TABLE IF NOT EXISTS player_game_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_sb_id TEXT NOT NULL,
        game_date TEXT NOT NULL,
        player_name TEXT NOT NULL,
        team_name TEXT,
        team_id TEXT NOT NULL,
        team_abbr TEXT,
        position TEXT,
        season INTEGER NOT NULL,
        points REAL NOT NULL,
        rebounds INTEGER DEFAULT 0,
        assists INTEGER DEFAULT 0,
        minutes INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(player_sb_id, game_date)
      );

      -- Players table
      CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        team_id TEXT NOT NULL,
        position TEXT,
        is_rookie INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- Frozen players table
      CREATE TABLE IF NOT EXISTS frozen_players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        player_id INTEGER NOT NULL,
        player_name TEXT NOT NULL,
        play_mode INTEGER NOT NULL DEFAULT 1,
        expires_at TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE (user_id, play_mode, player_id, expires_at),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      -- Manager Mode Tables
      CREATE TABLE IF NOT EXISTS manager_rosters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        player_type TEXT NOT NULL,
        is_starter INTEGER DEFAULT 0,
        is_injured INTEGER DEFAULT 0,
        injured_since TEXT,
        acquired_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS manager_weekly_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        week_start TEXT NOT NULL,
        total_points REAL DEFAULT 0,
        rank INTEGER,
        score INTEGER,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS manager_drafts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        draft_order INTEGER,
        round INTEGER,
        draft_type TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS manager_trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_user_id TEXT NOT NULL,
        to_user_id TEXT NOT NULL,
        trade_details TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        votes_for INTEGER DEFAULT 0,
        votes_against INTEGER DEFAULT 0,
        FOREIGN KEY(from_user_id) REFERENCES users(id),
        FOREIGN KEY(to_user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS manager_trade_votes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trade_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        vote INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY(trade_id) REFERENCES manager_trades(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS manager_reshuffles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        retained_players TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      -- Daily Players table (for daily stats)
      CREATE TABLE IF NOT EXISTS daily_players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_date TEXT NOT NULL,
        player_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        team_id TEXT,
        team_name TEXT,
        position TEXT DEFAULT '',
        season_avg REAL DEFAULT 0,
        stats_points REAL DEFAULT 0,
        stats_rebounds INTEGER DEFAULT 0,
        stats_assists INTEGER DEFAULT 0,
        stats_status TEXT DEFAULT 'scheduled',
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(game_date, player_id)
      );

      -- Season Aggregate Log
      CREATE TABLE IF NOT EXISTS season_aggregate_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_date TEXT NOT NULL,
        processed_at TEXT NOT NULL,
        UNIQUE(game_date)
      );

      -- Player Season Totals
      CREATE TABLE IF NOT EXISTS player_season_totals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        season INTEGER NOT NULL,
        player_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        team_id TEXT,
        team_name TEXT,
        games_played INTEGER DEFAULT 0,
        total_points REAL DEFAULT 0,
        avg_points REAL DEFAULT 0,
        last_game_date TEXT,
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(season, player_id)
      );

      -- SB Fetch Log (for tracking data syncs)
      CREATE TABLE IF NOT EXISTS sb_fetch_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date_key TEXT NOT NULL,
        games_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(date_key)
      );

      -- Groups table
      CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- Draft order table
      CREATE TABLE IF NOT EXISTS draft_order (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        order_index INTEGER NOT NULL,
        round INTEGER NOT NULL DEFAULT 1,
        season INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE (group_id, user_id, round, season),
        FOREIGN KEY(group_id) REFERENCES groups(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_selections_user ON selections(user_id);
      -- Removed idx_selections_game because game_id might be missing initially
      CREATE INDEX IF NOT EXISTS idx_selections_user_game_date ON selections(user_id, game_date);
      CREATE INDEX IF NOT EXISTS idx_draft_order_group ON draft_order(group_id, season);
    `);

    console.log('Database tables verified/created successfully');

    // Migration for selections table columns
    const selectionColumns = await db.all(`PRAGMA table_info(selections)`);
    const selectionColNames = selectionColumns?.map((col: any) => col.name) || [];

    if (!selectionColNames.includes('game_id')) {
      await db.exec(`ALTER TABLE selections ADD COLUMN game_id TEXT`);
      console.log('Added game_id column to selections table');
    }
    if (!selectionColNames.includes('team_id')) {
      await db.exec(`ALTER TABLE selections ADD COLUMN team_id INTEGER`);
      console.log('Added team_id column to selections table');
    }
    if (!selectionColNames.includes('team_name')) {
      await db.exec(`ALTER TABLE selections ADD COLUMN team_name TEXT`);
      console.log('Added team_name column to selections table');
    }
    if (!selectionColNames.includes('player_season_avg')) {
      await db.exec(`ALTER TABLE selections ADD COLUMN player_season_avg REAL`);
      console.log('Added player_season_avg column to selections table');
    }
    if (!selectionColNames.includes('player_actual_score')) {
      await db.exec(`ALTER TABLE selections ADD COLUMN player_actual_score REAL`);
      console.log('Added player_actual_score column to selections table');
    }
    if (!selectionColNames.includes('base_score')) {
      await db.exec(`ALTER TABLE selections ADD COLUMN base_score REAL`);
      console.log('Added base_score column to selections table');
    }
    if (!selectionColNames.includes('bonus_score')) {
      await db.exec(`ALTER TABLE selections ADD COLUMN bonus_score REAL DEFAULT 0`);
      console.log('Added bonus_score column to selections table');
    }
    if (!selectionColNames.includes('total_score')) {
      await db.exec(`ALTER TABLE selections ADD COLUMN total_score REAL`);
      console.log('Added total_score column to selections table');
    }

    // Migration for is_admin column
    const userColumns = await db.all(`PRAGMA table_info(users)`);
    const hasIsAdmin = userColumns?.some((col: any) => col.name === 'is_admin');
    if (!hasIsAdmin) {
      await db.exec(`ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0`);
      console.log('Added is_admin column to users table');
    }

    // Migration for phone column
    const hasPhone = userColumns?.some((col: any) => col.name === 'phone');
    if (!hasPhone) {
      await db.exec(`ALTER TABLE users ADD COLUMN phone TEXT`);
      console.log('Added phone column to users table');
    }

    // Migration for total_score column
    const hasTotalScore = userColumns?.some((col: any) => col.name === 'total_score');
    if (!hasTotalScore) {
      await db.exec(`ALTER TABLE users ADD COLUMN total_score INTEGER DEFAULT 0`);
      console.log('Added total_score column to users table');
    }

    // Admin account creation
    const admin = await db.get(`SELECT username FROM users WHERE username = 'admin'`);
    if (!admin) {
      const bcrypt = await import('bcryptjs');
      const passwordHash = await bcrypt.default.hash('admin123', 10);
      await db.run(
        `INSERT INTO users (username, password_hash, nickname, is_admin, openid) VALUES (?, ?, ?, 1, ?)`,
        ['admin', passwordHash, '管理员', 'admin_openid']
      );
      console.log('Admin account created: admin/admin123');
    }

    // Migration for group_id column
    const hasGroupId = userColumns?.some((col: any) => col.name === 'group_id');
    if (!hasGroupId) {
      await db.exec(`ALTER TABLE users ADD COLUMN group_id INTEGER DEFAULT 1`);
      console.log('Added group_id column to users table');
    }

    // Create default group if not exists
    const defaultGroup = await db.get(`SELECT id FROM groups WHERE id = 1`);
    if (!defaultGroup) {
      await db.run(`INSERT INTO groups (id, name, description) VALUES (1, '默认小组', '系统默认小组')`);
      console.log('Default group created');
    }

    // Migration for total_bonus column in users table
    const hasTotalBonus = userColumns?.some((col: any) => col.name === 'total_bonus');
    if (!hasTotalBonus) {
      await db.exec(`ALTER TABLE users ADD COLUMN total_bonus REAL DEFAULT 0`);
      console.log('Added total_bonus column to users table');
    }

    // Migration for is_injury_slot column in manager_rosters table
    const rosterColumns = await db.all(`PRAGMA table_info(manager_rosters)`);
    const hasInjurySlot = rosterColumns?.some((col: any) => col.name === 'is_injury_slot');
    if (!hasInjurySlot) {
      await db.exec(`ALTER TABLE manager_rosters ADD COLUMN is_injury_slot INTEGER DEFAULT 0`);
      console.log('Added is_injury_slot column to manager_rosters table');
    }

    // Migration for bonus column in manager_weekly_scores table
    const weeklyScoreColumns = await db.all(`PRAGMA table_info(manager_weekly_scores)`);
    const hasWeeklyBonus = weeklyScoreColumns?.some((col: any) => col.name === 'bonus');
    if (!hasWeeklyBonus) {
      await db.exec(`ALTER TABLE manager_weekly_scores ADD COLUMN bonus REAL DEFAULT 0`);
      console.log('Added bonus column to manager_weekly_scores table');
    }

    // Migration for manager_trades: add created_at and resolved_at columns
    const tradeColumns = await db.all(`PRAGMA table_info(manager_trades)`);
    const tradeColNames = tradeColumns?.map((col: any) => col.name) || [];
    if (!tradeColNames.includes('created_at')) {
      await db.exec(`ALTER TABLE manager_trades ADD COLUMN created_at TEXT DEFAULT (datetime('now'))`);
      console.log('Added created_at column to manager_trades table');
    }
    if (!tradeColNames.includes('resolved_at')) {
      await db.exec(`ALTER TABLE manager_trades ADD COLUMN resolved_at TEXT`);
      console.log('Added resolved_at column to manager_trades table');
    }

    // Playoff Mode Tables
    await db.exec(`
      CREATE TABLE IF NOT EXISTS playoff_rounds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        season INTEGER NOT NULL DEFAULT 2025,
        round_type TEXT NOT NULL,
        status TEXT DEFAULT 'upcoming',
        start_date TEXT,
        end_date TEXT,
        config TEXT
      );

      CREATE TABLE IF NOT EXISTS playoff_matchups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        round_id INTEGER NOT NULL,
        round_type TEXT NOT NULL,
        high_seed_user_id TEXT NOT NULL,
        low_seed_user_id TEXT NOT NULL,
        high_seed_rank INTEGER NOT NULL,
        low_seed_rank INTEGER NOT NULL,
        winner_id TEXT,
        status TEXT DEFAULT 'upcoming',
        priority_user_id TEXT,
        FOREIGN KEY(round_id) REFERENCES playoff_rounds(id),
        FOREIGN KEY(high_seed_user_id) REFERENCES users(id),
        FOREIGN KEY(low_seed_user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS playoff_selections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        matchup_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        player_name TEXT,
        game_date TEXT NOT NULL,
        season_avg REAL DEFAULT 0,
        actual_points REAL DEFAULT 0,
        plus58_score REAL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(matchup_id, user_id, game_date),
        FOREIGN KEY(matchup_id) REFERENCES playoff_matchups(id)
      );

      CREATE TABLE IF NOT EXISTS playoff_frozen_players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        player_name TEXT,
        round_id INTEGER NOT NULL,
        frozen_date TEXT NOT NULL,
        FOREIGN KEY(round_id) REFERENCES playoff_rounds(id)
      );

      CREATE TABLE IF NOT EXISTS playoff_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        matchup_id INTEGER NOT NULL,
        game_date TEXT NOT NULL,
        high_seed_score REAL DEFAULT 0,
        low_seed_score REAL DEFAULT 0,
        winner_user_id TEXT,
        FOREIGN KEY(matchup_id) REFERENCES playoff_matchups(id)
      );
    `);

  } catch (err) {
    console.error('Database bootstrap error:', err);
  }
};

bootstrap();

export default db;
