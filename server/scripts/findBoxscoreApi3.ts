/**
 * 尝试从直播吧APP接口获取本场比赛数据
 * 或者直接从网页标题/描述中提取球员得分
 */
import fetch from 'node-fetch';

async function testAppApi() {
  console.log('=== 测试直播吧APP接口 ===\n');
  
  const matchId = '1794039';
  
  // APP可能使用不同的API
  const urls = [
    // 可能的APP API
    `https://api.zhibo8.cc/match/${matchId}`,
    `https://api.zhibo8.cc/v1/match/${matchId}`,
    `https://api.zhibo8.cc/v2/match/${matchId}`,
    `https://api.zhibo8.cc/nba/match/${matchId}`,
    // 可能的数据接口
    `https://data.zhibo8.cc/match/${matchId}.json`,
    `https://data.zhibo8.cc/nba/match/${matchId}.json`,
    // 尝试获取赛况数据
    `https://data.zhibo8.cc/manage/public/app.php?_url=/nba_v2/saikuang&match_id=${matchId}`,
    `https://data.zhibo8.cc/manage/public/app.php?_url=/nba_v2/bifen&match_id=${matchId}`,
    `https://data.zhibo8.cc/manage/public/app.php?_url=/nba_v2/player_stats&match_id=${matchId}`,
  ];
  
  for (const url of urls) {
    try {
      console.log(`尝试: ${url}`);
      const response = await fetch(url, {
        headers: { 
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
          'Accept': 'application/json',
        },
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
        
        // 检查是否包含有用数据
        if (text.includes('player') || text.includes('球员') || text.includes('得分') || text.includes('points')) {
          console.log(`  *** 可能包含球员数据! ***`);
        }
        console.log(`  内容: ${text.substring(0, 500)}`);
      } else {
        console.log(`  失败: ${response.status}`);
      }
    } catch (error: any) {
      console.log(`  错误: ${error?.message}`);
    }
  }
}

async function parseMatchTitle() {
  console.log('\n\n=== 从比赛标题解析球员得分 ===\n');
  
  // 从赛况页面标题中可以提取球员得分信息
  // 例如: "🏀活塞力擒老鹰 康宁汉姆18+8+8 杰伦·约翰逊29+13+7"
  
  const matchId = '1794039';
  const saikuangUrl = `https://m.zhibo8.com/saikuang/nba/2025/${matchId}.htm`;
  
  console.log(`获取赛况页面: ${saikuangUrl}`);
  const response = await fetch(saikuangUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)' }
  });
  
  const html = await response.text();
  
  // 提取标题
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  if (titleMatch) {
    const title = titleMatch[1];
    console.log('标题:', title);
    
    // 解析标题中的球员数据
    // 格式: 球员名+得分+篮板+助攻 或 球员名+得分
    const playerPattern = /([\u4e00-\u9fa5·]+)(\d+)\+(\d+)(?:\+(\d+))?/g;
    let match;
    
    console.log('\n解析到的球员数据:');
    while ((match = playerPattern.exec(title)) !== null) {
      const playerName = match[1];
      const points = match[2];
      const rebounds = match[3];
      const assists = match[4] || '0';
      console.log(`  ${playerName}: ${points}分 ${rebounds}篮板 ${assists}助攻`);
    }
  }
  
  // 也可以从meta description中获取
  const descMatch = html.match(/<meta name="Description" content="([^"]+)"/);
  if (descMatch) {
    console.log('\n描述:', descMatch[1]);
  }
}

async function testCacheApi() {
  console.log('\n\n=== 测试cache接口 ===\n');
  
  const matchId = '1794039';
  const filename = '2025_12_02-news-nba-match1794039date2025vnative';
  
  // 尝试从cache获取评论/数据
  const urls = [
    `https://cache.qiumibao.com/json/${filename.replace(/-/g, '/')}_count.htm`,
    `https://cache.qiumibao.com/json/2025/12/02/news/nba/match1794039date2025vnative_count.htm`,
    `https://cache.qiumibao.com/json/nba/2025/${matchId}.htm`,
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

async function testBifenApi() {
  console.log('\n\n=== 测试比分接口 ===\n');
  
  const matchId = '1794039';
  
  // 尝试从比分接口获取数据
  const urls = [
    // 可能的比分API
    `https://bifen.zhibo8.cc/json/nba/${matchId}.json`,
    `https://bifen.zhibo8.cc/json/match/${matchId}.json`,
    `https://bifen.zhibo8.cc/api/nba/${matchId}`,
    // 尝试不同的域名
    `https://bf.zhibo8.cc/json/nba/${matchId}.json`,
    `https://score.zhibo8.cc/json/nba/${matchId}.json`,
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

async function main() {
  await testAppApi();
  await parseMatchTitle();
  await testCacheApi();
  await testBifenApi();
}

main().catch(console.error);

