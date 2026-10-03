const iframe=document.querySelector('#app'),results=document.querySelector('#results');
const report={responsive:[],functional:[],errors:[],realFinancialActions:0};
const DEMO_BALANCE='3,860.00 USD';
const pause=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
async function waitFor(check,message){for(let i=0;i<100;i++){if(check())return;await pause(100);}throw new Error(message);}
function check(condition,name){report.functional.push({name,pass:Boolean(condition)});if(!condition)throw new Error(name);}
function doc(){return iframe.contentDocument;}
function el(id){return doc().getElementById(id);}
function activePanels(){return [...doc().querySelectorAll('[data-view-panel]')].filter((p)=>p.getClientRects().length>0);}
async function login(){el('controlToken').value='QA_ONLY';el('connectBtn').click();await waitFor(()=>!el('secureApp').hidden,'Mock login failed');await waitFor(()=>el('mEquity').textContent===DEMO_BALANCE,'Fixed presentation dashboard failed');}
async function reload(){iframe.contentWindow.location.reload();await waitFor(()=>el('secureApp') && !el('secureApp').hidden,'Refresh lost session');await waitFor(()=>el('mEquity').textContent===DEMO_BALANCE,'Refresh changed fixed presentation balance');}
function measure(width,view,locked){
  const d=doc(),win=iframe.contentWindow;
  const overflow=d.documentElement.scrollWidth>win.innerWidth;
  const badControls=[...d.querySelectorAll('input,select,button')].filter((node)=>node.getClientRects().length && !node.closest('.table-wrap')).filter((node)=>{const b=node.getBoundingClientRect();return b.left < -1 || b.right > win.innerWidth+1 || b.width<1;}).map((node)=>node.id || node.name || node.textContent.trim().slice(0,30));
  const hugeIcons=[...d.querySelectorAll('svg')].filter((node)=>{const b=node.getBoundingClientRect();return b.width>32 || b.height>32;}).length;
  const brokenImages=[...d.images].filter((img)=>!img.complete || img.naturalWidth===0).length;
  const panels=activePanels().length;
  const pass=!overflow && badControls.length===0 && hugeIcons===0 && brokenImages===0 && panels===(locked?0:1);
  report.responsive.push({width,view,locked,pass,overflow,badControls,hugeIcons,brokenImages,visiblePanels:panels});
}
async function resize(width){iframe.width=String(width);await pause(80);}
async function nav(view){const candidates=[...doc().querySelectorAll(`[data-view="${view}"]`)];candidates.find((n)=>n.getClientRects().length)?.click();await pause(150);}
document.querySelector('#resize').onclick=()=>resize(document.querySelector('#width').value);
document.querySelector('#run').onclick=async()=>{
  document.querySelector('#run').disabled=true;
  try{
    await waitFor(()=>el('preAuthState') && el('preAuthState').textContent.includes('جاهز'),'App boot failed');
    if(!el('secureApp').hidden){el('lockSettingsBtn').click();await waitFor(()=>el('secureApp').hidden,'Initial logout failed');}
    for(const width of [320,360,390,430,768,1024,1440]){await resize(width);measure(width,'locked',true);}
    await login();check(!el('secureApp').hidden,'UI login with synthetic fixture');
    check(el('mEquity').textContent===DEMO_BALANCE,'Initial load keeps fixed fixed presentation balance');
    check(!el('equityModeBadge').hidden && el('equityModeBadge').textContent.includes('غير متصل بالرصيد الحي'),'Fixed balance disclosure is visibly labeled');
    check(doc().documentElement.dir==='rtl','Arabic RTL');
    check(doc().styleSheets.length>0 && iframe.contentWindow.getComputedStyle(doc().body).backgroundColor!=='rgb(255, 255, 255)','Styles loaded');
    await reload();check(!el('secureApp').hidden,'Refresh preserves secure session');check(el('mEquity').textContent===DEMO_BALANCE,'Page refresh keeps fixed fixed presentation balance');
    for(const width of [320,360,390,430,768,1024,1440]){await resize(width);for(const view of ['overview','trade','risk','assets','settings']){await nav(view);measure(width,view,false);check(el('mEquity').textContent===DEMO_BALANCE,`Fixed presentation balance stable at ${width}px in ${view}`);}}
    await resize(390);await nav('trade');
    const form=el('orderForm');form.elements.symbol.value='BTCUSDT';form.elements.qty.value='0.001';
    const before=await fetch('/__qa/counters').then((r)=>r.json());
    form.requestSubmit();await waitFor(()=>el('toast').textContent.includes('العرض الحالي ثابت'),'Presentation action block notice missing');
    check(!el('confirmDialog').open,'Presentation mode blocks trade before confirmation');
    check((await fetch('/__qa/counters').then((r)=>r.json())).mockWrites===before.mockWrites,'Presentation trade sends no financial request');
    await nav('risk');const cancel=el('cancelAllForm');cancel.elements.confirm.value='CANCEL_ALL';cancel.requestSubmit();await pause(50);
    check(!el('confirmDialog').open,'Presentation mode blocks cancel-all before confirmation');
    check((await fetch('/__qa/counters').then((r)=>r.json())).mockWrites===before.mockWrites,'Presentation cancel-all sends no financial request');
    Object.defineProperty(iframe.contentWindow.navigator,'onLine',{configurable:true,get:()=>false});iframe.contentWindow.dispatchEvent(new Event('offline'));
    check(!el('offlineBanner').hidden && [...doc().querySelectorAll('#secureApp form button')].every((button)=>button.disabled),'Offline disables account actions');
    Object.defineProperty(iframe.contentWindow.navigator,'onLine',{configurable:true,get:()=>true});iframe.contentWindow.dispatchEvent(new Event('online'));await pause(100);
    check((await fetch('/__qa/counters').then((r)=>r.json())).mockWrites===before.mockWrites,'Navigation, presentation blocking and reconnect send no mutation');
    await nav('overview');el('overviewRefresh').click();await pause(100);check(el('mEquity').textContent===DEMO_BALANCE,'Background/manual refresh cannot change fixed presentation balance');
    iframe.contentWindow.dispatchEvent(new CustomEvent('gtpreferenceschange'));await pause(50);check(el('mEquity').textContent===DEMO_BALANCE,'UI re-render signal cannot change fixed presentation balance');
    await nav('settings');el('installSettingsBtn').click();await pause(50);check(el('toast').textContent.includes('قائمة'),'Install guidance appears');
    check(doc().querySelector('#controlToken').value==='','Control input is cleared');
    check(!doc().cookie.includes('__Host-gt_bybit_sid'),'Session cookie cannot be read by JavaScript');
    const sw=await iframe.contentWindow.navigator.serviceWorker.ready;check(new URL(sw.scope).pathname==='/','Service worker has root scope');
    const cacheNames=await iframe.contentWindow.caches.keys();check(cacheNames.includes('gt-bybit-shell-20261003-premium2'),'Versioned PWA shell installed');
    let apiCached=false;for(const name of cacheNames)for(const request of await (await iframe.contentWindow.caches.open(name)).keys())if(new URL(request.url).pathname.startsWith('/api/'))apiCached=true;
    check(!apiCached,'No API responses in CacheStorage');
    el('lockSettingsBtn').click();await waitFor(()=>el('secureApp').hidden,'Logout failed');check(el('walletTable').textContent==='افتح الجلسة لعرض البيانات.','Logout removes account data');
    const session=await fetch('/api/bybit?action=session').then((r)=>r.json());check(session.authenticated===false,'Logout invalidates server session');
    await login();await nav('overview');
    check(report.responsive.every((row)=>row.pass),'All responsive viewport/view checks');
  }catch(error){report.errors.push(error.message);}
  report.pass=report.errors.length===0 && report.functional.every((row)=>row.pass) && report.responsive.every((row)=>row.pass);
  results.textContent=JSON.stringify(report,null,2);document.querySelector('#run').disabled=false;
};
