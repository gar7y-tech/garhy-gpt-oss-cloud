import crypto from 'node:crypto';
import { AppError, assert } from './errors.js';

const HOSTS = new Set(['api.bybit.com', 'api.bytick.com', 'api-testnet.bybit.com', 'api-demo.bybit.com', 'api.bybit.nl', 'api.bybit.tr', 'api.bybit.kz', 'api.bybitgeorgia.ge', 'api.bybit.ae', 'api.bybit.eu', 'api.bybit.id', 'api.manepa.jp', 'api-testnet.manepa.jp', 'api.spark-fintech.com', 'api-testnet.spark-fintech.com']);
const MESSAGES = [
  [[10003,10004,10007,10010,33004,-2015], 'INVALID_CREDENTIALS', 'مفاتيح Bybit غير صالحة أو منتهية أو لا تطابق بيئة الحساب أو عنوان IP.', 502],
  [[10005,10008,10024,10027,10028,100028,110067], 'PERMISSION_DENIED', 'صلاحيات المفتاح أو نوع الحساب لا يسمح بهذه العملية.', 403],
  [[10006,10018,10429,20003], 'RATE_LIMITED', 'تم بلوغ حد طلبات Bybit. انتظر قبل المحاولة مجددًا.', 429],
  [[10000,10016,10019], 'SERVICE_UNAVAILABLE', 'خدمة Bybit غير متاحة مؤقتًا. تحقق من حالة العملية قبل إعادة إرسالها.', 502],
  [[10002,-1], 'TIMESTAMP_ERROR', 'توقيت الطلب خارج النافذة المسموحة. تحقق من ساعة الخادم.', 502],
  [[10014,110072,131214], 'DUPLICATE_REQUEST', 'هذا الطلب مكرر. راجع سجل العمليات قبل إرسال طلب جديد.', 409],
  [[110004,110006,110007,110012,110014,110044,110045,170131,170132,131001,131212], 'INSUFFICIENT_BALANCE', 'الرصيد المتاح غير كافٍ لهذه العملية.', 400],
  [[10029,170121], 'INVALID_SYMBOL', 'رمز السوق غير صالح أو غير مدعوم.', 400],
  [[170136,170137,170140,170148,170149,110022,110032], 'INVALID_QUANTITY', 'الكمية لا تطابق حدود السوق أو دقة الكمية المطلوبة.', 400],
  [[110003,170134], 'INVALID_PRICE', 'السعر لا يطابق الحدود أو دقة السعر المطلوبة.', 400],
  [[110013,110043,110086,110090], 'INVALID_LEVERAGE', 'الرافعة المالية غير مسموحة أو لم تتغير. راجع حدود السوق.', 400],
  [[110024,110025,110028,110029], 'POSITION_MODE_MISMATCH', 'وضع المركز غير متوافق، أو توجد مراكز أو أوامر تمنع تغييره.', 400],
  [[131203,131204,131211], 'INVALID_TRANSFER_ACCOUNT', 'نوع حساب التحويل أو اتجاهه غير صالح.', 400],
  [[32023,32024,32025], 'QUOTE_EXPIRED', 'انتهى عرض التحويل أو تغير سعره. اطلب عرضًا جديدًا.', 409],
];

export class BybitError extends AppError {}

export function getBybitConfig(env = process.env) {
  const apiKey = env.BYBIT_API_KEY?.trim();
  const apiSecret = env.BYBIT_API_SECRET?.trim();
  assert(apiKey && apiSecret, 'BYBIT_NOT_CONFIGURED', 'مفاتيح Bybit غير مهيأة على الخادم.', 503);
  let url;
  try { url = new URL(env.BYBIT_API_BASE_URL || 'https://api.bybit.com'); } catch { /* validated below */ }
  assert(url && url.protocol === 'https:' && HOSTS.has(url.hostname) && !url.port && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash, 'BYBIT_CONFIG_INVALID', 'عنوان Bybit غير صالح.', 503);
  const recvWindow = Number(env.BYBIT_RECV_WINDOW || 5000);
  assert(Number.isInteger(recvWindow) && recvWindow >= 1000 && recvWindow <= 10000, 'BYBIT_CONFIG_INVALID', 'نافذة توقيت Bybit غير صالحة.', 503);
  return { apiKey, apiSecret, baseUrl: url.origin, recvWindow };
}

