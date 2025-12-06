/**
 * 分析直播吧比赛详情页面，找到球员本场数据的API
 */
import fetch from 'node-fetch';

async function analyzeMatchPage() {
  console.log('=== 分析比赛详情页面 ===\n');
  
  const matchId = '1794039'; // 老鹰vs活塞
  
  // 1. 先获取比赛详情JSON
  console.log('1. 获取比赛详情JSON...');
  const matchUrl = `https://m.zhibo8.cc/json/match/${matchId}.json`;
  const matchRes = await fetch(matchUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)' }
  });
  const matchData = await matchRes.json() as any;
  
  console.log('比赛:', matchData.visit_team, 'vs', matchData.home_team);
  console.log('比赛ID:', matchData.match_id);
  console.log('主队ID:', matchData.home_id);
  console.log('客队ID:', matchData.visit_id);
  
  // 检查data_tab中的数据
  if (matchData.data_tab) {
    console.log('\ndata_tab结构:', JSON.stringify(matchData.data_tab, null, 2));
  }
  
  // 2. 获取比赛页面HTML，查找API调用
  console.log('\n2. 获取比赛页面HTML...');
  const pageUrl = `https://m.zhibo8.com/zhibo/nba/2025/match${matchId}v.htm`;
  const pageRes = await fetch(pageUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)' }
  });
  const html = await pageRes.text();
  
  // 查找所有可能的API URL
  const apiMatches = html.match(/https?:\/\/[^"'\s<>]+\.(json|htm|php)[^"'\s<>]*/g) || [];
  const uniqueApis = [...new Set(apiMatches)];
  
  console.log('\n找到的API URL:');
  for (const api of uniqueApis) {
    console.log(`  ${api}`);
  }
  
  // 查找JavaScript中的API调用模式
  const jsApiPatterns = html.match(/\/json\/[^"'\s]+/g) || [];
  const uniqueJsApis = [...new Set(jsApiPatterns)];
  
  console.log('\n找到的JSON路径:');
  for (const api of uniqueJsApis) {
    console.log(`  ${api}`);
  }
}

async function tryBoxscoreApis() {
  console.log('\n\n=== 尝试各种boxscore API ===\n');
  
  const matchId = '1794039';
  const homeId = '6888'; // 活塞
  const awayId = '6916'; // 老鹰
  
  const urls = [
    // 尝试dc.qiumibao的本场数据
    `https://dc.qiumibao.com/dc/db/924/2025/${matchId}_ban.json`,
    `https://dc.qiumibao.com/dc/db/924/2025/${matchId}_ban.htm`,
    `https://dc.qiumibao.com/dc/db/924/${matchId}_ban.json`,
    `https://dc.qiumibao.com/dc/db/924/${matchId}.json`,
    `https://dc.qiumibao.com/dc/boxscore/924/${matchId}.json`,
    `https://dc.qiumibao.com/dc/game/${matchId}.json`,
    // 尝试stats.qiumibao
    `https://stats.qiumibao.com/data/json_v2/boxscore/${matchId}.json`,
    `https://stats.qiumibao.com/data/json_v2/game/${matchId}.json`,
    // 尝试m.zhibo8.cc
    `https://m.zhibo8.cc/json/boxscore/${matchId}.json`,
    `https://m.zhibo8.cc/json/match/${matchId}/boxscore.json`,
    `https://m.zhibo8.cc/json/match/${matchId}/stats.json`,
    `https://m.zhibo8.cc/json/match/${matchId}/players.json`,
    // 尝试data.zhibo8.cc
    `https://data.zhibo8.cc/manage/public/app.php?_url=/nba_v2/boxscore&match_id=${matchId}`,
    `https://data.zhibo8.cc/manage/public/app.php?_url=/nba_v2/game_stats&match_id=${matchId}`,
    `https://data.zhibo8.cc/manage/public/app.php?_url=/nba_v2/match&match_id=${matchId}`,
  ];
  
  for (const url of urls) {
    try {
      console.log(`尝试: ${url}`);
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)' },
        timeout: 5000,
      });
      
      if (response.ok) {
        let text = await response.text();
        // 移除PHP错误
        const jsonStart = text.indexOf('{');
        if (jsonStart > 0) {
          text = text.substring(jsonStart);
        }
        
        console.log(`  成功! 长度: ${text.length}`);
        
        // 检查是否包含球员数据
        if (text.includes('player') || text.includes('球员') || text.includes('得分') || text.includes('points')) {
          console.log(`  *** 可能包含球员数据! ***`);
          console.log(`  内容: ${text.substring(0, 1000)}`);
        } else {
          console.log(`  内容: ${text.substring(0, 300)}`);
        }
      } else {
        console.log(`  失败: ${response.status}`);
      }
    } catch (error: any) {
      console.log(`  错误: ${error?.message}`);
    }
  }
}

