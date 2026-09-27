import crypto from 'node:crypto';
import { AppError, assert } from './errors.js';

export const COOKIE_NAME = '__Host-gt_bybit_sid';
export const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const random = () => crypto.randomBytes(32).toString('base64url');
const safeEqual = (a, b) => crypto.timingSafeEqual(Buffer.from(hash(String(a || ''))), Buffer.from(hash(String(b || ''))));

export function isControlConfigured(env = process.env) {
  return typeof env.BYBIT_CONTROL_TOKEN === 'string' && env.BYBIT_CONTROL_TOKEN.trim().length >= 8;
}

export function sessionLifetime(env = process.env) {
  const days = Number(env.BYBIT_SESSION_MAX_AGE_DAYS || 30);
  assert(Number.isFinite(days) && days >= 1 && days <= 365, 'SESSION_CONFIG_INVALID', 'إعداد مدة الجلسة غير صالح.', 503);
  return Math.floor(days * 86400);
}

export function verifyOrigin(req, env = process.env) {
  const origin = req.headers.origin;
  const allowed = (env.BYBIT_ALLOWED_ORIGINS || 'https://crypto.garhy.tech').split(',').map((s) => s.trim());
  if (env.VERCEL_ENV === 'preview') {
    for (const hostname of [env.VERCEL_URL, env.VERCEL_BRANCH_URL]) {
      if (typeof hostname === 'string' && /^[a-z0-9-]+\.vercel\.app$/.test(hostname) && req.headers.host === hostname) {
        allowed.push(`https://${hostname}`);
      }
    }
  }
  assert(typeof origin === 'string' && allowed.includes(origin), 'ORIGIN_DENIED', 'مصدر الطلب غير مصرح به.', 403);
  assert(!req.headers['sec-fetch-site'] || req.headers['sec-fetch-site'] === 'same-origin', 'ORIGIN_DENIED', 'مصدر الطلب غير مصرح به.', 403);
}

function cookieId(req) {
  const parts = String(req.headers.cookie || '').split(';').map((s) => s.trim()).filter((s) => s.startsWith(`${COOKIE_NAME}=`));
  if (parts.length !== 1) return null;
  const value = parts[0].slice(COOKIE_NAME.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

export function createSessionService({ store, env = process.env, now = Date.now }) {
  const namespace = () => `gtbybit:v1:${hash(env.BYBIT_CONTROL_TOKEN || '').slice(0,24)}`;
  const sessionKey = (id) => `${namespace()}:session:${hash(id)}`;
  function setCookie(res, value, ttl) {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${ttl}`);
  }
  async function rateLimit(key, limit, ttl = 60) {
    const count = await store.increment(`${namespace()}:rate:${hash(key)}`, ttl);
    assert(count <= limit, 'RATE_LIMITED', 'طلبات كثيرة. انتظر قليلًا قبل المحاولة مجددًا.', 429);
  }
  async function authenticate(req, required = true) {
    const id = cookieId(req);
    const data = id ? await store.get(sessionKey(id)) : null;
    if (!data || data.expiresAt <= now() || !isControlConfigured(env)) {
      if (required) throw new AppError('UNAUTHORIZED', 'الجلسة غير صالحة. افتح جلسة التحكم من جديد.', 401);
      return null;
    }
    return { ...data, key: sessionKey(id), owner: hash(id), namespace: namespace() };
  }
  return {
    rateLimit, authenticate,
    async login(req, res, token) {
      verifyOrigin(req, env);
      assert(isControlConfigured(env), 'CONTROL_NOT_CONFIGURED', 'يلزم إعداد رمز التحكم على الخادم.', 503);
      const ip = env.VERCEL ? req.headers['x-vercel-forwarded-for'] : req.socket?.remoteAddress;
      await rateLimit(`login:${ip || 'unknown'}`, 10, 600);
      assert(typeof token === 'string' && token.length <= 512 && safeEqual(token.trim(), env.BYBIT_CONTROL_TOKEN.trim()), 'UNAUTHORIZED', 'رمز التحكم غير صحيح.', 401);
      const previous = cookieId(req);
      if (previous) await store.delete(sessionKey(previous));
      const id = random();
      const ttl = sessionLifetime(env);
      const data = { csrf: random(), createdAt: now(), expiresAt: now() + ttl * 1000 };
      await store.set(sessionKey(id), data, ttl);
      setCookie(res, id, ttl);
      return { authenticated: true, csrfToken: data.csrf, expiresAt: data.expiresAt, absoluteLifetimeDays: ttl / 86400, idleTimeout: false };
    },
    verifyCsrf(req, session) {
      verifyOrigin(req, env);
      assert(typeof req.headers['x-csrf-token'] === 'string' && safeEqual(req.headers['x-csrf-token'], session.csrf), 'CSRF_DENIED', 'تعذر التحقق من الطلب. حدّث الصفحة وحاول مجددًا.', 403);
    },
    async logout(req, res, session) {
      this.verifyCsrf(req, session);
      // A successful logout means the durable session record was invalidated.
      await store.delete(session.key);
      setCookie(res, '', 0);
    },
  };
}
