import { AppError, assert, publicError } from '../lib/errors.js';
import { BybitError, createBybitClient } from '../lib/bybit.js';
import { createSessionService, hash } from '../lib/bybit-control.js';
import { createRedisStore } from '../lib/store.js';
import { createReceipt } from '../lib/receipts.js';
import { selectFirstNonPromotedCompetitor, subtractDecimal, summarizeAd } from '../lib/p2p-pricing.js';
import { isDemoFinancialMode } from '../gt-bybit/demo-state.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY=16*1024;
const FROZEN_MESSAGE='الحساب مجمد مؤقتا لسلامة اصولك وامان حسابك ونعتذر بشده عن هذا لازعاج يرجي التواصل مع فريق الدعم';
function accountFrozen(env){return env.GT_ACCOUNT_FROZEN==='true';}
function mutationsEnabled(env){
  return !accountFrozen(env) && (env.VERCEL_ENV==='production' || env.BYBIT_ENABLE_MUTATIONS==='true');
}
const SAFE_AD_PAYLOAD_KEYS = new Set([
  'tokenId', 'currencyId', 'side', 'priceType', 'premium', 'price', 'minAmount', 'maxAmount',
  'remark', 'tradingPreferenceSet', 'paymentIds', 'quantity', 'paymentPeriod', 'itemId', 'actionType',
]);

function send(res, status, payload) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Vary', 'Cookie, Origin');
  return res.status(status).json(payload);
}

function fail(status, code, message) {
  const error = new Error(message);
  error.httpStatus = status;
  error.code = code;
  throw error;
}

function bodyOf(req) {
  assert(/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || ''),'UNSUPPORTED_MEDIA_TYPE','أرسل البيانات بصيغة JSON.',415);
  assert(Number(req.headers['content-length'] || 0)<=MAX_BODY,'PAYLOAD_TOO_LARGE','حجم الطلب أكبر من المسموح.',413);
  let body=req.body;
  assert(Buffer.byteLength(typeof body==='string'?body:JSON.stringify(body||{}))<=MAX_BODY,'PAYLOAD_TOO_LARGE','حجم الطلب أكبر من المسموح.',413);
  if(typeof body==='string')try{body=JSON.parse(body);}catch{fail(400,'INVALID_JSON','صيغة JSON غير صالحة.');}
  assert(body && typeof body==='object' && !Array.isArray(body) && Object.getPrototypeOf(body)===Object.prototype,'INVALID_JSON','بيانات الطلب غير صالحة.',400);
  return body;
}

function text(value, name, max = 200, { required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) fail(400, 'INVALID_INPUT', `${name} is required`);
    return undefined;
  }
  const result = String(value).trim();
  if (!result || result.length > max) fail(400, 'INVALID_INPUT', `${name} is invalid`);
  return result;
}

function integer(value, name, min, max, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) fail(400, 'INVALID_INPUT', `${name} is invalid`);
  return n;
}

function pagePayload(body, defaultSize = 20) {
  return {
    page: integer(body.page, 'page', 1, 100000, 1),
    size: integer(body.size, 'size', 1, 50, defaultSize),
  };
}

function optionalFilters(body, keys) {
  const result = {};
  for (const key of keys) {
    const value = text(body[key], key, 120, { required: false });
    if (value !== undefined) result[key] = value;
  }
  return result;
}

function safeAdPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(400, 'INVALID_INPUT', 'payload must be an object');
  }
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!SAFE_AD_PAYLOAD_KEYS.has(key)) continue;
    if (entry === undefined || entry === null || entry === '') continue;
    result[key] = entry;
  }
  if (!Object.keys(result).length) fail(400, 'INVALID_INPUT', 'payload has no supported fields');
  return result;
}

function listOf(value) {
  if (Array.isArray(value)) return value;
  for (const key of ['items','list','result','records']) if (Array.isArray(value?.[key])) return value[key];
  return [];
}

function adId(ad = {}) {
  return String(ad.itemId ?? ad.id ?? ad.adId ?? '');
}

