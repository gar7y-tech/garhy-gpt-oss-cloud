// Presentation only. Reuses the existing validators; never sends a request.
import {decimal, symbol, coin} from './validation.js?v=20260908-2';

const language=()=>window.GTPreferences?.language?.() || 'ar';
const text=(ar,en)=>language()==='en'?en:ar;
const forms=[...document.querySelectorAll('#secureApp form')];
const feedback=new Map();
const decimalNames=new Set(['qty','price','takeProfit','stopLoss','trailingStop','buyLeverage','sellLeverage','amount','requestAmount']);
const coinNames=new Set(['coin','fromCoin','toCoin']);
const status=document.getElementById('uxFormStatus');
let focusQueued=false;

function fieldMessage(field) {
  if(field.disabled)return '';
  const value=field.value.trim();
  if(!value)return field.required?text('هذا الحقل مطلوب.','This field is required.'):'';
  try {
    if(decimalNames.has(field.name))decimal(value,field.name,field.form.id==='stopForm');
    else if(field.name==='symbol')symbol(value);
    else if(coinNames.has(field.name))coin(value);
  } catch {
    if(field.name==='symbol')return text('استخدم رمز السوق مثل BTCUSDT دون مسافات.','Use a market symbol such as BTCUSDT, without spaces.');
    if(coinNames.has(field.name))return text('استخدم رمز العملة مثل USDT دون مسافات.','Use a coin symbol such as USDT, without spaces.');
    return field.form.id==='stopForm'
      ?text('أدخل رقمًا عشريًا غير سالب؛ صفر يلغي الحماية المحددة.','Enter a non-negative decimal; zero removes the selected protection.')
      :text('أدخل رقمًا عشريًا أكبر من صفر، دون فواصل أو صيغة أسية.','Enter a positive decimal without commas or exponential notation.');
  }
  return '';
}

function validate(field,{show=true}={}) {
  field.setCustomValidity('');
  const message=fieldMessage(field);
  field.setCustomValidity(message);
  const node=feedback.get(field);
  if(show && node){node.textContent=message;node.hidden=!message;field.setAttribute('aria-invalid',String(Boolean(message)));}
  return !message;
}

function focusFirst(form) {
  const first=[...form.elements].find(field=>field.willValidate && !field.validity.valid);
  if(first){first.focus({preventScroll:true});first.scrollIntoView({block:'center',behavior:'instant'});}
}

for(const form of forms) {
  for(const field of form.querySelectorAll('input')) {
    if(!field.id)field.id=`ux-${form.id}-${field.name}`;
    const error=document.createElement('small');error.id=`${field.id}-error`;error.className='field-error';error.hidden=true;
    const described=field.getAttribute('aria-describedby') || '';
    field.setAttribute('aria-describedby',[described,error.id].filter(Boolean).join(' '));
    field.closest('label')?.append(error);feedback.set(field,error);
    field.addEventListener('blur',()=>{if(field.value || field.getAttribute('aria-invalid')==='true')validate(field);});
    field.addEventListener('input',()=>{if(field.getAttribute('aria-invalid')==='true'){validate(field);if(!fieldMessage(field))status.textContent='';}});
  }
  form.addEventListener('invalid',event=>{
    event.preventDefault();validate(event.target);
    status.textContent=text('راجع الحقول المحددة قبل متابعة المراجعة.','Check the highlighted fields before continuing to review.');
    if(!focusQueued){focusQueued=true;queueMicrotask(()=>{focusQueued=false;focusFirst(form);});}
  },true);
  form.addEventListener('submit',event=>{
    const invalid=[...form.querySelectorAll('input')].filter(field=>!validate(field));
    if(invalid.length){event.preventDefault();event.stopImmediatePropagation();focusFirst(form);status.textContent=text('راجع الحقول المحددة قبل متابعة المراجعة.','Check the highlighted fields before continuing to review.');}
    else status.textContent='';
  },true);
  form.addEventListener('reset',()=>queueMicrotask(()=>{
    for(const field of form.querySelectorAll('input')){field.setCustomValidity('');field.removeAttribute('aria-invalid');const node=feedback.get(field);if(node){node.hidden=true;node.textContent='';}}
    status.textContent='';
  }));
}

const order=document.getElementById('orderForm');
const reasons={
  price:['السعر متاح مع أوامر Limit فقط.','Price is available for Limit orders only.'],
  positionIdx:['جهة المركز متاحة لعقود Linear وInverse.','Position side is available for Linear and Inverse contracts.'],
  takeProfit:['الحماية غير مدعومة مع إعدادات هذا الأمر.','Protection is not supported with these order settings.'],
  stopLoss:['الحماية غير مدعومة مع إعدادات هذا الأمر.','Protection is not supported with these order settings.']
};
for(const [name] of Object.entries(reasons)) {
  const field=order.elements[name],hint=document.createElement('small');
  hint.id=`${field.id}-help`;hint.className='field-help';field.closest('label').append(hint);
  field.setAttribute('aria-describedby',`${field.getAttribute('aria-describedby')} ${hint.id}`);
}
function renderHints() {
  for(const [name,translations] of Object.entries(reasons)) {
    const field=order.elements[name],hint=document.getElementById(`${field.id}-help`);
    hint.hidden=!field.disabled;hint.textContent=field.disabled?text(...translations):'';
    if(field.disabled)validate(field);
  }
}
order.addEventListener('change',renderHints);
new MutationObserver(renderHints).observe(order,{subtree:true,attributes:true,attributeFilter:['disabled']});
renderHints();

// Native dialog retains its focus trap; return focus to the review trigger on close.
const dialog=document.getElementById('confirmDialog');
let reviewTrigger;
document.addEventListener('submit',event=>{if(event.target.closest('#secureApp'))reviewTrigger=event.submitter || document.activeElement;},true);
dialog.addEventListener('close',()=>{
  requestAnimationFrame(()=>{
    if(reviewTrigger?.isConnected && !reviewTrigger.disabled && reviewTrigger.getClientRects().length)reviewTrigger.focus({preventScroll:true});
  });
});

// Horizontal tables expose keyboard scrolling only when their content overflows.
const tableRegions=[...document.querySelectorAll('.table-wrap')];
function tableAccess() {
  for(const region of tableRegions) {
    const overflow=region.scrollWidth>region.clientWidth+1;
    if(overflow){region.tabIndex=0;region.setAttribute('role','region');region.setAttribute('aria-label',text('جدول بيانات — مرر أفقيًا لعرض جميع الأعمدة.','Data table — scroll horizontally to view all columns.'));}
    else {region.removeAttribute('tabindex');region.removeAttribute('role');region.removeAttribute('aria-label');}
    region.classList.toggle('table-scrollable',overflow);
  }
}
const resizeObserver=new ResizeObserver(tableAccess);
tableRegions.forEach(region=>{resizeObserver.observe(region);new MutationObserver(tableAccess).observe(region,{childList:true,subtree:true});});
tableAccess();

// ARIA status describes refreshing without asserting that financial data is fresh.
const refresh=document.getElementById('refreshBtn');
const refreshObserver=new MutationObserver(()=>{
  document.getElementById('overviewRefresh').setAttribute('aria-busy',String(refresh.disabled && navigator.onLine));
});
refreshObserver.observe(refresh,{attributes:true,attributeFilter:['disabled']});

window.addEventListener('gtpreferenceschange',()=>{
  for(const [field] of feedback)if(field.getAttribute('aria-invalid')==='true')validate(field);
  if(status.textContent)status.textContent=text('راجع الحقول المحددة قبل متابعة المراجعة.','Check the highlighted fields before continuing to review.');
  renderHints();tableAccess();
});
