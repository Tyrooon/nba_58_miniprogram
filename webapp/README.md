# NBA 58 Web App

这是 NBA 58 竞猜游戏的网页版本，从微信小程序移植而来。

## 技术栈

- **前端**: 纯 HTML/CSS/JavaScript (无框架依赖)
- **后端**: 复用原有的 Node.js + Express + SQLite3 后端

## 快速开始

### 1. 启动后端

```bash
cd ../server
npm install
npm run dev
```

后端默认运行在 `http://localhost:4000`

### 2. 启动前端

由于是纯静态文件，你可以使用任何静态文件服务器：

**使用 Python:**
```bash
python3 -m http.server 3000
```

**使用 Node.js (serve):**
```bash
npx serve -p 3000
```

**使用 VS Code Live Server 插件**

然后访问 `http://localhost:3000`

### 3. 配置 API 地址

编辑 `js/config.js`，修改 `API_BASE` 为你的后端地址：

```javascript
const CONFIG = {
  API_BASE: 'http://localhost:4000/api',
  // ...
};
```

## 部署到生产环境

### 方案 1: 同源部署 (推荐)

将后端配置为同时服务静态文件：

```javascript
// 在 server/src/index.ts 中添加
app.use(express.static(path.join(__dirname, '../../webapp')));
```

### 方案 2: Nginx 反向代理

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 静态文件
    location / {
        root /path/to/nba_58_miniprogram/webapp;
        try_files $uri $uri/ /index.html;
    }

    # API 代理
    location /api {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 方案 3: Vercel/Netlify + 独立后端

1. 将 `webapp` 目录部署到 Vercel 或 Netlify
2. 将后端部署到 Railway/Render/Fly.io 等
3. 修改 `config.js` 中的 `API_BASE` 为后端地址

## 功能对比

| 功能 | 小程序版本 | 网页版本 | 状态 |
|------|----------|---------|------|
| 今日赛程 | ✅ | ✅ | 完成 |
| 球员选择 | ✅ | ✅ | 完成 |
| 三种玩法 | ✅ | ✅ | 完成 |
| 冷冻名单 | ✅ | ✅ | 完成 |
| 历史记录 | ✅ | ✅ | 完成 |
| 排行榜 | ✅ | ✅ | 完成 |
| 个人中心 | ✅ | ✅ | 完成 |
| 微信登录 | ✅ | ❌ | 使用昵称登录 |
| 无限滚动 | ✅ | ✅ | 完成 |

## 文件结构

```
webapp/
├── index.html          # 主页面
├── styles/
│   └── main.css        # 样式文件
├── js/
│   ├── config.js       # 配置文件
│   ├── utils.js        # 工具函数
│   ├── api.js          # API 封装
│   └── app.js          # 主应用逻辑
├── images/             # 图片资源
└── README.md           # 本文件
```

## 与小程序的主要差异

1. **登录方式**: 网页版使用昵称登录，不依赖微信授权
2. **存储**: 使用 localStorage 替代小程序的 wx.setStorageSync
3. **UI 适配**: CSS 已针对移动端优化，同时支持桌面浏览器
4. **TabBar**: 底部导航栏使用 HTML/CSS 实现，功能一致

## 浏览器兼容性

- Chrome 60+
- Firefox 60+
- Safari 12+
- Edge 79+

## 注意事项

1. 确保 `API_BASE` 配置正确
2. 后端需要配置 CORS 允许跨域请求
3. 生产环境建议使用 HTTPS
