const API = '/api/p2p';
const SESSION_API='/api/bybit';
const POLL_MS = 30000;

let sessionActive=false;
let csrfToken='';
const mutationAttempts=new Map();
let pollTimer = null;
let knownPendingIds = new Set();
let initializedPendingSnapshot = false;
let latestAds = [];
let monitoredAdId = '';
let priceSuggestion = null;
let accountFrozen=false;
let demoMode=false;
const FROZEN_MESSAGE_AR='الحساب مجمد مؤقتا لسلامة اصولك وامان حسابك ونعتذر بشده عن هذا لازعاج يرجي التواصل مع فريق الدعم';
const FROZEN_MESSAGE_EN='The account is temporarily frozen to protect your assets and account security. We sincerely apologize for the inconvenience. Please contact the support team.';
const DEMO_MESSAGE_AR='البيانات المالية الحية غير متاحة حاليًا ولا يمكن تنفيذ عمليات مالية.';
const DEMO_MESSAGE_EN='Live financial data is currently unavailable and financial operations cannot be executed.';

const $ = (id) => document.getElementById(id);
const locale = () => window.GTPreferences?.locale?.() || 'ar-EG';

function toast(message, kind = 'info') {
  const el = $('toast');
  el.textContent = message;
  el.className = `toast show ${kind === 'frozen' ? 'error frozen' : kind === 'error' ? 'error' : kind === 'success' ? 'success' : ''}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.className = 'toast'; }, 4200);
}

function frozenMessage(){return window.GTPreferences?.language?.()==='en'?FROZEN_MESSAGE_EN:FROZEN_MESSAGE_AR;}
function demoMessage(){return window.GTPreferences?.language?.()==='en'?DEMO_MESSAGE_EN:DEMO_MESSAGE_AR;}
function showFrozenNotice(){toast(frozenMessage(),'frozen');}
function showDemoNotice(){toast(demoMessage(),'error');}

function setState(state, text) {
  $('serviceState').dataset.state = state;
  $('serviceState').querySelector('b').textContent = text;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function formObject(form) {
  return Object.fromEntries([...new FormData(form).entries()].map(([key, value]) => [key, String(value).trim()]));
}

async function request(payload) {
  if (!navigator.onLine) throw new Error('لا يوجد اتصال بالإنترنت.');
  if (!sessionActive || !csrfToken) throw new Error('افتح جلسة التحكم أولًا.');
  const response = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token':csrfToken,
    },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const error = new Error(data.message || data.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.data = data;
    if(response.status===401)logout('انتهت جلسة التحكم. افتحها من جديد.');
    throw error;
  }
  return data;
}

async function financialRequest(payload) {
  if(accountFrozen){showFrozenNotice();const error=new Error(frozenMessage());error.code='ACCOUNT_FROZEN';throw error;}
  if(demoMode){showDemoNotice();const error=new Error(demoMessage());error.code='PRESENTATION_MODE_MUTATION_BLOCKED';throw error;}
  const fingerprint=JSON.stringify(payload);
  const requestId=mutationAttempts.get(fingerprint)||crypto.randomUUID();
  mutationAttempts.set(fingerprint,requestId);
  const response=await request({...payload,confirmed:true,requestId});
  mutationAttempts.delete(fingerprint);
  window.GTReceipts?.present(response.receipt);
  return response;
}

function extractList(payload) {
  const data = payload?.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.list)) return data.list;
  if (Array.isArray(data?.result)) return data.result;
  if (Array.isArray(data?.records)) return data.records;
  return [];
}

function firstValue(object, keys, fallback = '—') {
  for (const key of keys) {
    const value = object?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return fallback;
}

function formatTime(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return String(value || '—');
  const ms = n < 1e12 ? n * 1000 : n;
  try { return new Date(ms).toLocaleString(locale()); } catch { return String(value); }
}

function renderPending(payload) {
  const list = extractList(payload);
  $('mPending').textContent = String(list.length);
  if (!list.length) {
    $('pendingTable').innerHTML = '<div class="empty">لا توجد Pending Orders حاليًا.</div>';
    handlePendingNotifications([]);
    return;
  }

  $('pendingTable').innerHTML = `<table><thead><tr><th>Order</th><th>Side</th><th>Token</th><th>Fiat</th><th>Amount</th><th>Price</th><th>Status</th></tr></thead><tbody>${list.map((order) => {
    const id = firstValue(order, ['orderId', 'id']);
    const side = firstValue(order, ['side', 'orderType']);
    const token = firstValue(order, ['tokenId', 'tokenName', 'coin']);
    const fiat = firstValue(order, ['currencyId', 'currencyName', 'fiat']);
    const amount = firstValue(order, ['amount', 'quantity', 'notifyTokenQuantity']);
    const price = firstValue(order, ['price', 'notifyUnitPrice']);
    const status = firstValue(order, ['status', 'orderStatus']);
    return `<tr><td>${escapeHtml(id)}</td><td>${escapeHtml(side)}</td><td>${escapeHtml(token)}</td><td>${escapeHtml(fiat)}</td><td>${escapeHtml(amount)}</td><td>${escapeHtml(price)}</td><td>${escapeHtml(status)}</td></tr>`;
  }).join('')}</tbody></table>`;

  handlePendingNotifications(list);
}

function syncMonitorSelector() {
  const select=$('monitorAdSelect');
  if(!select) return;
  const current=select.value || monitoredAdId;
  select.replaceChildren();
  for(const ad of latestAds) {
    const itemId=String(firstValue(ad,['itemId','id'],''));
    if(!itemId) continue;
    const option=document.createElement('option');
    option.value=itemId;
    option.textContent=`${firstValue(ad,['tokenId','tokenName'],'Asset')} · ${firstValue(ad,['currencyId','currencyName'],'Fiat')} · ${firstValue(ad,['price'],'—')}`;
    select.append(option);
  }
  if([...select.options].some((option)=>option.value===current)) select.value=current;
  monitoredAdId=select.value || '';
  if(!monitoredAdId) resetPriceMonitor('لا يوجد إعلان متاح للمراقبة.');
}

function renderAds(payload) {
  const list=extractList(payload);
  latestAds=list;
  $('mAds').textContent=String(list.length);
  if(!list.length) {
    $('adsTable').innerHTML='<div class="empty">لا توجد إعلانات قابلة للعرض أو الصلاحية لم تُفتح بعد.</div>';
    syncMonitorSelector();
    return;
  }
  $('adsTable').innerHTML=`<table><thead><tr><th>Ad ID</th><th>Side</th><th>Token</th><th>Fiat</th><th>Price</th><th>Min</th><th>Max</th><th>Status</th></tr></thead><tbody>${list.map((ad)=>`<tr>
    <td>${escapeHtml(firstValue(ad,['itemId','id']))}</td>
    <td>${escapeHtml(firstValue(ad,['side']))}</td>
    <td>${escapeHtml(firstValue(ad,['tokenId','tokenName']))}</td>
    <td>${escapeHtml(firstValue(ad,['currencyId','currencyName']))}</td>
    <td>${escapeHtml(firstValue(ad,['price']))}</td>
    <td>${escapeHtml(firstValue(ad,['minAmount','minQuote']))}</td>
    <td>${escapeHtml(firstValue(ad,['maxAmount','maxQuote']))}</td>
    <td>${escapeHtml(firstValue(ad,['status']))}</td>
  </tr>`).join('')}</tbody></table>`;
  syncMonitorSelector();
}

function resetPriceMonitor(message='بانتظار بيانات السوق.') {
  priceSuggestion=null;
  for(const id of ['monitorCurrentPrice','monitorCompetitorPrice','monitorTargetPrice']) {
    if($(id)) $(id).textContent='—';
  }
  if($('monitorStatus')) $('monitorStatus').textContent=message;
  if($('applyTargetBtn')) $('applyTargetBtn').disabled=true;
}

function renderPriceMonitor(payload) {
  const data=payload?.data || {};
  if(!data.available) {
    const messages={
      OWN_AD_NOT_FOUND:'لم يتم العثور على الإعلان المحدد ضمن إعلانات الحساب.',
      OWN_AD_MARKET_INCOMPLETE:'بيانات السوق للإعلان غير مكتملة.',
      NO_NON_PROMOTED_COMPETITOR:'لا يوجد معلن منافس غير معلّم كترويجي يمكن استخدامه حاليًا.',
      INVALID_COMPETITOR_PRICE:'سعر أول منافس غير صالح للحساب.',
    };
    resetPriceMonitor(messages[data.reason] || 'لا توجد توصية سعر متاحة حاليًا.');
    return;
  }
  priceSuggestion=data;
  $('monitorCurrentPrice').textContent=String(data.ad?.price ?? '—');
  $('monitorCompetitorPrice').textContent=String(data.competitor?.price ?? '—');
  $('monitorTargetPrice').textContent=String(data.targetPrice ?? '—');
  $('monitorStatus').textContent='المقترح أقل 0.01 من أول إعلان منافس غير معلّم كترويجي. التحديث الحقيقي لا ينفذ تلقائيًا.';
  $('applyTargetBtn').disabled=false;
}

async function refreshPriceMonitor(showToast=false) {
  const itemId=$('monitorAdSelect')?.value || monitoredAdId;
  if(!itemId) {
    resetPriceMonitor('اختر إعلانًا للمراقبة.');
    return null;
  }
  monitoredAdId=itemId;
  const result=await request({action:'price-monitor',itemId});
  renderPriceMonitor(result);
  if(showToast) toast('تم تحديث مراقب سعر P2P.','success');
  return result;
}

function handlePendingNotifications(list) {
  const ids = new Set(list.map((order) => String(firstValue(order, ['orderId', 'id'], ''))).filter(Boolean));
  if (!initializedPendingSnapshot) {
    knownPendingIds = ids;
    initializedPendingSnapshot = true;
    return;
  }
  const newIds = [...ids].filter((id) => !knownPendingIds.has(id));
  knownPendingIds = ids;
  if (!newIds.length || !('Notification' in window) || Notification.permission !== 'granted') return;
  new Notification('GT CRYPTO APIs · طلب P2P جديد', {
    body: `${newIds.length} طلب Pending جديد يحتاج متابعة.`,
    tag: 'gt-bybit-p2p-pending',
  });
}

function renderObjectDetail(data) {
  if (!data || typeof data !== 'object') return '<div class="empty">لا توجد تفاصيل.</div>';
  const entries = Object.entries(data).filter(([, value]) => value !== null && value !== undefined && value !== '' && typeof value !== 'object').slice(0, 30);
  if (!entries.length) return '<div class="empty">لا توجد تفاصيل قابلة للعرض.</div>';
  return `<dl>${entries.map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(/time|date/i.test(key) ? formatTime(value) : value)}</dd></div>`).join('')}</dl>`;
}

