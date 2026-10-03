// Local QA only. Uses generated fixtures and an injected mock transport; cannot call Bybit.
import http from 'node:http';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHandler} from '../api/bybit.js';
import {fixtureEnv,memoryStore,mockRequest} from '../test/helpers.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.GT_QA_PORT || 4173);
const origin=`http://localhost:${port}`;
const env=fixtureEnv();env.BYBIT_ALLOWED_ORIGINS=origin;env.GT_APP_MODE=process.env.GT_QA_GUARDED==='1'?'production':'ui-testing';
const calls=[];
const handler=createHandler({env,store:memoryStore(),request:mockRequest(calls),storageReady:()=>true});
const config=JSON.parse(await readFile(path.join(root,'vercel.json'),'utf8'));
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
  res.status=(status)=>{res.statusCode=status;return res;};res.json=(body)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));};
  const url=new URL(req.url,origin);
  for(const h of config.headers[0].headers)res.setHeader(h.key,h.value);
  res.setHeader('Cache-Control','no-store');
  try{
    if(url.pathname==='/api/bybit'){
      req.query=Object.fromEntries(url.searchParams);
      if(req.method==='POST'){
        const chunks=[];let size=0;
        for await(const chunk of req){size+=chunk.length;if(size>16384)return res.status(413).json({ok:false,error:'PAYLOAD_TOO_LARGE'});chunks.push(chunk);}
        req.body=Buffer.concat(chunks).toString();
        try{const body=JSON.parse(req.body);if(body.action==='login' && body.controlToken==='QA_ONLY')req.body=JSON.stringify({...body,controlToken:env.BYBIT_CONTROL_TOKEN});}catch{}
      }
      return await handler(req,res);
    }
    if(url.pathname==='/__qa/counters')return res.json({mockWrites:calls.filter((c)=>c.method==='POST').length,realFinancialActions:0});
    if(url.pathname==='/__qa/' || url.pathname==='/__qa/harness.js'){
      res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-src 'self'; connect-src 'self'; img-src 'self'");
      const isScript=url.pathname.endsWith('.js');res.setHeader('Content-Type',isScript?mime['.js']:mime['.html']);
      return res.end(await readFile(path.join(root,'test',isScript?'harness.js':'harness.html')));
    }
    let pathname=url.pathname;
    const rewrite=config.rewrites.find((rule)=>rule.source===pathname);
    if(rewrite)pathname=rewrite.destination;
    if(pathname==='/gt-bybit') {res.writeHead(308,{Location:'/gt-bybit/'});return res.end();}
    if(url.pathname==='/sw.js'){res.setHeader('Service-Worker-Allowed','/');}
    // Local-only framing exception permits deterministic viewport tests in iframes.
    if(url.searchParams.get('source')==='qa'){
      res.setHeader('Content-Security-Policy',config.headers[0].headers.find((h)=>h.key==='Content-Security-Policy').value.replace("frame-ancestors 'none'","frame-ancestors 'self'"));
      res.removeHeader('X-Frame-Options');
    }
    const target=path.resolve(root,'public','.'+decodeURIComponent(pathname));
    if(!target.startsWith(path.resolve(root,'public')+path.sep))return res.status(404).end();
    const body=await readFile(target);res.setHeader('Content-Type',mime[path.extname(target)] || 'application/octet-stream');res.end(body);
  }catch{res.status(404).end('Not found');}
});
server.listen(port,'0.0.0.0',()=>console.log(`GT CRYPTO APIs local QA at ${origin}/__qa/ — mock transport only.`));
