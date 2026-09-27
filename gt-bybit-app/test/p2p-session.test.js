import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createP2pHandler} from '../api/p2p.js';
import {BybitError} from '../lib/bybit.js';
import {fixtureEnv,invoke,memoryStore,setup} from './helpers.mjs';

test('P2P route imports and rejects missing session, origin, CSRF and invalid request shapes before Bybit',async()=>{
  const env=fixtureEnv(),store=memoryStore(),calls=[];
  const main=await setup({env,store});
  const handler=createP2pHandler({env,store,request:async(...args)=>{calls.push(args);return {retCode:0,result:{}};}});
  let res=await invoke(handler,{method:'POST',body:{action:'status'}});
  assert.equal(res.statusCode,401);
  res=await invoke(handler,{method:'POST',body:{action:'status'},cookie:main.cookie});
  assert.equal(res.statusCode,403);
  res=await invoke(handler,{method:'POST',body:{action:'status'},cookie:main.cookie,csrf:main.csrf,headers:{origin:'https://evil.example'}});
  assert.equal(res.statusCode,403);
  res=await invoke(handler,{method:'POST',body:[],cookie:main.cookie,csrf:main.csrf});
  assert.equal(res.statusCode,400);
  assert.equal(calls.length,0);
  res=await invoke(handler,{method:'POST',body:{action:'status'},cookie:main.cookie,csrf:main.csrf});
  assert.equal(res.statusCode,200);
  assert.deepEqual(calls[0].slice(0,2),['POST','/v5/p2p/user/personal/info']);
  assert.equal(res.body.available,true);
});

test('P2P presentation never claims live access or calls Bybit',async()=>{
  const env={...fixtureEnv(),GT_APP_MODE:'ui-testing'},store=memoryStore();
  const main=await setup({env,store}),calls=[];
  const handler=createP2pHandler({env,store,request:async(...args)=>{calls.push(args);return {retCode:0,result:{}};}});
  const opts={method:'POST',cookie:main.cookie,csrf:main.csrf};
  const status=await invoke(handler,{...opts,body:{action:'status'}});
  assert.equal(status.statusCode,200);
  assert.equal(status.body.available,false);
  assert.equal(status.body.financialDataMode,'presentation');
  assert.equal((await invoke(handler,{...opts,body:{action:'pending-orders'}})).statusCode,403);
  assert.equal(calls.length,0);
});

test('P2P reports missing Bybit permission without claiming a live connection',async()=>{
  const env=fixtureEnv(),store=memoryStore(),main=await setup({env,store});
  const handler=createP2pHandler({env,store,request:async()=>{
    throw new BybitError('PERMISSION_DENIED','صلاحيات المفتاح أو نوع الحساب لا يسمح بهذه العملية.',403,{retCode:10005});
  }});
  const res=await invoke(handler,{method:'POST',body:{action:'status'},cookie:main.cookie,csrf:main.csrf});
  assert.equal(res.statusCode,403);
  assert.equal(res.body.error,'PERMISSION_DENIED');
  assert.equal(res.body.retCode,10005);
  assert.equal(res.body.available,undefined);
});

test('P2P account changes need manual review and one durable reservation per request',async()=>{
  const env=fixtureEnv(),store=memoryStore(),calls=[];
  const main=await setup({env,store});
  const handler=createP2pHandler({env,store,request:async(...args)=>{calls.push(args);return {retCode:0,result:{orderId:'qa'}};}});
  const opts={method:'POST',cookie:main.cookie,csrf:main.csrf};
  const payload={action:'release',orderId:'qa',confirm:'RELEASE_P2P',confirmed:true,requestId:crypto.randomUUID()};
  assert.equal((await invoke(handler,{...opts,body:{...payload,confirmed:false}})).statusCode,400);
  assert.equal(calls.length,0);
  const accepted=await invoke(handler,{...opts,body:payload});
  assert.equal(accepted.statusCode,200);
  assert.equal(calls.filter(([,path])=>path==='/v5/p2p/order/finish').length,1);
  const replay=await invoke(handler,{...opts,body:payload});
  assert.equal(replay.statusCode,409);
  assert.equal(calls.filter(([,path])=>path==='/v5/p2p/order/finish').length,1);
});
