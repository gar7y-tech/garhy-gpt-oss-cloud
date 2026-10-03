(() => {
  'use strict';
  let activeUrl='';

  function decodeBase64(value){
    const binary=atob(value);
    const bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
    return bytes;
  }

  function ensureDialog(){
    let dialog=document.getElementById('receiptDialog');
    if(dialog) return dialog;

    dialog=document.createElement('dialog');
    dialog.id='receiptDialog';
    dialog.className='receipt-dialog';
    dialog.setAttribute('aria-labelledby','receiptTitle');
    dialog.innerHTML=`
      <div class="receipt-head">
        <div><span>GT CRYPTO APIs · GARHY TECH</span><h2 id="receiptTitle">إيصال العملية</h2></div>
        <button id="receiptClose" class="receipt-close" type="button" aria-label="إغلاق">×</button>
      </div>
      <div class="receipt-status"><strong id="receiptStatus">—</strong><span id="receiptTime">—</span></div>
      <dl class="receipt-meta">
        <div><dt>Receipt ID</dt><dd id="receiptId">—</dd></div>
        <div><dt>Action</dt><dd id="receiptAction">—</dd></div>
        <div><dt>Request ID</dt><dd id="receiptRequestId">—</dd></div>
        <div><dt>SHA-256</dt><dd id="receiptIntegrity">—</dd></div>
      </dl>
      <details open><summary>تفاصيل الطلب</summary><pre id="receiptRequest"></pre></details>
      <details><summary>استجابة المصدر</summary><pre id="receiptResult"></pre></details>
      <p class="receipt-note">الإيصال يثبت الطلب الذي قبلته الخدمة. بعض العمليات تحتاج مراجعة سجل الحساب للتأكد من حالة التسوية النهائية.</p>
      <div class="receipt-actions">
        <a id="receiptDownload" class="btn btn--primary" download>تحميل PDF</a>
        <button id="receiptDone" class="btn btn--ghost" type="button">إغلاق</button>
      </div>`;
    document.body.append(dialog);

    const close=()=>dialog.close();
    dialog.querySelector('#receiptClose').addEventListener('click',close);
    dialog.querySelector('#receiptDone').addEventListener('click',close);
    dialog.addEventListener('close',()=>{
      if(activeUrl){URL.revokeObjectURL(activeUrl);activeUrl='';}
    });
    return dialog;
  }

  function put(id,value){
    const node=document.getElementById(id);
    if(node) node.textContent=value ?? '—';
  }

  function present(receipt){
    if(!receipt || typeof receipt!=='object') return;
    const dialog=ensureDialog();

    put('receiptStatus',receipt.status || 'ACCEPTED');
    put('receiptTime',receipt.timestamp || '—');
    put('receiptId',receipt.receiptId || '—');
    put('receiptAction',`${receipt.channel || 'GT CRYPTO'} · ${receipt.action || '—'}`);
    put('receiptRequestId',receipt.requestId || '—');
    put('receiptIntegrity',receipt.integrity || '—');
    put('receiptRequest',JSON.stringify(receipt.request ?? {},null,2));
    put('receiptResult',JSON.stringify(receipt.result ?? {},null,2));

    const link=document.getElementById('receiptDownload');
    if(activeUrl){URL.revokeObjectURL(activeUrl);activeUrl='';}
    if(receipt.pdf?.base64){
      const blob=new Blob([decodeBase64(receipt.pdf.base64)],{type:receipt.pdf.mime || 'application/pdf'});
      activeUrl=URL.createObjectURL(blob);
      link.href=activeUrl;
      link.download=receipt.pdf.fileName || `${receipt.receiptId || 'gt-bybit-receipt'}.pdf`;
      link.hidden=false;
    }else{
      link.hidden=true;
      link.removeAttribute('href');
    }
    if(!dialog.open) dialog.showModal();
  }

  window.GTReceipts={present};
})();
