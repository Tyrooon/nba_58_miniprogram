import sqlite3 from 'sqlite3';
import path from 'path';

// Use __dirname directly in CommonJS context
const dbPath = path.join(__dirname, '..', 'nba_58.db');
const db = new sqlite3.Database(dbPath);

const bootstrap = () => {
  // Create tables
  db.exec(`
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname TEXT,
      avatar TEXT,
      avatar_url TEXT,
      openid TEXT UNIQUE,
      username TEXT UNIQUE,
      password TEXT,
      score INTEGER DEFAULT 0,
      total_score INTEGER DEFAULT 0,
      last_active TEXT,
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
      user_id TEXT NOT NULL,
      game_id TEXT NOT NULL,
      game_date TEXT NOT NULL,
      player_id TEXT NOT NULL,
      player_name TEXT NOT NULL,
      play_mode INTEGER NOT NULL,
      points REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(game_id) REFERENCES games(external_id)
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

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_selections_user ON selections(user_id);
    CREATE INDEX IF NOT EXISTS idx_selections_game ON selections(game_id);
    CREATE INDEX IF NOT EXISTS idx_selections_user_game ON selections(user_id, game_id);
    CREATE INDEX IF NOT EXISTS idx_frozen_players_user ON frozen_players(user_id);
    CREATE INDEX IF NOT EXISTS idx_frozen_players_player ON frozen_players(player_id);
    CREATE INDEX IF NOT EXISTS idx_player_game_log_season ON player_game_log(season);
    CREATE INDEX IF NOT EXISTS idx_player_game_log_player ON player_game_log(player_sb_id, season);
    CREATE INDEX IF NOT EXISTS idx_games_date ON games(game_date);

    -- Manager Mode Indexes
    CREATE INDEX IF NOT EXISTS idx_manager_rosters_user ON manager_rosters(user_id);
    CREATE INDEX IF NOT EXISTS idx_manager_rosters_player ON manager_rosters(player_id);
    CREATE INDEX IF NOT EXISTS idx_manager_weekly_scores_user_week ON manager_weekly_scores(user_id, week_start);
    CREATE INDEX IF NOT EXISTS idx_manager_drafts_user ON manager_drafts(user_id);
    CREATE INDEX IF NOT EXISTS idx_manager_trades_users ON manager_trades(from_user_id, to_user_id);
    CREATE INDEX IF NOT EXISTS idx_manager_trade_votes_trade ON manager_trade_votes(trade_id);
  `, (err) => {
    if (err) {
      console.error('Error creating tables:', err);
    } else {
      console.log('Database tables created successfully');
    }
  });

  // Migrations for new columns
  db.prepare(`PRAGMA table_info(frozen_players)`).all([], (err, rows) => {
    if (err) {
      console.error('Error checking frozen_players columns:', err);
      return;
    }
    const frozenColumns = rows as any[];
    const hasPlayMode = frozenColumns?.some((col: any) => col.name === 'play_mode');
    if (!hasPlayMode) {
      db.exec(`
        BEGIN TRANSACTION;
        ALTER TABLE frozen_players RENAME TO frozen_players_old;
        CREATE TABLE frozen_players (
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
        INSERT INTO frozen_players (user_id, player_id, player_name, play_mode, expires_at, created_at)
        SELECT user_id, player_id, player_name, 1, expires_at, created_at FROM frozen_players_old;
        DROP TABLE frozen_players_old;
        COMMIT;
      `, (err) => {
        if (err) {
          console.error('Error migrating frozen_players table:', err);
        } else {
          console.log('Migrated frozen_players table successfully');
        }
      });
    }
  });

  // Migration for games table schema change
  db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='games' AND sql LIKE '%away_team%'`, (err, row) => {
    if (row) {
      // Old schema detected, need to migrate
      db.exec(`
        BEGIN TRANSACTION;
        ALTER TABLE games RENAME TO games_old;
        CREATE TABLE games (
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
        INSERT INTO games (external_id, game_date, status, home_team_name, visitor_team_name, home_score, visitor_score, season, created_at)
        SELECT id, game_date, status, home_team, away_team, home_score, away_score, season, created_at FROM games_old;
        DROP TABLE games_old;
        COMMIT;
      `, (err) => {
        if (err) {
          console.error('Error migrating games table:', err);
        } else {
          console.log('Migrated games table successfully');
        }
      });
    }
  });

  // Migration for player_game_log table schema change
  db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='player_game_log' AND sql LIKE '%player_id%'`, (err, row) => {
    if (row) {
      // Old schema detected, need to migrate
      db.exec(`
        BEGIN TRANSACTION;
        ALTER TABLE player_game_log RENAME TO player_game_log_old;
        CREATE TABLE player_game_log (
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
        INSERT INTO player_game_log (player_sb_id, game_date, player_name, team_id, season, points, rebounds, assists, created_at)
        SELECT player_id, game_date, player_name, team_id, season, points, rebounds, assists, created_at FROM player_game_log_old;
        DROP TABLE player_game_log_old;
        COMMIT;
      `, (err) => {
        if (err) {
          console.error('Error migrating player_game_log table:', err);
        } else {
          console.log('Migrated player_game_log table successfully');
        }
      });
    }
  });

  // Migration for users table schema change
  db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='users' AND sql NOT LIKE '%avatar_url%'`, (err, row) => {
    if (row) {
      // Old schema detected, need to migrate
      db.exec(`
        BEGIN TRANSACTION;
        ALTER TABLE users RENAME TO users_old;
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nickname TEXT,
          avatar TEXT,
          avatar_url TEXT,
          openid TEXT UNIQUE,
          username TEXT UNIQUE,
          password TEXT,
          score INTEGER DEFAULT 0,
          total_score INTEGER DEFAULT 0,
          last_active TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        );
        INSERT INTO users (id, nickname, avatar, openid, score, last_active, created_at)
        SELECT id, nickname, avatar, openid, score, last_active, created_at FROM users_old;
        DROP TABLE users_old;
        COMMIT;
      `, (err) => {
        if (err) {
          console.error('Error migrating users table:', err);
        } else {
          console.log('Migrated users table successfully');
        }
      });
    }
  });
};

bootstrap();

export default db;
