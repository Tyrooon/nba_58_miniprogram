-- 为支持微信小程序登录，添加新用户表使用 OPENID 作为主键

-- 新建用户表
CREATE TABLE IF NOT EXISTS openid_users (
  openid TEXT PRIMARY KEY,           -- 微信 OPENID（主键）
  nickname TEXT DEFAULT '球迷',         -- 昵称
  avatar_url TEXT,                   -- 头像URL
  total_score INTEGER DEFAULT 0,         -- 总积分
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,  -- 创建时间
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP   -- 更新时间
  last_login_at DATETIME,              -- 最后登录时间
  metadata TEXT DEFAULT '{}'             -- 额外信息（JSON 格式）
  UNIQUE (openid)                      -- OPENID 唯一
);

-- 用户表增加 OPENID 字段，同时保留原有登录方式
ALTER TABLE users ADD COLUMN openid TEXT;
CREATE INDEX IF NOT EXISTS idx_users_openid ON users(openid);

-- 数据迁移脚本：将现有用户的 openid 同步到新表
-- 注意：这只是一个示例，实际迁移需要根据数据情况谨慎处理
-- 运行前请备份数据库！
