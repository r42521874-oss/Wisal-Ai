export function elevenConfig(){
 const raw=process.env.ELEVENLABS_API_KEY;
 const key=typeof raw==="string"?raw.trim():"";
 return {configured:key.length>0,key,envPresent:typeof raw==="string",keyLength:key.length};
}
export const ELEVEN_AGENT_ID=process.env.ELEVENLABS_AGENT_ID||"agent_2001m47ydj9yfa098yn1savj7m5x";
async function getElevenSignedUrl(){
 const e=elevenConfig();
 if(!e.configured) return "wss://api.elevenlabs.io/v1/convai/conversation?agent_id="+encodeURIComponent(ELEVEN_AGENT_ID);
 const r=await fetch("https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id="+encodeURIComponent(ELEVEN_AGENT_ID),{headers:{"xi-api-key":e.key},signal:AbortSignal.timeout(10000)});
 const raw=await r.text();let d={};try{d=JSON.parse(raw)}catch{}
 if(!r.ok||!d.signed_url){const x=new Error(d?.detail?.message||d?.detail||("ElevenLabs HTTP "+r.status));x.code="ELEVEN_AUTH_ERROR";x.status=r.status;throw x}
 return d.signed_url;
}
export async function callElevenAgent(message){
 const signed=await getElevenSignedUrl();
 return await new Promise((resolve,reject)=>{
  const ws=new WebSocket(signed);
  let done=false,sent=false,readyTimer;
  const finish=(err,val)=>{if(done)return;done=true;clearTimeout(timer);clearTimeout(readyTimer);try{ws.close()}catch{};err?reject(err):resolve(val)};
  const sendRequest=()=>{if(sent||done)return;sent=true;ws.send(JSON.stringify({type:"user_message",text:message}))};
  const timer=setTimeout(()=>finish(Object.assign(new Error("ElevenLabs timeout"),{code:"ELEVEN_TIMEOUT"})),90000);
  ws.addEventListener("open",()=>{
   ws.send(JSON.stringify({type:"conversation_initiation_client_data",conversation_config_override:{conversation:{text_only:true}}}));
  });
  ws.addEventListener("message",(ev)=>{
   let d;try{d=JSON.parse(String(ev.data))}catch{return}
   if(d.type==="conversation_initiation_metadata")readyTimer=setTimeout(sendRequest,1800);
   if(d.type==="ping"&&d.ping_event) ws.send(JSON.stringify({type:"pong",event_id:d.ping_event.event_id}));
   // The first agent response is the configured greeting, not an analysis.
   if(d.type==="agent_response"){
    const answer=d.agent_response_event?.agent_response;
    if(!sent){clearTimeout(readyTimer);sendRequest();return}
    if(d.agent_response_event?.in_response_to_ids?.length===0)return;
    if(typeof answer==="string"&&answer.trim()) finish(null,answer);
   }
   if(d.type==="client_error") finish(Object.assign(new Error(d.client_error_event?.message||"ElevenLabs client error"),{code:"ELEVEN_UPSTREAM_ERROR"}));
  });
  ws.addEventListener("error",()=>finish(Object.assign(new Error("ElevenLabs WebSocket error"),{code:"ELEVEN_UPSTREAM_ERROR"})));
  ws.addEventListener("close",(ev)=>{
   if(!done){
    console.error("ElevenLabs connection closed", {closeCode:ev.code,reason:String(ev.reason||"").replace(/(?:sk_|xi-)[A-Za-z0-9_-]+/g,"[redacted]").slice(0,300),requestSent:sent});
    finish(Object.assign(new Error("ElevenLabs closed the connection ("+ev.code+"). "+(ev.reason||"")),{code:"ELEVEN_CONNECTION_CLOSED"}));
   }
  });
 });
}
