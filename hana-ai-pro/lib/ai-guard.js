import { createHmac, randomUUID } from 'node:crypto';

export class AIGuardError extends Error {
  constructor(code, status = 503, retryAfter = 0) { super(code); this.code = code; this.status = status; this.retryAfter = retryAfter; }
}

export function limiterConfigured(env = process.env) {
  return Boolean((env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL) && (env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN) && (env.AI_RATE_LIMIT_SALT || env.GROQ_API_KEY));
}

export function originAllowed(req, env = process.env, allowed = ['https://garhy.ai', 'https://hana-ai-pro.vercel.app']) {
  const origin = req.headers?.origin;
  if (typeof origin !== 'string' || !origin || req.headers['sec-fetch-site'] === 'cross-site' && !allowed.includes(origin)) return false;
  let parsed;
  try { parsed = new URL(origin); } catch { return false; }
  if (parsed.origin !== origin || parsed.username || parsed.password) return false;
  if (allowed.includes(origin)) return true;
  return env.VERCEL_ENV === 'preview' && Boolean(env.VERCEL_URL) && origin === `https://${env.VERCEL_URL}`;
}

export function validRequest(req, maxBytes = 32768) {
  const type = String(req.headers?.['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') return { status: 415, error: 'JSON content type required.' };
  const length = Number(req.headers?.['content-length'] || 0);
  if (!Number.isFinite(length) || length < 0) return { status: 400, error: 'Invalid request size.' };
  let bytes;
  try { bytes = Buffer.byteLength(JSON.stringify(req.body)); } catch { return { status: 400, error: 'Invalid JSON body.' }; }
  if (length > maxBytes || bytes > maxBytes) return { status: 413, error: 'Request too large.' };
  return null;
}

export function ipScope(req, env) {
  // Vercel overwrites X-Forwarded-For at its edge. Outside Vercel use the socket,
  // never an arbitrary client-supplied forwarded header.
  const forwarded = env.VERCEL ? req.headers?.['x-forwarded-for'] : null;
  const raw = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket?.remoteAddress;
  const ip = typeof raw === 'string' && /^[0-9a-f:.]{3,64}$/i.test(raw) ? raw : 'unknown';
  const salt = env.AI_RATE_LIMIT_SALT || env.GROQ_API_KEY;
  if (!salt) throw new AIGuardError('AI_BUDGET_UNAVAILABLE');
  return createHmac('sha256', salt).update(`garhy-ai-ip-v1:${ip}`).digest('hex');
}

export const ACQUIRE_LUA = `
local nowParts=redis.call('TIME')
local now=tonumber(nowParts[1])*1000+math.floor(tonumber(nowParts[2])/1000)
redis.call('ZREMRANGEBYSCORE',KEYS[3],'-inf',now)
redis.call('ZREMRANGEBYSCORE',KEYS[4],'-inf',now)
if redis.call('ZCARD',KEYS[3])>=tonumber(ARGV[4]) or redis.call('ZCARD',KEYS[4])>=tonumber(ARGV[5]) then return {'BUSY',2} end
local n=redis.call('INCR',KEYS[1])
if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end
if n>tonumber(ARGV[2]) then return {'RATE_LIMIT',math.max(1,redis.call('TTL',KEYS[1]))} end
local g=redis.call('INCR',KEYS[2])
if g==1 then redis.call('EXPIRE',KEYS[2],ARGV[1]) end
if g>tonumber(ARGV[3]) then return {'RATE_LIMIT',math.max(1,redis.call('TTL',KEYS[2]))} end
redis.call('ZADD',KEYS[3],now+tonumber(ARGV[6])*1000,ARGV[7])
redis.call('ZADD',KEYS[4],now+tonumber(ARGV[6])*1000,ARGV[7])
redis.call('EXPIRE',KEYS[3],ARGV[6])
redis.call('EXPIRE',KEYS[4],ARGV[6])
return {'OK',0}`;

async function redisCommand(args, env, fetchImpl) {
  let url;
  try { url = new URL(env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL); } catch {}
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (!url || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !token) throw new AIGuardError('AI_BUDGET_UNAVAILABLE');
  try {
    const response = await fetchImpl(url.href, {method:'POST', headers:{Authorization:`Bearer ${token}`, 'Content-Type':'application/json'}, body:JSON.stringify(args), cache:'no-store', redirect:'error', signal:AbortSignal.timeout(4000)});
    const data = await response.json();
    if (!response.ok || data.error || !Object.hasOwn(data, 'result')) throw new Error('transport');
    return data.result;
  } catch { throw new AIGuardError('AI_BUDGET_UNAVAILABLE'); }
}

export async function acquireBudget(req, {env = process.env, fetchImpl = fetch, namespace = 'hana', maxRequests = 15} = {}) {
  if (!limiterConfigured(env)) throw new AIGuardError('AI_BUDGET_UNAVAILABLE');
  if (!/^[a-z-]{1,24}$/.test(namespace)) throw new AIGuardError('AI_BUDGET_UNAVAILABLE');
  const scope = ipScope(req, env), leaseId = randomUUID();
  const keys = [`{garhy-ai}:v1:${namespace}:window:${scope}`, '{garhy-ai}:v1:global-window', '{garhy-ai}:v1:global-leases', `{garhy-ai}:v1:leases:${scope}`];
  const result = await redisCommand(['EVAL', ACQUIRE_LUA, 4, ...keys, 600, maxRequests, 120, 6, 2, 40, leaseId], env, fetchImpl);
  if (!Array.isArray(result) || !['OK','BUSY','RATE_LIMIT'].includes(result[0])) throw new AIGuardError('AI_BUDGET_UNAVAILABLE');
  if (result[0] !== 'OK') throw new AIGuardError(result[0], 429, Math.min(600, Math.max(1, Number(result[1]) || 2)));
  let released = false;
  return {async release() {
    if (released) return;
    released = true;
    try { await redisCommand(['EVAL', "redis.call('ZREM',KEYS[1],ARGV[1]);redis.call('ZREM',KEYS[2],ARGV[1]);return 1", 2, keys[2], keys[3], leaseId], env, fetchImpl); } catch { /* lease expires after 40s; never retry an LLM call */ }
  }};
}

export async function budgetReady(env = process.env, fetchImpl = fetch) {
  if (!limiterConfigured(env)) return false;
  try { return await redisCommand(['PING'], env, fetchImpl) === 'PONG'; } catch { return false; }
}

export function aiHeaders(res, origin) {
  res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer'); res.setHeader('Vary','Origin');
  res.setHeader('X-Request-ID',randomUUID());
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin',origin); res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Content-Type'); res.setHeader('Access-Control-Max-Age','600');
  }
}
