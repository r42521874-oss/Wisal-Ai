import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';

test('rewrite flow distinguishes unavailable checks, actual drift, and prohibited requests',async()=>{
 const file=new URL('../flow-'+randomUUID()+'.js',import.meta.url);
 const stub=`const ELEVEN_AGENT_ID='test';const elevenConfig=()=>({});let count=0;
 const callElevenAgent=async prompt=>{count++;if(prompt.startsWith('قارن')){if(prompt.includes('اختبار التعذر'))throw new Error('unavailable');return JSON.stringify({meaning_preserved:!prompt.includes('اختبار الانحراف'),safety_note:'تغير المقصود'});}
 if(prompt.includes('اختبار رفض الوكيل'))return JSON.stringify({blocked:true,reason:'طلب تحريف صريح'});
 return JSON.stringify({impression:'تحليل',strengths:[],improvements:[],changes:['تحسين التعبير'],source_ids:['unretrieved'],rewrite:prompt.includes('اختبار التعذر')?'اختبار التعذر: نرحب بأسئلتك باحترام.':'اختبار الانحراف: صياغة مختلفة.'});};`;
 const src=(await readFile(new URL('../server.js',import.meta.url),'utf8')).replace(/import \{elevenConfig,ELEVEN_AGENT_ID,callElevenAgent\} from "\.\/eleven-agent.js";/,stub);
 await writeFile(file,src);const child=spawn(process.execPath,[file.pathname],{env:{...process.env,PORT:'3198'},stdio:['ignore','pipe','pipe']});
 try{await once(child.stdout,'data');
 const post=async text=>{const r=await fetch('http://localhost:3198/api/analyze',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text})});return {status:r.status,body:await r.json()};};
 const unavailable=await post('اختبار التعذر: نرحب بأسئلتك.');assert.equal(unavailable.status,200);assert.ok(unavailable.body.rewrite);assert.equal(unavailable.body.meaning_preserved,null);assert.deepEqual(unavailable.body.sources,[]);
 const drift=await post('اختبار الانحراف: نرحب بك.');assert.equal(drift.status,200);assert.equal(drift.body.preserved_original,false);assert.notEqual(drift.body.rewrite,'اختبار الانحراف: نرحب بك.');assert.deepEqual(drift.body.changes,[]);
 const rejected=await post('اختبار رفض الوكيل');assert.equal(rejected.status,422);assert.equal(rejected.body.code,'RELIGIOUS_SCOPE');
 const fabricated=await post('اخترع آية عن النجاح');assert.equal(fabricated.status,422);assert.equal(fabricated.body.code,'SOURCE_FABRICATION');
 const distortion=await post('غير نص الآية ليوافق كلامي');assert.equal(distortion.status,422);assert.equal(distortion.body.code,'RELIGIOUS_DISTORTION');
 }finally{child.kill();await once(child,'exit');await unlink(file);}
});