export function buildQuery(params = {}) {
  const search = new URLSearchParams();
  for (const key of Object.keys(params).sort()) {
    const value = params[key];
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  return search.toString();
}

export function signHmac({ timestamp, apiKey, recvWindow, payload, apiSecret }) {
  return crypto.createHmac('sha256', apiSecret).update(`${timestamp}${apiKey}${recvWindow}${payload}`).digest('hex');
}

function upstreamError(data, status, p2p = false) {
  const value = p2p && typeof data?.ret_code === 'number' ? data.ret_code : data?.retCode;
  const retCode = typeof value === 'number' ? value : null;
  let info = MESSAGES.find(([codes]) => codes.includes(retCode));
  // Only use upstream text for classification; never reflect it to the client or logs.
  if (retCode === 10001 && /position idx|position mode/i.test(data?.retMsg || '')) info = [[], 'POSITION_MODE_MISMATCH', 'اختيار جهة المركز لا يطابق وضع الحساب.', 400];
  if (status === 429) info = [[], 'RATE_LIMITED', 'تم بلوغ حد طلبات Bybit. انتظر قبل المحاولة مجددًا.', 429];
  if (status === 403 && !info) info = [[], 'UPSTREAM_ACCESS_DENIED', 'رفضت Bybit الاتصال من الخادم. راجع المنطقة وصلاحيات الوصول.', 502];
  const [,code,message,httpStatus] = info || [[], 'BYBIT_REJECTED', 'رفضت Bybit الطلب. راجع المدخلات وصلاحيات الحساب ورمز الخطأ.', status >= 500 ? 502 : 400];
  return new BybitError(code, message, httpStatus, { retCode });
}

export function createBybitClient({ env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
  return async function request(method, path, payload = {}) {
    const config = getBybitConfig(env);
    assert(['GET', 'POST'].includes(method) && /^\/v5\/[a-zA-Z0-9/-]+$/.test(path), 'INVALID_UPSTREAM_REQUEST', 'طلب الخادم غير صالح.', 500);
    const p2p = path.startsWith('/v5/p2p/');
    const timestamp = String(now());
    const recvWindow = String(config.recvWindow);
    const query = method === 'GET' ? buildQuery(payload) : '';
    const body = method === 'POST' ? JSON.stringify(payload) : undefined;
    const headers = {
      Accept: 'application/json',
      'X-BAPI-API-KEY': config.apiKey,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-RECV-WINDOW': recvWindow,
      'X-BAPI-SIGN': signHmac({ ...config, timestamp, recvWindow, payload: query || body || '' }),
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    try {
      const response = await fetchImpl(`${config.baseUrl}${path}${query ? `?${query}` : ''}`, {
        method, headers, body, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000),
      });
      let data;
      try { data = await response.json(); } catch {
        if (!response.ok) throw upstreamError(null, response.status, p2p);
        throw new BybitError('MALFORMED_UPSTREAM', 'استجابة Bybit غير صالحة.', 502);
      }
      const retCode = p2p && typeof data?.ret_code === 'number' ? data.ret_code : data?.retCode;
      assert(!p2p || typeof data?.ret_code !== 'number' || typeof data?.retCode !== 'number' || data.ret_code === data.retCode, 'MALFORMED_UPSTREAM', 'استجابة Bybit غير مكتملة.', 502);
      if (!response.ok || (typeof retCode === 'number' && retCode !== 0)) throw upstreamError(data, response.status, p2p);
      assert(data && retCode === 0 && data.result && typeof data.result === 'object' && !Array.isArray(data.result), 'MALFORMED_UPSTREAM', 'استجابة Bybit غير مكتملة.', 502);
      return data;
    } catch (error) {
      if (error instanceof AppError) throw error;
      const timedOut = ['TimeoutError','AbortError'].includes(error?.name);
      throw new BybitError(timedOut ? 'UPSTREAM_TIMEOUT' : 'NETWORK_ERROR', timedOut ? 'انتهت مهلة الاتصال. حالة العملية غير مؤكدة؛ راجع سجلها قبل أي محاولة جديدة.' : 'تعذر الاتصال بـBybit. تحقق من حالة العملية قبل إعادة إرسالها.', timedOut ? 504 : 502);
    }
  };
}

export const bybitRequest = createBybitClient();
export async function verifyBybitConnection() {
  await bybitRequest('GET', '/v5/account/info');
  return true;
}
