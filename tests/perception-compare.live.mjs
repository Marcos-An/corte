// Opt-in comparison: same sampled images/task for local Qwen and the existing Corte ChatGPT login.
// node tests/perception-compare.live.mjs --provider=gpt|qwen --profile=compact|detailed --cases=... --out=...
import fs from 'node:fs/promises';import path from 'node:path';import {spawn,execFile} from 'node:child_process';import {promisify} from 'node:util';import {createHash} from 'node:crypto';
import {codexArgs,codexEnv,codexExecutable,loginStatus} from '../desktop/ai.mjs';
const arg=k=>process.argv.find(a=>a.startsWith(`--${k}=`))?.slice(k.length+3),provider=arg('provider'),profileName=arg('profile');
if(!['gpt','qwen'].includes(provider)||!['compact','detailed'].includes(profileName)||!arg('cases')||!arg('out'))throw Error('Explicit provider, profile, cases and output directory are required.');
const casesFile=path.resolve(arg('cases')),root=path.dirname(casesFile),out=path.resolve(arg('out'));
await fs.mkdir(out,{recursive:true});
const profile=JSON.parse(await fs.readFile(path.join(root,`${profileName}-profile.json`),'utf8'));
const only=arg('only')?.split(','),cases=JSON.parse(await fs.readFile(casesFile,'utf8')).filter(c=>!only||only.includes(c.id));
const home=arg('chatgpt-home')||path.join(process.env.APPDATA,'Corte','chatgpt');
const model=arg('model')||'gpt-6-astra',effort=arg('effort')||'medium';
const localModelLabel=arg('local-model-label')||'Qwen3-VL-4B-Instruct Q4_K_M';
const endpoint=new URL(arg('endpoint')||'http://127.0.0.1:18765');
if(endpoint.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(endpoint.hostname))throw Error('Local Qwen endpoint must be loopback.');
if(provider==='gpt'&&!(await loginStatus(home)).connected)throw Error('Existing Corte ChatGPT login is not connected.');
const exec=promisify(execFile),results=[];
for(const c of cases){
 const dir=path.join(out,c.id);await fs.mkdir(dir,{recursive:true});
 if(await fs.access(path.join(dir,'result.json')).then(()=>true,()=>false))throw Error('Choose a new output directory; results must not be overwritten.');
 const images=[];
 for(const frame of c.frames){const bytes=await fs.readFile(frame.path);if(createHash('sha256').update(bytes).digest('hex')!==frame.sha256)throw Error('Frame changed: '+frame.path);images.push({frame,bytes});}
 const task=profileName==='compact'?`The video lasts ${c.duration.toFixed(2)} seconds. List its main visible actions in chronological order, at most four. Use seconds relative to this video (0 to ${c.duration.toFixed(2)}). Include a brief action that changes the preparation, even if it is between repetitions. Each action label must be under 12 words. Do not describe clothes or surroundings. Note uncertainty instead of guessing. Do not propose edits.`:`Analyze the complete ${c.duration.toFixed(2)} second video. Timestamps must be relative to THIS VIDEO from 0 to ${c.duration.toFixed(2)}, in seconds. Split only at meaningful observable action changes; cover the main actions in chronological order. Say when an action starts before or continues after this video. Identify the actual end of transfers/preparation when visible. Use broad action descriptions and explicit uncertainty when object identity or action boundaries are not visible. Output at most 6 events; keep descriptions concise. Do not propose cuts or call a segment unimportant based on visual inactivity.`;
 const transport=`You are given ${images.length} ordered images sampled from the video. Image-to-time mapping in seconds: ${JSON.stringify(c.frames.map((f,i)=>({image:i+1,time:f.time})))}. These are samples, not continuous observation; boundary precision is limited by sampling. Analyze only the attached images. Do not use tools, inspect files, browse, or perform coding tasks. Return only the requested observation JSON.`;
 const prompt=[profile.system,task,transport].join('\n\n');
 await fs.writeFile(path.join(dir,'prompt.txt'),prompt);await fs.writeFile(path.join(dir,'schema.json'),JSON.stringify(profile.schema,null,2));
 await fs.writeFile(path.join(dir,'input.json'),JSON.stringify({provider,profile:profileName,model:provider==='gpt'?model:localModelLabel,reasoningEffort:provider==='gpt'?effort:null,caseId:c.id,sourceName:c.sourceName,sourceStart:c.sourceStart,sourceEnd:c.sourceEnd,frames:c.frames,audioProvided:false,referenceProvided:false,promptSha256:createHash('sha256').update(prompt).digest('hex'),schemaSha256:createHash('sha256').update(JSON.stringify(profile.schema)).digest('hex')},null,2));
 const started=performance.now(),memory=[];let sampling=false;
 const sample=async()=>{if(provider!=='qwen'||sampling)return;sampling=true;try{const {stdout}=await exec('nvidia-smi',['--query-gpu=memory.used,utilization.gpu','--format=csv,noheader,nounits'],{windowsHide:true,timeout:3000});const [gpuMiB,gpuPercent]=stdout.trim().split(',').map(Number);memory.push({elapsedMs:Math.round(performance.now()-started),gpuMiB,gpuPercent});}catch{}finally{sampling=false;}};
 await sample();const timer=provider==='qwen'?setInterval(sample,1000):null;
 console.log(JSON.stringify({stage:'start',provider,profile:profileName,case:c.id,frames:images.length}));
 try{
  let observed,usage,timings;
  if(provider==='qwen'){
   const body={model:'local-video-pilot',messages:[{role:'user',content:[...images.map(({bytes})=>({type:'image_url',image_url:{url:'data:image/jpeg;base64,'+bytes.toString('base64')}})),{type:'text',text:prompt}]}],temperature:0.7,top_p:0.8,top_k:20,seed:42,max_tokens:profile.maxOutputTokens,response_format:{type:'json_schema',json_schema:{name:'observations',strict:true,schema:profile.schema}},cache_prompt:false};
   const response=await fetch(new URL('/v1/chat/completions',endpoint),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(240000)});
   const raw=await response.json();await fs.writeFile(path.join(dir,'raw.json'),JSON.stringify(raw,null,2));
   if(!response.ok||raw.choices?.[0]?.finish_reason==='length')throw Error(!response.ok?JSON.stringify(raw):'Truncated model output; not accepted.');
   observed=JSON.parse(raw.choices[0].message.content);usage=raw.usage;timings=raw.timings;
  }else{
   const bin=codexExecutable(),output=path.join(dir,'response.json'),args=codexArgs(path.join(dir,'schema.json'),output,images.map(x=>x.frame.path));
   args.splice(1,0,'--model',model,'-c',`model_reasoning_effort="${effort}"`);
   const eventText=await new Promise((resolve,reject)=>{
    const child=spawn(bin.file,[...bin.prefix,...args],{cwd:dir,env:{...codexEnv(process.env),...bin.env,CODEX_HOME:home},windowsHide:true,shell:false});
    let stdout='',stderr='',expired=false;const timeout=setTimeout(()=>{expired=true;child.kill();},240000);
    child.stdout.on('data',b=>{stdout+=b;if(stdout.length>4e6){expired=true;child.kill();}});child.stderr.on('data',b=>{stderr=(stderr+b).slice(-24000);});
    child.stdin.on('error',()=>{});child.stdin.end(prompt);
    child.on('error',e=>{clearTimeout(timeout);reject(e);});
    child.on('close',async code=>{clearTimeout(timeout);await fs.writeFile(path.join(dir,'events.jsonl'),stdout);await fs.writeFile(path.join(dir,'stderr.log'),stderr);if(code!==0||expired)reject(Error(expired?'Provider timed out after 240 seconds.':`Provider exited ${code}; see saved events.`));else resolve(stdout);});
   });
   const events=eventText.trim().split('\n').map(line=>{try{return JSON.parse(line);}catch{return {};}}),completed=events.findLast(e=>e.type==='turn.completed');
   if(!completed)throw Error('No completed provider turn.');
   const toolsUsed=events.filter(e=>e.item?.type&&!['agent_message','reasoning'].includes(e.item.type));if(toolsUsed.length)throw Error('Unexpected tool use; observation rejected.');
   usage=completed.usage;observed=JSON.parse(await fs.readFile(output,'utf8'));
  }
  const validIntervals=Array.isArray(observed.events)&&observed.events.length>0&&observed.events.every((e,i)=>Number.isFinite(e.start)&&Number.isFinite(e.end)&&e.start>=0&&e.end>e.start&&e.end<=c.duration+.05&&(!i||e.start>=observed.events[i-1].start));
  const result={caseId:c.id,referenceId:c.referenceId,provider,profile:profileName,model:provider==='gpt'?model:localModelLabel,reasoningEffort:provider==='gpt'?effort:null,sourceName:c.sourceName,sourceStart:c.sourceStart,sourceEnd:c.sourceEnd,elapsedMs:Math.round(performance.now()-started),validIntervals,intervalValidationScope:'bounds and start order only; not semantic quality',usage,timings,observations:observed,sourceEvents:observed.events.map(e=>({...e,start:c.sourceStart+e.start,end:c.sourceStart+e.end})),memory};
  await fs.writeFile(path.join(dir,'result.json'),JSON.stringify(result,null,2));results.push(result);console.log(JSON.stringify({stage:'done',provider,profile:profileName,case:c.id,elapsedMs:result.elapsedMs,validIntervals,observations:observed}));
 }catch(error){const result={caseId:c.id,provider,profile:profileName,error:error.message,elapsedMs:Math.round(performance.now()-started)};results.push(result);await fs.writeFile(path.join(dir,'error.json'),JSON.stringify(result,null,2));console.error(JSON.stringify(result));process.exitCode=1;}
 finally{if(timer)clearInterval(timer);}
 await fs.writeFile(path.join(out,'results.json'),JSON.stringify({createdAt:new Date().toISOString(),provider,profile:profileName,cases:results},null,2));
 if(results.at(-1).error)break;
}
