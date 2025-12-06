# NBA球星58竞猜小程序

基于 **Node.js + Express** 的后端与 **微信原生小程序** 的前端，实现 PRD 中描述的 “NBA球星58竞猜” 游戏。

## 数据源

- **NBA官方API**: 获取赛程和实时比分
- **Basketball Reference**: 获取球员场均数据和比赛Boxscore

## 仓库结构

```
.
├── server/      # Node.js 后端
└── miniapp/     # 微信小程序
```

---

## 后端（server）

### 主要特性

- Express + SQLite3 实现的 RESTful API。
- NBA官方API + Basketball Reference 数据同步：赛程、球队阵容、球员场均得分、比赛Boxscore。
- 玩法支持：常规模式、正58、负58。
- 冷冻名单（7天自动解冻）、积分计算与排行榜。
- 支持用户随机昵称生成、头像和昵称修改。
- 实时排行榜显示所有玩家得分。

### 快速开始

```bash
cd server
npm install
cp env.sample .env
npm run dev
```

`.env` 关键项：

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `PORT` | 服务端口 | 4000 |
| `CURRENT_SEASON` | 赛季（用于均分） | 2025 |
| `SYNC_CRON` | 每日同步任务 | `5 4 * * *` |
| `SCORE_CRON` | 每日计分任务 | `0 14 * * *` |

### 常用 API

| Method | Path | 说明 |
| --- | --- | --- |
| `POST` | `/api/users/login` | 微信授权后注册/登录 |
| `GET` | `/api/games/today` | 获取当日赛程 + 球员 |
| `POST` | `/api/selections` | 提交玩法选择 |
| `GET` | `/api/selections/history` | 历史记录 |
| `GET` | `/api/leaderboard?scope=overall|daily` | 排行榜 |
| `POST` | `/api/admin/sync` | 手动同步赛程/球员 |
| `POST` | `/api/admin/compute` | 手动触发积分计算 |

> **提示**：Ball Don't Lie 免费版本有速率限制，线上部署建议增加缓存或结合代理。

---

## 微信小程序（miniapp）

### 主要页面

- `pages/index`：今日赛程与三种玩法的球员锁定。
- `pages/history`：用户选择历史。
- `pages/leaderboard`：总榜/日榜。
- `pages/profile`：个人信息、冷冻名单。

### 配置

`miniapp/config.js` 中调整后端地址：

```js
const API_BASE = 'http://localhost:4000/api';
```

导入微信开发者工具后即可预览，发布前记得将 `project.config.json` 中的 `appid` 替换成真实小程序 AppID。

---

## 后续可扩展方向

- 接入真实微信登录（使用云托管或自建后端换取 openid/session_key）。
- 使用 MySQL/PostgreSQL 等集中式数据库，或引入 Prisma 进行 ORM 管理。
- 针对 BALL Don't Lie 的速率限制做本地缓存/离线化。
- 增加好友榜、推送订阅、成就系统等玩法。

欢迎根据业务需要继续扩展。 PRD 中的核心流程、玩法与冷冻规则均已在此版本中落地，可作为 MVP 直接上线测试。