function renderMessages(payload) {
  const list = extractList(payload);
  if (!list.length) {
    $('chatMessages').innerHTML = '<div class="empty">لا توجد رسائل أو لم يتم السماح بقراءة المحادثة بعد.</div>';
    return;
  }
  $('chatMessages').innerHTML = list.map((message) => {
    const author = firstValue(message, ['nickName', 'senderNickName', 'senderName', 'fromUserId'], 'P2P');
    const text = firstValue(message, ['message', 'content', 'msg'], '');
    const time = firstValue(message, ['createDate', 'createTime', 'timestamp'], '');
    return `<div class="message"><strong>${escapeHtml(author)} · ${escapeHtml(formatTime(time))}</strong><span>${escapeHtml(text)}</span></div>`;
  }).join('');
}

async function checkStatus() {
  try {
    const result = await request({ action: 'status' });
    accountFrozen=result.accountFrozen===true;demoMode=result.financialDataMode==='presentation';
    $('mApi').textContent = result.available===true?'متاح':'عرض فقط';
    $('mApiSub').textContent = result.available===true?'P2P Open API active':'لم يتم التحقق من صلاحيات P2P الحية';
    $('capabilityText').textContent = demoMode ? 'البيانات المالية الحية غير متاحة حاليًا؛ المراقبة والعمليات المالية غير متاحة.' : accountFrozen ? 'الحساب مجمد مؤقتا. العرض والمراقبة متاحان لكن جميع العمليات المالية محظورة حتى مراجعة فريق الدعم.' : 'P2P Open API متاح للحساب. المراقبة الآلية تعمل، والعمليات الحساسة ما زالت يدوية.';
    $('permissionAlert').classList.add('hidden');
    setState((demoMode||accountFrozen)?'error':'ok',demoMode?'غير متاح':accountFrozen?'الحساب مجمد':'P2P متصل');
    return result;
  } catch (error) {
    $('mApi').textContent = 'مغلق';
    $('mApiSub').textContent = Number.isInteger(error.data?.retCode) ? `Provider retCode ${error.data.retCode}` : 'لم يتم التحقق من الصلاحيات';
    $('capabilityText').textContent = error.data?.error==='PERMISSION_DENIED' ? 'تسجيل الدخول يعمل، لكن المفتاح أو حساب المعلن لا يملك صلاحيات P2P Open API المطلوبة.' : `تعذر التحقق من P2P Open API: ${error.message}`;
    $('permissionAlert').classList.remove('hidden');
    setState('error', 'P2P غير متاح');
    throw error;
  }
}

