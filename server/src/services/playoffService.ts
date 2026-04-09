/**
 * Playoff Service
 * Core business logic for NBA58 playoff mode — bracket seeding, head-to-head
 * matchups, daily player selection with freeze, plus58 scoring, and round
 * advancement.
 */

import db from '../db';

// ---------------------------------------------------------------------------
// Helper: Plus58 score calculation (matches scoringService mode 2)
//   score = 10 + 5.8 * (actual_points - season_avg)
//   If the player did not play (actual is undefined / null), score = 0.
// ---------------------------------------------------------------------------
const calcPlus58 = (actual: number | null | undefined, seasonAvg: number): number => {
  if (actual === null || actual === undefined) return 0;
  return Number((10 + 5.8 * (actual - seasonAvg)).toFixed(2));
};

// ---------------------------------------------------------------------------
// 1. initPlayoff  —  Seed the bracket from seasonal rankings
// ---------------------------------------------------------------------------
export const initPlayoff = async (season?: number): Promise<any> => {
  try {
    // Check if playoff_rounds already exist for this season
    const existing = await db.prepare(
      `SELECT id FROM playoff_rounds WHERE season = ? LIMIT 1`
    ).all([season ?? 2025]) as unknown as any[];

    if (existing && existing.length > 0) {
      throw new Error('Playoff bracket already initialised for this season');
    }

    const seasonValue = season ?? 2025;

    // Top 10 users ordered by total_bonus DESC (then total_score as tiebreak)
    const users = await db.prepare(
      `SELECT id, nickname, total_bonus, total_score
       FROM users
       ORDER BY COALESCE(total_bonus, 0) DESC, COALESCE(total_score, 0) DESC
       LIMIT 10`
    ).all([]) as unknown as any[];

    if (users.length < 2) {
      throw new Error('Not enough users to start a playoff');
    }

    const seeded = users.map((u: any, idx: number) => ({
      ...u,
      seed: idx + 1,
    }));

    // ---- Create rounds ----
    const roundTypes = ['play_in', 'round1', 'round2', 'conference_finals'];
    const roundIds: Record<string, number> = {};

    for (const rt of roundTypes) {
      const result = await db.prepare(
        `INSERT INTO playoff_rounds (season, round_type, status) VALUES (?, ?, 'upcoming')`
      ).run([seasonValue, rt]);
      roundIds[rt] = (result as any).lastID;
    }

    // ---- Create play-in matchups ----
    // #7 vs #8  and  #9 vs #10
    const matchupInserts: any[] = [];

    if (seeded.length >= 8) {
      const u7 = seeded[6];
      const u8 = seeded[7];
      matchupInserts.push({
        round_id: roundIds['play_in'],
        round_type: 'play_in',
        high_seed_user_id: String(u7.id),
        low_seed_user_id: String(u8.id),
        high_seed_rank: u7.seed,
        low_seed_rank: u8.seed,
        priority_user_id: String(u7.id),   // higher seed picks first
        label: 'play_in_1',
      });
    }

    if (seeded.length >= 10) {
      const u9 = seeded[8];
      const u10 = seeded[9];
      matchupInserts.push({
        round_id: roundIds['play_in'],
        round_type: 'play_in',
        high_seed_user_id: String(u9.id),
        low_seed_user_id: String(u10.id),
        high_seed_rank: u9.seed,
        low_seed_rank: u10.seed,
        priority_user_id: String(u9.id),
        label: 'play_in_2',
      });
    }

    const createdMatchups: any[] = [];
    for (const m of matchupInserts) {
      const res = await db.prepare(
        `INSERT INTO playoff_matchups
         (round_id, round_type, high_seed_user_id, low_seed_user_id,
          high_seed_rank, low_seed_rank, status, priority_user_id)
         VALUES (?, ?, ?, ?, ?, ?, 'upcoming', ?)`
      ).run([
        m.round_id, m.round_type,
        m.high_seed_user_id, m.low_seed_user_id,
        m.high_seed_rank, m.low_seed_rank,
        m.priority_user_id,
      ]);
      createdMatchups.push({ ...m, id: (res as any).lastID });
    }

    return {
      season: seasonValue,
      seeded: seeded.map((s: any) => ({ userId: s.id, nickname: s.nickname, seed: s.seed, totalBonus: s.total_bonus })),
      rounds: roundIds,
      matchups: createdMatchups,
    };
  } catch (err: any) {
    throw new Error(`initPlayoff failed: ${err.message}`);
  }
};

