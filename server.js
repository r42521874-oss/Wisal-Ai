import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app=express();
const __dirname=path.dirname(fileURLToPath(import.meta.url));
app.use(express.json({limit:"1mb"}));
const ALLOWED_ORIGINS=(process.env.ALLOWED_ORIGINS||"https://wisal-ai.onrender.com,https://wisal-ai-api.onrender.com").split(",").map(x=>x.trim()).filter(Boolean);
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
 {id:"quranenc",name:"موسوعة القرآن الكريم",url:"https://quranenc.com/ar/home",api:"https://quranenc.com/ar/home/api/",tags:["قرآن","ترجمة"]},
 {id:"hadeethenc",name:"موسوعة الأحاديث النبوية",url:"https://hadeethenc.com/",api:"https://hadeethenc.com/api-docs",tags:["حديث","سنة"]},
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
  const timeout=setTimeout(()=>controller.abort(),6000);
  const r=await fetch(source.url,{headers:{"User-Agent":"WisalAI/1.0","Accept":"text/html,application/json,text/plain"},signal:controller.signal});
  clearTimeout(timeout);
  if(!r.ok) return null;
  const type=r.headers.get("content-type")||"";
  let raw=await r.text();
  if(!raw.trim()) return null;
  if(type.includes("html")) raw=stripHtml(raw);
  const excerpt=raw.replace(/\s+/g," ").trim().slice(0,5000);
  if(excerpt.length<40) return null;
  return {...source,excerpt};
 }catch{return null}
}
function safeJson(text){try{return JSON.parse(text.replace(/^```json\s*|```$/g,"").trim())}catch{return null}}
app.get("/api/sources",(req,res)=>res.json({sources:SOURCES}));
app.post("/api/analyze",async(req,res)=>{
 const {text,audience="جمهور عام",audienceDetails="",goal="تحليل الأسلوب واقتراح تحسين"}=req.body||{};
 if(!text?.trim()) return res.status(400).json({error:"أدخل النص أولًا.",code:"EMPTY_TEXT"});
 const words=text.trim().split(/\s+/).filter(Boolean).length;
 if(words>1500) return res.status(413).json({error:"النص يتجاوز الحد المسموح (1500 كلمة). قسّميه إلى أجزاء أقصر.",code:"TEXT_TOO_LONG",maxWords:1500,words});
 if(!process.env.GEMINI_API_KEY) return res.status(503).json({error:"Gemini غير مفعّل بعد. أضيفي GEMINI_API_KEY في Render."});
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
  const model=process.env.GEMINI_MODEL||"gemini-2.5-flash";
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:"application/json",temperature:.25}})});
  const data=await r.json();
  if(!r.ok) return res.status(502).json({error:"تعذر الاتصال بـ Gemini.",details:data?.error?.message||"API error"});
  const raw=data?.candidates?.[0]?.content?.parts?.[0]?.text||"";
  const result=safeJson(raw);
  if(!result) return res.status(502).json({error:"تعذر قراءة نتيجة التحليل."});
  const allowedIds=new Set(allowed.map(s=>s.id));
  const used=(Array.isArray(result.source_ids)?result.source_ids:[]).filter(id=>allowedIds.has(id)).map(id=>allowed.find(s=>s.id===id)).filter(Boolean).map(({excerpt,...s})=>s);
  res.json({...result,sources:used});
 }catch(e){console.error("Analyze error:",e);res.status(500).json({error:"حدث خطأ مؤقت أثناء التحليل.",details:e?.message||"Unknown server error"})}
});
app.get("/api/health",(req,res)=>res.json({ok:true,geminiConfigured:Boolean(process.env.GEMINI_API_KEY),model:process.env.GEMINI_MODEL||"gemini-2.5-flash",sources:SOURCES.length,allowedOrigins:ALLOWED_ORIGINS}));
app.use((req,res)=>res.sendFile(path.join(__dirname,"index.html")));
app.listen(process.env.PORT||3000,()=>console.log("Wisal AI running"));
