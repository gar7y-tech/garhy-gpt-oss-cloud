import {validateChatInput, PROFESSIONAL_MODES} from './validation.js';
import {normalizeIdentityReply} from './identity.js';
import {acquireBudget, aiHeaders, originAllowed, validRequest} from './ai-guard.js';

export function createChatHandler({env=process.env, fetchImpl=fetch, acquire=acquireBudget, validate=validateChatInput, systemMessage, normalize=normalizeIdentityReply, namespace='hana', maxRequests=15, maxBytes=32768, origins, earlyReply, responseMetadata} = {}) {
  return async function handler(req,res) {
    const allowed=originAllowed(req,env,origins);
    aiHeaders(res,allowed ? req.headers.origin : null);
    if (!allowed) return res.status(403).json({error:'Origin not allowed.'});
    if (req.method==='OPTIONS') return res.status(204).end();
    if (req.method!=='POST') {res.setHeader('Allow','POST, OPTIONS');return res.status(405).json({error:'Method not allowed.'});}
    const invalid=validRequest(req,maxBytes);
    if (invalid) return res.status(invalid.status).json({error:invalid.error});
    const parsed=validate(req.body);
    if (!parsed.ok) return res.status(400).json({error:parsed.error});
    let lease;
    try {
      lease=await acquire(req,{env,fetchImpl,namespace,maxRequests});
      const direct=earlyReply?.(parsed.value);
      if (direct) return res.status(200).json(direct);
      if (!env.GROQ_API_KEY) return res.status(503).json({error:'Assistant temporarily unavailable.'});
      const {model,reasoning,messages,mode}=parsed.value;
      const authority=systemMessage(model);
      const serverMessage=mode ? {...authority,content:`${authority.content} ${PROFESSIONAL_MODES[mode]}`} : authority;
      const response=await fetchImpl('https://api.groq.com/openai/v1/chat/completions',{
        method:'POST',headers:{Authorization:`Bearer ${env.GROQ_API_KEY}`,'Content-Type':'application/json'},
        body:JSON.stringify({model,messages:[serverMessage,...messages],reasoning_effort:reasoning,include_reasoning:false,temperature:namespace==='wird-amira'?.25:.6,top_p:.9,max_completion_tokens:namespace==='wird-amira'?700:1024,stream:false}),
        redirect:'error',signal:AbortSignal.timeout(25000),
      });
      const payload=await response.json().catch(()=>null);
      if (!response.ok) return res.status(response.status===429?429:502).json({error:'Assistant provider temporarily unavailable.'});
      const text=payload?.choices?.[0]?.message?.content;
      if (typeof text!=='string'||!text.trim()||text.length>12000) return res.status(502).json({error:'Assistant returned an invalid response.'});
      const usage=Object.fromEntries(['prompt_tokens','completion_tokens','total_tokens'].filter(k=>Number.isSafeInteger(payload.usage?.[k])&&payload.usage[k]>=0).map(k=>[k,payload.usage[k]]));
      return res.status(200).json({reply:normalize(text.trim()),name:'Hana',genderStyle:'feminine',model,provider:'groq',usage,...responseMetadata?.(parsed.value)});
    } catch(error) {
      if (error?.retryAfter) res.setHeader('Retry-After',String(error.retryAfter));
      return res.status(error?.status===429?429:error?.status===503?503:502).json({error:error?.status===429?'Request limit reached. Try again later.':'Assistant temporarily unavailable.'});
    } finally {await lease?.release();}
  };
}
