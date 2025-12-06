import { refreshTodayScores } from '../src/services/gameService';

async function test() {
  console.log('测试刷新比分和球员得分...');
  const result = await refreshTodayScores('2025-12-02');
  console.log('结果:', result);
}

test().catch(console.error);

