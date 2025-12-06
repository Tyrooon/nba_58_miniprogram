import db from '../src/db';
import { config } from '../src/config';

(async () => {
  const override = process.env.TARGET_SEASON ? Number(process.env.TARGET_SEASON) : undefined;
  const season = override && !Number.isNaN(override) ? override : config.currentSeason;
  console.log(`Backfilling season totals for ${season}...`);
  await db.exec('BEGIN TRANSACTION');
  try {
    await db.exec(`DELETE FROM player_season_totals WHERE season = ${season}`);
    const rows = (await db.prepare(`
      SELECT 
        g.season as season,
        dp.player_id,
        dp.player_name,
        dp.team_id,
        dp.team_name,
        dp.stats_points as points,
        dp.game_date
      FROM daily_players dp
      JOIN games g ON g.game_date = dp.game_date
      WHERE g.season = ?
      ORDER BY dp.game_date ASC
    `).all([season])) as any[];

    const totals = new Map<number, any>();
    for (const row of rows) {
      const existing = totals.get(row.player_id);
      if (!existing) {
        totals.set(row.player_id, {
          season: row.season,
          player_id: row.player_id,
          player_name: row.player_name,
          team_id: row.team_id,
          team_name: row.team_name,
          games_played: 1,
          total_points: Number(row.points ?? 0),
          last_game_date: row.game_date
        });
      } else {
        existing.games_played += 1;
        existing.total_points += Number(row.points ?? 0);
        existing.team_id = row.team_id;
        existing.team_name = row.team_name;
        existing.last_game_date = row.game_date;
      }
    }

    const insert = db.prepare(`
      INSERT INTO player_season_totals (
        season, player_id, player_name, team_id, team_name,
        games_played, total_points, avg_points, last_game_date, updated_at
      )
      VALUES (
        @season, @player_id, @player_name, @team_id, @team_name,
        @games_played, @total_points, @avg_points, @last_game_date, datetime('now')
      )
    `);

    for (const data of totals.values()) {
      await insert.run({
        ...data,
        avg_points: data.games_played ? data.total_points / data.games_played : 0
      });
    }

    await db.exec('COMMIT');
    console.log(`Inserted totals for ${totals.size} players`);
  } catch (error) {
    await db.exec('ROLLBACK');
    console.error('Backfill failed', error);
    process.exit(1);
  }
  process.exit(0);
})();

