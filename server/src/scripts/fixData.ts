/**
 * fixData.ts ── 数据修复脚本（一次性）
 *
 * 做两件事：
 * 1. 删除 gqw 测试账号（nickname='gqw' 且 total_score=0）
 * 2. 对所有正58（mode=2）和负58（mode=3）已出分的竞猜记录，
 *    用 player_game_log 重新计算"选人当天前的赛季场均"，
 *    并用新均值更新 player_season_avg / base_score / total_score，
 *    同时修正 users.total_score。
 *
 * 用法（在 server/ 目录下）：
 *   npx ts-node src/scripts/fixData.ts
 *   npx ts-node src/scripts/fixData.ts --dry-run   # 只打印，不修改数据库
 */

import db from '../db';

const DRY_RUN = process.argv.includes('--dry-run');

// ══════════════════════════════════════════════
// 0. 工具函数
// ══════════════════════════════════════════════

/** 负58公式 */
const calcBase = (mode: number, actual: number, seasonAvg: number): number => {
    switch (mode) {
        case 2: return 5.8 * (actual - seasonAvg) + 10;   // 正58
        case 3: return -5.8 * (actual - seasonAvg) + 10;  // 负58
        default: return actual;
    }
};

const round2 = (n: number) => Math.round(n * 100) / 100;

// ══════════════════════════════════════════════
// 1. 删除 gqw 测试账号
// ══════════════════════════════════════════════

async function deleteTestAccounts() {
    console.log('\n══ Step 1: Delete gqw test accounts ══');

    const testUsers = await db.prepare(
        `SELECT id, nickname, username, total_score, created_at
     FROM users WHERE nickname = 'gqw'`
    ).all([]) as any[];

    if (testUsers.length === 0) {
        console.log('  No gqw accounts found, skipping.');
        return;
    }

    console.log(`  Found ${testUsers.length} gqw account(s):`);
    for (const u of testUsers) {
        console.log(`    id=${u.id}  nickname=${u.nickname}  username=${u.username ?? '(none)'}  score=${u.total_score}  created=${u.created_at}`);
    }

    const userIds = testUsers.map((u: any) => u.id);
    const placeholders = userIds.map(() => '?').join(',');

    // 检查是否有关联选择记录
    const selCount = await db.prepare(
        `SELECT COUNT(*) as cnt FROM selections WHERE user_id IN (${placeholders})`
    ).get(userIds) as any;
    if (selCount.cnt > 0) {
        console.log(`  ⚠ These accounts have ${selCount.cnt} selection records, will also be deleted.`);
    }

    if (DRY_RUN) {
        console.log('  [DRY-RUN] Would delete selections + users for ids:', userIds);
        return;
    }

    await db.prepare(`DELETE FROM selections WHERE user_id IN (${placeholders})`).run(userIds);
    await db.prepare(`DELETE FROM frozen_players WHERE user_id IN (${placeholders})`).run(userIds);
    await db.prepare(`DELETE FROM users WHERE id IN (${placeholders})`).run(userIds);
    console.log(`  ✅ Deleted ${testUsers.length} gqw account(s) and their related records.`);
}

// ══════════════════════════════════════════════
// 2. 修正正58/负58的 player_season_avg 及得分
// ══════════════════════════════════════════════

