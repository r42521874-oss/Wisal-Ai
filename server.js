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
function elevenConfig(){
 const raw=process.env.ELEVENLABS_API_KEY;
 const key=typeof raw==="string"?raw.trim():"";
 return {configured:key.length>0,key,envPresent:typeof raw==="string",keyLength:key.length};
}
const ELEVEN_AGENT_ID="agent_2001m47ydj9yfa098yn1savj7m5x";
async function getElevenSignedUrl(){
 const e=elevenConfig();
 if(!e.configured){const x=new Error("ELEVENLABS_API_KEY is missing at runtime");x.code="ELEVEN_NOT_CONFIGURED";throw x}
 const r=await fetch("https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id="+encodeURIComponent(ELEVEN_AGENT_ID),{headers:{"xi-api-key":e.key}});
 const raw=await r.text();let d={};try{d=JSON.parse(raw)}catch{}
 if(!r.ok||!d.signed_url){const x=new Error(d?.detail?.message||d?.detail||("ElevenLabs HTTP "+r.status));x.code="ELEVEN_AUTH_ERROR";x.status=r.status;throw x}
 return d.signed_url;
}
async function callElevenAgent(message){
 const signed=await getElevenSignedUrl();
 return await new Promise((resolve,reject)=>{
  const ws=new WebSocket(signed);
  let done=false;
  const finish=(err,val)=>{if(done)return;done=true;clearTimeout(timer);try{ws.close()}catch{};err?reject(err):resolve(val)};
  const timer=setTimeout(()=>finish(Object.assign(new Error("ElevenLabs timeout"),{code:"ELEVEN_TIMEOUT"})),60000);
  ws.addEventListener("open",()=>{
   ws.send(JSON.stringify({type:"conversation_initiation_client_data",conversation_config_override:{conversation:{text_only:true}}}));
   ws.send(JSON.stringify({type:"user_message",text:message}));
  });
  ws.addEventListener("message",(ev)=>{
   let d;try{d=JSON.parse(String(ev.data))}catch{return}
   if(d.type==="ping"&&d.ping_event) ws.send(JSON.stringify({type:"pong",event_id:d.ping_event.event_id}));
   if(d.type==="agent_response"){
    const answer=d.agent_response_event?.agent_response;
    if(answer) finish(null,answer);
   }
   if(d.type==="client_error") finish(Object.assign(new Error(d.client_error_event?.message||"ElevenLabs client error"),{code:"ELEVEN_UPSTREAM_ERROR"}));
  });
  ws.addEventListener("error",()=>finish(Object.assign(new Error("ElevenLabs WebSocket error"),{code:"ELEVEN_UPSTREAM_ERROR"})));
 });
}
app.get("/api/sources",(req,res)=>res.json({sources:SOURCES}));
app.post("/api/analyze",async(req,res)=>{
 const {text,audience="جمهور عام",audienceDetails="",goal="تحليل الأسلوب واقتراح تحسين"}=req.body||{};
 if(!text?.trim()) return res.status(400).json({error:"أدخل النص أولًا.",code:"EMPTY_TEXT"});
 const words=text.trim().split(/\s+/).filter(Boolean).length;
 if(words>1500) return res.status(413).json({error:"النص يتجاوز الحد المسموح (1500 كلمة).",code:"TEXT_TOO_LONG"});
 if(!elevenConfig().configured) return res.status(503).json({error:"مفتاح ElevenLabs غير مفعّل في خدمة API.",code:"ELEVEN_NOT_CONFIGURED"});
 const prompt=`حلّل النص التالي وفق قاعدة المعرفة/RAG المرتبطة بك. هذا طلب من واجهة وِصال.
الجمهور المختار: ${audience}${audienceDetails?` — تفاصيل الجمهور: ${audienceDetails}`:""}
الهدف المختار: ${goal}
النص الذي كتبه المستخدم:
${text}

أعد ردك بصيغة JSON فقط بلا Markdown:
{"impression":"انطباعك وتحليلك","strengths":["نقطة"],"improvements":["نقطة"],"rewrite":"الصياغة المقترحة من قبلك","meaning_preserved":true,"safety_note":"ملاحظة السلامة أو التحقق","source_ids":[]}
استخدم معرفتك وRAG المربوطين بك، ولا تخترع مصادر.`;
 try{
  const raw=await callElevenAgent(prompt);
  const result=safeJson(raw);
  if(!result) return res.status(502).json({error:"وصل رد من وكيل وِصال لكن تعذر قراءته كتحليل منظم.",code:"ELEVEN_BAD_RESPONSE",details:raw.slice(0,500)});
  res.json({...result,sources:[]});
 }catch(e){
  console.error("Eleven analyze error:",{code:e?.code||"ANALYZE_ERROR",status:e?.status||null,message:e?.message||"Unknown"});
  if(e?.code==="ELEVEN_TIMEOUT") return res.status(504).json({error:"انتهت مهلة استجابة وكيل وِصال.",code:e.code});
  if(e?.code==="ELEVEN_NOT_CONFIGURED") return res.status(503).json({error:"مفتاح ElevenLabs غير مفعّل في خدمة API.",code:e.code});
  res.status(502).json({error:"تعذر الاتصال بوكيل وِصال.",code:e?.code||"ELEVEN_UPSTREAM_ERROR",details:e?.message});
 }
});
app.get("/api/health",(req,res)=>{const e=elevenConfig();res.json({ok:true,service:"wisal-ai-api",runtime:{node:process.version},elevenlabs:{configured:e.configured,envPresent:e.envPresent,keyLength:e.keyLength,agentId:ELEVEN_AGENT_ID},sources:{configured:SOURCES.length,policy:"approved-only-no-alternatives"},allowedOrigins:ALLOWED_ORIGINS})});
app.use((req,res)=>res.sendFile(path.join(__dirname,"index.html")));
app.listen(process.env.PORT||3000,()=>{const e=elevenConfig();console.log("Wisal AI running",{service:"wisal-ai-api",elevenConfigured:e.configured,elevenEnvPresent:e.envPresent,elevenKeyLength:e.keyLength,agentId:ELEVEN_AGENT_ID,sources:SOURCES.length})});