function requireMutationReview(body, expectedConfirm, env) {
  if (accountFrozen(env)) fail(423, 'ACCOUNT_FROZEN', FROZEN_MESSAGE);
  if (isDemoFinancialMode(env)) fail(403, 'PRESENTATION_MODE_MUTATION_BLOCKED', 'Fixed presentation never executes real P2P financial operations');
  if (!mutationsEnabled(env)) fail(403, 'MUTATIONS_DISABLED', 'P2P mutations are disabled by server configuration');
  if (body.confirm !== expectedConfirm) fail(400, 'CONFIRMATION_REQUIRED', `action requires confirm=${expectedConfirm}`);
  if (body.confirmed !== true) fail(400, 'CONFIRMATION_REQUIRED', 'Explicit reviewed confirmation is required');
  const requestId=text(body.requestId, 'requestId', 64);
  if (!UUID.test(requestId)) fail(400, 'INVALID_REQUEST_ID', 'requestId must be a UUID');
  return requestId;
}

function receiptFor(action, requestId, request, result) {
  return createReceipt({ channel: 'P2P', action, requestId, request, result });
}

async function handle(req, res, {env,store,request,now,sessions}) {
  const body = bodyOf(req);
  const session=await sessions.authenticate(req);
  sessions.verifyCsrf(req,session);
  await sessions.rateLimit(`p2p:${session.owner}`,60);
  const action = text(body.action, 'action', 80).toLowerCase();
  const p2p=(path,params={})=>request('POST',path,params);
  async function reserveMutation(requestId,payload){
    await sessions.authenticate(req);
    const key=`${session.namespace}:p2p:${requestId}`;
    const reserved=await store.set(key,{owner:session.owner,fingerprint:hash(JSON.stringify({action,payload})),state:'pending'},172800,true);
    assert(reserved,'DUPLICATE_REQUEST','سبق إرسال الطلب أو نتيجته غير مؤكدة. راجع سجل P2P قبل محاولة جديدة.',409);
  }

  if (isDemoFinancialMode(env)) {
    if (action === 'status' || action === 'user-info') {
      return send(res, 200, {
        ok: true,
        available: false,
        service: 'bybit-p2p-v5',
        data: {},
        accountFrozen: false,
        financialDataMode: 'presentation',
        frozenMessage: null,
        timestamp: now(),
      });
    }
    fail(403, 'PRESENTATION_MODE_LIVE_DATA_BLOCKED', 'Fixed presentation does not read or mutate live P2P financial data');
  }

  if (action === 'status' || action === 'user-info') {
    const data = await p2p('/v5/p2p/user/personal/info', {});
    return send(res, 200, {
      ok: true,
      available: true,
      service: 'bybit-p2p-v5',
      data: data.result,
      accountFrozen: accountFrozen(env),
      financialDataMode: 'live',
      frozenMessage: accountFrozen(env) ? FROZEN_MESSAGE : null,
      timestamp: now(),
    });
  }

  if (action === 'payment-methods') {
    const data = await p2p('/v5/p2p/user/payment/list', {});
    return send(res, 200, { ok: true, data: data.result });
  }

  if (action === 'orders') {
    const payload = {
      ...pagePayload(body),
      ...optionalFilters(body, ['status', 'side', 'beginTime', 'endTime', 'tokenId', 'currencyId']),
    };
    const data = await p2p('/v5/p2p/order/simplifyList', payload);
    return send(res, 200, { ok: true, data: data.result });
  }

  if (action === 'pending-orders') {
    const data = await p2p('/v5/p2p/order/pending/simplifyList', pagePayload(body));
    return send(res, 200, { ok: true, data: data.result });
  }

  if (action === 'order-detail') {
    const data = await p2p('/v5/p2p/order/info', { orderId: text(body.orderId, 'orderId', 100) });
    return send(res, 200, { ok: true, data: data.result });
  }

  if (action === 'counterparty-info') {
    const data = await p2p('/v5/p2p/user/order/personal/info', { orderId: text(body.orderId, 'orderId', 100) });
    return send(res, 200, { ok: true, data: data.result });
  }

  if (action === 'my-ads') {
    const payload = {
      ...pagePayload(body),
      ...optionalFilters(body, ['status', 'side', 'tokenId', 'currencyId']),
    };
    const data = await p2p('/v5/p2p/item/personal/list', payload);
    return send(res, 200, { ok: true, data: data.result });
  }

  if (action === 'online-ads') {
    const payload = {
      ...pagePayload(body),
      ...optionalFilters(body, ['side', 'tokenId', 'currencyId', 'payment']),
    };
    const data = await p2p('/v5/p2p/item/online', payload);
    return send(res, 200, { ok: true, data: data.result });
  }

  if (action === 'ad-detail') {
    const data = await p2p('/v5/p2p/item/info', { itemId: text(body.itemId, 'itemId', 100) });
    return send(res, 200, { ok: true, data: data.result });
  }

  if (action === 'price-monitor') {
    const itemId=text(body.itemId, 'itemId', 100);
    const mine=await p2p('/v5/p2p/item/personal/list', { page: 1, size: 50 });
    const own=listOf(mine.result).find((ad)=>adId(ad)===itemId);
    if (!own) return send(res, 200, { ok: true, data: { available: false, reason: 'OWN_AD_NOT_FOUND', itemId } });

    const side=String(own.side ?? '').trim();
    const tokenId=String(own.tokenId ?? own.tokenName ?? '').trim();
    const currencyId=String(own.currencyId ?? own.currencyName ?? '').trim();
    if (!side || !tokenId || !currencyId) {
      return send(res, 200, { ok: true, data: { available: false, reason: 'OWN_AD_MARKET_INCOMPLETE', ad: summarizeAd(own), itemId } });
    }

    const market=await p2p('/v5/p2p/item/online', { page: 1, size: 20, side, tokenId, currencyId });
    const competitor=selectFirstNonPromotedCompetitor(listOf(market.result), itemId);
    if (!competitor) {
      return send(res, 200, { ok: true, data: { available: false, reason: 'NO_NON_PROMOTED_COMPETITOR', ad: summarizeAd(own), itemId } });
    }

    const targetPrice=subtractDecimal(competitor.price ?? competitor.premiumPrice ?? competitor.unitPrice, '0.01');
    if (!targetPrice) {
      return send(res, 200, { ok: true, data: { available: false, reason: 'INVALID_COMPETITOR_PRICE', ad: summarizeAd(own), competitor: summarizeAd(competitor), itemId } });
    }

    return send(res, 200, {
      ok: true,
      data: {
        available: true,
        ad: summarizeAd(own),
        competitor: summarizeAd(competitor),
        targetPrice,
        adjustment: '-0.01',
        promotionFilter: 'explicit-markers-only',
        executable: false,
      },
    });
  }

  if (action === 'create-ad') {
    const requestId=requireMutationReview(body, 'CREATE_P2P_AD',env);
    const payload=safeAdPayload(body.payload);
    await reserveMutation(requestId,payload);
    const data=await p2p('/v5/p2p/item/create', payload);
    const receipt=receiptFor(action, requestId, { payload }, data.result);
    return send(res, 200, { ok: true, data: data.result, requestId, accepted: true, receipt });
  }

  if (action === 'update-ad') {
    const requestId=requireMutationReview(body, 'UPDATE_P2P_AD',env);
    const payload=safeAdPayload(body.payload);
    payload.itemId=payload.itemId || text(body.itemId, 'itemId', 100);
    await reserveMutation(requestId,payload);
    const data=await p2p('/v5/p2p/item/update', payload);
    const receipt=receiptFor(action, requestId, { payload }, data.result);
    return send(res, 200, { ok: true, data: data.result, requestId, accepted: true, receipt });
  }

  if (action === 'remove-ad') {
    const requestId=requireMutationReview(body, 'CANCEL_P2P_AD',env);
    const itemId=text(body.itemId, 'itemId', 100);
    await reserveMutation(requestId,{itemId});
    let ad=null;
    try { ad=(await p2p('/v5/p2p/item/info', { itemId })).result; } catch {}
    const data=await p2p('/v5/p2p/item/cancel', { itemId });
    const receipt=receiptFor(action, requestId, { itemId, ad }, data.result);
    return send(res, 200, { ok: true, data: data.result, requestId, accepted: true, receipt });
  }

  if (action === 'mark-paid') {
    const requestId=requireMutationReview(body, 'P2P_PAID',env);
    const orderId=text(body.orderId, 'orderId', 100);
    const paymentType=text(body.paymentType, 'paymentType', 100);
    await reserveMutation(requestId,{orderId,paymentType});
    const data=await p2p('/v5/p2p/order/pay', { orderId, paymentType });
    let order=null;
    try { order=(await p2p('/v5/p2p/order/info', { orderId })).result; } catch {}
    const receipt=receiptFor(action, requestId, { orderId, paymentType, order }, data.result);
    return send(res, 200, { ok: true, data: data.result, requestId, accepted: true, receipt });
  }

  if (action === 'release') {
    const requestId=requireMutationReview(body, 'RELEASE_P2P',env);
    const orderId=text(body.orderId, 'orderId', 100);
    await reserveMutation(requestId,{orderId});
    const data=await p2p('/v5/p2p/order/finish', { orderId });
    let order=null;
    try { order=(await p2p('/v5/p2p/order/info', { orderId })).result; } catch {}
    const receipt=receiptFor(action, requestId, { orderId, order }, data.result);
    return send(res, 200, { ok: true, data: data.result, requestId, accepted: true, receipt });
  }

  if (action === 'send-message') {
    const data = await p2p('/v5/p2p/order/message/send', {
      orderId: text(body.orderId, 'orderId', 100),
      message: text(body.message, 'message', 1000),
      contentType: text(body.contentType, 'contentType', 20, { required: false }) || 'str',
    });
    return send(res, 200, { ok: true, data: data.result });
  }

  if (action === 'messages') {
    const data = await p2p('/v5/p2p/order/message/listpage', {
      orderId: text(body.orderId, 'orderId', 100),
      size: integer(body.size, 'size', 1, 50, 30),
      lastId: integer(body.lastId, 'lastId', 0, Number.MAX_SAFE_INTEGER, 0),
    });
    return send(res, 200, { ok: true, data: data.result });
  }

  if (action === 'chat-sessions') {
    const data = await p2p('/v5/p2p/chat/session/list', pagePayload(body, 30));
    return send(res, 200, { ok: true, data: data.result });
  }

  if (action === 'chat-message-list') {
    const data = await p2p('/v5/p2p/chat/message/listpage', {
      orderId: text(body.orderId, 'orderId', 100),
      size: integer(body.size, 'size', 1, 50, 30),
      lastId: integer(body.lastId, 'lastId', 0, Number.MAX_SAFE_INTEGER, 0),
    });
    return send(res, 200, { ok: true, data: data.result });
  }

  if (action === 'chat-send') {
    const data = await p2p('/v5/p2p/chat/message/send', {
      orderId: text(body.orderId, 'orderId', 100),
      message: text(body.message, 'message', 1000),
      contentType: text(body.contentType, 'contentType', 20, { required: false }) || 'str',
    });
    return send(res, 200, { ok: true, data: data.result });
  }

  fail(404, 'UNKNOWN_ACTION', 'Unknown P2P action');
}

export function createP2pHandler({env=process.env,store=createRedisStore({env}),request=createBybitClient({env}),now=Date.now}={}){
  const sessions=createSessionService({store,env,now});
  return async function handler(req,res){
    try{
      if(req.method!=='POST'){
        res.setHeader('Allow','POST');
        return send(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'});
      }
      return await handle(req,res,{env,store,request,now,sessions});
    }catch(error){
      if(error instanceof BybitError || error instanceof AppError) return send(res,error.status||500,publicError(error));
      return send(res,error.httpStatus||500,{ok:false,error:error.code||'INTERNAL_ERROR',message:error.httpStatus?error.message:'Internal server error'});
    }
  };
}
export default createP2pHandler();
