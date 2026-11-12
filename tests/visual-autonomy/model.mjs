import fs from 'node:fs/promises';import path from 'node:path';import {spawn} from 'node:child_process';import {createHash} from 'node:crypto';
import {codexArgs,codexEnv,codexExecutable,loginStatus} from '../../desktop/ai.mjs';
export async function ask({dir,prompt,schema,images=[]}){
 await fs.mkdir(dir,{recursive:true});if(await fs.access(path.join(dir,'response.json')).then(()=>true,()=>false))throw Error('Existing response: '+dir);
 const home=path.join(process.env.APPDATA,'Corte','chatgpt');if(!(await loginStatus(home)).connected)throw Error('Existing Corte login unavailable.');
 const hashes=[];for(const image of images){hashes.push({path:image,sha256:createHash('sha256').update(await fs.readFile(image)).digest('hex')});}
 await fs.writeFile(path.join(dir,'prompt.txt'),prompt);await fs.writeFile(path.join(dir,'schema.json'),JSON.stringify(schema,null,2));await fs.writeFile(path.join(dir,'images.json'),JSON.stringify(hashes,null,2));
 const responseFile=path.join(dir,'response.json'),bin=codexExecutable(),args=codexArgs(path.join(dir,'schema.json'),responseFile,images);
 args.splice(1,0,'--model','gpt-6-astra','-c','model_reasoning_effort="medium"');
 let stdout='',stderr='',expired=false;const started=performance.now();
 try{await new Promise((resolve,reject)=>{
  const child=spawn(bin.file,[...bin.prefix,...args],{cwd:dir,env:{...codexEnv(process.env),...bin.env,CODEX_HOME:home},windowsHide:true,shell:false});
  const timeout=setTimeout(()=>{expired=true;child.kill();},300000);
  child.stdout.on('data',b=>{stdout+=b;});child.stderr.on('data',b=>{stderr=(stderr+b).slice(-20000);});child.stdin.on('error',()=>{});child.stdin.end(prompt);
  child.on('error',e=>{clearTimeout(timeout);reject(e);});child.on('close',code=>{clearTimeout(timeout);code===0&&!expired?resolve():reject(Error(expired?'GPT timeout':'GPT exit '+code));});
 });}finally{await fs.writeFile(path.join(dir,'events.jsonl'),stdout);await fs.writeFile(path.join(dir,'stderr.log'),stderr);}
 const events=stdout.trim().split('\n').map(s=>JSON.parse(s)),completion=events.findLast(e=>e.type==='turn.completed');
 if(!completion||events.some(e=>e.item?.type&&!['agent_message','reasoning'].includes(e.item.type)))throw Error('Unexpected tools or incomplete inference');
 const result=JSON.parse(await fs.readFile(responseFile,'utf8'));
 const trace={model:'gpt-6-astra',effort:'medium',elapsedMs:Math.round(performance.now()-started),imageCount:images.length,usage:completion.usage,result};
 await fs.writeFile(path.join(dir,'trace.json'),JSON.stringify(trace,null,2));console.log(JSON.stringify({round:path.basename(dir),elapsedMs:trace.elapsedMs,images:images.length}));return trace;
}
