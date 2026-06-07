# AGENTS.md

## 项目概览

**ImageCompress** - 基于 Cloudflare 技术栈的极简图片压缩网站，提供 Google 快捷登录、点数管理、前端本地压缩和 Stripe 支付功能。

## 技术栈

- **前端**: HTML + Tailwind CSS (CDN) + 原生 JavaScript
- **后端**: Cloudflare Workers
- **数据库**: Cloudflare D1 (SQLite)
- **支付**: Stripe Checkout + Webhook
- **认证**: Google OAuth 2.0 (JWT)

## 目录结构

```
/workspace/projects/
├── index.html              # 前端页面（主要入口）
├── workers/
│   └── index.js            # Workers API 代码
├── sql/
│   └── schema.sql          # D1 建表 SQL
├── wrangler.toml           # Workers 配置文件
├── .coze                   # Coze 项目配置
└── README.md               # 部署说明文档
```

## 构建与运行

### 本地预览（静态页面）

```bash
# 项目已通过 coze init 初始化，服务运行在 5000 端口
# 修改代码后会自动热更新
```

### Cloudflare 本地开发

```bash
# Workers 本地开发（需安装 wrangler）
wrangler dev --local

# Pages 本地开发
wrangler pages dev ./ --compatibility-date=2024-01-01
```

### 生产部署

```bash
# 1. 创建 D1 数据库
wrangler d1 create imagecompress-db

# 2. 执行建表 SQL
wrangler d1 execute imagecompress-db --file=./sql/schema.sql

# 3. 配置 Secrets
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put APP_URL

# 4. 部署 Workers
wrangler deploy

# 5. 部署 Pages（上传静态文件）
```

## API 接口清单

| 接口 | 方法 | 文件位置 | 功能 |
|------|------|----------|------|
| `/api/config` | GET | workers/index.js:56 | 返回 Google Client ID |
| `/api/auth/google` | POST | workers/index.js:66 | Google OAuth 登录验证 |
| `/api/user/points` | GET | workers/index.js:136 | 查询用户点数 |
| `/api/user/deduct` | POST | workers/index.js:162 | 原子扣除点数 |
| `/api/create-checkout` | POST | workers/index.js:206 | 创建 Stripe Checkout |
| `/api/webhook/stripe` | POST | workers/index.js:244 | Stripe Webhook 回调 |

## 关键功能模块

### 1. Google 登录验证 (workers/index.js:66-122)

- 接收前端 credential token
- 验证 JWT（issuer、audience、expiry）
- 查询/创建用户点数记录
- 返回用户信息和点数

### 2. 点数管理 (workers/index.js:136-220)

- `getUserPoints()`: 查询用户点数
- `createOrUpdateUserPoints()`: 创建/更新用户
- `atomicDeductPoints()`: 原子扣除（先查询后扣除）

### 3. Stripe 支付 (workers/index.js:206-280)

- `createStripeCheckoutSession()`: 创建 Checkout Session
- `handleStripeWebhook()`: 处理支付成功回调
- `verifyStripeWebhook()`: 验证 Webhook 签名

### 4. 前端图片压缩 (index.html)

- Canvas API 本地压缩
- 支持质量、尺寸、格式调整
- 压缩后自动下载

## 环境变量（Secrets）

| 变量 | 用途 |
|------|------|
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID |
| `STRIPE_SECRET_KEY` | Stripe API Key |
| `STRIPE_WEBHOOK_SECRET` | Webhook 签名密钥 |
| `APP_URL` | 应用域名（回调地址） |

## 数据库表结构

### user_points 表

| 字段 | 类型 | 说明 |
|------|------|------|
| `user_id` | TEXT | 主键，Google User ID |
| `points` | INTEGER | 用户剩余点数 |
| `created_at` | DATETIME | 创建时间（可选） |
| `updated_at` | DATETIME | 更新时间（可选） |

## 代码风格

- **注释**: 关键函数添加详细注释，代码分段明确
- **命名**: 函数命名清晰，如 `handleGoogleAuth`, `atomicDeductPoints`
- **安全**: 所有敏感信息通过 Secrets 管理，不硬编码

## 安全注意事项

1. JWT Token 验证确保用户身份安全
2. Stripe Webhook 签名验证防止伪造
3. 点数扣除使用原子操作防止并发
4. 前端压缩不上传，保护用户隐私

## 测试要点

### 前端测试

- Google 登录流程
- 图片压缩功能（不同格式、质量）
- 点数显示更新
- 支付流程跳转

### 后端测试

- JWT 验证逻辑
- 点数扣除（余额不足场景）
- Stripe Checkout 创建
- Webhook 签名验证

## 扩展建议

- R2 存储：保存压缩后的图片
- KV 缓存：存储用户 session
- Analytics：Cloudflare Analytics 集成
- Rate Limiting：请求频率限制

## 相关文档

- [README.md](README.md) - 详细部署指南
- [wrangler.toml](wrangler.toml) - Workers 配置
- [sql/schema.sql](sql/schema.sql) - 数据库建表