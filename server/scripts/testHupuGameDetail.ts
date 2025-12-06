import fetch from 'node-fetch';

async function test() {
  console.log('=== 测试虎扑比赛详情页面 ===\n');
  
  // 尝试不同的URL格式
  const urls = [
    'https://nba.hupu.com/games/rockets-20251202',
    'https://nba.hupu.com/games/20251202',
    'https://nba.hupu.com/games/rockets',
  ];
  
  for (const url of urls) {
    try {
      console.log(`尝试: ${url}`);
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      const html = await response.text();
      
      // 查找球员数据表格
      if (html.includes('球员') || html.includes('得分') || html.includes('篮板')) {
        console.log('  找到球员数据！');
        
        // 查找表格
        const tableMatch = html.match(/<table[^>]*>[\s\S]*?<\/table>/);
        if (tableMatch) {
          console.log('  找到表格，长度:', tableMatch[0].length);
          console.log('  表格片段:', tableMatch[0].substring(0, 1000));
        }
        
        // 查找球员得分
        const playerMatch = html.match(/<tr[^>]*>[\s\S]{0,500}得分[\s\S]{0,500}<\/tr>/);
        if (playerMatch) {
          console.log('  找到球员行:', playerMatch[0].substring(0, 500));
        }
        
        break;
      } else {
        console.log('  未找到球员数据');
      }
    } catch (error: any) {
      console.log(`  错误: ${error?.message || error}`);
    }
  }
}

test().catch(console.error);