async function checkSaikuangPage() {
  console.log('\n\n=== 检查赛况页面 ===\n');
  
  const matchId = '1794039';
  const saikuangUrl = `https://m.zhibo8.com/saikuang/nba/2025/${matchId}.htm`;
  
  console.log(`获取赛况页面: ${saikuangUrl}`);
  const response = await fetch(saikuangUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)' }
  });
  
  const html = await response.text();
  console.log(`HTML长度: ${html.length}`);
  
  // 查找所有script标签中的src
  const scriptSrcs = html.match(/src=["']([^"']+)["']/g) || [];
  console.log('\n找到的script src:');
  for (const src of scriptSrcs.slice(0, 10)) {
    console.log(`  ${src}`);
  }
  
  // 查找可能的数据API
  const dataUrls = html.match(/https?:\/\/[^"'\s<>]*(?:dc|stats|data|json)[^"'\s<>]*/gi) || [];
  const uniqueDataUrls = [...new Set(dataUrls)];
  console.log('\n找到的数据URL:');
  for (const url of uniqueDataUrls) {
    console.log(`  ${url}`);
  }
  
  // 查找Vue/React数据绑定
  const dataBindings = html.match(/\{\{[^}]+\}\}/g) || [];
  console.log('\n找到的数据绑定:');
  for (const binding of dataBindings.slice(0, 10)) {
    console.log(`  ${binding}`);
  }
}

async function checkInsideLiveJs() {
  console.log('\n\n=== 检查inside-live JS文件 ===\n');
  
  // 从HTML中发现的JS文件
  const jsUrl = 'https://static4style.duoduocdn.com/static/inside-live/js/app.v1.57eefd82da9e0949ad5d.js';
  
  console.log(`获取JS文件: ${jsUrl}`);
  try {
    const response = await fetch(jsUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    const js = await response.text();
    console.log(`JS长度: ${js.length}`);
    
    // 查找API URL模式
    const apiPatterns = js.match(/["']https?:\/\/[^"']+["']/g) || [];
    const uniqueApis = [...new Set(apiPatterns)].filter(u => 
      u.includes('qiumibao') || u.includes('zhibo8') || u.includes('json') || u.includes('boxscore')
    );
    
    console.log('\n找到的API URL:');
    for (const api of uniqueApis.slice(0, 20)) {
      console.log(`  ${api}`);
    }
    
    // 查找boxscore相关代码
    const boxscoreMatches = js.match(/.{0,100}boxscore.{0,100}/gi) || [];
    console.log('\n包含boxscore的代码片段:');
    for (const match of boxscoreMatches.slice(0, 5)) {
      console.log(`  ${match}`);
    }
    
    // 查找player_stats相关代码
    const playerStatsMatches = js.match(/.{0,100}player.*stat.{0,100}/gi) || [];
    console.log('\n包含player stat的代码片段:');
    for (const match of playerStatsMatches.slice(0, 5)) {
      console.log(`  ${match}`);
    }
  } catch (error: any) {
    console.log(`错误: ${error?.message}`);
  }
}

async function main() {
  await analyzeMatchPage();
  await tryBoxscoreApis();
  await checkSaikuangPage();
  await checkInsideLiveJs();
}

main().catch(console.error);

