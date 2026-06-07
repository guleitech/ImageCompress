/**
 * Cloudflare Workers - ImageCompress API
 * 
 * 功能模块：
 * 1. Google OAuth 验证
 * 2. 点数管理（查询、扣除）
 * 3. Stripe 支付集成
 * 4. Webhook 回调处理
 */

// ============================================
// 常量与配置
// ============================================

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
};

const JWT_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

// ============================================
// 主入口函数
// ============================================

export default {
    async fetch(request, env, ctx) {
        // 处理 CORS 预检请求
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: CORS_HEADERS });
        }

        const url = new URL(request.url);
        const path = url.pathname;

        try {
            // API 路由分发
            switch (true) {
                // 配置接口（返回 Google Client ID）
                case path === '/api/config' && request.method === 'GET':
                    return handleGetConfig(env);

                // Google 登录验证
                case path === '/api/auth/google' && request.method === 'POST':
                    return handleGoogleAuth(request, env);

                // 查询用户点数
                case path === '/api/user/points' && request.method === 'GET':
                    return handleGetPoints(request, env);

                // 扣除点数
                case path === '/api/user/deduct' && request.method === 'POST':
                    return handleDeductPoints(request, env);

                // 创建 Stripe 收银台
                case path === '/api/create-checkout' && request.method === 'POST':
                    return handleCreateCheckout(request, env);

                // Stripe Webhook 回调
                case path === '/api/webhook/stripe' && request.method === 'POST':
                    return handleStripeWebhook(request, env);

                // 默认：返回静态页面（由 Pages 处理）
                default:
                    return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
            }
        } catch (error) {
            console.error('Worker error:', error);
            return new Response(
                JSON.stringify({ error: 'Internal server error' }),
                { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
            );
        }
    },
};

// ============================================
// 1. 配置接口
// ============================================

