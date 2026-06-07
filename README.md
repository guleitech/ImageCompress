# ImageCompress - 极简图片压缩网站

基于 Cloudflare Pages + Workers + D1 + R2 构建的海外图片压缩工具。

## 功能特性

- Google 快捷登录
- 点数管理系统
- 前端原生图片压缩（无需上传到服务器）
- Stripe 支付集成
- Webhook 自动充值

## 技术栈

- **前端**: HTML + Tailwind CSS + 原生 JavaScript
- **后端**: Cloudflare Workers
- **数据库**: Cloudflare D1 (SQLite)
- **支付**: Stripe Checkout
- **认证**: Google OAuth 2.0

## 部署步骤

### 1. 创建 Cloudflare 资源

#### 1.1 创建 D1 数据库

```bash
# 创建数据库
wrangler d1 create imagecompress-db

# 记录返回的 database_id，更新到 wrangler.toml 中
```

#### 1.2 执行数据库初始化

```bash
# 执行建表 SQL
wrangler d1 execute imagecompress-db --file=./sql/schema.sql
```

### 2. 配置 Google OAuth

#### 2.1 创建 Google OAuth 应用

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建新项目或选择现有项目
3. 进入 "APIs & Services" -> "Credentials"
4. 创建 "OAuth 2.0 Client ID"
5. 选择 "Web application"
6. 添加授权域名：
   - `https://your-domain.pages.dev`
   - 自定义域名（如有）
7. 记录 **Client ID**

#### 2.2 配置 Client ID Secret

```bash
wrangler secret put GOOGLE_CLIENT_ID
# 输入你的 Google Client ID
```

### 3. 配置 Stripe

#### 3.1 创建 Stripe 账户

1. 访问 [Stripe Dashboard](https://dashboard.stripe.com/)
2. 获取 API Keys（测试环境或生产环境）
3. 记录 **Secret Key**

#### 3.2 配置 Stripe Secrets

```bash
wrangler secret put STRIPE_SECRET_KEY
# 输入 Stripe Secret Key (sk_test_xxx 或 sk_live_xxx)

wrangler secret put STRIPE_WEBHOOK_SECRET
# 输入 Webhook Signing Secret (创建 Webhook 后获取)
```

#### 3.3 创建 Stripe Webhook

1. 在 Stripe Dashboard 进入 "Developers" -> "Webhooks"
2. 点击 "Add endpoint"
3. 输入 Webhook URL：
   ```
   https://your-domain.pages.dev/api/webhook/stripe
   ```
4. 选择监听事件：
   - `checkout.session.completed`
5. 创建后记录 **Signing Secret**

### 4. 配置应用 URL

```bash
wrangler secret put APP_URL
# 输入你的 Pages 域名，如: https://imagecompress.pages.dev
```

### 5. 部署到 Cloudflare Pages

#### 5.1 创建 Pages 项目

```bash
# 方法一：通过 Wrangler CLI
wrangler pages project create imagecompress

# 方法二：通过 Dashboard 手动创建
# 访问 Cloudflare Pages Dashboard，创建新项目
```

#### 5.2 上传静态文件

将以下文件上传到 Pages：
- `index.html`（前端页面）
- `styles/main.css`（可选，Tailwind 已通过 CDN 加载）

#### 5.3 绑定 Workers API

在 Pages Dashboard 中：
1. 进入项目设置 -> "Functions"
2. 创建绑定：
   - **Service binding**: 选择 `imagecompress-api` Workers
   - **Route**: `/api/*`

### 6. 部署 Workers API

```bash
# 部署到生产环境
wrangler deploy

# 或使用 wrangler.toml 中的配置
wrangler deploy --config wrangler.toml
```

### 7. 本地开发与测试

#### 7.1 启动本地开发环境

```bash
# 启动 Workers 本地开发（含 D1 本地数据库）
wrangler dev --local

# 启动 Pages 本地预览
wrangler pages dev ./ --compatibility-date=2024-01-01
```

#### 7.2 测试接口

```bash
# 测试配置接口
curl http://localhost:8787/api/config

# 测试点数查询（需要先登录获取 token）
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:8787/api/user/points
```

## 目录结构

```
/workspace/projects/
├── index.html              # 前端页面
├── workers/
│   └── index.js            # Workers API 代码
├── sql/
│   └── schema.sql          # D1 建表 SQL
├── wrangler.toml           # Workers 配置文件
├── .coze                   # Coze 项目配置
└── README.md               # 部署说明（本文件）
```

## API 接口说明

### 公开接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/config` | GET | 获取前端配置（Google Client ID） |

### 认证接口

| 接口 | 方法 | 说明 | 认证 |
|------|------|------|------|
| `/api/auth/google` | POST | Google 登录验证 | 无 |
| `/api/user/points` | GET | 查询用户点数 | Bearer Token |
| `/api/user/deduct` | POST | 扣除点数 | Bearer Token |

### 支付接口

| 接口 | 方法 | 说明 | 认证 |
|------|------|------|------|
| `/api/create-checkout` | POST | 创建 Stripe Checkout | Bearer Token |
| `/api/webhook/stripe` | POST | Stripe Webhook 回调 | 无 |

## 环境变量清单

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | `xxx.apps.googleusercontent.com` |
| `STRIPE_SECRET_KEY` | Stripe API Secret Key | `sk_test_xxx` 或 `sk_live_xxx` |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook 签名密钥 | `whsec_xxx` |
| `APP_URL` | 应用域名（用于 Stripe 回调） | `https://imagecompress.pages.dev` |

## 安全注意事项

1. **所有密钥通过 Cloudflare Secrets 管理，不要写入代码**
2. **JWT Token 验证确保用户身份安全**
3. **Stripe Webhook 验证签名防止伪造请求**
4. **点数扣除使用原子操作防止并发问题**
5. **前端图片压缩在浏览器本地执行，不上传到服务器**

## 费用估算

### Cloudflare 资源（免费额度）

| 服务 | 免费额度 | 说明 |
|------|----------|------|
| Pages | 无限制 | 静态网站托管 |
| Workers | 100,000 次/天 | API 请求 |
| D1 | 5GB 存储 + 500万行读/天 | 数据库 |

### Stripe 费用

- 每笔交易：2.9% + $0.30（美国）
- 测试环境无费用

## 扩展建议

1. **R2 存储**：如需保存压缩后的图片，可集成 R2
2. **KV 缓存**：可使用 KV 存储用户 session
3. **Analytics**：集成 Cloudflare Analytics 分析用户行为
4. **Rate Limiting**：添加请求频率限制防止滥用

## 常见问题

### Q: 为什么图片不上传到服务器？

A: 前端使用 Canvas API 本地压缩，用户隐私得到保护，且节省服务器带宽。

### Q: D1 数据库性能如何？

A: D1 基于 SQLite，适合中小规模应用，免费额度充足。

### Q: 如何切换 Stripe 测试/生产环境？

A: 更新 `STRIPE_SECRET_KEY` 和 `STRIPE_WEBHOOK_SECRET` 即可。

## 许可证

MIT License

## 支持

如有问题，请提交 Issue 或联系开发者。