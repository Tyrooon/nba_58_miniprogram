/**
 * 根据JS代码分析，尝试找到本场比赛数据的API
 * 从代码中发现：getData调用了 Object(f["q"])(t) 和 Object(f["p"])(t)
 * 这些可能是获取比赛数据和赛况数据的函数
 */
import fetch from 'node-fetch';

async function testSaikuangApis() {
  console.log('=== 测试赛况数据API ===\n');
  
  const matchId = '1794039'; // 老鹰vs活塞
  
  // 根据JS代码分析，可能的API路径
  const urls = [
    // 赛况数据API
    `https://m.zhibo8.cc/saikuang/nba/2025/${matchId}.json`,
    `https://m.zhibo8.cc/json/saikuang/${matchId}.json`,
    `https://m.zhibo8.cc/json/saikuang/nba/${matchId}.json`,
    `https://m.zhibo8.cc/json/saikuang/nba/2025/${matchId}.json`,
    // 比分数据
    `https://m.zhibo8.cc/json/bifen/${matchId}.json`,
    `https://m.zhibo8.cc/json/bifen/nba/${matchId}.json`,
    // 可能的API格式
    `https://m.zhibo8.cc/api/saikuang/${matchId}`,
    `https://m.zhibo8.cc/api/match/${matchId}/saikuang`,
    // 尝试从cache获取
    `https://cache.qiumibao.com/json/saikuang/nba/2025/${matchId}.htm`,
    `https://cache.qiumibao.com/json/bifen/nba/2025/${matchId}.htm`,
    // 尝试a.qiumibao.com
    `https://a.qiumibao.com/json/saikuang/${matchId}.json`,
    `https://a.qiumibao.com/json/match/${matchId}.json`,
  ];
  
  for (const url of urls) {
    try {
      console.log(`尝试: ${url}`);
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)' },
        timeout: 5000,
      });
      
      if (response.ok) {
        const text = await response.text();
        console.log(`  成功! 长度: ${text.length}`);
        console.log(`  内容: ${text.substring(0, 500)}`);
      } else {
        console.log(`  失败: ${response.status}`);
      }
    } catch (error: any) {
      console.log(`  错误: ${error?.message}`);
    }
  }
}

async function testWebstatApi() {
  console.log('\n\n=== 测试webstat API ===\n');
  
  // 从JS代码中发现webstat.qiumibao.com
  const urls = [
    'https://webstat.qiumibao.com/api/match/1794039',
    'https://webstat.qiumibao.com/api/saikuang/1794039',
  ];
  
  for (const url of urls) {
    try {
      console.log(`尝试: ${url}`);
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 5000,
      });
      
      if (response.ok) {
        const text = await response.text();
        console.log(`  成功! 长度: ${text.length}`);
        console.log(`  内容: ${text.substring(0, 500)}`);
      } else {
        console.log(`  失败: ${response.status}`);
      }
    } catch (error: any) {
      console.log(`  错误: ${error?.message}`);
    }
  }
}

async function testDcQiumibaoMatchApi() {
  console.log('\n\n=== 测试dc.qiumibao比赛数据API ===\n');
  
  const matchId = '1794039';
  const homeId = '6888'; // 活塞
  const awayId = '6916'; // 老鹰
  
  // 尝试不同的URL格式
  const urls = [
    // 尝试使用球队ID和比赛ID组合
    `https://dc.qiumibao.com/dc/db/924/2025/${homeId}_${matchId}_ban.json`,
    `https://dc.qiumibao.com/dc/db/924/2025/${matchId}_${homeId}_ban.json`,
    `https://dc.qiumibao.com/dc/db/924/2025/${matchId}_boxscore.json`,
    // 尝试不同的路径
    `https://dc.qiumibao.com/dc/match/924/${matchId}.json`,
    `https://dc.qiumibao.com/dc/match/924/2025/${matchId}.json`,
    `https://dc.qiumibao.com/dc/game/924/${matchId}.json`,
    `https://dc.qiumibao.com/dc/game/924/2025/${matchId}.json`,
    // 尝试ban类型
    `https://dc.qiumibao.com/dc/ban/924/${matchId}.json`,
    `https://dc.qiumibao.com/dc/ban/924/2025/${matchId}.json`,
  ];
  
  for (const url of urls) {
    try {
      console.log(`尝试: ${url}`);
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 5000,
      });
      
      if (response.ok) {
        const text = await response.text();
        console.log(`  成功! 长度: ${text.length}`);
        console.log(`  内容: ${text.substring(0, 800)}`);
      } else {
        console.log(`  失败: ${response.status}`);
      }
    } catch (error: any) {
      console.log(`  错误: ${error?.message}`);
    }
  }
}

async function testLiveDataApi() {
  console.log('\n\n=== 测试直播数据API ===\n');
  
  const matchId = '1794039';
  
  // 从JS代码中看到有saikuangTimer，可能是轮询获取数据
  // 尝试找到轮询的API
  const urls = [
    `https://m.zhibo8.cc/json/live/${matchId}.json`,
    `https://m.zhibo8.cc/json/live/nba/${matchId}.json`,
    `https://m.zhibo8.cc/json/live/nba/2025/${matchId}.json`,
    // 尝试获取实时数据
    `https://m.zhibo8.cc/json/realtime/${matchId}.json`,
    `https://m.zhibo8.cc/json/realtime/nba/${matchId}.json`,
  ];
  
  for (const url of urls) {
    try {
      console.log(`尝试: ${url}`);
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)' },
        timeout: 5000,
      });
      
      if (response.ok) {
        const text = await response.text();
        console.log(`  成功! 长度: ${text.length}`);
        console.log(`  内容: ${text.substring(0, 500)}`);
      } else {
        console.log(`  失败: ${response.status}`);
      }
    } catch (error: any) {
      console.log(`  错误: ${error?.message}`);
    }
  }
}

async function parseSaikuangHtml() {
  console.log('\n\n=== 解析赛况HTML页面 ===\n');
  
  const matchId = '1794039';
  const saikuangUrl = `https://m.zhibo8.com/saikuang/nba/2025/${matchId}.htm`;
  
  console.log(`获取赛况页面: ${saikuangUrl}`);
  const response = await fetch(saikuangUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)' }
  });
  
  const html = await response.text();
  
  // 从HTML中提取match_id
  const matchIdMatch = html.match(/<p id="match_id">(\d+)<\/p>/);
  console.log('match_id:', matchIdMatch ? matchIdMatch[1] : 'not found');
  
  // 从HTML中提取filename
  const filenameMatch = html.match(/<p id="filename">([^<]+)<\/p>/);
  console.log('filename:', filenameMatch ? filenameMatch[1] : 'not found');
  
  // 查找任何包含API路径的内容
  const apiPaths = html.match(/["']\/[^"']*json[^"']*["']/g) || [];
  console.log('\n找到的API路径:');
  for (const path of [...new Set(apiPaths)]) {
    console.log(`  ${path}`);
  }
}

async function main() {
  await testSaikuangApis();
  await testWebstatApi();
  await testDcQiumibaoMatchApi();
  await testLiveDataApi();
  await parseSaikuangHtml();
}

main().catch(console.error);