// ---------------------------------------------------------------------------
// 2. getPlayoffStatus  —  Full bracket view
// ---------------------------------------------------------------------------
export const getPlayoffStatus = async (userId?: string): Promise<any> => {
  try {
    const rounds = await db.prepare(
      `SELECT * FROM playoff_rounds ORDER BY
       CASE round_type
         WHEN 'play_in' THEN 1
         WHEN 'round1' THEN 2
         WHEN 'round2' THEN 3
         WHEN 'conference_finals' THEN 4
       END`
    ).all([]) as unknown as any[];

    const result: any[] = [];

    for (const round of rounds) {
      const matchups = await db.prepare(
        `SELECT pm.*,
           h.nickname AS high_seed_nickname, h.avatar_url AS high_seed_avatar,
           l.nickname AS low_seed_nickname,  l.avatar_url AS low_seed_avatar,
           w.nickname AS winner_nickname
         FROM playoff_matchups pm
         LEFT JOIN users h ON pm.high_seed_user_id = h.id
         LEFT JOIN users l ON pm.low_seed_user_id = l.id
         LEFT JOIN users w ON pm.winner_id = w.id
         WHERE pm.round_id = ?`
      ).all([round.id]) as unknown as any[];

      for (const mu of matchups) {
        // Aggregate scores for this matchup
        const scores = await db.prepare(
          `SELECT * FROM playoff_scores WHERE matchup_id = ? ORDER BY game_date`
        ).all([mu.id]) as unknown as any[];

        let highSeedTotal = 0;
        let lowSeedTotal = 0;
        let highSeedWins = 0;
        let lowSeedWins = 0;

        for (const sc of scores) {
          highSeedTotal += sc.high_seed_score || 0;
          lowSeedTotal += sc.low_seed_score || 0;
          if (sc.winner_user_id === mu.high_seed_user_id) highSeedWins++;
          if (sc.winner_user_id === mu.low_seed_user_id) lowSeedWins++;
        }

        (mu as any).scores = scores;
        (mu as any).high_seed_total = Number(highSeedTotal.toFixed(2));
        (mu as any).low_seed_total = Number(lowSeedTotal.toFixed(2));
        (mu as any).high_seed_wins = highSeedWins;
        (mu as any).low_seed_wins = lowSeedWins;

        // If a specific userId is given, include their selections
        if (userId) {
          const selections = await db.prepare(
            `SELECT * FROM playoff_selections WHERE matchup_id = ? AND user_id = ? ORDER BY game_date`
          ).all([mu.id, userId]) as unknown as any[];
          (mu as any).mySelections = selections;
        }
      }

      result.push({ ...round, matchups });
    }

    return result;
  } catch (err: any) {
    throw new Error(`getPlayoffStatus failed: ${err.message}`);
  }
};

