import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { paths } from '../config';
import { getUserById, getUserFrozenPlayers, updateUserProfile, getLeaderboard, getAllUsers, registerUser, authLogin, getUserByOpenid, linkWebAccountToOpenid, syncUserFromCloudFunction, linkAccount } from '../services/userService';
import { code2Session } from '../services/wechatService';

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
  try {
    const { code, openid: directOpenid } = req.body ?? {};

    // 如果直接传入了 openid（用于测试或向后兼容），直接使用
    // 否则通过 code 调用微信 API 获取真正的 openid
    let openid = directOpenid;

    if (!openid && code) {
      try {
        const session = await code2Session(code);
        openid = session.openid;
      } catch (error: any) {
        console.error('微信登录失败:', error.message);
        return res.status(400).json({ message: error.message || '微信登录失败' });
      }
    }

    if (!openid) {
      return res.status(400).json({ message: '缺少openid或code' });
    }

    const user = await getUserByOpenid(openid) as any;
    if (!user) {
      // 不自动创建默认用户，返回未关联状态
      return res.json({ linked: false });
    }
    return res.json({
      linked: true,
      id: user.id,
      nickname: user.nickname,
      avatarUrl: user.avatar_url,
      totalScore: user.total_score,
      username: user.username,
    });
  } catch (error: any) {
    console.error('登录失败:', error);
    res.status(500).json({ message: error.message || '登录失败' });
  }
});

/**
 * 关联账号（新流程）：不创建默认微信用户。
 * 通过 code 获取 openid，将网页端账号绑定到该 openid。
 */
router.post('/link-account', async (req, res) => {
  try {
    const { code, openid: directOpenid, username, password } = req.body ?? {};
    if (!username || !password) {
      return res.status(400).json({ message: '请输入用户名和密码' });
    }

    let openid = directOpenid;
    if (!openid && code) {
      const session = await code2Session(code);
      openid = session.openid;
    }
    if (!openid) {
      return res.status(400).json({ message: '缺少openid或code' });
    }

    const linkedUser = await linkWebAccountToOpenid(openid, username, password);
    return res.json({
      id: linkedUser.id,
      nickname: linkedUser.nickname,
      avatarUrl: linkedUser.avatar_url,
      username: linkedUser.username,
      totalScore: linkedUser.total_score,
    });
  } catch (error: any) {
    console.error('关联账号失败:', error);
    res.status(400).json({ message: error.message || '关联账号失败' });
  }
});

/**
 * 关联账号：将小程序账号与网页端账号关联
 */
router.post('/:userId/link-account', async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const { username, password } = req.body ?? {};

    if (!username || !password) {
      return res.status(400).json({ message: '请输入用户名和密码' });
    }

    const linkedUser = await linkAccount(userId, username, password);

    res.json({
      id: linkedUser.id,
      nickname: linkedUser.nickname,
      avatarUrl: linkedUser.avatar_url,
      username: linkedUser.username,
      totalScore: linkedUser.total_score,
    });
  } catch (error: any) {
    console.error('关联账号失败:', error);
    res.status(400).json({ message: error.message || '关联账号失败' });
  }
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
    username: user.username,
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

// 微信小程序用户同步接口：从小程序云函数同步用户信息到本地
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
});

export default router;
