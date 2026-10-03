(() => {
  'use strict';

  const THEME_KEY = 'gt-bybit-theme';
  const LANG_KEY = 'gt-bybit-language';
  const COLORS = { dark: '#0B0E11', light: '#F6F7F8' };
  let theme = 'dark';
  let language = 'ar';
  let observer;
  let applying = false;

  const EN = {
    'التنقل الرئيسي':'Main navigation','التنقل السفلي':'Bottom navigation',
    'الرئيسية':'Overview','تداول':'Trade','التداول':'Trading','المخاطر':'Risk','إدارة المخاطر':'Risk Management',
    'أصول':'Assets','الأصول':'Assets','الأصول والتحويلات':'Assets & Transfers','إعدادات':'Settings','الإعدادات':'Settings','الإعدادات والأمان':'Settings & Security',
    'جلسة محمية. تنفيذ العمليات يتطلب مراجعتك وتأكيدك.':'Protected session. Operations require your review and explicit confirmation.',
    'GT CRYPTO APIs · إدارة الحساب':'GT CRYPTO APIs · Account Control','جارٍ الفحص':'Checking','تثبيت التطبيق':'Install App',
    'تحديث البيانات':'Refresh data','تسجيل الخروج':'Sign out','إدارة التداول والأصول':'Trading & Asset Control',
    'حسابك وأوامرك وأصولك في لوحة واحدة، مع مراجعة واضحة قبل تنفيذ أي عملية.':'Your account, orders, and assets in one control surface, with a clear review before every operation.',
    'الحالة:':'Status:','فحص الاتصال...':'Checking connection...',
    'فتح جلسة التحكم':'Open Control Session','أدخل رمز التحكم الخاص بك للوصول إلى حسابك بأمان.':'Enter your control token to access your account securely.',
    'رمز التحكم':'Control token','فتح الجلسة':'Open Session',
    'تبقى الجلسة مفتوحة عند تحديث الصفحة، ولا تُغلق بسبب الخمول. يمكنك إنهاؤها من زر تسجيل الخروج.':'The session persists across refreshes and does not close due to inactivity. You can end it using Sign out.',
    'نظرة على الحساب':'Account Overview','مركز التحكم':'Control Center',
    'ملخص لحظي للحساب الموحد، الرصيد، المراكز والأوامر المفتوحة.':'Live summary of the unified account, balances, positions, and open orders.',
    'الجلسة:':'Session:','مفتوحة':'Open','الحساب الموحد':'Unified Account','تحديث الآن':'Refresh Now',
    'إجمالي قيمة الحساب':'Total Account Equity','رصيد المحفظة':'Wallet Balance','المراكز المحملة':'Loaded Positions','المراكز النشطة':'Active positions',
    'الأوامر المحملة':'Loaded Orders','الأوامر المفتوحة':'Open orders','تفاصيل الحساب':'Account Details',
    'أرصدة ومراكز من المصدر المتصل':'Balances and positions from the connected source','المحفظة':'Wallet','الأرصدة غير الصفرية':'Non-zero balances',
    'جارٍ التحميل...':'Loading...','جارٍ التحميل…':'Loading…','المراكز المفتوحة':'Open Positions',
    'إنشاء أوامر Spot وDerivatives وإدارة الأوامر المفتوحة.':'Create Spot and Derivatives orders and manage open orders.',
    'أمر جديد':'New Order','أمر حقيقي — بتأكيد يدوي':'Live order — manual confirmation required','السوق':'Market','الجهة':'Side',
    'شراء Buy':'Buy','بيع Sell':'Sell','رمز السوق':'Market symbol','نوع الأمر':'Order type','سوق Market':'Market','محدد Limit':'Limit',
    'الكمية':'Quantity','سعر الأمر المحدد':'Limit price','اختياري':'Optional','جني الربح TP':'Take Profit TP','وقف الخسارة SL':'Stop Loss SL',
    'جهة المركز للعقود':'Derivatives position side','جهة المركز':'Position side','اتجاه واحد':'One-way','تحوط — شراء':'Hedge — Buy','تحوط — بيع':'Hedge — Sell','تحوط — اتجاهان':'Hedge — Two-way',
    'كمية العملة الأساسية.':'Base-asset quantity.','مراجعة وتنفيذ الأمر':'Review & Submit Order','أحدث أوامر السوق المحدد':'Latest orders for the selected market',
    'سوق الأوامر':'Orders market','تحديث':'Refresh','Leverage، TP/SL، Trailing Stop وإلغاء الأوامر.':'Leverage, TP/SL, Trailing Stop, and order cancellation.',
    'الرافعة المالية':'Leverage','للعقود فقط':'Derivatives only','رافعة الشراء':'Buy leverage','رافعة البيع':'Sell leverage','تحديث Leverage':'Update Leverage',
    'حماية المركز — الصفر يلغي الحماية المحددة':'Position protection — zero clears the selected protection','الوقف المتحرك':'Trailing Stop','تحديث الحماية':'Update Protection',
    'وضع المركز':'Position Mode','حسب دعم الحساب والسوق':'Subject to account and market support','الرمز':'Symbol','مراجعة تغيير الوضع':'Review Mode Change',
    'عمليات حساسة':'Sensitive Operations','يتطلب تأكيدًا صريحًا':'Explicit confirmation required','إلغاء مجموعة أوامر':'Cancel Multiple Orders',
    'لن يتم التنفيذ قبل كتابة CANCEL_ALL حرفيًا ثم تأكيد العملية.':'Execution is blocked until you type CANCEL_ALL exactly and confirm the operation.',
    'رمز السوق — اختياري للـSpot':'Market symbol — optional for Spot','كلمة التأكيد':'Confirmation phrase','إلغاء الأوامر المطابقة':'Cancel Matching Orders',
    'تحويل داخلي بين الحسابات وخدمة التحويل.':'Internal transfers and conversion service.','تحويل داخلي':'Internal Transfer','العملة':'Asset','المبلغ':'Amount',
    'حساب المصدر':'Source account','حساب الوجهة':'Destination account','مراجعة التحويل':'Review Transfer',
    'العملات المتاحة تظهر بعد اختيار حسابي التحويل.':'Available assets appear after choosing both transfer accounts.','عرض سعر قبل التنفيذ':'Quote before execution',
    'من عملة':'From asset','إلى عملة':'To asset','حساب التحويل':'Convert account','الحساب الموحد UNIFIED':'Unified account UNIFIED','حساب التمويل FUND':'Funding account FUND',
    'طلب عرض سعر':'Request Quote','سيظهر سعر التحويل هنا قبل التنفيذ.':'The conversion quote will appear here before execution.','مراجعة تنفيذ التحويل':'Review Convert Execution',
    'حالة التطبيق والجلسة وإعدادات التثبيت.':'Application, session, and installation status.','تطبيق GT CRYPTO APIs':'GT CRYPTO APIs App',
    'يمكن تثبيت هذه الواجهة كتطبيق مستقل على Android/Desktop من المتصفح.':'This interface can be installed as a standalone app on Android/Desktop from the browser.',
    'تثبيت GT CRYPTO APIs':'Install GT CRYPTO APIs','إشعارات الهاتف':'Mobile Notifications',
    'بعد تفعيلها يظل اختيارك محفوظًا عند تحديث الصفحة وإعادة فتح التطبيق، ولا تتوقف من داخل GT CRYPTO APIs إلا عندما توقفها يدويًا. لا تتضمن الإشعارات بيانات حساسة.':'Once enabled, this preference persists across refreshes and restarts until you disable it manually. Notifications contain no sensitive data.',
    'تفعيل الإشعارات باستمرار':'Keep Notifications Enabled','الحالة':'Status','غير مفعّلة':'Disabled',
    'ينهي جلسة التحكم على الخادم ويحذف ملف تعريف الجلسة من الجهاز.':'Ends the server control session and clears the local session profile from this device.',
    'هوية الحساب':'Account Identity','بيانات قراءة فقط من المصدر المتصل. لا يتم عرض API Key أو Secret أو عناوين IP أو صلاحيات المفتاح.':'Read-only identity data from the connected source. API keys, secrets, IP addresses, and key permissions are never displayed.',
    'الحساب':'Account','حالة النظام':'System Status','نوع الحساب':'Account type','منطقة الخادم':'Server region','سياسة الجلسة':'Session Policy',
    'لا يوجد قفل بسبب الخمول. مدة الأمان المطلقة 30 يومًا افتراضيًا، ويمكن ضبطها على الخادم.':'There is no idle lock. The default absolute security lifetime is 30 days and can be configured on the server.',
    'حماية الجلسة':'Session protection','انتهاء الصلاحية المطلق':'Absolute expiry','تنفيذ العمليات المالية':'Financial operations',
    'مراجعة العملية':'Review Operation','هذه عملية حقيقية على حسابك. راجع التفاصيل قبل التأكيد.':'This is a live operation on your account. Review the details before confirming.',
    'اكتب CANCEL_ALL لتأكيد الإلغاء الجماعي':'Type CANCEL_ALL to confirm bulk cancellation','رجوع':'Back','تأكيد وإرسال':'Confirm & Submit',
    'أنت غير متصل بالإنترنت — أوامر الحساب متوقفة.':'You are offline — account operations are paused.',
    'يلزم تشغيل JavaScript لاستخدام لوحة التحكم. لا يمكن تنفيذ العمليات بدونه.':'JavaScript is required to use the control panel. Operations cannot run without it.',
    'لا توجد أرصدة غير صفرية.':'No non-zero balances.','القيمة بالدولار':'USD value','الربح غير المحقق':'Unrealized P&L','لا توجد مراكز مفتوحة.':'No open positions.',
    'المتوسط':'Average','السعر المرجعي':'Mark price','الرافعة':'Leverage','الربح':'P&L','التصفية':'Liquidation','نعم':'Yes','لا':'No',
    'النوع':'Type','إلغاء':'Cancel','لا توجد أوامر مفتوحة في هذا السوق.':'No open orders in this market.','جارٍ تحميل الأوامر…':'Loading orders…',
    'جارٍ تحميل العملات المتاحة للتحويل…':'Loading available transfer assets…','لا توجد عملات متاحة لهذا الاتجاه.':'No assets are available for this transfer direction.',
    'بيانات غير مكتملة':'Incomplete data','متصل بالمصدر':'Connected to source','تم تحديث بيانات الحساب.':'Account data refreshed.',
    'كمية العملة الأساسية، بما في ذلك أوامر الشراء بسعر السوق.':'Base-asset quantity, including market buy orders.','كمية العقد حسب وحدة السوق المختار.':'Contract quantity according to the selected market unit.',
    'مقفلة':'Locked','جاهز':'Ready','غير متصل':'Offline','غير متاح':'Unavailable','مفعّل بتأكيد يدوي':'Enabled with manual confirmation','معطّل':'Disabled',
    'خدمة الجلسات غير مهيأة':'Session service is not configured','رمز التحكم غير مهيأ':'Control token is not configured','مفاتيح الاتصال غير مهيأة':'Connection keys are not configured','جاهز لتسجيل الدخول':'Ready to sign in',
    'الإعداد غير مكتمل':'Setup incomplete','تعذر الوصول إلى الخدمة':'Service unavailable','غير متصل بالإنترنت':'Offline',
    'العودة للتطبيق':'Back to App','مركز عمليات P2P':'P2P Operations Center',
    'إدارة الطلبات والإعلانات والمحادثات مع أتمتة مراقبة آمنة. لا يتم تنفيذ Release أو Mark as Paid تلقائيًا.':'Manage orders, advertisements, and chat with safe monitoring automation. Release and Mark as Paid are never executed automatically.',
    'فتح جلسة P2P':'Open P2P Session','Control Token يبقى في ذاكرة الصفحة فقط ولا يوجد قفل تلقائي بمرور الوقت. تنتهي الجلسة عند تسجيل الخروج أو إغلاق/تحديث الصفحة.':'The Control Token stays in page memory only. There is no idle lock; the session ends on sign-out or page close/refresh.',
    'جارٍ التحقق من صلاحيات P2P Open API…':'Checking P2P Open API permissions…','تفعيل الإشعارات':'Enable Notifications',
    'P2P Open API غير متاح حاليًا':'P2P Open API is currently unavailable','الواجهة جاهزة، لكنها ستظل في وضع الانتظار حتى تتوفر صلاحيات FiatP2POrder وAdvertising للمفتاح.':'The interface is ready, but remains on standby until FiatP2POrder and Advertising permissions are available.',
    'حالة P2P API':'P2P API Status','بانتظار الفحص':'Waiting for check','طلبات تحتاج متابعة':'Orders requiring attention','إعلانات الحساب':'Account ads','آخر مزامنة':'Last Sync',
    'الأتمتة الآمنة':'Safe Automation','مراقبة فقط — لا يتم تحويل أموال أو Release بشكل تلقائي.':'Monitoring only — no funds are moved and no Release is executed automatically.',
    'تحديث كل 30 ثانية':'Refresh every 30 seconds','يراقب الطلبات الجديدة ويحدث العدادات تلقائيًا.':'Monitors new orders and updates counters automatically.',
    'ينبهك عند ظهور طلب Pending جديد بعد السماح بالإشعارات.':'Alerts you when a new Pending order appears after notification permission is granted.',
    'Release وMark as Paid يحتاجان تأكيدًا يدويًا صريحًا في كل مرة.':'Release and Mark as Paid require explicit manual confirmation every time.',
    'الطلبات المعلقة':'Pending Orders','آخر Pending P2P orders':'Latest Pending P2P orders','إعلاناتي':'My Ads','الحالة الحالية للإعلانات':'Current advertisement status',
    'تفاصيل طلب':'Order Details','تحميل التفاصيل':'Load Details','أدخل Order ID لعرض التفاصيل.':'Enter an Order ID to view details.',
    'محادثة P2P':'P2P Chat','رسائل يدوية عبر P2P Open API':'Manual messages via P2P Open API','اكتب الرسالة…':'Type a message…','إرسال الرسالة':'Send Message',
    'تنفيذ مالي حساس — تأكيد يدوي إلزامي':'Sensitive financial action — manual confirmation is mandatory','اكتب P2P_PAID للتأكيد':'Type P2P_PAID to confirm',
    'لا تستخدمها قبل التأكد الفعلي من وصول الدفع':'Do not use this before verifying that payment was actually received','اكتب RELEASE_P2P للتأكيد':'Type RELEASE_P2P to confirm',
    'تشخيص مباشر دون كشف أي مفاتيح سرية':'Live diagnostics without exposing any secrets','أنت غير متصل بالإنترنت — جميع عمليات P2P متوقفة.':'You are offline — all P2P operations are paused.',
    'لا يوجد اتصال بالإنترنت.':'No internet connection.','جلسة P2P مقفلة.':'The P2P session is locked.','لا توجد Pending Orders حاليًا.':'There are no Pending Orders right now.',
    'لا توجد إعلانات قابلة للعرض أو الصلاحية لم تُفتح بعد.':'No advertisements are available to display, or the permission has not been enabled yet.',
    'لا توجد تفاصيل.':'No details available.','لا توجد تفاصيل قابلة للعرض.':'No displayable details.','لا توجد رسائل أو لم يتم السماح بقراءة المحادثة بعد.':'No messages are available, or chat read access has not been enabled yet.',
    'متاح':'Available','P2P Open API متاح للحساب. المراقبة الآلية تعمل، والعمليات الحساسة ما زالت يدوية.':'P2P Open API is available. Automated monitoring is active; sensitive operations remain manual.',
    'P2P متصل':'P2P Connected','مغلق':'Unavailable','التطبيق جاهز، لكن صلاحيات P2P Open API للمفتاح غير متاحة بعد.':'The app is ready, but P2P Open API permissions are not available for this key yet.',
    'P2P غير متاح':'P2P Unavailable','بانتظار تفعيل صلاحيات P2P.':'Waiting for P2P permissions to be enabled.','بانتظار تفعيل صلاحية Advertising.':'Waiting for the Advertising permission to be enabled.',
    'اكتب P2P_PAID حرفيًا للتأكيد.':'Type P2P_PAID exactly to confirm.','اكتب RELEASE_P2P حرفيًا للتأكيد.':'Type RELEASE_P2P exactly to confirm.','جلسة مفتوحة':'Session Open',
    'رصيد عرض ثابت · غير متصل بالرصيد الحي':'Fixed display balance · not connected to live balance','مراقب ترتيب الإعلان':'Ad Ranking Monitor',
    'يراقب أول منافس غير معلّم كترويجي ويقترح سعرًا أقل بـ 0.01 فقط.':'Tracks the first competitor not explicitly marked as promoted and suggests a price lower by 0.01 only.',
    'تحديث السوق':'Refresh Market',
    'الإعلان المراقب':'Monitored Ad',
    'سعرك الحالي':'Your Current Price',
    'أول منافس غير ترويجي':'First Non-Promoted Competitor',
    'السعر المقترح':'Suggested Price',
    'بانتظار بيانات السوق.':'Waiting for market data.',
    'مراجعة تحديث السعر':'Review Price Update',
    'المراقبة آلية، أما تعديل السعر الحقيقي فلا يتم تلقائيًا: REVIEW → CONFIRM → EXECUTE.':'Monitoring is automatic, but live price changes are never automatic: REVIEW → CONFIRM → EXECUTE.',
    'إيصال العملية':'Transaction Receipt',
    'تفاصيل الطلب':'Request Details',
    'استجابة المصدر':'Source Response',
    'تحميل PDF':'Download PDF',
    'إغلاق':'Close',
    'الإيصال يثبت الطلب الذي قبلته الخدمة. بعض العمليات تحتاج مراجعة سجل الحساب للتأكد من حالة التسوية النهائية.':'This receipt records the request accepted by the service. Some operations require account-history verification for final settlement status.'
  };

  Object.assign(EN, {
    'جارٍ تهيئة الاتصال…':'Preparing connection…',
    'البيانات الحية غير متاحة':'Live data unavailable',
    'اختصارات الحساب':'Account shortcuts','إنشاء أمر':'Create an order','راجع التفاصيل قبل الإرسال':'Review details before sending',
    'إدارة الحماية':'Manage protection','الرافعة ووقف الخسارة':'Leverage and stop loss','تحويل الأصول':'Transfer assets',
    'اختر الحساب أو اطلب عرض سعر':'Choose an account or request a quote','كيف أستخدم لوحة التحكم؟':'How do I use the control panel?',
    'اختر القسم والسوق المناسبين للعملية.':'Choose the relevant section and market for your operation.',
    'أدخل البيانات ثم راجع الملخص؛ المراجعة وحدها لا ترسل العملية.':'Enter your data and review the summary; review alone does not send the operation.',
    'التنفيذ المالي يتطلب تأكيدك الصريح. عند انقطاع الاتصال، راجع سجل الحساب قبل إعادة المحاولة.':'Financial execution requires your explicit confirmation. If connectivity is interrupted, check account history before trying again.',
    'مراجعة نهائية قبل الإرسال':'Final review before sending'
  });

  const AR = new Map(Object.entries(EN).map(([ar, en]) => [en, ar]));
  const textSource = new WeakMap();
  const attrSource = new WeakMap();
  const hasArabic = value => /[\u0600-\u06FF]/.test(value || '');
  const get = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const set = (key, value) => { try { localStorage.setItem(key, value); } catch {} };

  function localize(value, target = language) {
    if (typeof value !== 'string' || !value) return value;
    const match = value.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const lead = match?.[1] || '', body = match?.[2] || value, tail = match?.[3] || '';
    if (target === 'ar') return lead + (AR.get(body) || body) + tail;
    if (EN[body]) return lead + EN[body] + tail;
    const rules = [
      [/^لا قفل بسبب الخمول\. الصلاحية القصوى (\d+) يومًا من تسجيل الدخول، أو حتى تسجيل الخروج أو إلغاء الجلسة\.$/, m => 'No idle lock. Maximum lifetime is ' + m[1] + ' days from sign-in, or until logout/session revocation.'],
      [/^لم يكتمل تسجيل الخروج على الخادم: (.+)$/s, m => 'Server sign-out did not complete: ' + m[1]],
      [/^(\d+) طلب Pending جديد يحتاج متابعة\.$/, m => m[1] + ' new Pending order' + (m[1] === '1' ? '' : 's') + ' require attention.'],
      [/^(.+) ← (.+) · سعر التحويل (.+) · ينتهي (.+)$/s, m => m[1] + ' → ' + m[2] + ' · exchange rate ' + m[3] + ' · expires ' + m[4]]
    ];
    for (const [pattern, render] of rules) { const m = body.match(pattern); if (m) return lead + render(m) + tail; }
    return value;
  }

  function processText(node) {
    const parent = node?.parentElement;
    if (!parent || parent.closest('script,style,code,pre')) return;
    const current = node.nodeValue || '';
    if (!current.trim()) return;
    let source = textSource.get(node);
    if (!source || hasArabic(current)) { source = current; textSource.set(node, source); }
    const next = language === 'ar' ? source : localize(source, 'en');
    if (current !== next) node.nodeValue = next;
  }

  function processAttrs(el) {
    if (!(el instanceof Element)) return;
    let sources = attrSource.get(el);
    if (!sources) { sources = {}; attrSource.set(el, sources); }
    for (const attr of ['placeholder','title','aria-label']) {
      if (!el.hasAttribute(attr)) continue;
      const current = el.getAttribute(attr) || '';
      if (!sources[attr] || hasArabic(current)) sources[attr] = current;
      const next = language === 'ar' ? sources[attr] : localize(sources[attr], 'en');
      if (current !== next) el.setAttribute(attr, next);
    }
  }

  function translate(root = document.body) {
    if (!root) return;
    applying = true;
    try {
      if (root.nodeType === Node.TEXT_NODE) return processText(root);
      if (root instanceof Element) processAttrs(root);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      let node = walker.currentNode;
      while (node) {
        if (node.nodeType === Node.TEXT_NODE) processText(node);
        else if (node instanceof Element) processAttrs(node);
        node = walker.nextNode();
      }
    } finally { applying = false; }
  }

  const icons = {
    sun:'<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"></path></svg>',
    moon:'<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20.5 14.5A8 8 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z"></path></svg>',
    lang:'<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"></path></svg>'
  };

  function ensureControls() {
    const host = document.querySelector('.appbar__actions, .top-actions');
    if (!host || host.querySelector('.preference-switches')) return;
    const group = document.createElement('div');
    group.className = 'preference-switches';
    group.setAttribute('role','group');
    group.innerHTML = '<button id="themeToggle" class="preference-toggle" type="button"><span class="preference-toggle__icon"></span><span class="preference-toggle__label"></span></button>' +
      '<button id="languageToggle" class="preference-toggle preference-toggle--language" type="button">' + icons.lang + '<span class="preference-toggle__label"></span></button>';
    host.prepend(group);
    group.querySelector('#themeToggle').addEventListener('click', () => applyTheme(theme === 'dark' ? 'light' : 'dark', true));
    group.querySelector('#languageToggle').addEventListener('click', () => applyLanguage(language === 'ar' ? 'en' : 'ar', true));
    updateControls();
  }

  function updateControls() {
    const themeButton = document.getElementById('themeToggle');
    const languageButton = document.getElementById('languageToggle');
    if (themeButton) {
      const target = theme === 'dark' ? 'light' : 'dark';
      const label = language === 'ar' ? (target === 'light' ? 'نهاري' : 'ليلي') : (target === 'light' ? 'Light' : 'Dark');
      const aria = language === 'ar' ? 'التبديل إلى الوضع ' + label : 'Switch to ' + label.toLowerCase() + ' mode';
      themeButton.querySelector('.preference-toggle__icon').innerHTML = target === 'light' ? icons.sun : icons.moon;
      themeButton.querySelector('.preference-toggle__label').textContent = label;
      themeButton.setAttribute('aria-label', aria); themeButton.title = aria;
    }
    if (languageButton) {
      const target = language === 'ar' ? 'en' : 'ar';
      languageButton.querySelector('.preference-toggle__label').textContent = target === 'en' ? 'EN' : 'AR';
      const aria = language === 'ar' ? 'Switch interface to English' : 'تبديل الواجهة إلى العربية';
      languageButton.setAttribute('aria-label', aria); languageButton.title = aria;
    }
  }

  function snapshot() { return { theme, language, dir: language === 'ar' ? 'rtl' : 'ltr', locale: language === 'ar' ? 'ar-EG' : 'en-US' }; }

  function applyTheme(value, persist = false) {
    theme = value === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLORS[theme]);
    document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', theme);
    if (persist) set(THEME_KEY, theme);
    updateControls();
    window.dispatchEvent(new CustomEvent('gtpreferenceschange', { detail: snapshot() }));
  }

  function applyLanguage(value, persist = false) {
    language = value === 'en' ? 'en' : 'ar';
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.dataset.lang = language;
    if (persist) set(LANG_KEY, language);
    translate(document.body);
    updateControls();
    window.dispatchEvent(new CustomEvent('gtpreferenceschange', { detail: snapshot() }));
  }

  const nativeConfirm = window.confirm.bind(window);
  window.confirm = message => nativeConfirm(language === 'en' ? localize(String(message), 'en') : message);

  theme = get(THEME_KEY) === 'light' ? 'light' : 'dark';
  language = get(LANG_KEY) === 'en' ? 'en' : 'ar';

  window.GTPreferences = Object.freeze({
    theme: () => theme, language: () => language, dir: () => language === 'ar' ? 'rtl' : 'ltr',
    locale: () => language === 'ar' ? 'ar-EG' : 'en-US',
    localize: value => language === 'en' ? localize(value, 'en') : value,
    setTheme: value => applyTheme(value, true), setLanguage: value => applyLanguage(value, true), snapshot
  });

  function init() {
    applyTheme(theme); applyLanguage(language); ensureControls();
    observer = new MutationObserver(mutations => {
      if (applying) return;
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') processText(mutation.target);
        else if (mutation.type === 'attributes') processAttrs(mutation.target);
        else for (const node of mutation.addedNodes) translate(node);
      }
    });
    observer.observe(document.body, { subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['placeholder','title','aria-label'] });
    requestAnimationFrame(() => document.documentElement.classList.add('theme-ready'));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true }); else init();
  window.addEventListener('storage', event => {
    if (event.key === THEME_KEY && event.newValue) applyTheme(event.newValue);
    if (event.key === LANG_KEY && event.newValue) applyLanguage(event.newValue);
  });
})();
