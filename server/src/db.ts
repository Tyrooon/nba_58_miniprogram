import sqlite3 from 'sqlite3';
import fs from 'fs';
import { paths } from './config';

if (!fs.existsSync(paths.data)) {
  fs.mkdirSync(paths.data, { recursive: true });
}

const sqlite = sqlite3.verbose();

class Database {
  private db: sqlite3.Database;

  constructor(filename: string) {
    this.db = new sqlite.Database(filename);
  }

  prepare(sql: string) {
    // FIX: Replace @param with $param for sqlite3 compatibility
    // better-sqlite3 uses @id, sqlite3 prefers $id or :id.
    // We will normalize everything to $id.
    const normalizedSql = sql.replace(/@(\w+)/g, '$$$1');
    
    const stmt = this.db.prepare(normalizedSql);
    
    return {
      run: (params: any = {}) => {
        return new Promise((resolve, reject) => {
          stmt.run(this.flattenParams(params), function (err) {
            if (err) reject(err);
            else resolve({ changes: this.changes, lastInsertRowid: this.lastID });
          });
        });
      },
      get: (params: any = {}) => {
        return new Promise((resolve, reject) => {
          stmt.get(this.flattenParams(params), (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });
      },
      all: (params: any = {}) => {
        return new Promise((resolve, reject) => {
          stmt.all(this.flattenParams(params), (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });
      }
    };
  }

  exec(sql: string) {
    return new Promise((resolve, reject) => {
      this.db.exec(sql, (err) => {
        if (err) reject(err);
        else resolve(true);
      });
    });
  }

  transaction(fn: () => void) {
    return async () => {
      // Simple async transaction wrapper
      // Note: sqlite3 executes statements sequentially in its internal queue, 
      // but for async/await safety we use explicit BEGIN/COMMIT.
      await this.exec('BEGIN TRANSACTION');
      try {
        await fn(); 
        await this.exec('COMMIT');
      } catch (error) {
        await this.exec('ROLLBACK');
        throw error;
      }
    };
  }

  private flattenParams(params: any) {
    // sqlite3 expects array [val1, val2] or object { $key: val }
    
    // Case 1: Array - pass through
    if (Array.isArray(params)) {
      return params;
    }
    
    // Case 2: Object - prefix keys with $
    if (typeof params === 'object' && params !== null) {
      const newParams: any = {};
      for (const key of Object.keys(params)) {
        // If key already starts with $, keep it, otherwise add $
        // The regex replace in prepare() changed @key to $key, so we need $key here.
        const newKey = key.startsWith('$') ? key : '$' + key;
        newParams[newKey] = params[key];
      }
      return newParams;
    }
    
    // Case 3: Single value (primitive) - this is tricky. 
    // better-sqlite3 allows .get(id). sqlite3 usually expects array for positional args.
    // If it's a primitive, wrap in array.
    if (params !== undefined && params !== null && typeof params !== 'object') {
        return [params];
    }
    
    return params;
  }
}

const db = new Database(paths.dbFile);

const bootstrap = async () => {
    // Note: We split statements because db.exec might handle one at a time reliably, 
    // though sqlite3 exec() supports multiple.
    // For safety with IF NOT EXISTS, one big string is fine.
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          openid TEXT NOT NULL UNIQUE,
          nickname TEXT,
          avatar_url TEXT,
          total_score REAL DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now'))
        );
    
        CREATE TABLE IF NOT EXISTS games (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          external_id TEXT NOT NULL UNIQUE, 
          game_date TEXT NOT NULL,
          status TEXT,
          tipoff TEXT,
          home_team_id INTEGER,
          home_team_name TEXT,
          visitor_team_id INTEGER,
          visitor_team_name TEXT,
          home_score INTEGER DEFAULT 0,
          visitor_score INTEGER DEFAULT 0,
          season INTEGER,
          created_at TEXT DEFAULT (datetime('now'))
        );
    
        CREATE TABLE IF NOT EXISTS daily_players (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          game_date TEXT NOT NULL,
          team_id INTEGER NOT NULL,
          team_name TEXT NOT NULL,
          player_id INTEGER NOT NULL,
          player_name TEXT NOT NULL,
          position TEXT,
          season_avg REAL DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          UNIQUE (game_date, player_id)
        );
    
        CREATE TABLE IF NOT EXISTS selections (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          game_date TEXT NOT NULL,
          play_mode INTEGER NOT NULL,
          player_id INTEGER NOT NULL,
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

        CREATE TABLE IF NOT EXISTS player_season_totals (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          season INTEGER NOT NULL,
          player_id INTEGER NOT NULL,
          player_name TEXT NOT NULL,
          team_id INTEGER,
          team_name TEXT,
          games_played INTEGER DEFAULT 0,
          total_points INTEGER DEFAULT 0,
          avg_points REAL DEFAULT 0,
          last_game_date TEXT,
          updated_at TEXT DEFAULT (datetime('now')),
          UNIQUE (season, player_id)
        );

        CREATE TABLE IF NOT EXISTS season_aggregate_log (
          game_date TEXT PRIMARY KEY,
          processed_at TEXT DEFAULT (datetime('now'))
        );
        
        CREATE INDEX IF NOT EXISTS idx_games_date ON games(game_date);
    `);

    // Migrations for new columns
    try {
      await db.exec(`ALTER TABLE daily_players ADD COLUMN stats_points INTEGER DEFAULT 0;`);
    } catch (e) { /* ignore if exists */ }
    try {
      await db.exec(`ALTER TABLE daily_players ADD COLUMN stats_rebounds INTEGER DEFAULT 0;`);
    } catch (e) { /* ignore if exists */ }
    try {
      await db.exec(`ALTER TABLE daily_players ADD COLUMN stats_assists INTEGER DEFAULT 0;`);
    } catch (e) { /* ignore if exists */ }
    try {
      await db.exec(`ALTER TABLE daily_players ADD COLUMN stats_status TEXT DEFAULT 'ACTIVE';`);
    } catch (e) { /* ignore if exists */ }

    // Frozen players play_mode migration
    const frozenColumns = (await db.prepare(`PRAGMA table_info(frozen_players)`).all()) as any[];
    const hasPlayMode = frozenColumns?.some((col: any) => col.name === 'play_mode');
    if (!hasPlayMode) {
      await db.exec(`
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
      `);
    }
};

bootstrap();

export default db;