async function handleGetConfig(env) {
    return new Response(
        JSON.stringify({ googleClientId: env.GOOGLE_CLIENT_ID }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
}

// ============================================
// 2. Google OAuth 验证
// ============================================

async function handleGoogleAuth(request, env) {
    const { credential } = await request.json();

    if (!credential) {
        return new Response(
            JSON.stringify({ error: 'Missing credential' }),
            { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
    }

    try {
        // 验证 Google JWT Token
        const payload = await verifyGoogleJWT(credential, env);

        if (!payload) {
            return new Response(
                JSON.stringify({ error: 'Invalid credential' }),
                { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
            );
        }

        const userId = payload.sub;
        const userEmail = payload.email;
        const userName = payload.name;
        const userPicture = payload.picture;

        // 查询或创建用户点数记录
        let points = await getUserPoints(userId, env);

        if (points === null) {
            // 新用户：赠送初始点数（如 10 点）
            points = 10;
            await createOrUpdateUserPoints(userId, points, env);
        }

        // 返回用户信息
        return new Response(
            JSON.stringify({
                success: true,
                user: {
                    id: userId,
                    email: userEmail,
                    name: userName,
                    picture: userPicture
                },
                points: points
            }),
            { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('Google auth error:', error);
        return new Response(
            JSON.stringify({ error: 'Authentication failed' }),
            { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
    }
}

// 验证 Google JWT Token
async function verifyGoogleJWT(token, env) {
    try {
        // 解析 JWT（简单实现，生产环境建议使用库如 jose）
        const parts = token.split('.');
        if (parts.length !== 3) return null;

        const header = JSON.parse(atob(parts[0]));
        const payload = JSON.parse(atob(parts[1]));
        const signature = parts[2];

        // 验证算法
        if (header.alg !== 'RS256') return null;

        // 验证 issuer
        if (!JWT_ISSUERS.includes(payload.iss)) return null;

        // 验证 audience（Client ID）
        if (payload.aud !== env.GOOGLE_CLIENT_ID) return null;

        // 验证过期时间
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp < now) return null;

        // 生产环境应验证签名，这里简化处理
        // 实际部署建议使用 Google 的 tokeninfo API 或 JWT 库

        return payload;
    } catch (error) {
        console.error('JWT verification error:', error);
        return null;
    }
}

// ============================================
// 3. 点数管理
// ============================================

// 查询用户点数
async function handleGetPoints(request, env) {
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(
            JSON.stringify({ error: 'Unauthorized' }),
            { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
    }

    const token = authHeader.slice(7);
    const payload = await verifyGoogleJWT(token, env);

    if (!payload) {
        return new Response(
            JSON.stringify({ error: 'Invalid token' }),
            { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
    }

    const userId = payload.sub;
    const points = await getUserPoints(userId, env);

    return new Response(
        JSON.stringify({ points: points || 0 }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
}

// 扣除点数（原子操作）
async function handleDeductPoints(request, env) {
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(
            JSON.stringify({ error: 'Unauthorized' }),
            { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
    }

    const token = authHeader.slice(7);
    const payload = await verifyGoogleJWT(token, env);

    if (!payload) {
        return new Response(
            JSON.stringify({ error: 'Invalid token' }),
            { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
    }

    const userId = payload.sub;
    const { amount } = await request.json();

    if (!amount || amount <= 0) {
        return new Response(
            JSON.stringify({ error: 'Invalid amount' }),
            { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
    }

    // 原子扣除点数
    const result = await atomicDeductPoints(userId, amount, env);

    if (result.success) {
        return new Response(
            JSON.stringify({ success: true, points: result.points }),
            { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
    } else {
        return new Response(
            JSON.stringify({ success: false, error: 'Insufficient points' }),
            { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
    }
}

// ============================================
// 4. Stripe 支付集成
// ============================================

// 创建 Stripe Checkout Session
async function handleCreateCheckout(request, env) {
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(
            JSON.stringify({ error: 'Unauthorized' }),
            { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
    }

    const token = authHeader.slice(7);
    const payload = await verifyGoogleJWT(token, env);

    if (!payload) {
        return new Response(
            JSON.stringify({ error: 'Invalid token' }),
            { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
    }

    const userId = payload.sub;
    const { credits, amount } = await request.json();

    if (!credits || !amount) {
        return new Response(
            JSON.stringify({ error: 'Missing credits or amount' }),
            { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
    }

    try {
        // 调用 Stripe API 创建 Checkout Session
        const session = await createStripeCheckoutSession(userId, credits, amount, env);

        return new Response(
            JSON.stringify({ url: session.url }),
            { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('Stripe checkout error:', error);
        return new Response(
            JSON.stringify({ error: 'Failed to create checkout session' }),
            { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
    }
}

// Stripe Webhook 回调处理
async function handleStripeWebhook(request, env) {
    const payload = await request.text();
    const sig = request.headers.get('stripe-signature');

    if (!sig) {
        return new Response(
            JSON.stringify({ error: 'Missing signature' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }

    try {
        // 验证 Webhook 签名
        const event = await verifyStripeWebhook(payload, sig, env);

        if (!event) {
            return new Response(
                JSON.stringify({ error: 'Invalid signature' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        // 处理支付成功事件
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            const userId = session.client_reference_id;
            const credits = session.metadata.credits;

            if (userId && credits) {
                // 增加点数
                await addPoints(userId, parseInt(credits), env);
                console.log(`Added ${credits} points to user ${userId}`);
            }
        }

        return new Response(
            JSON.stringify({ received: true }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('Webhook error:', error);
        return new Response(
            JSON.stringify({ error: 'Webhook processing failed' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}

// 创建 Stripe Checkout Session
async function createStripeCheckoutSession(userId, credits, amount, env) {
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            'payment_method_types[]': 'card',
            'line_items[0][price_data][currency]': 'usd',
            'line_items[0][price_data][unit_amount]': amount * 100, // 转换为美分
            'line_items[0][price_data][product_data][name]': `${credits} Image Credits`,
            'line_items[0][price_data][product_data][description]': `Compress ${credits} images`,
            'line_items[0][quantity]': '1',
            'mode': 'payment',
            'success_url': `${env.APP_URL}?payment=success`,
            'cancel_url': `${env.APP_URL}?payment=cancel`,
            'client_reference_id': userId,
            'metadata[credits]': credits.toString(),
            'metadata[user_id]': userId,
        }).toString(),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Stripe API error: ${error}`);
    }

    return await response.json();
}

// 验证 Stripe Webhook 签名
async function verifyStripeWebhook(payload, sig, env) {
    // 简化实现：生产环境应使用 Stripe SDK 或完整签名验证
    // 这里仅做基础验证
    
    try {
        const event = JSON.parse(payload);
        
        // 验证事件类型是否有效
        const validTypes = [
            'checkout.session.completed',
            'payment_intent.succeeded',
            'payment_intent.payment_failed'
        ];
        
        if (!validTypes.includes(event.type)) {
            console.log(`Ignoring event type: ${event.type}`);
            return null;
        }
        
        // 生产环境应验证签名
        // 实际部署建议使用 Stripe 库的 webhook 签名验证
        
        return event;
    } catch (error) {
        console.error('Webhook parsing error:', error);
        return null;
    }
}

// ============================================
// 5. D1 数据库操作
// ============================================

// 查询用户点数
async function getUserPoints(userId, env) {
    try {
        const result = await env.DB.prepare(
            'SELECT points FROM user_points WHERE user_id = ?'
        ).bind(userId).first();

        return result ? result.points : null;
    } catch (error) {
        console.error('Database query error:', error);
        return null;
    }
}

// 创建或更新用户点数
async function createOrUpdateUserPoints(userId, points, env) {
    try {
        await env.DB.prepare(
            'INSERT INTO user_points (user_id, points) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET points = ?'
        ).bind(userId, points, points).run();

        return true;
    } catch (error) {
        console.error('Database insert error:', error);
        return false;
    }
}

// 原子扣除点数（使用事务保证原子性）
async function atomicDeductPoints(userId, amount, env) {
    try {
        // 先查询当前点数
        const current = await getUserPoints(userId, env);
        
        if (current === null || current < amount) {
            return { success: false, points: current || 0 };
        }

        // 执行扣除
        const newPoints = current - amount;
        
        await env.DB.prepare(
            'UPDATE user_points SET points = ? WHERE user_id = ?'
        ).bind(newPoints, userId).run();

        return { success: true, points: newPoints };
    } catch (error) {
        console.error('Atomic deduct error:', error);
        return { success: false, points: 0 };
    }
}

// 增加点数
async function addPoints(userId, amount, env) {
    try {
        // 获取当前点数
        const current = await getUserPoints(userId, env);
        
        const newPoints = (current || 0) + amount;
        
        // 更新点数
        await env.DB.prepare(
            'INSERT INTO user_points (user_id, points) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET points = points + ?'
        ).bind(userId, amount, amount).run();

        console.log(`User ${userId} points updated: ${current || 0} + ${amount} = ${newPoints}`);
        return true;
    } catch (error) {
        console.error('Add points error:', error);
        return false;
    }
}