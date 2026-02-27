import sys

# 读取文件
with open('users.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# 找到 router.post('/auth-login', 的位置，在其后添加新接口
marker = 'router.post(\'/auth-login\','

# 插入新的路由（在 router.post('/auth-login', 之后）
new_route = '''// 微信小程序用户同步接口：从小程序云函数同步用户信息到本地
router.post('/sync-user', async (req, res) => {
  try {
    const { openid, nickname, avatarUrl } = req.body;

    if (!openid) {
      return res.status(400).json({ message: '缺少 openid' });
    }

    // 调用服务函数同步用户信息到本地
    const user = await syncUserFromCloudFunction(openid, nickname, avatarUrl);

    res.json(user);
  } catch (error: any) {
    console.error('同步用户信息失败:', error);
    res.status(500).json({ message: error.message || '同步失败' });
  }
});'''

# 找到 marker 位置
marker_pos = content.find(marker)

# 在 marker 之后插入新路由
if marker_pos:
    # 找到 marker_pos 后的换行符，在其前插入
    nl = content.find('\\n', marker_pos)
    if nl:
        # 在换行符前插入
        new_content = content[:marker_pos] + '\\n' + new_route + content[marker_pos:]
        f.seek(0, 0)
        f.write(new_content)
    else:
        # 如果没有换行符，在行尾添加
        f.seek(0, 2)
        f.write('\n' + new_route)
        f.write('export default router;\\n')
else:
    # 没找到 marker，直接在文件末尾添加
    f.write('\n' + new_route)
    f.write('export default router;\\n')

print("已添加 /sync-user 接口")