// ---------------------------------------------------------------------------
// 3. getMatchupDetail  —  Single matchup with per-date breakdown
// ---------------------------------------------------------------------------
export const getMatchupDetail = async (matchupId: number, userId?: string): Promise<any> => {
  try {
    const matchup = await db.prepare(
      `SELECT pm.*,
         h.nickname AS high_seed_nickname, h.avatar_url AS high_seed_avatar,
         l.nickname AS low_seed_nickname,  l.avatar_url AS low_seed_avatar,
         w.nickname AS winner_nickname,
         pr.round_type, pr.status AS round_status, pr.config AS round_config
       FROM playoff_matchups pm
       LEFT JOIN users h ON pm.high_seed_user_id = h.id
       LEFT JOIN users l ON pm.low_seed_user_id = l.id
       LEFT JOIN users w ON pm.winner_id = w.id
       LEFT JOIN playoff_rounds pr ON pm.round_id = pr.id
       WHERE pm.id = ?`
    ).get([matchupId]) as any;

    if (!matchup) {
      throw new Error('Matchup not found');
    }

    // Determine game dates for this round
    let gameDates: string[] = [];
    if (matchup.round_config) {
      try {
        const config = JSON.parse(matchup.round_config);
        if (Array.isArray(config.gameDates)) {
          gameDates = config.gameDates;
        }
      } catch (_) { /* ignore parse error */ }
    }

    // Fallback: look at playoff_selections for this matchup
    if (gameDates.length === 0) {
      const dateRows = await db.prepare(
        `SELECT DISTINCT game_date FROM playoff_selections WHERE matchup_id = ? ORDER BY game_date`
      ).all([matchupId]) as unknown as any[];
      gameDates = dateRows.map((r: any) => r.game_date);
    }

    // Build per-date detail
    const days: any[] = [];
    for (const gd of gameDates) {
      const highSel = await db.prepare(
        `SELECT * FROM playoff_selections WHERE matchup_id = ? AND user_id = ? AND game_date = ?`
      ).get([matchupId, matchup.high_seed_user_id, gd]) as any;

      const lowSel = await db.prepare(
        `SELECT * FROM playoff_selections WHERE matchup_id = ? AND user_id = ? AND game_date = ?`
      ).get([matchupId, matchup.low_seed_user_id, gd]) as any;

      const scoreRow = await db.prepare(
        `SELECT * FROM playoff_scores WHERE matchup_id = ? AND game_date = ?`
      ).get([matchupId, gd]) as any;

      days.push({
        gameDate: gd,
        highSeed: highSel || null,
        lowSeed: lowSel || null,
        score: scoreRow || null,
      });
    }

    // Aggregate totals
    const scores = await db.prepare(
      `SELECT * FROM playoff_scores WHERE matchup_id = ? ORDER BY game_date`
    ).all([matchupId]) as unknown as any[];

    let highSeedTotal = 0;
    let lowSeedTotal = 0;
    for (const sc of scores) {
      highSeedTotal += sc.high_seed_score || 0;
      lowSeedTotal += sc.low_seed_score || 0;
    }

    return {
      matchup,
      gameDates,
      days,
      aggregate: {
        highSeedTotal: Number(highSeedTotal.toFixed(2)),
        lowSeedTotal: Number(lowSeedTotal.toFixed(2)),
      },
    };
  } catch (err: any) {
    throw new Error(`getMatchupDetail failed: ${err.message}`);
  }
};