async function refreshPending(showToast = false) {
  const result = await request({ action: 'pending-orders', page: 1, size: 50 });
  renderPending(result);
  if (showToast) toast('تم تحديث Pending Orders.', 'success');
  return result;
}

async function refreshAds(showToast = false) {
  const result = await request({ action: 'my-ads', page: 1, size: 50 });
  renderAds(result);
  if (showToast) toast('تم تحديث إعلانات P2P.', 'success');
  return result;
}

async function refreshAll(showToast = false) {
  if (!sessionActive) return;
  try {
    await checkStatus();
    if(demoMode){
      latestAds=[];
      $('mPending').textContent='—';
      $('mAds').textContent='—';
      $('pendingTable').innerHTML='<div class="empty">طلبات P2P الحية غير متاحة حاليًا.</div>';
      $('adsTable').innerHTML='<div class="empty">إعلانات P2P الحية غير متاحة حاليًا.</div>';
      resetPriceMonitor('مراقبة السعر الحية غير متاحة حاليًا.');
      $('mSync').textContent = new Date().toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
      if (showToast) toast('المزامنة المالية الحية غير متاحة حاليًا.', 'success');
      return;
    }
    await Promise.all([refreshPending(false), refreshAds(false)]);
    await refreshPriceMonitor(false).catch(()=>resetPriceMonitor('تعذر تحديث مراقب السعر.'));
    $('mSync').textContent = new Date().toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
    if (showToast) toast('تمت مزامنة P2P بنجاح.', 'success');
  } catch (error) {
    $('mPending').textContent = '—';
    $('mAds').textContent = '—';
    $('pendingTable').innerHTML = '<div class="empty">بانتظار تفعيل صلاحيات P2P.</div>';
    $('adsTable').innerHTML = '<div class="empty">بانتظار تفعيل صلاحية Advertising.</div>';
    if (showToast) toast(error.message, 'error');
  }
}

