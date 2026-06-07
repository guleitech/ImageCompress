-- ============================================
-- D1 Database Schema for ImageCompress
-- ============================================
-- 表: user_points
-- 功能: 存储用户点数信息
-- 说明: 仅包含核心字段，保持极简设计
-- ============================================

CREATE TABLE IF NOT EXISTS user_points (
    -- 用户唯一标识（Google User ID）
    user_id TEXT PRIMARY KEY NOT NULL,
    
    -- 用户剩余点数
    points INTEGER NOT NULL DEFAULT 0,
    
    -- 创建时间（可选，用于统计）
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- 最后更新时间（可选，用于审计）
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 索引说明
-- ============================================
-- user_id 是主键，自带索引
-- 无需额外索引，保持数据库极简
-- ============================================

-- ============================================
-- 初始数据示例（可选）
-- ============================================
-- INSERT INTO user_points (user_id, points) VALUES ('test_user_001', 100);

-- ============================================
-- 常用查询示例
-- ============================================
-- 查询用户点数:
-- SELECT points FROM user_points WHERE user_id = 'xxx';
--
-- 更新用户点数:
-- UPDATE user_points SET points = points - 1 WHERE user_id = 'xxx';
--
-- 增加用户点数:
-- INSERT INTO user_points (user_id, points) VALUES ('xxx', 100) 
-- ON CONFLICT(user_id) DO UPDATE SET points = points + 100;
-- ============================================