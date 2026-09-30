import {createChatHandler} from '../lib/chat-handler.js';
import {buildWirdAmiraSystemMessage,OUT_OF_SCOPE_REPLY,validateWirdAmiraInput} from '../lib/wird-amira.js';

export default createChatHandler({
  namespace:'wird-amira',maxRequests:12,maxBytes:16384,
  origins:['https://wirdamira.garhy.tech','https://tasbih.garhy.tech','https://garhy.tech'],
  validate(body){
    const parsed=validateWirdAmiraInput(body);
    if(parsed.ok) parsed.value={...parsed.value,model:'openai/gpt-oss-20b',reasoning:'low',messages:parsed.value.messages.slice(-10)};
    return parsed;
  },
  systemMessage:buildWirdAmiraSystemMessage,normalize:reply=>reply,
  earlyReply(value){
    if(value.domain==='OUT_OF_SCOPE') return {reply:OUT_OF_SCOPE_REPLY,scope:'out_of_scope'};
    if(value.domain==='UNSAFE') return {reply:'لا أستطيع المساعدة في تعليمات قد تسبب أذى. يمكنني مناقشة التوجيهات الإسلامية العامة التي تحث على حفظ النفس وحرمة الاعتداء.',scope:'unsafe'};
    return null;
  },
  responseMetadata:value=>({name:'مساعد وِرد أميرة الإسلامي',poweredBy:'HANA AI',scope:value.domain}),
});
