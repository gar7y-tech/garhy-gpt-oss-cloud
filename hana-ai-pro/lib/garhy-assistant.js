import {KNOWLEDGE,approvedUrl,KNOWLEDGE_VERSION} from './garhy-knowledge.js';

export function normalizeQuestion(text){return text.normalize('NFKC').replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2069]/g,'').replace(/[\u064B-\u065F\u0670]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').toLowerCase();}
export function languageOf(text){return /[\u0600-\u06FF]/.test(text)?'ar':'en';}
export function redirectReply(lang){return lang==='ar'?'أنا مساعد GARHY TECH، ويمكنني مساعدتك في خدمات الشركة ومنتجاتها ومشاريعها ومعلوماتها التقنية.':'I am the GARHY TECH assistant. I can help with the company’s services, products, public projects and technical information.';}
const injection=/(ignore[\s\W_]*(?:all[\s\W_]*)?(previous|prior|above)|reveal.{0,40}(prompt|instruction|secret|credential)|system[\s_-]*prompt|you are now|override.{0,30}(scope|policy|instruction)|jailbreak|تجاهل.{0,35}(تعليمات|قواعد|سابق)|اكشف.{0,40}(تعليمات|برومبت|مفاتيح|اسرار)|غير.{0,20}(نطاقك|قواعدك)|مساعد.{0,12}عام)/i;
const outside=/(كرة|لاعب|صداع|علاج|دواء|تشخيص|football|soccer|headache|medicine|diagnos|prescrib|who won|أفضل لاعب|افضل لاعب|اكتب.{0,25}(برنامج|كود)|write.{0,30}(python|code|program)|investment advice|اشتر.{0,20}(سهم|عملة)|توصيه.{0,15}تداول)/i;
const intents=/(خدمات|خدمه|منتج|مشاريع|تطبيقات|تواصل|اتواصل|هاتف|بريد|مؤسس|موجود|هو|هي|نبذه|نبذة|تقنيات|قدرات|دخول|مصادقه|استخدام|رابط|موقع|services|products?|projects?|exist|contact|founder|about|capabilities|website|login|how|what|who|support|identity|api)/i;
const company=/(garhy|gar7y|جارحي|الجارحي|hana|و[ِ]?رد اميره|ورد اميرة|وِرد أميرة|wird amira|gt crypto|control center|الشركه|الشركة|خدماتكم|منتجاتكم|مشاريعكم)/i;
export function classifyScope(text){
  const q=normalizeQuestion(text);
  if(injection.test(q))return 'BLOCKED';
  if(outside.test(q))return 'OUT_OF_SCOPE';
  return company.test(q)&&intents.test(q)?'GARHY_TECH':'OUT_OF_SCOPE';
}
export function retrieve(text){
  const q=normalizeQuestion(text);
  const scores=KNOWLEDGE.map(doc=>({doc,score:doc.keywords.reduce((n,word)=>n+(q.includes(normalizeQuestion(word))?1:0),0)}));
  const found=scores.filter(({doc,score})=>score>0&&doc.id!=='company').sort((a,b)=>b.score-a.score).slice(0,3).map(x=>x.doc);
  if(!found.length&&/^(?:ما هي|ما هو|من هي|من هو|نبذه عن|what is|who is|tell me about)\s+(?:شركه\s+)?(?:garhy tech|جارحي تك|الجارحي)\s*[؟?.!]*$/i.test(q))return KNOWLEDGE.filter(d=>d.id==='company');
  return found;
}
export function validateSelection(content,documents){
  let data;try{data=JSON.parse(content)}catch{return null}
  if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).length!==1||!Array.isArray(data.ids)||data.ids.length<1||data.ids.length>3||new Set(data.ids).size!==data.ids.length)return null;
  const allowed=new Map(documents.map(d=>[d.id,d]));
  if(!data.ids.every(id=>typeof id==='string'&&allowed.has(id)))return null;
  return data.ids.map(id=>allowed.get(id));
}
export function renderAnswer(documents,lang){
  if(!documents.every(doc=>approvedUrl(doc.source)))throw Error('unapproved_knowledge_source');
  return {reply:documents.map(doc=>doc[lang]).join('\n\n'),sources:[...new Set(documents.map(doc=>doc.source))],knowledgeVersion:KNOWLEDGE_VERSION,scope:'GARHY_TECH'};
}
