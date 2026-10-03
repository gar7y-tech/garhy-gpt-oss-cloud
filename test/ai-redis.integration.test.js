import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
import {acquireBudget,ACQUIRE_LUA} from '../hana-ai-pro/lib/ai-guard.js';

test('real Redis: atomic concurrent leases, cross-instance quota, release and TTL expiry',async()=>{
  const reservation=createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
  const dir=await mkdtemp(tmpdir()+'/garhy-redis-test-'),server=process.env.GARHY_REDIS_SERVER||'redis-server',cli=process.env.GARHY_REDIS_CLI||'redis-cli',run=promisify(execFile);
  const child=spawn(server,['--bind','127.0.0.1','--port',String(port),'--save','','--appendonly','no','--dir',dir],{stdio:['ignore','ignore','pipe']});let launchError;child.on('error',error=>launchError=error);child.stderr.resume();
  const command=async args=>JSON.parse((await run(cli,['-p',String(port),'--json',...args.map(String)],{timeout:3000,maxBuffer:1024*1024})).stdout);
  try{
    let ready=false;for(let i=0;i<40;i++){if(launchError)throw Error('BLOCKED: Redis executable is required for integration tests');try{ready=await command(['PING'])==='PONG';if(ready)break}catch{}await new Promise(r=>setTimeout(r,50))}assert.equal(ready,true,'Redis test server starts locally');
    const env={VERCEL:'1',GROQ_API_KEY:'integration-test-only',UPSTASH_REDIS_REST_URL:'https://redis.fixture.invalid',UPSTASH_REDIS_REST_TOKEN:'integration-test-only'},req={headers:{'x-forwarded-for':'192.0.2.1'}};
    // The HTTPS adapter is an explicit fixture. The exact production Lua runs in real Redis.
    const fetchImpl=async(url,options)=>new Response(JSON.stringify({result:await command(JSON.parse(options.body))}));
    const burst=await Promise.allSettled(Array.from({length:12},()=>acquireBudget(req,{env:{...env},fetchImpl,namespace:'hana',maxRequests:15})));
    const leases=burst.filter(r=>r.status==='fulfilled').map(r=>r.value);assert.equal(leases.length,2);assert.ok(burst.filter(r=>r.status==='rejected').every(r=>r.reason.status===429));
    for(const lease of leases){await lease.release();await lease.release()}
    let accepted=2;for(let i=0;i<14;i++){try{const lease=await acquireBudget(req,{env:{...env},fetchImpl,namespace:'hana',maxRequests:15});accepted++;await lease.release()}catch(error){assert.equal(error.status,429)}}assert.equal(accepted,15,'quota survives releases and distinct consumer instances');
    const prefix='{garhy-ai}:ttl-test:'+randomUUID(),keys=['window','global-window','leases','ip-leases'].map(k=>prefix+':'+k);
    const acquire=()=>command(['EVAL',ACQUIRE_LUA,4,...keys,1,3,100,6,2,1,randomUUID()]);
    for(let i=0;i<3;i++){assert.equal((await acquire())[0],'OK');const active=await command(['ZRANGE',keys[2],0,-1]);await command(['ZREM',keys[2],...active]);await command(['ZREM',keys[3],...active])}
    const blocked=await acquire();assert.equal(blocked[0],'RATE_LIMIT');assert.ok(blocked[1]>0&&blocked[1]<=1);
    await new Promise(r=>setTimeout(r,1100));assert.equal((await acquire())[0],'OK','expired quota is renewed by Redis TTL');
  }finally{if(child.pid&&child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r))}}
});