function startPolling() {
  stopPolling();
  if (!$('autoRefresh').checked || !sessionActive) return;
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible' && navigator.onLine) refreshAll(false);
  }, POLL_MS);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function unlock() {
  $('authGate').classList.add('hidden');
  $('console').classList.remove('hidden');
  startPolling();
}

function logout(message = 'تم تسجيل الخروج وإنهاء جلسة التحكم.') {
  sessionActive=false;csrfToken='';
  mutationAttempts.clear();
  knownPendingIds = new Set();
  initializedPendingSnapshot = false;
  stopPolling();
  $('controlToken').value = '';
  concealToken();loginFeedback();
  $('console').classList.add('hidden');
  $('authGate').classList.remove('hidden');
  setState('idle', 'مقفلة');
  toast(message);
}

async function connect() {
  const token = $('controlToken').value.trim();
  if (!token) { loginFeedback('أدخل رمز التحكم أولًا.'); $('controlToken').focus(); return; }
  loginFeedback();concealToken();
  $('connectBtn').disabled = true;
  $('connectBtn').textContent = 'جارٍ التحقق…';
  try {
    const response=await fetch(SESSION_API,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',body:JSON.stringify({action:'login',controlToken:token})});
    const result=await response.json().catch(()=>({}));
    if(!response.ok || !result.ok || !result.csrfToken)throw new Error(result.message || 'تعذر فتح جلسة التحكم.');
    csrfToken=result.csrfToken;sessionActive=true;
    $('controlToken').value = '';
    unlock();
    await refreshAll(false);
    toast($('mApi').textContent==='متاح'?'تم فتح الجلسة والتحقق من P2P Open API.':'الجلسة مفتوحة؛ صلاحيات P2P الحية قيد التحقق أو غير متاحة.',$('mApi').textContent==='متاح'?'success':'info');
  } catch (error) {
    $('controlToken').value='';
    loginFeedback(error.message);$('controlToken').focus();
  } finally {
    $('connectBtn').disabled = false;
    $('connectBtn').textContent = 'فتح جلسة P2P';
  }
}

function loginFeedback(message = '') {
  $('loginFeedback').textContent = message;
  $('loginFeedback').hidden = !message;
  $('controlToken').setAttribute('aria-invalid', String(Boolean(message)));
}
function concealToken() {
  $('controlToken').type = 'password';
  $('toggleToken').textContent = 'إظهار';
  $('toggleToken').setAttribute('aria-label', 'إظهار رمز التحكم');
  $('toggleToken').setAttribute('aria-pressed', 'false');
}
$('toggleToken').addEventListener('click', () => {
  const shown = $('controlToken').type === 'password';
  $('controlToken').type = shown ? 'text' : 'password';
  $('toggleToken').textContent = shown ? 'إخفاء' : 'إظهار';
  $('toggleToken').setAttribute('aria-label', shown ? 'إخفاء رمز التحكم' : 'إظهار رمز التحكم');
  $('toggleToken').setAttribute('aria-pressed', String(shown));
});
$('controlToken').addEventListener('input', () => loginFeedback());
$('connectBtn').addEventListener('click', connect);
$('controlToken').addEventListener('keydown', (event) => { if (event.key === 'Enter') connect(); });
$('logoutBtn').addEventListener('click',async()=>{
  if(!sessionActive)return;
  try{
    const response=await fetch(SESSION_API,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken},credentials:'same-origin',cache:'no-store',body:JSON.stringify({action:'logout'})});
    if(!response.ok)throw new Error('تعذر تأكيد تسجيل الخروج على الخادم. حاول مجددًا.');
    logout();
  }catch(error){toast(error.message,'error');}
});
$('refreshBtn').addEventListener('click', () => refreshAll(true));
$('pendingRefresh').addEventListener('click', async () => {
  try { await refreshPending(true); } catch (error) { toast(error.message, 'error'); }
});
$('adsRefresh').addEventListener('click', async () => {
  try { await refreshAds(true); } catch (error) { toast(error.message, 'error'); }
});
$('autoRefresh').addEventListener('change', () => {
  startPolling();
  toast($('autoRefresh').checked ? 'تم تشغيل المراقبة كل 30 ثانية.' : 'تم إيقاف المراقبة الآلية.');
});
$('monitorAdSelect').addEventListener('change',async(event)=>{
  monitoredAdId=event.currentTarget.value;
  try{await refreshPriceMonitor(true);}catch(error){resetPriceMonitor(error.message);toast(error.message,'error');}
});
$('monitorRefresh').addEventListener('click',async()=>{
  try{await refreshPriceMonitor(true);}catch(error){resetPriceMonitor(error.message);toast(error.message,'error');}
});
$('applyTargetBtn').addEventListener('click',async()=>{
  if(accountFrozen)return showFrozenNotice();
  const data=priceSuggestion;
  if(!data?.available || !data.targetPrice || !data.ad?.itemId) return toast('لا توجد توصية صالحة للتنفيذ.','error');
  const current=String(data.ad.price ?? '—');
  const competitor=String(data.competitor?.price ?? '—');
  const target=String(data.targetPrice);
  if(!confirm(`مراجعة تحديث سعر إعلان P2P\n\nالسعر الحالي: ${current}\nأول منافس غير معلّم كترويجي: ${competitor}\nالسعر المقترح: ${target}\n\nلن يتم التنفيذ إلا بعد هذا التأكيد. هل تريد تطبيق السعر؟`)) return;
  try{
    $('applyTargetBtn').disabled=true;
    await financialRequest({
      action:'update-ad',
      itemId:data.ad.itemId,
      payload:{itemId:data.ad.itemId,price:target},
      confirm:'UPDATE_P2P_AD',
    });
    toast('تم إرسال تحديث السعر إلى الخدمة وتم إنشاء إيصال PDF.','success');
    await refreshAds(false);
    await refreshPriceMonitor(false);
  }catch(error){
    toast(error.message,'error');
  }finally{
    $('applyTargetBtn').disabled=!priceSuggestion?.available;
  }
});

