import {readFile,readdir,stat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';

const root=new URL('../',import.meta.url);

for(const directory of ['api','lib','gt-bybit','scripts']) {
  for(const name of await readdir(new URL(directory+'/',root))) {
    if(/\.(m?js)$/.test(name)) execFileSync(process.execPath,['--check',new URL(directory+'/'+name,root).pathname],{stdio:'pipe'});
  }
}

const config=JSON.parse(await readFile(new URL('vercel.json',root),'utf8'));
const manifest=JSON.parse(await readFile(new URL('gt-bybit/manifest.webmanifest',root),'utf8'));
const html=await readFile(new URL('gt-bybit/index.html',root),'utf8');
const p2pHtml=await readFile(new URL('gt-bybit/p2p.html',root),'utf8');
const worker=await readFile(new URL('gt-bybit/sw.js',root),'utf8');
const allowedImages=['assets/gt-crypto/bybit-icon.svg'];

assert.match(html,/<html lang="ar" dir="rtl">/);
assert.match(html,/id="secureApp"[^>]*hidden/);

for(const page of [html,p2pHtml]) {
  const ids=[...page.matchAll(/\bid="([^"]+)"/g)].map((m)=>m[1]);
  assert.equal(ids.length,new Set(ids).size,'Duplicate HTML IDs');
  assert.doesNotMatch(page,/<script(?![^>]*\bsrc=)[^>]*>/i,'Inline scripts violate the production CSP');
  for(const match of page.matchAll(/(?:src|href)="(\/[^"?#]+)(?:\?[^"#]*)?"/g)) {
    await stat(new URL(match[1].slice(1),root));
  }
}

assert.ok(Array.isArray(manifest.icons) && manifest.icons.some((icon)=>icon.src==='/assets/gt-crypto/bybit-icon.svg' && icon.type==='image/svg+xml'),'Manifest must use the approved Bybit application icon');

assert.equal(manifest.start_url,'/');
assert.equal(manifest.scope,'/');
assert.equal(manifest.display,'standalone');
assert.equal(config.rewrites.find((r)=>r.source==='/').destination,'/gt-bybit/index.html');
assert.match(config.headers.find((rule)=>rule.source==='/(.*)').headers.find((header)=>header.key==='Content-Security-Policy').value,/\bimg-src 'self'/);
assert.equal(config.outputDirectory,'public');

for(const dependency of ['preferences-bootstrap.js','preferences.js','receipts.js','p2p-console.js','demo-state.js']) {
  assert.ok(worker.includes(dependency),`Service worker must include ${dependency}`);
}
for(const asset of allowedImages)assert.ok(worker.includes(`/${asset}`),`Offline shell missing ${asset}`);

const imageExtension=/\.(?:png|jpe?g|webp|gif|avif|bmp|ico|svg|tiff?)$/i;
const imageFiles=[];
async function scan(url,prefix='') {
  for(const entry of await readdir(url,{withFileTypes:true})) {
    const relative=prefix ? `${prefix}/${entry.name}` : entry.name;
    // Build output is checked separately after build; tests may contain negative assertions.
    if(relative==='public' || relative==='test')continue;
    if(entry.isDirectory()){await scan(new URL(`${entry.name}/`,url),relative);continue;}
    if(imageExtension.test(entry.name)){
      imageFiles.push(relative);
      assert.ok(allowedImages.includes(relative),`Unexpected image file: ${relative}`);
      continue;
    }
    if(!/\.(?:html|css|m?js|json|webmanifest|txt)$/.test(entry.name) || relative==='scripts/check.mjs')continue;
    const source=await readFile(new URL(entry.name,url),'utf8');
    assert.doesNotMatch(source,/<(?:picture|source)\b|data:image|apple-touch-icon|https?:\/\/[^\s'"()<>]+\.(?:png|jpe?g|webp|gif|avif|bmp|ico|svg|tiff?)(?:\b|\?)/i,`Disallowed image reference: ${relative}`);
    for(const match of source.matchAll(/\/[^\s'"()<>]+?\.(?:png|jpe?g|webp|gif|avif|bmp|ico|svg|tiff?)(?:\b|\?)/gi)){
      assert.ok(allowedImages.includes(match[0].slice(1)),`Unexpected image URL in ${relative}: ${match[0]}`);
    }
    if(entry.name.endsWith('.html')){
      for(const match of source.matchAll(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/gi))assert.equal(match[1],`/${allowedImages[0]}`,`Unexpected HTML image in ${relative}`);
    }
    assert.doesNotMatch(source,/(?:createElement\(['"]img['"]\)|new Image\s*\(|createObjectURL\([^)]*image|<canvas\b|\.getContext\(['"]2d)/i,`Image generator: ${relative}`);
    if(entry.name.endsWith('.css')){
      assert.doesNotMatch(source,/url\s*\(\s*['"]?[^)'"\s]+\.(?:png|jpe?g|webp|gif|avif|bmp|ico|svg|tiff?)(?:\?[^)'"\s]*)?['"]?\s*\)/i,`Unexpected CSS image in ${relative}`);
      assert.doesNotMatch(source,/image-set\s*\(|border-image\s*:|content\s*:\s*url\s*\(/i,`Unexpected CSS image mechanism: ${relative}`);
    }
  }
}
await scan(root);
assert.deepEqual(imageFiles.sort(),allowedImages.sort(),'Only the approved Bybit application icon may be tracked');

console.log('Syntax, HTML/CSP, local assets, Bybit PWA icon, receipt shell, and image inventory passed.');
