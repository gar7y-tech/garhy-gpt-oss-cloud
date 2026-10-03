const CACHE='gt-bybit-shell-20261003-trading-identity1';
const VERSION='20261003-bybit-inspired1';
const STATIC=[
  '/gt-bybit/index.html',
  '/gt-bybit/p2p.html',
  `/gt-bybit/app.css?v=${VERSION}`,
  `/gt-bybit/p2p-console.css?v=${VERSION}`,
  `/gt-bybit/brand.css?v=${VERSION}`,
  `/gt-bybit/preferences-bootstrap.js?v=${VERSION}`,
  `/gt-bybit/preferences.js?v=${VERSION}`,
  `/gt-bybit/receipts.js?v=${VERSION}`,
  `/gt-bybit/app.js?v=${VERSION}`,
  `/gt-bybit/demo-state.js?v=${VERSION}`,
  `/gt-bybit/p2p-console.js?v=${VERSION}`,
  `/gt-bybit/validation.js?v=${VERSION}`,
  '/gt-bybit/manifest.webmanifest',
  '/assets/gt-crypto/gt-crypto-mark.svg',
];
const ALLOWED=new Set(STATIC.map((path)=>new URL(path,self.location.origin).pathname));

self.addEventListener('install',(event)=>{
  event.waitUntil(caches.open(CACHE).then(async(cache)=>{
    for(const path of STATIC){
      const request=new Request(path,{cache:'reload',credentials:'omit'});
      const response=await fetch(request);
      if(!response.ok)throw new Error('Shell asset unavailable');
      await cache.put(path,response);
    }
    await self.skipWaiting();
  }));
});

self.addEventListener('notificationclick',(event)=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const open=windows.find((client)=>new URL(client.url).origin===self.location.origin);
    if(open){await open.focus();return;}
    await self.clients.openWindow(event.notification.data?.url || '/');
  })());
});

self.addEventListener('activate',(event)=>{
  event.waitUntil((async()=>{
    for(const key of await caches.keys())if(key.startsWith('gt-bybit-shell-') && key!==CACHE)await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',(event)=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET' || url.origin!==self.location.origin || /^\/api(?:\/|$)/.test(url.pathname) || request.headers.has('Authorization'))return;

  const mainNavigation=request.mode==='navigate' && ['/', '/gt-bybit/', '/gt-bybit/index.html'].includes(url.pathname);
  const p2pNavigation=request.mode==='navigate' && url.pathname==='/gt-bybit/p2p.html';
  if(mainNavigation || p2pNavigation){
    if([...url.searchParams.keys()].some((key)=>!['view','source'].includes(key)))return;
    const fallback=p2pNavigation?'/gt-bybit/p2p.html':'/gt-bybit/index.html';
    event.respondWith(fetch(request,{cache:'no-store'}).catch(async()=>await caches.match(fallback,{cacheName:CACHE}) || Response.error()));
    return;
  }

  if(!ALLOWED.has(url.pathname) || [...url.searchParams.keys()].some((key)=>key!=='v'))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    try{
      const response=await fetch(request,{cache:'no-cache'});
      const type=response.headers.get('Content-Type') || '';
      const valid=(!url.pathname.endsWith('.js') || /javascript/.test(type)) && (!url.pathname.endsWith('.css') || /text\/css/.test(type));
      if(response.ok && valid)await cache.put(request,response.clone());
      return response;
    }catch{
      return await cache.match(request) || Response.error();
    }
  })());
});
