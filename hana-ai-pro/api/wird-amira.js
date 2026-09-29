import crypto from 'node:crypto';
import { buildWirdAmiraSystemMessage, OUT_OF_SCOPE_REPLY, validateWirdAmiraInput } from '../lib/wird-amira.js';

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 12;
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'openai/gpt-oss-20b';
const ALLOWED_ORIGINS = new Set([
  'https://wirdamira.garhy.tech',
  'https://tasbih.garhy.tech',
  'https://garhy.tech',
]);
const buckets = new Map();

function setBaseHeaders(res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Vary','Origin');
}

function cors(req,res) {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  if (!ALLOWED_ORIGINS.has(origin)) return false;
  res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Max-Age','600');
  return true;
}

function requestKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = typeof forwarded === 'string' && forwarded ? forwarded.split(',')[0].trim() : (req.socket?.remoteAddress || 'unknown');
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0,24);
}

function rateLimited(key) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key,{count:1,resetAt:now + WINDOW_MS});
    return false;
  }
  current.count += 1;
  return current.count > MAX_REQUESTS;
}

function providerError(payload,status) {
  const message = String(payload?.error?.message || '').toLowerCase();
  if (status === 429 || message.includes('rate limit')) return 'الخدمة مشغولة حاليًا. حاول مرة أخرى بعد قليل.';
  if (status === 401 || status === 403 || message.includes('authentication')) return 'خدمة المساعد غير متاحة مؤقتًا.';
  return 'تعذر الحصول على رد من المساعد حاليًا.';
}

export default async function handler(req,res) {
  setBaseHeaders(res);

  if (!cors(req,res)) {
    return res.status(403).json({error:'Origin not allowed.'});
  }

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow','POST, OPTIONS');
    return res.status(405).json({error:'Method not allowed.'});
  }

  const contentLength = Number(req.headers['content-length'] || 0);
  if (Number.isFinite(contentLength) && contentLength > 16384) {
    return res.status(413).json({error:'Request too large.'});
  }

  if (rateLimited(requestKey(req))) {
    return res.status(429).json({error:'لقد وصلت إلى الحد المؤقت للمحادثة. حاول مرة أخرى بعد قليل.'});
  }

  const parsed = validateWirdAmiraInput(req.body);
  if (!parsed.ok) return res.status(400).json({error:parsed.error});

  if (parsed.value.domain === 'OUT_OF_SCOPE') {
    return res.status(200).json({reply:OUT_OF_SCOPE_REPLY,scope:'out_of_scope'});
  }
  if (parsed.value.domain === 'UNSAFE') {
    return res.status(200).json({
      reply:'لا أستطيع المساعدة في تعليمات قد تسبب أذى. يمكنني بدلًا من ذلك مناقشة التوجيهات الإسلامية العامة التي تحث على حفظ النفس وحرمة الاعتداء.',
      scope:'unsafe'
    });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(503).json({error:'خدمة المساعد غير مهيأة حاليًا.'});

  const messages = [buildWirdAmiraSystemMessage(), ...parsed.value.messages.slice(-10)];

  try {
    const response = await fetch(GROQ_ENDPOINT,{
      method:'POST',
      headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model:MODEL,
        messages,
        reasoning_effort:'low',
        include_reasoning:false,
        temperature:0.25,
        top_p:0.9,
        max_completion_tokens:700,
        stream:false,
      }),
      signal:AbortSignal.timeout(45000),
    });

    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }

    if (!response.ok) {
      console.error('Wird Amira provider error',{status:response.status});
      return res.status(response.status === 429 ? 429 : 502).json({error:providerError(payload,response.status)});
    }

    const reply = payload?.choices?.[0]?.message?.content;
    if (typeof reply !== 'string' || !reply.trim()) {
      return res.status(502).json({error:'لم يُرجع المساعد إجابة صالحة.'});
    }

    return res.status(200).json({
      reply:reply.trim(),
      name:'مساعد وِرد أميرة الإسلامي',
      poweredBy:'HANA AI',
      scope:parsed.value.domain,
    });
  } catch (error) {
    const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    console.error('Wird Amira request error',{name:error?.name});
    return res.status(502).json({error:timeout ? 'انتهت مهلة الاتصال بالمساعد. حاول مرة أخرى.' : 'تعذر الاتصال بالمساعد حاليًا.'});
  }
}