$('notifyBtn').addEventListener('click', async () => {
  if (!('Notification' in window)) return toast('المتصفح لا يدعم الإشعارات.', 'error');
  const permission = await Notification.requestPermission();
  toast(permission === 'granted' ? 'تم تفعيل إشعارات الطلبات الجديدة.' : 'لم يتم السماح بالإشعارات.', permission === 'granted' ? 'success' : 'error');
});

$('orderLookupForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const { orderId } = formObject(event.currentTarget);
  try {
    const [detail, counterparty, messages] = await Promise.all([
      request({ action: 'order-detail', orderId }),
      request({ action: 'counterparty-info', orderId }).catch(() => ({ data: null })),
      request({ action: 'messages', orderId, size: 30, lastId: 0 }).catch(() => ({ data: [] })),
    ]);
    const combined = {
      ...(detail.data && typeof detail.data === 'object' ? detail.data : {}),
      counterparty: counterparty.data && typeof counterparty.data === 'object' ? JSON.stringify(counterparty.data) : undefined,
    };
    $('orderDetail').innerHTML = renderObjectDetail(combined);
    renderMessages(messages);
    $('messageForm').elements.orderId.value = orderId;
    $('paidForm').elements.orderId.value = orderId;
    $('releaseForm').elements.orderId.value = orderId;
    toast('تم تحميل تفاصيل الطلب.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  }
});

$('messageForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const body = formObject(event.currentTarget);
  if (!body.orderId || !body.message) return;
  try {
    await request({ action: 'send-message', orderId: body.orderId, message: body.message, contentType: 'str' });
    event.currentTarget.elements.message.value = '';
    const messages = await request({ action: 'messages', orderId: body.orderId, size: 30, lastId: 0 });
    renderMessages(messages);
    toast('تم إرسال الرسالة عبر خدمة P2P.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  }
});

$('paidForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if(accountFrozen)return showFrozenNotice();
  const body = formObject(event.currentTarget);
  if (body.confirm !== 'P2P_PAID') return toast('اكتب P2P_PAID حرفيًا للتأكيد.', 'error');
  if (!confirm(`تأكيد Mark as Paid للطلب ${body.orderId}؟\nنفّذ فقط إذا كنت قد أرسلت الدفع بالفعل.`)) return;
  try {
    await financialRequest({ action: 'mark-paid', orderId: body.orderId, paymentType: body.paymentType, confirm: 'P2P_PAID' });
    toast('تم إرسال Mark as Paid إلى الخدمة وتم إنشاء إيصال PDF.', 'success');
    event.currentTarget.elements.confirm.value = '';
    await refreshAll(false);
  } catch (error) {
    toast(error.message, 'error');
  }
});

$('releaseForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if(accountFrozen)return showFrozenNotice();
  const body = formObject(event.currentTarget);
  if (body.confirm !== 'RELEASE_P2P') return toast('اكتب RELEASE_P2P حرفيًا للتأكيد.', 'error');
  if (!confirm(`تحذير: سيتم Release للأصول في الطلب ${body.orderId}.\n\nلا تؤكد إلا بعد التحقق الفعلي من وصول الأموال خارج المنصة عند الحاجة.`)) return;
  try {
    await financialRequest({ action: 'release', orderId: body.orderId, confirm: 'RELEASE_P2P' });
    toast('تم إرسال Release Assets إلى الخدمة وتم إنشاء إيصال PDF.', 'success');
    event.currentTarget.elements.confirm.value = '';
    await refreshAll(false);
  } catch (error) {
    toast(error.message, 'error');
  }
});

function updateConnectivity() {
  $('offlineBanner').classList.toggle('hidden', navigator.onLine);
  if (!navigator.onLine) setState('error', 'Offline');
  else if (sessionActive) setState('idle', 'جارٍ التحقق من P2P');
}

window.addEventListener('online', () => { updateConnectivity(); if (sessionActive) refreshAll(false); });
window.addEventListener('offline', updateConnectivity);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && sessionActive && $('autoRefresh').checked) refreshAll(false);
});

async function restoreSession(){
  try{
    const response=await fetch(`${SESSION_API}?action=session`,{credentials:'same-origin',cache:'no-store'});
    const result=await response.json();
    if(response.ok && result.authenticated===true && result.csrfToken){
      csrfToken=result.csrfToken;sessionActive=true;unlock();await refreshAll(false);
    }
  }catch{setState('error','تعذر التحقق من الجلسة');}
}
updateConnectivity();
restoreSession();
