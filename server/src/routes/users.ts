import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { upsertUser, getUserById, getUserFrozenPlayers, updateUserProfile, getLeaderboard, getAllUsers, registerUser, authLogin } from '../services/userService';
import { paths } from '../config';

const router = Router();

const avatarDir = path.resolve(paths.data, 'uploads', 'avatars');
fs.mkdirSync(avatarDir, { recursive: true });

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, avatarDir),
  filename: (req, _file, cb) => {
    const ext = path.extname(_file.originalname) || '.jpg';
    cb(null, `${req.params.userId}_${Date.now()}${ext}`);
  },
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 jpg/png/gif/webp 格式的图片'));
    }
  },
});

router.post('/register', async (req, res) => {
  try {
    const { username, password, confirmPassword, nickname } = req.body ?? {};
    if (password !== confirmPassword) {
      return res.status(400).json({ message: '两次输入的密码不一致' });
    }
    const user = await registerUser(username, password, nickname);
    res.json(user);
  } catch (error: any) {
    res.status(400).json({ message: error.message || '注册失败' });
  }
});

router.post('/auth-login', async (req, res) => {
  try {
    const { username, password } = req.body ?? {};
    const user = await authLogin(username, password);
    res.json(user);
  } catch (error: any) {
    res.status(400).json({ message: error.message || '登录失败' });
  }
});

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

router.post('/:userId/avatar', (req, res, next) => {
  avatarUpload.single('avatar')(req, res, async (err: any) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: '图片大小不能超过 2MB' });
      }
      return res.status(400).json({ message: err.message });
    }
    if (err) {
      return res.status(400).json({ message: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ message: '请上传头像文件' });
    }

    try {
      const userId = Number(req.params.userId);
      const avatarUrl = `/uploads/avatars/${req.file.filename}`;
      const updatedUser = await updateUserProfile(userId, undefined, avatarUrl);
      res.json({
        id: updatedUser.id,
        nickname: updatedUser.nickname,
        avatarUrl: updatedUser.avatar_url,
        totalScore: updatedUser.total_score,
      });
    } catch (error: any) {
      res.status(400).json({ message: error.message || '上传失败' });
    }
  });
});

router.get('/:userId/frozen', async (req, res) => {
  const user = await getUserById(Number(req.params.userId)) as any;
  if (!user) {
    return res.status(404).json({ message: '用户不存在' });
  }
  const playMode = req.query.playMode ? Number(req.query.playMode) : undefined;
  const list = await getUserFrozenPlayers(user.id, playMode) as unknown as any[];
  res.json(list);
});

export default router;
