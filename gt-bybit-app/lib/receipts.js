import crypto from 'node:crypto';

const SENSITIVE = new Set([
  'apikey','apisecret','secret','controltoken','authorization','cookie','csrf','csrftoken',
  'password','privatekey','signature','signer','confirm','confirmed',
]);

function keyName(key) {
  return String(key || '').replace(/[^a-z0-9]/gi,'').toLowerCase();
}
function sensitive(key) {
  const value=keyName(key);
  return SENSITIVE.has(value) || /^(?:x)?api(?:key|secret)$/.test(value);
}
export function sanitizeReceiptValue(value, depth=0) {
  if(depth>10) return '[MAX_DEPTH]';
  if(value===null || value===undefined) return value ?? null;
  if(Array.isArray(value)) return value.map((entry)=>sanitizeReceiptValue(entry,depth+1));
  if(typeof value==='object') {
    const output={};
    for(const [key,entry] of Object.entries(value)) {
      if(sensitive(key)) continue;
      output[key]=sanitizeReceiptValue(entry,depth+1);
    }
    return output;
  }
  if(typeof value==='bigint') return value.toString();
  if(['string','number','boolean'].includes(typeof value)) return value;
  return String(value);
}
function ascii(value) {
  return String(value ?? '').replace(/[^\x20-\x7E]/gu,(char)=>`\\u{${char.codePointAt(0).toString(16).toUpperCase()}}`);
}
function pdfEscape(value) {
  return ascii(value).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
}
function wrap(value,width=88) {
  const lines=[];
  for(const raw of ascii(value).split(/\r?\n/)) {
    if(!raw){lines.push('');continue;}
    let rest=raw;
    while(rest.length>width){lines.push(rest.slice(0,width));rest=rest.slice(width);}
    lines.push(rest);
  }
  return lines;
}
function flatten(value,prefix,lines) {
  if(value===null || value===undefined){lines.push(`${prefix} = ${String(value)}`);return;}
  if(Array.isArray(value)) {
    if(!value.length){lines.push(`${prefix} = []`);return;}
    value.forEach((entry,index)=>flatten(entry,`${prefix}[${index}]`,lines));
    return;
  }
  if(typeof value==='object') {
    const entries=Object.entries(value);
    if(!entries.length){lines.push(`${prefix} = {}`);return;}
    for(const [key,entry] of entries) flatten(entry,prefix ? `${prefix}.${key}` : key,lines);
    return;
  }
  lines.push(`${prefix} = ${String(value)}`);
}
function pdfFor(receipt) {
  const source=[
    'GT CRYPTO APIs - GARHY TECH','TRANSACTION RECEIPT','',
    `Receipt ID: ${receipt.receiptId}`,
    `Timestamp: ${receipt.timestamp}`,
    `Channel: ${receipt.channel}`,
    `Action: ${receipt.action}`,
    `Status: ${receipt.status}`,
    `Request ID: ${receipt.requestId || 'N/A'}`,
    `Integrity SHA-256: ${receipt.integrity}`,'',
    'NOTICE: This records the request accepted by the service.',
    'Final settlement/fill status may require account-history verification.','',
    'REQUEST DETAILS',
  ];
  flatten(receipt.request,'request',source);
  source.push('','SOURCE RESPONSE');
  flatten(receipt.result,'result',source);
  const lines=source.flatMap((line)=>wrap(line,88));
  const pages=[];
  for(let i=0;i<lines.length;i+=48) pages.push(lines.slice(i,i+48));
  if(!pages.length) pages.push(['GT CRYPTO APIs TRANSACTION RECEIPT']);

  const pageIds=pages.map((_,i)=>4+i*2);
  const contentIds=pages.map((_,i)=>5+i*2);
  const objects=[];
  objects[1]='<< /Type /Catalog /Pages 2 0 R >>';
  objects[2]=`<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id)=>`${id} 0 R`).join(' ')}] >>`;
  objects[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pages.forEach((page,index)=>{
    const stream=['BT','/F1 9 Tf','42 800 Td','12 TL',...page.flatMap((line,i)=>[`(${pdfEscape(line)}) Tj`,...(i===page.length-1?[]:['T*'])]),'ET'].join('\n');
    objects[pageIds[index]]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentIds[index]} 0 R >>`;
    objects[contentIds[index]]=`<< /Length ${Buffer.byteLength(stream,'latin1')} >>\nstream\n${stream}\nendstream`;
  });

  let pdf='%PDF-1.4\n%GTCRYPTO\n';
  const offsets=[0];
  for(let id=1;id<objects.length;id++){
    offsets[id]=Buffer.byteLength(pdf,'latin1');
    pdf+=`${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const start=Buffer.byteLength(pdf,'latin1');
  pdf+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for(let id=1;id<objects.length;id++) pdf+=`${String(offsets[id]).padStart(10,'0')} 00000 n \n`;
  pdf+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(pdf,'latin1');
}
export function createReceipt({channel,action,requestId=null,request={},result={},now=Date.now()}) {
  const safeRequest=sanitizeReceiptValue(request);
  const safeResult=sanitizeReceiptValue(result);
  const timestamp=new Date(now).toISOString();
  const core={channel:String(channel),action:String(action),status:'ACCEPTED',timestamp,requestId:requestId ? String(requestId) : null,request:safeRequest,result:safeResult};
  const integrity=crypto.createHash('sha256').update(JSON.stringify(core)).digest('hex');
  const receiptId=`GTB-${now.toString(36).toUpperCase()}-${integrity.slice(0,10).toUpperCase()}`;
  const receipt={receiptId,...core,integrity};
  const pdf=pdfFor(receipt);
  return {...receipt,pdf:{fileName:`${receiptId}.pdf`,mime:'application/pdf',base64:pdf.toString('base64')}};
}
