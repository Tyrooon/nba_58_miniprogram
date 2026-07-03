const assert = require('node:assert/strict');
const fs = require('node:fs');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const vm = require('node:vm');

const serverRoot = path.resolve(__dirname, '..');
const node = process.execPath;

const runNode = (script, env = {}) => {
  const result = spawnSync(node, ['-e', script], {
    cwd: serverRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATA_DIR: mkdtempSync(path.join(tmpdir(), 'nba58-test-')),
      DB_FILE: 'test.db',
      ...env,
    },
    encoding: 'utf8',
  });

  assert.equal(
    result.status,
    0,
    `node script failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`
  );
  return result.stdout.trim();
};

const parseResult = (output) => {
  const lines = output.split(/\r?\n/).filter(Boolean);
  const line = [...lines].reverse().find((item) => item.startsWith('RESULT:'));
  assert.ok(line, `No RESULT line found in output:\n${output}`);
  return JSON.parse(line.slice('RESULT:'.length));
};

test('mode config exposes plus58 and respects MODE_PLUS58=false', () => {
  const output = runNode(
    "const { config } = require('./dist/config'); console.log('RESULT:' + JSON.stringify(config.modeEnabled));",
    { MODE_REGULAR: 'true', MODE_PLUS58: 'false', MODE_MINUS58: 'true', MODE_MANAGER: 'true' }
  );

  const modeEnabled = parseResult(output);
  assert.deepEqual(Object.keys(modeEnabled).sort(), ['manager', 'minus58', 'plus58', 'regular']);
  assert.equal(modeEnabled.plus58, false);
});

test('fresh database schema includes daily_players.is_played', () => {
  const output = runNode(`
    const db = require('./dist/db').default;
    setTimeout(async () => {
      const columns = await db.all("PRAGMA table_info(daily_players)");
      console.log('RESULT:' + JSON.stringify(columns.map((column) => column.name)));
    }, 50);
  `);

  assert.ok(parseResult(output).includes('is_played'));
});

test('admin middleware accepts configured admin token without user-id spoofing', () => {
  const output = runNode(`
    const { requireAdmin } = require('./dist/middleware/admin');
    const req = { query: {}, headers: { 'x-admin-token': 'secret-token' } };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { console.log('RESULT:' + JSON.stringify({ statusCode: this.statusCode, payload })); }
    };
    requireAdmin(req, res, () => console.log('RESULT:' + JSON.stringify({ next: true, user: req.user })));
  `, { ADMIN_API_TOKEN: 'secret-token', NODE_ENV: 'production' });

  const result = parseResult(output);
  assert.equal(result.next, true);
  assert.equal(result.user.authType, 'admin-token');
});

test('score computation rolls back if a user total cannot be updated', () => {
  const output = runNode(`
    const db = require('./dist/db').default;
    const { computeDayScores } = require('./dist/services/scoringService');

    setTimeout(async () => {
      await db.run(
        "INSERT INTO daily_players (game_date, player_id, player_name, team_id, team_name, season_avg, stats_points, stats_status, is_played) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ['2026-01-02', '101', 'Test Player', 'TST', 'Test Team', 10, 20, 'played', 1]
      );
      await db.run(
        "INSERT INTO selections (user_id, game_date, play_mode, player_id, player_name, player_season_avg) VALUES (?, ?, ?, ?, ?, ?)",
        [9999, '2026-01-02', 1, '101', 'Test Player', 10]
      );

      let threw = false;
      try {
        await computeDayScores('2026-01-02');
      } catch (error) {
        threw = true;
      }

      const selection = await db.get("SELECT player_actual_score, total_score FROM selections WHERE user_id = ?", [9999]);
      console.log('RESULT:' + JSON.stringify({ threw, selection }));
    }, 50);
  `);

  const result = parseResult(output);
  assert.equal(result.threw, true);
  assert.equal(result.selection.player_actual_score, null);
  assert.equal(result.selection.total_score, null);
});

test('startup sync dates are based on Beijing date instead of UTC date', () => {
  const output = runNode(`
    const { getStartupSyncDates } = require('./dist/startup');
    console.log('RESULT:' + JSON.stringify(getStartupSyncDates(new Date('2026-07-02T16:30:00.000Z'))));
  `);

  assert.deepEqual(parseResult(output), ['2026-07-02', '2026-07-03', '2026-07-04']);
});

test('static public directory uses webapp as the development source of truth', () => {
  const output = runNode(`
    const path = require('node:path');
    const { resolvePublicDir } = require('./dist/staticAssets');
    const resolved = resolvePublicDir({
      nodeEnv: 'development',
      runtimeDir: path.resolve(__dirname, 'dist'),
      serverRoot: __dirname,
      webappExists: true
    });
    console.log('RESULT:' + JSON.stringify(path.relative(__dirname, resolved)));
  `);

  assert.equal(parseResult(output), path.join('..', 'webapp'));
});

test('admin web requests include bearer admin token when configured', async () => {
  const source = fs.readFileSync(path.resolve(serverRoot, '..', 'webapp/js/admin.js'), 'utf8');
  const context = {
    CONFIG: { API_BASE: 'https://example.test/api' },
    Utils: {
      storage: {
        get(key) {
          return key === 'adminToken' ? 'secret-token' : null;
        },
        set() {},
        remove() {},
      },
    },
    document: { addEventListener() {} },
    setTimeout,
    fetch: async (_url, config) => ({
      ok: true,
      json: async () => ({ headers: config.headers }),
    }),
  };

  const adminApp = vm.runInNewContext(`${source}\nAdminApp;`, context);
  adminApp.currentUser = { id: 17, is_admin: 1 };
  const result = await adminApp.apiRequest('/admin/users');

  assert.equal(result.headers.Authorization, 'Bearer secret-token');
  assert.equal(result.headers['X-User-Id'], 17);
});