// ---------------------------------------------------------------------------
// 4. makeSelection  —  Pick a player for a specific matchup + game date
// ---------------------------------------------------------------------------
export const makeSelection = async (
  matchupId: number,
  userId: string,
  playerId: string,
  gameDate: string
): Promise<any> => {
  try {
    // --- Validate matchup ---
    const matchup = await db.prepare(
      `SELECT pm.*, pr.id AS round_db_id, pr.round_type, pr.status AS round_status
       FROM playoff_matchups pm
       JOIN playoff_rounds pr ON pm.round_id = pr.id
       WHERE pm.id = ?`
    ).get([matchupId]) as any;

    if (!matchup) throw new Error('Matchup not found');
    if (matchup.status === 'completed') throw new Error('Matchup already completed');

    // --- Validate user is a participant ---
    const isHigh = String(matchup.high_seed_user_id) === String(userId);
    const isLow = String(matchup.low_seed_user_id) === String(userId);
    if (!isHigh && !isLow) {
      throw new Error('User is not a participant in this matchup');
    }

    // --- Priority check ---
    if (matchup.priority_user_id && String(matchup.priority_user_id) !== String(userId)) {
      throw new Error('It is not your turn to pick. Wait for the other user to select first.');
    }

    // --- Check if user already has a selection for this matchup+date ---
    const existing = await db.prepare(
      `SELECT * FROM playoff_selections WHERE matchup_id = ? AND user_id = ? AND game_date = ?`
    ).get([matchupId, userId, gameDate]) as any;

    if (existing) {
      throw new Error('You have already made a selection for this game date');
    }

    // --- Check frozen ---
    const frozen = await db.prepare(
      `SELECT 1 FROM playoff_frozen_players
       WHERE user_id = ? AND round_id = ?`
    ).get([userId, matchup.round_db_id]) as any;

    if (frozen) {
      // Get the frozen player list to see if this specific player is frozen
      const frozenPlayer = await db.prepare(
        `SELECT * FROM playoff_frozen_players WHERE user_id = ? AND player_id = ? AND round_id = ?`
      ).get([userId, playerId, matchup.round_db_id]) as any;
      if (frozenPlayer) {
        throw new Error('This player is frozen for the current round');
      }
    }

    // --- Get player info (season_avg) ---
    const dailyPlayer = await db.prepare(
      `SELECT * FROM daily_players WHERE game_date = ? AND player_id = ?`
    ).get([gameDate, playerId]) as any;

    let seasonAvg = 0;
    let playerName = '';

    if (dailyPlayer) {
      seasonAvg = dailyPlayer.season_avg || 0;
      playerName = dailyPlayer.player_name || '';
    } else {
      // Fallback: look in player_season_totals
      const seasonRow = await db.prepare(
        `SELECT * FROM player_season_totals WHERE player_id = ? ORDER BY season DESC LIMIT 1`
      ).get([playerId]) as any;
      if (seasonRow) {
        seasonAvg = seasonRow.avg_points || 0;
        playerName = seasonRow.player_name || '';
      } else {
        throw new Error('Player not found');
      }
    }

    // --- Insert selection ---
    const insertResult = await db.prepare(
      `INSERT INTO playoff_selections
       (matchup_id, user_id, player_id, player_name, game_date, season_avg)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run([matchupId, userId, playerId, playerName, gameDate, seasonAvg]);

    // --- Add to frozen players for this round ---
    await db.prepare(
      `INSERT OR IGNORE INTO playoff_frozen_players
       (user_id, player_id, player_name, round_id, frozen_date)
       VALUES (?, ?, ?, ?, ?)`
    ).run([userId, playerId, playerName, matchup.round_db_id, gameDate]);

    // --- Toggle priority to the other user ---
    const otherUserId = isHigh ? matchup.low_seed_user_id : matchup.high_seed_user_id;
    await db.prepare(
      `UPDATE playoff_matchups SET priority_user_id = ? WHERE id = ?`
    ).run([otherUserId, matchupId]);

    // --- Update matchup status to 'active' if it was 'upcoming' ---
    if (matchup.status === 'upcoming') {
      await db.prepare(
        `UPDATE playoff_matchups SET status = 'active' WHERE id = ?`
      ).run([matchupId]);
    }

    const selection = await db.prepare(
      `SELECT * FROM playoff_selections WHERE id = ?`
    ).get([(insertResult as any).lastID]);

    return selection;
  } catch (err: any) {
    throw new Error(`makeSelection failed: ${err.message}`);
  }
};

// ---------------------------------------------------------------------------
// 5. deleteSelection  —  Remove a selection and undo freeze
// ---------------------------------------------------------------------------
export const deleteSelection = async (
  matchupId: number,
  userId: string,
  gameDate: string
): Promise<any> => {
  try {
    const matchup = await db.prepare(
      `SELECT pm.*, pr.id AS round_db_id FROM playoff_matchups pm
       JOIN playoff_rounds pr ON pm.round_id = pr.id
       WHERE pm.id = ?`
    ).get([matchupId]) as any;

    if (!matchup) throw new Error('Matchup not found');
    if (matchup.status === 'completed') throw new Error('Matchup already completed');

    // Find the selection
    const sel = await db.prepare(
      `SELECT * FROM playoff_selections WHERE matchup_id = ? AND user_id = ? AND game_date = ?`
    ).get([matchupId, userId, gameDate]) as any;

    if (!sel) throw new Error('No selection found for this matchup/date/user');

    // Remove from playoff_selections
    await db.prepare(
      `DELETE FROM playoff_selections WHERE id = ?`
    ).run([sel.id]);

    // Remove from playoff_frozen_players
    await db.prepare(
      `DELETE FROM playoff_frozen_players
       WHERE user_id = ? AND player_id = ? AND round_id = ?`
    ).run([userId, sel.player_id, matchup.round_db_id]);

    // Toggle priority back to this user (undo the toggle from makeSelection)
    await db.prepare(
      `UPDATE playoff_matchups SET priority_user_id = ? WHERE id = ?`
    ).run([userId, matchupId]);

    return { deleted: true, matchupId, userId, gameDate };
  } catch (err: any) {
    throw new Error(`deleteSelection failed: ${err.message}`);
  }
};

// ---------------------------------------------------------------------------
// 6. calculateMatchupDayScores  —  Compute plus58 scores for one day
// ---------------------------------------------------------------------------
export const calculateMatchupDayScores = async (
  matchupId: number,
  gameDate: string
): Promise<any> => {
  try {
    const matchup = await db.prepare(
      `SELECT * FROM playoff_matchups WHERE id = ?`
    ).get([matchupId]) as any;

    if (!matchup) throw new Error('Matchup not found');

    const highUserId = matchup.high_seed_user_id;
    const lowUserId = matchup.low_seed_user_id;

    // Get both users' selections
    const highSel = await db.prepare(
      `SELECT * FROM playoff_selections WHERE matchup_id = ? AND user_id = ? AND game_date = ?`
    ).get([matchupId, highUserId, gameDate]) as any;

    const lowSel = await db.prepare(
      `SELECT * FROM playoff_selections WHERE matchup_id = ? AND user_id = ? AND game_date = ?`
    ).get([matchupId, lowUserId, gameDate]) as any;

    // If either user hasn't selected yet, skip scoring
    if (!highSel || !lowSel) {
      return { matchupId, gameDate, status: 'waiting', highSel: !!highSel, lowSel: !!lowSel };
    }

    // Resolve actual points for each selection
    const resolveActual = async (playerId: string): Promise<number | null> => {
      // Try daily_players first (most authoritative for the date)
      const dp = await db.prepare(
        `SELECT stats_points, stats_status FROM daily_players WHERE game_date = ? AND player_id = ?`
      ).get([gameDate, playerId]) as any;

      if (dp && dp.stats_status === 'played' && dp.stats_points != null) {
        return Number(dp.stats_points);
      }

      // Try player_game_log
      const pgl = await db.prepare(
        `SELECT points FROM player_game_log WHERE game_date = ? AND player_sb_id = ?`
      ).get([gameDate, playerId]) as any;

      if (pgl && pgl.points != null) {
        return Number(pgl.points);
      }

      // No data yet
      return null;
    };

    const highActual = await resolveActual(highSel.player_id);
    const lowActual = await resolveActual(lowSel.player_id);

    // Calculate plus58 scores
    const highScore = calcPlus58(highActual, highSel.season_avg);
    const lowScore = calcPlus58(lowActual, lowSel.season_avg);

    // Update selections with actual_points and plus58_score
    await db.prepare(
      `UPDATE playoff_selections SET actual_points = ?, plus58_score = ? WHERE id = ?`
    ).run([highActual ?? 0, highScore, highSel.id]);

    await db.prepare(
      `UPDATE playoff_selections SET actual_points = ?, plus58_score = ? WHERE id = ?`
    ).run([lowActual ?? 0, lowScore, lowSel.id]);

    // Determine winner of this day
    let winnerUserId: string | null = null;
    if (highScore > lowScore) {
      winnerUserId = highUserId;
    } else if (lowScore > highScore) {
      winnerUserId = lowUserId;
    }
    // Tie: no winner for this day (null)

    // Upsert playoff_scores record
    const existingScore = await db.prepare(
      `SELECT id FROM playoff_scores WHERE matchup_id = ? AND game_date = ?`
    ).get([matchupId, gameDate]) as any;

    if (existingScore) {
      await db.prepare(
        `UPDATE playoff_scores
         SET high_seed_score = ?, low_seed_score = ?, winner_user_id = ?
         WHERE id = ?`
      ).run([highScore, lowScore, winnerUserId, existingScore.id]);
    } else {
      await db.prepare(
        `INSERT INTO playoff_scores (matchup_id, game_date, high_seed_score, low_seed_score, winner_user_id)
         VALUES (?, ?, ?, ?, ?)`
      ).run([matchupId, gameDate, highScore, lowScore, winnerUserId]);
    }

    return {
      matchupId,
      gameDate,
      highSeed: { userId: highUserId, playerId: highSel.player_id, playerName: highSel.player_name, actualPoints: highActual, seasonAvg: highSel.season_avg, plus58Score: highScore },
      lowSeed: { userId: lowUserId, playerId: lowSel.player_id, playerName: lowSel.player_name, actualPoints: lowActual, seasonAvg: lowSel.season_avg, plus58Score: lowScore },
      winnerUserId,
    };
  } catch (err: any) {
    throw new Error(`calculateMatchupDayScores failed: ${err.message}`);
  }
};

// ---------------------------------------------------------------------------
// 7. advanceRound  —  Determine winners and create next round matchups
// ---------------------------------------------------------------------------
export const advanceRound = async (roundType: string): Promise<any> => {
  try {
    const round = await db.prepare(
      `SELECT * FROM playoff_rounds WHERE round_type = ? ORDER BY id DESC LIMIT 1`
    ).get([roundType]) as any;

    if (!round) throw new Error(`Round '${roundType}' not found`);

    // Get all matchups for this round
    const matchups = await db.prepare(
      `SELECT * FROM playoff_matchups WHERE round_id = ?`
    ).all([round.id]) as unknown as any[];

    if (matchups.length === 0) {
      throw new Error('No matchups found for this round');
    }

    const results: any[] = [];

    for (const mu of matchups) {
      if (mu.status === 'completed') {
        results.push({ matchupId: mu.id, winnerId: mu.winner_id, skipped: true });
        continue;
      }

      // Aggregate playoff_scores for this matchup
      const scores = await db.prepare(
        `SELECT * FROM playoff_scores WHERE matchup_id = ?`
      ).all([mu.id]) as unknown as any[];

      let highTotal = 0;
      let lowTotal = 0;
      for (const sc of scores) {
        highTotal += sc.high_seed_score || 0;
        lowTotal += sc.low_seed_score || 0;
      }

      let winnerId: string;
      if (highTotal > lowTotal) {
        winnerId = mu.high_seed_user_id;
      } else if (lowTotal > highTotal) {
        winnerId = mu.low_seed_user_id;
      } else {
        // Tie: higher seed (lower rank number) wins
        winnerId = mu.high_seed_user_id;
      }

      // Update matchup
      await db.prepare(
        `UPDATE playoff_matchups SET winner_id = ?, status = 'completed' WHERE id = ?`
      ).run([winnerId, mu.id]);

      results.push({
        matchupId: mu.id,
        highTotal: Number(highTotal.toFixed(2)),
        lowTotal: Number(lowTotal.toFixed(2)),
        winnerId,
      });
    }

    // Mark round as completed
    await db.prepare(
      `UPDATE playoff_rounds SET status = 'completed' WHERE id = ?`
    ).run([round.id]);

    // Clear frozen players for this round
    await db.prepare(
      `DELETE FROM playoff_frozen_players WHERE round_id = ?`
    ).run([round.id]);

    // --- Create next round matchups ---
    const nextRoundType = getNextRoundType(roundType);

    if (nextRoundType) {
      const nextRound = await db.prepare(
        `SELECT * FROM playoff_rounds WHERE round_type = ? ORDER BY id DESC LIMIT 1`
      ).get([nextRoundType]) as any;

      if (!nextRound) {
        throw new Error(`Next round '${nextRoundType}' not found in playoff_rounds`);
      }

      if (roundType === 'play_in') {
        // Play-in produces seed 7 and seed 8
        // play_in matchup ordering: first matchup is #7v#8, second is #9v#10
        const sortedMatchups = matchups.sort((a: any, b: any) => a.id - b.id);

        // Game1 winner = seed 7, Game1 loser = eliminated or goes to game3
        // Game2 winner stays alive
        // Simplified model: play_in_1 winner = seed7, play_in_1 loser vs play_in_2 winner = seed8

        const game1 = results.find((r: any) => r.matchupId === sortedMatchups[0]?.id);
        const game2 = results.length > 1
          ? results.find((r: any) => r.matchupId === sortedMatchups[1]?.id)
          : null;

        const seed7 = game1?.winnerId;
        // For seed 8: if there are two play-in matchups, the winner of game2 plays
        // the loser of game1 in a hypothetical game3. Simplified: seed8 = game2 winner.
        const seed8 = game2?.winnerId || null;

        // Build round1 seeding: #1v#8, #2v#7, #3v#6, #4v#5
        // We need to resolve users for seeds 1-6 from the original seeding
        const topUsers = await db.prepare(
          `SELECT id FROM users
           ORDER BY COALESCE(total_bonus, 0) DESC, COALESCE(total_score, 0) DESC
           LIMIT 6`
        ).all([]) as unknown as any[];

        const seedMap: Record<number, string> = {};
        topUsers.forEach((u: any, idx: number) => {
          seedMap[idx + 1] = String(u.id);
        });
        if (seed7) seedMap[7] = seed7;
        if (seed8) seedMap[8] = seed8;

        const round1Pairs = [
          [1, 8], [2, 7], [3, 6], [4, 5],
        ];

        for (const [high, low] of round1Pairs) {
          const highId = seedMap[high];
          const lowId = seedMap[low];
          if (!highId || !lowId) continue;

          await db.prepare(
            `INSERT INTO playoff_matchups
             (round_id, round_type, high_seed_user_id, low_seed_user_id,
              high_seed_rank, low_seed_rank, status, priority_user_id)
             VALUES (?, 'round1', ?, ?, ?, ?, 'upcoming', ?)`
          ).run([
            nextRound.id,
            highId, lowId,
            high, low,
            highId,  // higher seed picks first
          ]);
        }

        // Mark round1 as active
        await db.prepare(
          `UPDATE playoff_rounds SET status = 'active' WHERE id = ?`
        ).run([nextRound.id]);

      } else if (roundType === 'round1' || roundType === 'round2') {
        // Bracket-style advancement: take winners in order
        const sortedResults = results.sort((a: any, b: any) => a.matchupId - b.matchupId);
        const winners = sortedResults.map((r: any) => r.winnerId);

        // Also get the original seeds for the winners
        const winnerSeeds: { userId: string; seed: number }[] = [];
        for (const r of sortedResults) {
          const mu = matchups.find((m: any) => m.id === r.matchupId);
          if (!mu) continue;
          const seed = r.winnerId === mu.high_seed_user_id
            ? mu.high_seed_rank
            : mu.low_seed_rank;
          winnerSeeds.push({ userId: r.winnerId, seed });
        }

        // Pair winners: (0 vs 1), (2 vs 3), etc.
        for (let i = 0; i < winnerSeeds.length - 1; i += 2) {
          const a = winnerSeeds[i];
          const b = winnerSeeds[i + 1];
          // Lower seed number = higher seed
          const highSeed = a.seed <= b.seed ? a : b;
          const lowSeed = a.seed <= b.seed ? b : a;

          await db.prepare(
            `INSERT INTO playoff_matchups
             (round_id, round_type, high_seed_user_id, low_seed_user_id,
              high_seed_rank, low_seed_rank, status, priority_user_id)
             VALUES (?, ?, ?, ?, ?, ?, 'upcoming', ?)`
          ).run([
            nextRound.id,
            nextRoundType,
            highSeed.userId, lowSeed.userId,
            highSeed.seed, lowSeed.seed,
            highSeed.userId,
          ]);
        }

        // Mark next round as active
        await db.prepare(
          `UPDATE playoff_rounds SET status = 'active' WHERE id = ?`
        ).run([nextRound.id]);

      } else if (roundType === 'conference_finals') {
        // This is the final round — no next matchups to create
        // The winner of the conference finals is the champion
      }
    }

    return { roundType, results };
  } catch (err: any) {
    throw new Error(`advanceRound failed: ${err.message}`);
  }
};

/** Map current round type to the next round type */
const getNextRoundType = (current: string): string | null => {
  switch (current) {
    case 'play_in':          return 'round1';
    case 'round1':           return 'round2';
    case 'round2':           return 'conference_finals';
    case 'conference_finals': return null;
    default:                 return null;
  }
};

// ---------------------------------------------------------------------------
// 8. getFrozenPlayers  —  Frozen players for a user in a round
// ---------------------------------------------------------------------------
export const getFrozenPlayers = async (userId: string, roundId?: number): Promise<any[]> => {
  try {
    let query = `
      SELECT fp.*, pr.round_type
      FROM playoff_frozen_players fp
      JOIN playoff_rounds pr ON fp.round_id = pr.id
      WHERE fp.user_id = ?
    `;
    const params: any[] = [userId];

    if (roundId) {
      query += ` AND fp.round_id = ?`;
      params.push(roundId);
    } else {
      // Default: get frozen players from the active round
      query += ` AND pr.status = 'active'`;
    }

    const rows = await db.prepare(query).all(params) as unknown as any[];

    return rows;
  } catch (err: any) {
    throw new Error(`getFrozenPlayers failed: ${err.message}`);
  }
};

// ---------------------------------------------------------------------------
// 9. syncPlayoffDates  —  Discover game dates for a round from the games table
// ---------------------------------------------------------------------------
export const syncPlayoffDates = async (roundType: string): Promise<any> => {
  try {
    const round = await db.prepare(
      `SELECT * FROM playoff_rounds WHERE round_type = ? ORDER BY id DESC LIMIT 1`
    ).get([roundType]) as any;

    if (!round) throw new Error(`Round '${roundType}' not found`);

    let startDate: string;
    let endDate: string;

    if (roundType === 'play_in') {
      // NBA play-in tournament: typically mid-April (April 13-18 for 2024-25 season)
      startDate = '2025-04-13';
      endDate = '2025-04-18';
    } else if (roundType === 'round1') {
      startDate = '2025-04-19';
      endDate = '2025-05-04';
    } else if (roundType === 'round2') {
      startDate = '2025-05-05';
      endDate = '2025-05-18';
    } else if (roundType === 'conference_finals') {
      startDate = '2025-05-19';
      endDate = '2025-06-05';
    } else {
      throw new Error(`Unknown round type: ${roundType}`);
    }

    // Auto-detect from games table: find dates with games in the range
    const dateRows = await db.prepare(
      `SELECT DISTINCT game_date
       FROM games
       WHERE game_date >= ? AND game_date <= ?
         AND status IS NOT NULL
       ORDER BY game_date ASC`
    ).all([startDate, endDate]) as unknown as any[];

    const gameDates = dateRows.map((r: any) => r.game_date);

    // If no dates found from DB, try a broader search by looking for any games
    // after the previous round's end date
    if (gameDates.length === 0) {
      const anyGames = await db.prepare(
        `SELECT DISTINCT game_date
         FROM games
         WHERE game_date >= ? AND game_date <= ?
         ORDER BY game_date ASC`
      ).all([startDate, endDate]) as unknown as any[];

      // Return auto-detection hint
      return {
        roundType,
        roundId: round.id,
        configuredDates: [],
        hint: 'No games found in the expected date range. Try syncing the schedule first.',
        expectedRange: { startDate, endDate },
      };
    }

    // Update round config
    const config = { gameDates };
    await db.prepare(
      `UPDATE playoff_rounds SET
         config = ?,
         start_date = ?,
         end_date = ?,
         status = CASE WHEN status = 'upcoming' THEN 'active' ELSE status END
       WHERE id = ?`
    ).run([JSON.stringify(config), gameDates[0], gameDates[gameDates.length - 1], round.id]);

    return {
      roundType,
      roundId: round.id,
      gameDates,
      startDate: gameDates[0],
      endDate: gameDates[gameDates.length - 1],
    };
  } catch (err: any) {
    throw new Error(`syncPlayoffDates failed: ${err.message}`);
  }
};

// ---------------------------------------------------------------------------
// 10. getAvailablePlayers  —  Players for a date minus frozen ones
// ---------------------------------------------------------------------------
export const getAvailablePlayers = async (
  matchupId: number,
  userId: string,
  gameDate: string
): Promise<any[]> => {
  try {
    // Resolve the round_id for this matchup
    const matchup = await db.prepare(
      `SELECT pm.*, pr.id AS round_db_id
       FROM playoff_matchups pm
       JOIN playoff_rounds pr ON pm.round_id = pr.id
       WHERE pm.id = ?`
    ).get([matchupId]) as any;

    if (!matchup) throw new Error('Matchup not found');

    // Get all players scheduled/playing on gameDate
    const allPlayers = await db.prepare(
      `SELECT player_id, player_name, team_id, team_name, position, season_avg, stats_points, stats_status
       FROM daily_players
       WHERE game_date = ?
       ORDER BY season_avg DESC`
    ).all([gameDate]) as unknown as any[];

    // Get frozen player IDs for this user + round
    const frozenRows = await db.prepare(
      `SELECT player_id FROM playoff_frozen_players WHERE user_id = ? AND round_id = ?`
    ).all([userId, matchup.round_db_id]) as unknown as any[];

    const frozenIds = new Set(frozenRows.map((r: any) => String(r.player_id)));

    // Also exclude the player the user already selected for this matchup+date
    const existingSel = await db.prepare(
      `SELECT player_id FROM playoff_selections WHERE matchup_id = ? AND user_id = ? AND game_date = ?`
    ).get([matchupId, userId, gameDate]) as any;

    if (existingSel) {
      frozenIds.add(String(existingSel.player_id));
    }

    // Filter out frozen
    const available = allPlayers.filter((p: any) => !frozenIds.has(String(p.player_id)));

    return available;
  } catch (err: any) {
    throw new Error(`getAvailablePlayers failed: ${err.message}`);
  }
};

// ---------------------------------------------------------------------------
// Default export
// ---------------------------------------------------------------------------
export default {
  initPlayoff,
  getPlayoffStatus,
  getMatchupDetail,
  makeSelection,
  deleteSelection,
  calculateMatchupDayScores,
  advanceRound,
  getFrozenPlayers,
  syncPlayoffDates,
  getAvailablePlayers,
};