async function fixModeAvgAndScores() {
    console.log('\n══ Step 2: Fix 正58/负58 season_avg & scores ══');

    // 只处理已出分（player_actual_score IS NOT NULL）的 mode 2/3 记录
    const selections = await db.prepare(`
    SELECT s.id, s.user_id, s.game_date, s.play_mode,
           s.player_name, s.player_actual_score,
           s.player_season_avg   AS old_avg,
           s.base_score          AS old_base,
           s.bonus_score         AS bonus,
           s.total_score         AS old_total
    FROM selections s
    WHERE s.play_mode IN (2, 3)
      AND s.player_actual_score IS NOT NULL
    ORDER BY s.game_date, s.player_name
  `).all([]) as any[];

    if (selections.length === 0) {
        console.log('  No scored mode-2/3 selections found, skipping.');
        return;
    }

    console.log(`  Found ${selections.length} selections to check.\n`);
    console.log(
        '  ' + ['SelectionID', 'Date', 'Mode', 'Player', 'OldAvg', 'NewAvg', 'Actual', 'OldBase', 'NewBase', 'OldTotal', 'NewTotal', 'ScoreDelta'].join(' | ')
    );
    console.log('  ' + '-'.repeat(130));

    let fixedCount = 0;

    for (const sel of selections) {
        // 使用选人当天前（严格 <）在 player_game_log 中的所有比赛计算均值
        const avgRow = await db.prepare(`
      SELECT ROUND(AVG(CAST(points AS REAL)), 2) as avg_pts, COUNT(*) as games
      FROM player_game_log
      WHERE player_name = ?
        AND game_date < ?
        AND season = (SELECT MAX(season) FROM player_game_log WHERE player_name = ?)
    `).get([sel.player_name, sel.game_date, sel.player_name]) as any;

        const newAvg: number | null = (avgRow && avgRow.games > 0) ? avgRow.avg_pts : null;

        if (newAvg === null) {
            console.log(`  ⚠ No game_log data for "${sel.player_name}" before ${sel.game_date}, keeping original avg=${sel.old_avg}`);
            continue;
        }

        const newBase = round2(calcBase(sel.play_mode, sel.player_actual_score, newAvg));
        const newTotal = round2(newBase + (sel.bonus ?? 0));
        const scoreDelta = round2(newTotal - (sel.old_total ?? 0));

        const changed = Math.abs(round2(newAvg) - round2(sel.old_avg ?? 0)) > 0.01;

        console.log(
            `  ${sel.id} | ${sel.game_date} | mode${sel.play_mode} | ${sel.player_name.padEnd(22)} | ` +
            `${String(sel.old_avg).padStart(5)} → ${String(round2(newAvg)).padStart(5)} | ` +
            `actual=${sel.player_actual_score} | ` +
            `base: ${String(sel.old_base).padStart(6)} → ${String(newBase).padStart(6)} | ` +
            `total: ${String(sel.old_total).padStart(6)} → ${String(newTotal).padStart(6)} | ` +
            `Δ=${scoreDelta > 0 ? '+' : ''}${scoreDelta}` +
            (changed ? '' : '  [NO CHANGE]')
        );

        if (!changed) continue;
        fixedCount++;

        if (!DRY_RUN) {
            // 更新 selections 表
            await db.prepare(`
        UPDATE selections
        SET player_season_avg = ?,
            base_score        = ?,
            total_score       = ?
        WHERE id = ?
      `).run([round2(newAvg), newBase, newTotal, sel.id]);

            // 修正 users.total_score（加上差值）
            await db.prepare(`
        UPDATE users SET total_score = ROUND(COALESCE(total_score, 0) + ?, 2)
        WHERE id = ?
      `).run([scoreDelta, sel.user_id]);
        }
    }

    console.log('\n  ' + '─'.repeat(130));
    if (DRY_RUN) {
        console.log(`  [DRY-RUN] Would fix ${fixedCount} selection(s). No changes written.`);
    } else {
        console.log(`  ✅ Fixed ${fixedCount} selection(s). selections & users.total_score updated.`);
    }
}

// ══════════════════════════════════════════════
// 3. 打印最终排行榜
// ══════════════════════════════════════════════

async function printLeaderboard() {
    console.log('\n══ Final Leaderboard ══');
    const rows = await db.prepare(`
    SELECT nickname, username, total_score
    FROM users
    ORDER BY total_score DESC
  `).all([]) as any[];

    rows.forEach((r: any, i: number) => {
        console.log(`  ${i + 1}. ${(r.nickname ?? r.username ?? '?').padEnd(20)} ${r.total_score}`);
    });
}

// ══════════════════════════════════════════════
// Main
// ══════════════════════════════════════════════

async function main() {
    console.log('='.repeat(60));
    console.log('  NBA 58 Data Fix Script');
    console.log(DRY_RUN ? '  MODE: DRY-RUN (no DB changes)' : '  MODE: LIVE (will modify DB)');
    console.log('='.repeat(60));

    await deleteTestAccounts();
    await fixModeAvgAndScores();
    await printLeaderboard();

    console.log('\n✅ Done.\n');
    process.exit(0);
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
