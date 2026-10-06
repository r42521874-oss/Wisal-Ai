import {readFileSync} from 'node:fs';
export const PASSAGES=JSON.parse(readFileSync(new URL('./knowledge-base/passages.json',import.meta.url),'utf8'));
export const normalize=s=>String(s||'').normalize('NFKC').replace(/[\u064B-\u065F\u0670\u06D6-\u06EDـ]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').toLowerCase();
export function validateInput(body){
 const {text,audience='جمهور عام',audienceDetails='',goal='تحليل الأسلوب واقتراح تحسين'}=body||{};
 if(typeof text!=='string'||!text.trim())return {error:'أدخل النص أولًا.',code:'EMPTY_TEXT',status:400};
 if(text.length>16000||text.trim().split(/\s+/).length>1500)return {error:'الحد المسموح 1500 كلمة و16000 حرف.',code:'TEXT_TOO_LONG',status:413};
 if([audience,audienceDetails,goal].some(x=>typeof x!=='string')||audienceDetails.length>1200)return {error:'بيانات الجمهور والهدف غير صالحة.',code:'INVALID_INPUT',status:400};
 if(!['جمهور عام','جمهور عقلاني','جمهور روحي'].includes(audience)||!['تحليل الأسلوب فقط','اقتراح تحسين','تحليل الأسلوب واقتراح تحسين'].includes(goal))return {error:'اختر جمهورًا وهدفًا من الخيارات المتاحة.',code:'INVALID_INPUT',status:400};
 return {text:text.trim(),audience,audienceDetails,goal};
}
export function isAntiIslamPromotion(text){
 const n=normalize(text);
 // السماح بنقل الشبهة أو مناقشتها أو رفضها، وعدم الخلط بينها وبين الترويج لها.
 if(/(?:رد على|الرد على|ناقش|فند|صحح|اشرح خطا|حذر من|تحذير من|لا تقل|لا تقول|هل قول|هل عباره|شبهه|اقتباس|يقول|قال).{0,90}(?:كن|اصبح|اترك|الالحاد|الكفر|ترك الاسلام)/.test(n))return false;
 if(/(?:لا|لات)\s+(?:تكن|تكون|تصبح)\s+(?:ملحدا?|كافرا?)/.test(n))return false;
 const promotion=[
  /(?:^|[\s،,:؛.!؟])(?:انت\s+)?(?:كن|كون|اصبح|صير)\s+(?:ملحدا?|كافرا?)(?=\s|$|[،,:؛.!؟])/,
  /(?:اترك|دعك من|تخل عن|تخلي عن|ابتعد عن|تحرر من)\s+(?:الاسلام|الايمان|الدين الاسلامي|عقيدتك الاسلاميه|عقيدتك الاسلامية)/,
  /(?:اكفر|لا تؤمن)\s+(?:بالله|بالاسلام|بالقران|بالرسول|بالنبي)/,
  /(?:اعتنق|اختر|اتبع)\s+(?:الالحاد|الكفر)/,
  /(?:شجع|ادع|حث).{0,25}(?:على|الي)\s+(?:الالحاد|الكفر|ترك الاسلام|ترك الايمان)/,
  /(?:تحرر|متحرر).{0,24}(?:من|عن).{0,18}(?:قيود\s+)?(?:الايمان|الاسلام|الدين)/
 ];
 return promotion.some(r=>r.test(n));
}
export function preflight(text){
 const n=normalize(text);
 if(isAntiIslamPromotion(text))return {blocked:true,code:'NON_ISLAMIC_PROMOTION',message:'هذا المحتوى خارج نطاق وِصال: لا يمكن تحسين نص يشجّع على ترك الإسلام أو الإلحاد أو الكفر. يمكن استخدام وِصال لتحسين نص يدعو إلى الإسلام أو ترك الكفر، أو لمناقشة شبهة دون الترويج لها.',level:4};
 const rules=[
 ['PERSONAL_FATWA',/افتني|فتوي|هل يجوز|حكم (طلاق|زواج|ميراث|معامل|بيع|شراء|صيام|صلاه)|زوجتي طالق|تكفير/,'السؤال يتطلب حكمًا أو فتوى. راجع جهة إفتاء معتمدة؛ وِصال يحسّن أسلوب التواصل فقط.'],
 ['RELIGIOUS_DISTORTION',/(حرف|حرّف|غير|بدل).{0,25}(نص الاي[ةه]|كلمات الاي[ةه]|كلام الله)|اجعل.{0,20}الحرام.{0,15}حلال/,'لا يمكن تحريف نص ديني أو تبرير تغيير حكمه. أرسل نصًا للتعبير عن معناه بأمانة.'],
 ['SOURCE_FABRICATION',/(اخترع|اختلق|لفق|ابتكر|مزيف).{0,35}(اي[ةه]|حديث|مصدر|مرجع)|(اي[ةه]|حديث|مصدر|مرجع).{0,25}(اخترع|اختلق|مزيف)/,'لا يمكن اختلاق آية أو حديث أو مرجع. أضف نصًا موثقًا للتحليل الأسلوبي.'],
 ['PROMPT_INJECTION',/تجاهل.{0,25}(تعليمات|قواعد|قيود)|اكشف.{0,20}(مفتاح|تعليمات|سر)|ignore.{0,25}(instructions|rules)|system prompt/,'يتضمن النص تعليمات لتجاوز ضوابط الأداة. أرسل الرسالة المراد تحسين أسلوبها فقط.'],
 ['PERSONAL_DATA',/[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?966|05)\d{8,9}\b|\b[12]\d{9}\b/,'أزل بيانات الاتصال أو الهوية الشخصية قبل إرسال النص.'],
 ['HIGH_RISK_CONTENT',/اقتل|قتلهم|ابادت|تفجير|استهدف.{0,20}(دين|مسلم|يهود|مسيح)|اهن.{0,15}(دين|مسلم|يهود|مسيح)/,'لا يمكن تحسين خطاب يحرض على العنف أو استهداف الناس. أعد صياغة مقصدك بطريقة تحترم الآخرين.']
 ];
 const hit=rules.find(r=>r[1].test(n));
 if(hit)return {blocked:true,code:hit[0],message:hit[2],level:4};
 if(/قال الله|قال (رسول|النبي)|حديث|اي[ةه]|حلال|حرام|واجب|فرض|عقيده|توحيد/.test(n))return {blocked:false,code:'RELIGIOUS_REVIEW',message:'يحتوي النص على مضمون ديني يحتاج مراجعة بشرية؛ الاقتباسات محفوظة ولا تُعتمد الصياغة تلقائيًا.',level:3};
 return {blocked:false,code:'STYLE_SCOPE',message:'تحسين أسلوب التواصل ضمن نطاق الأداة.',level:/اسلام|الله|دين|دعوه/.test(n)?2:1};
}
export function retrievePassages(text,audience){
 const n=normalize(text);
 return PASSAGES.map(p=>({p,score:p.keywords.reduce((a,k)=>a+(n.includes(normalize(k))?1:0),0)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,2).map(x=>x.p);
}
export function parseJSON(text){try{return JSON.parse(String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim())}catch{return null}}
export function schemaValid(r){return !!r&&typeof r.impression==='string'&&r.impression.length>0&&typeof r.rewrite==='string'&&['strengths','improvements','changes','source_ids'].every(k=>Array.isArray(r[k])&&r[k].length<=15&&r[k].every(x=>typeof x==='string'&&x.length<=2000))&&r.impression.length<=6000&&r.rewrite.length<=20000;}
export function outputChecks(text,result,passages){
 const issues=[];const out=result.rewrite||'';const input=normalize(text),n=normalize(out);
 for(const q of (out?text:'').match(/[«“"]([^»”"]{5,})[»”"]/g)||[])if(!out.includes(q))issues.push('PROTECTED_QUOTE_CHANGED');
 for(const v of (out?text:'').match(/[0-9٠-٩]+/g)||[])if(!out.includes(v))issues.push('NUMBER_CHANGED');
 if(/قال الله|قال رسول|قال النبي|حلال|حرام|واجب|فرض/.test(n)&&!(/قال الله|قال رسول|قال النبي|حلال|حرام|واجب|فرض/.test(input)))issues.push('NEW_RELIGIOUS_CLAIM');
 if(out&&/يجب|واجب|فرض|يتعين|يلزم/.test(input)&&!(/يجب|واجب|فرض|يتعين|يلزم|عليه ان/.test(n)))issues.push('OBLIGATION_CHANGED');
 if(out&&isAntiIslamPromotion(out)){issues.push('NON_ISLAMIC_PROMOTION');issues.push('NEW_RELIGIOUS_CLAIM');}
 const allowed=new Set(passages.map(p=>p.id));
 if(result.source_ids.some(id=>!allowed.has(id)))issues.push('UNSUPPORTED_SOURCE');
 return [...new Set(issues)];
}
export function refusal(policy){return {status:'referral',impression:policy.message,strengths:[],improvements:[],changes:[],rewrite:'',meaning_preserved:null,safety_note:policy.message,sources:[],retrieved_sources:[],source_ids:[],verification:{status:'referral',semantic:'not_run',human_review_required:true,content_level:policy.level,checks:[{id:policy.code,status:'blocked',label:policy.message}],limits:'هذه سياسة نطاق وليست فتوى أو حكمًا على صحة النص.'}}}
