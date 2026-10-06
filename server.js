import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app=express();
app.disable("x-powered-by");
const __dirname=path.dirname(fileURLToPath(import.meta.url));
app.use(express.json({limit:"1mb"}));
const ALLOWED_ORIGINS=(process.env.ALLOWED_ORIGINS||"https://wisal-ai.onrender.com,https://wisal-ai-v8n2.onrender.com,https://wisal-ai-api.onrender.com").split(",").map(x=>x.trim()).filter(Boolean);
app.use((req,res,next)=>{
 const origin=req.headers.origin;
 if(origin&&ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin",origin);
 res.setHeader("Vary","Origin");
 res.setHeader("Access-Control-Allow-Headers","Content-Type");
 res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");
 if(req.method==="OPTIONS") return res.sendStatus(204);
 next();
});
app.use(express.static(__dirname));

const SOURCES=[
 {id:"quranenc",name:"موسوعة القرآن الكريم",url:"https://quranenc.com/en/home/api",api:"https://quranenc.com/en/home/api",tags:["قرآن","ترجمة"]},
 {id:"hadeethenc",name:"موسوعة الأحاديث النبوية",url:"https://hadeethenc.com/",api:"https://hadeethenc.com/",tags:["حديث","سنة"]},
 {id:"islamenc",name:"موسوعة المحتوى الإسلامي باللغات",url:"https://islamenc.com/ar",tags:["محتوى إسلامي","لغات"]},
 {id:"terminologyenc",name:"موسوعة المصطلحات الإسلامية",url:"https://terminologyenc.com/",tags:["مصطلحات"]},
 {id:"byenah",name:"بيان الإسلام",url:"https://byenah.com/ar/api",tags:["تعريف بالإسلام","لغات"]},
 {id:"dorar",name:"الدرر السنية",url:"https://dorar.net/article/389",tags:["حديث","علوم شرعية"]},
 {id:"qurancomplex",name:"مجمع الملك فهد لطباعة المصحف الشريف",url:"https://qurancomplex.gov.sa/quran-dev/",tags:["قرآن","نص المصحف"]},
 {id:"wahy",name:"مركز تفسير للدراسات القرآنية",url:"https://wahy.net/",tags:["تفسير","دراسات قرآنية"]},
 {id:"shamela",name:"المكتبة الشاملة",url:"https://shamela.ws/page/download",tags:["كتب","مراجع"]}
];

const keywords={
 quranenc:["قرآن","آية","سورة","توحيد","الله","خالق"],
 hadeethenc:["حديث","سنة","النبي","رسول"],
 islamenc:["إسلام","مسلم","دعوة","تعريف","عقيدة"],
 terminologyenc:["مصطلح","توحيد","عبادة","إيمان","عقيدة","شريعة"],
 byenah:["غير مسلم","الإسلام","دعوة","تعريف","رسالة"],
 dorar:["حديث","صحيح","ضعيف","سنة","رواية"],
 qurancomplex:["قرآن","آية","سورة","مصحف"],
 wahy:["تفسير","آية","سورة","قرآن","معنى"],
 shamela:["كتاب","مرجع","فقه","سيرة","تفسير","عقيدة"]
};
function retrieve(text){
 const t=text.toLowerCase();
 return SOURCES.map(s=>({s,score:(keywords[s.id]||[]).reduce((n,k)=>n+(t.includes(k.toLowerCase())?1:0),0)}))
 .filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,5).map(x=>x.s);
}
function stripHtml(raw){return raw.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;/g," ").replace(/&amp;/g,"&").replace(/\s+/g," ").trim()}
async function fetchSourceContext(source){
 try{
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),8000);
  const r=await fetch(source.url,{headers:{"User-Agent":"WisalAI/1.0","Accept":"text/html,application/json,text/plain"},signal:controller.signal,redirect:"follow"});
  clearTimeout(timeout);
  if(!r.ok) return null;
  const type=r.headers.get("content-type")||"";
  let raw=await r.text();
  if(!raw.trim()) return null;
  if(type.includes("html")) raw=stripHtml(raw);
  const excerpt=raw.replace(/\s+/g," ").trim().slice(0,5000);
  if(excerpt.length<40) return null;
  return {...source,excerpt};
 }catch(e){console.warn("Source unavailable:",source.id,e?.name||e?.message||"unknown");return null}
}
function safeJson(text){try{return JSON.parse(String(text||"").replace(/^\`\`\`json\s*|\`\`\`$/g,"").trim())}catch{return null}}
function geminiConfig(){
 const raw=process.env.GEMINI_API_KEY;
 const key=typeof raw==="string"?raw.trim():"";
 const model=(process.env.GEMINI_MODEL||"gemini-2.5-flash").trim();
 return {configured:key.length>0,key,keyLength:key.length,model,envPresent:typeof raw==="string",envNonEmpty:key.length>0};
}
async function callGemini(prompt){
 const {configured,model,key}=geminiConfig();
 if(!configured){const e=new Error("GEMINI_API_KEY is missing at runtime");e.code="GEMINI_NOT_CONFIGURED";throw e}
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),45000);
 try{
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:"application/json",temperature:.25}}),signal:controller.signal});
  const raw=await r.text(); let data={}; try{data=JSON.parse(raw)}catch{}
  if(!r.ok){const e=new Error(data?.error?.message||`Gemini HTTP ${r.status}`);e.code="GEMINI_UPSTREAM_ERROR";e.status=r.status;throw e}
  return data;
 }finally{clearTimeout(timeout)}
}
app.get("/api/sources",(req,res)=>res.json({sources:SOURCES}));
app.post("/api/analyze",async(req,res)=>{
 const {text,audience="جمهور عام",audienceDetails="",goal="تحليل الأسلوب واقتراح تحسين"}=req.body||{};
 if(!text?.trim()) return res.status(400).json({error:"أدخل النص أولًا.",code:"EMPTY_TEXT"});
 const words=text.trim().split(/\s+/).filter(Boolean).length;
 if(words>1500) return res.status(413).json({error:"النص يتجاوز الحد المسموح (1500 كلمة). قسّميه إلى أجزاء أقصر.",code:"TEXT_TOO_LONG",maxWords:1500,words});
 if(!geminiConfig().configured) return res.status(503).json({error:"Gemini غير مفعّل في خدمة API وقت التشغيل.",code:"GEMINI_NOT_CONFIGURED"});
 const candidates=retrieve(text).slice(0,3);
 const fetched=(await Promise.all(candidates.map(fetchSourceContext))).filter(Boolean);
 const allowed=fetched;
 const prompt=`أنت وِصال AI. مهمتك تحسين أسلوب إيصال المحتوى الإسلامي فقط مع الحفاظ على المعنى، ولا تصدر فتوى.
الجمهور: ${audience}${audienceDetails?` — تفاصيل إضافية: ${audienceDetails}`:""}
الهدف: ${goal}
النص:
${text}

المصادر الوحيدة المسموح لك بالإشارة إليها هي القائمة التالية، ولا يجوز اختلاق مصدر أو رابط أو نسبة معلومة لمصدر لم تتحقق منه:
${allowed.map(s=>"- ID: "+s.id+" | "+s.name+" | "+s.url+"\nمقتطف متحقق من المصدر:\n"+s.excerpt).join("\n\n")}

أعد JSON صالحًا فقط بالشكل:
{"impression":"...","strengths":["..."],"improvements":["..."],"rewrite":"...","meaning_preserved":true,"safety_note":"...","source_ids":["id"]}
source_ids يجب أن تكون فقط من المصادر المسترجعة التالية: ${allowed.map(s=>s.id).join(", ")||"لا يوجد"}.
إذا لم تحتج إلى مصدر أو لم تستطع التحقق، اجعل source_ids فارغة واذكر ذلك في safety_note.`;
 try{
  const data=await callGemini(prompt);
  const raw=data?.candidates?.[0]?.content?.parts?.[0]?.text||"";
  const result=safeJson(raw);
  if(!result) return res.status(502).json({error:"تعذر قراءة نتيجة التحليل."});
  const allowedIds=new Set(allowed.map(s=>s.id));
  const used=(Array.isArray(result.source_ids)?result.source_ids:[]).filter(id=>allowedIds.has(id)).map(id=>allowed.find(s=>s.id===id)).filter(Boolean).map(({excerpt,...s})=>s);
  res.json({...result,sources:used});
 }catch(e){
  console.error("Analyze error:",{code:e?.code||"ANALYZE_ERROR",status:e?.status||null,message:e?.message||"Unknown"});
  if(e?.code==="GEMINI_NOT_CONFIGURED") return res.status(503).json({error:"Gemini غير مفعّل في خدمة API وقت التشغيل.",code:e.code});
  if(e?.name==="AbortError") return res.status(504).json({error:"انتهت مهلة الاتصال بـ Gemini.",code:"GEMINI_TIMEOUT"});
  if(e?.code==="GEMINI_UPSTREAM_ERROR") return res.status(502).json({error:"رفض Gemini طلب التحليل.",code:e.code,details:e.message});
  res.status(500).json({error:"حدث خطأ مؤقت أثناء التحليل.",code:"ANALYZE_ERROR"});
 }
});
app.get("/api/health",(req,res)=>{const g=geminiConfig();res.json({ok:true,service:"wisal-ai-api",runtime:{node:process.version},gemini:{configured:g.configured,envPresent:g.envPresent,envNonEmpty:g.envNonEmpty,keyLength:g.keyLength,model:g.model},sources:{configured:SOURCES.length,policy:"approved-only-no-alternatives"},allowedOrigins:ALLOWED_ORIGINS})});
app.use((req,res)=>res.sendFile(path.join(__dirname,"index.html")));
app.listen(process.env.PORT||3000,()=>{const g=geminiConfig();console.log("Wisal AI running",{service:"wisal-ai-api",geminiConfigured:g.configured,geminiEnvPresent:g.envPresent,geminiKeyLength:g.keyLength,geminiModel:g.model,sources:SOURCES.length})});
