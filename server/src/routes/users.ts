import { Router } from 'express';
import { upsertUser, getUserById, getUserFrozenPlayers, updateUserProfile, getLeaderboard, getAllUsers } from '../services/userService';

const router = Router();

router.post('/login', async (req, res) => {
  const { code, openid, nickname, avatarUrl } = req.body ?? {};
  const identifier = openid ?? code;
  if (!identifier) {
    return res.status(400).json({ message: '缺少openid或code' });
  }
  const user = await upsertUser({
    openid: identifier,
    nickname,
    avatarUrl,
  }) as any;
  res.json({
    id: user.id,
    nickname: user.nickname,
    avatarUrl: user.avatar_url,
    totalScore: user.total_score,
  });
});

router.get('/leaderboard', async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const list = await getLeaderboard(limit);
    res.json(list);
  } catch (error) {
    res.status(500).json({ message: '获取排行榜失败' });
  }
});

router.get('/all', async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const list = await getAllUsers(limit);
    res.json(list);
  } catch (error) {
    res.status(500).json({ message: '获取用户列表失败' });
  }
});

router.get('/:userId', async (req, res) => {
  const user = await getUserById(Number(req.params.userId)) as any;
  if (!user) {
    return res.status(404).json({ message: '用户不存在' });
  }
  res.json({
    id: user.id,
    nickname: user.nickname,
    avatarUrl: user.avatar_url,
    totalScore: user.total_score,
    createdAt: user.created_at,
  });
});

router.put('/:userId/profile', async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const { nickname, avatarUrl } = req.body ?? {};
    
    const updatedUser = await updateUserProfile(userId, nickname, avatarUrl);
    res.json({
      id: updatedUser.id,
      nickname: updatedUser.nickname,
      avatarUrl: updatedUser.avatar_url,
      totalScore: updatedUser.total_score,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message || '更新失败' });
  }
});

router.get('/:userId/frozen', async (req, res) => {
  const user = await getUserById(Number(req.params.userId));
  if (!user) {
    return res.status(404).json({ message: '用户不存在' });
  }
  const playMode = req.query.playMode ? Number(req.query.playMode) : undefined;
  const list = await getUserFrozenPlayers(user.id, playMode);
  res.json(list);
});

export default router;
