// Local synthetic fixtures only. The server injects mockRequest, never real Bybit.
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.GT_QA_PLAYWRIGHT || 'playwright');
const port=process.env.GT_QA_PORT || '4174',origin=`http://localhost:${port}`;
const server=spawn(process.execPath,['scripts/dev-server.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,GT_QA_PORT:port,GT_QA_GUARDED:'1'},stdio:['ignore','pipe','pipe']});
let browser;
const report={checks:[],responsive:[],errors:[],realFinancialActions:0};
const check=(condition,name)=>{assert.ok(condition,name);report.checks.push(name);};
try {
  await new Promise((resolve,reject)=>{server.stdout.on('data',data=>{if(String(data).includes('local QA'))resolve();});server.on('error',reject);server.on('exit',code=>reject(new Error(`QA server exited: ${code}`)));});
  browser=await chromium.launch({headless:true,...(process.env.GT_QA_BROWSER?{executablePath:process.env.GT_QA_BROWSER}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
  const counter=async()=>await(await page.request.get(`${origin}/__qa/counters`)).json();
  const nav=async(view)=>await page.locator(`.nav [data-view="${view}"]:visible,.bottom-nav [data-view="${view}"]:visible`).click();
  await page.goto(origin);await page.locator('#connectBtn').click();
  check(await page.locator('#controlToken').evaluate(node=>node===document.activeElement),'Empty login focuses control token');
  await page.locator('#controlToken').fill('QA_ONLY');await page.locator('#controlToken').press('Enter');await page.locator('#secureApp').waitFor({state:'visible'});
  await page.reload();await page.locator('#secureApp').waitFor({state:'visible'});check(true,'Session survives top-level refresh');
  await page.locator('.quick-action[data-view="trade"]').click();
  check(new URL(page.url()).searchParams.get('view')==='trade','Dashboard shortcut navigates through the existing view handler');
  const before=await counter();
  const order=page.locator('#orderForm'),submit=order.locator('[type="submit"]');
  await submit.click();
  check(await order.locator('[name="symbol"]').getAttribute('aria-invalid')==='true','Required error is inline and linked to the field');
  check(await order.locator('[name="symbol"]').evaluate(node=>node===document.activeElement),'First invalid field receives focus');
  await order.locator('[name="symbol"]').fill('BTCUSDT');await order.locator('[name="qty"]').fill('1e3');await order.locator('[name="qty"]').blur();
  check(await order.locator('[name="qty"]').getAttribute('aria-invalid')==='true','Existing decimal policy rejects exponential notation before review');
  await page.locator('#languageToggle').click();
  check((await page.locator('#ux-orderForm-qty-error').textContent()).includes('positive decimal'),'Inline feedback follows English language selection');
  await page.locator('#languageToggle').click();await order.locator('[name="qty"]').fill('0.001');
  check(await order.locator('[name="qty"]').getAttribute('aria-invalid')==='false','Correcting a field clears its error');
  check(await page.locator('#ux-orderForm-price-help').isVisible(),'Disabled price explains why it is unavailable');
  await order.locator('[name="orderType"]').selectOption('Limit');
  check(await page.locator('#ux-orderForm-price-help').isHidden(),'Limit selection removes disabled-price guidance');
  await submit.click();check(await order.locator('[name="price"]').getAttribute('aria-invalid')==='true','Limit orders explain required price');
  await order.locator('[name="price"]').fill('60000');await submit.click();await page.locator('#confirmDialog').waitFor({state:'visible'});
  check(await page.locator('#confirmCancel').evaluate(node=>node===document.activeElement),'Review initially focuses the safe cancel action');
  await page.keyboard.press('Escape');await page.locator('#confirmDialog').waitFor({state:'hidden'});await page.waitForTimeout(100);
  check((await counter()).mockWrites===before.mockWrites,'Escape cancels without a financial request');
  check(await submit.evaluate(node=>node===document.activeElement),'Cancel returns focus to the review trigger');
  await submit.click();await page.locator('#confirmDialog').waitFor({state:'visible'});await page.locator('#confirmAccept').click();await page.locator('#receiptDialog').waitFor({state:'visible'});
  check((await counter()).mockWrites===before.mockWrites+1,'One explicit confirmation sends exactly one mock operation');
  await page.locator('#receiptClose').click();await submit.click();await page.locator('#confirmDialog').waitFor({state:'visible'});await page.keyboard.press('Escape');await page.waitForTimeout(150);
  check((await counter()).mockWrites===before.mockWrites+1,'Escape after an earlier confirmed review never reuses the previous result');
  await nav('overview');
  await page.waitForFunction(()=>document.getElementById('walletTable').getAttribute('tabindex')==='0');
  check(await page.locator('#walletTable').getAttribute('tabindex')==='0','Overflowing table is keyboard-scrollable');
  await page.locator('#walletTable').focus();check(await page.locator('#walletTable').evaluate(node=>node===document.activeElement),'Table scroll region accepts keyboard focus');
  for(const lang of ['ar','en']) {
    if(await page.getAttribute('html','lang')!==lang)await page.locator('#languageToggle').click();
    for(const theme of ['dark','light']) {
      if(await page.getAttribute('html','data-theme')!==theme)await page.locator('#themeToggle').click();
      for(const width of [320,360,390,412,430,768,1024,1440]) {
        await page.setViewportSize({width,height:width<768?844:1000});
        for(const view of ['overview','trade','risk','assets','settings']) {
          await nav(view);await page.waitForTimeout(350);
          const row=await page.evaluate(({lang,theme,width,view})=>{
            const controls=[...document.querySelectorAll('button,input,select,summary')].filter(node=>node.getClientRects().length&&!node.closest('.table-wrap'));
            return {lang,theme,width,view,overflow:document.documentElement.scrollWidth>innerWidth,bad:controls.filter(node=>{const r=node.getBoundingClientRect();return r.left<-.5||r.right>innerWidth+.5||r.width<43.5||r.height<43.5;}).map(node=>node.id||node.name||node.tagName)};
          },{lang,theme,width,view});report.responsive.push(row);
        }
      }
    }
  }
  check(report.responsive.every(row=>!row.overflow&&!row.bad.length),'All 160 viewport/view/language/theme combinations pass');
  await page.setViewportSize({width:844,height:390});await nav('trade');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Landscape view has no horizontal document overflow');
  await page.emulateMedia({reducedMotion:'reduce'});
  check(await page.locator('.view.active').evaluate(node=>getComputedStyle(node).animationName==='none'),'Reduced motion disables view reveal');
  await page.reload();await page.locator('#secureApp').waitFor({state:'visible'});
  check(await page.getAttribute('html','lang')==='en' && await page.getAttribute('html','data-theme')==='light','Language and theme persist after refresh');
  const cache=await page.evaluate(async()=>Promise.all((await caches.keys()).map(async key=>(await(await caches.open(key)).keys()).map(request=>request.url))));
  check(cache.flat().some(url=>url.includes('/ux.js?v=20261003-ux3')),'PWA caches the new UX module');
  check(!cache.flat().some(url=>new URL(url).pathname.startsWith('/api/')),'PWA never caches account API responses');
  await nav('settings');await page.locator('#lockSettingsBtn').click();await page.locator('#authGate').waitFor({state:'visible'});
  const session=await(await page.request.get(`${origin}/api/bybit?action=session`)).json();check(session.authenticated===false,'Logout invalidates the server session');
  check(report.errors.length===0,'No page JavaScript errors');
  report.counters=await counter();check(report.counters.realFinancialActions===0,'No real financial operations');report.pass=true;
} catch(error) {report.pass=false;report.failure=error.message;process.exitCode=1;}
finally {await browser?.close();server.kill();if(process.env.GT_QA_REPORT)await writeFile(process.env.GT_QA_REPORT,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,responsive:`${report.responsive.length} cases`,failedResponsive:report.responsive.filter(row=>row.overflow||row.bad.length)}));}
