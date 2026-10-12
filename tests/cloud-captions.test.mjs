import test from 'node:test';import assert from 'node:assert/strict';
import {toAss} from '../src/captions.mjs';
test('caption style exports font, size, color and top alignment',()=>{
 const ass=toAss([{start:0,end:1,text:'Olá'}],720,1280,{font:'Arial',size:8,color:'#ffffff',position:'top',preset:'clean'});
 assert.match(ass,/Style: Default,Arial,58,&H00FFFFFF/);assert.match(ass,/,8,40,40,/);
});
test('cloud transcripts require real timestamps and sanitize provider errors',async()=>{
 const {normalizeCloudTranscript,transcribeAudio}=await import('../desktop/cloud-captions.mjs');
 assert.deepEqual(normalizeCloudTranscript({segments:[{start:0,end:1,text:' Olá '} ]},2),[{start:0,end:1,text:'Olá'}]);
 assert.throws(()=>normalizeCloudTranscript({text:'Olá'},2));assert.throws(()=>normalizeCloudTranscript({segments:[{start:0,end:3,text:'x'}]},2));
 let sent;const fetcher=async(url,init)=>{sent=init;return {ok:true,json:async()=>({segments:[{start:0,end:1,text:'Olá'}]})};};
 const result=await transcribeAudio({key:'test-secret',audio:Buffer.from('test'),duration:2,fetcher});assert.equal(result[0].text,'Olá');assert.equal(sent.body.get('model'),'gpt-4o-transcribe-diarize');assert.equal(sent.body.get('response_format'),'diarized_json');
 await assert.rejects(()=>transcribeAudio({key:'test-secret',audio:Buffer.from('test'),duration:2,fetcher:async()=>({ok:false,status:401,text:async()=> 'test-secret'})}),e=>!e.message.includes('test-secret')&&/chave/i.test(e.message));
});
test('credential store encrypts, replaces and removes; refuses insecure storage',async()=>{
 const {keyStore}=await import('../desktop/credentials.mjs');const {mkdtemp,readFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const path=await import('node:path');
 const dir=await mkdtemp(path.join(tmpdir(),'corte-key-'));const secret='sk-'+ 'x'.repeat(40);
 const safe={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s.split('').reverse().join('')),decryptString:b=>b.toString().split('').reverse().join('')};
 try{const store=keyStore(path.join(dir,'key'),safe);await store.save(secret);assert.equal(await store.read(),secret);assert.ok(!(await readFile(path.join(dir,'key'))).includes(secret));await store.save(secret+'y');assert.equal(await store.read(),secret+'y');await store.remove();assert.equal(await store.read(),null);await assert.rejects(()=>keyStore(path.join(dir,'key'),{...safe,isEncryptionAvailable:()=>false}).save(secret));}finally{await rm(dir,{recursive:true,force:true});}
});

test('cloud reuses existing transcripts without sending audio again and estimates unique original assets',async()=>{
 const {captionEstimate,transcribeCloud}=await import('../desktop/cloud-captions.mjs');const {createProject,addAsset,addClip,validateProject}=await import('../src/project.mjs');
 let p=addClip(addAsset(createProject(),{id:'a',name:'x.mp4',duration:120,width:320,height:240,hasAudio:true}),'a');p=addClip(p,'a');assert.equal(captionEstimate(p).seconds,120);
 p.transcripts=[{assetId:'a',words:[{start:1,end:2,text:'Olá'}]}];assert.equal(captionEstimate(p).seconds,120,'legacy local captions must not masquerade as GPT cache');p.transcripts[0].provider='openai';p.transcripts[0].model='gpt-4o-transcribe-diarize';assert.equal(captionEstimate(p).assets,1,'phrase-only cache needs real word times when regenerated');p.transcripts[0].model='whisper-1';assert.equal(captionEstimate(p).estimatedUSD,0);
 const r=await transcribeCloud({project:p,registry:new Map(),fetcher:()=>assert.fail('No repeat billing')});assert.deepEqual(r,p.transcripts);
 p.captionStyle={font:'Arial',size:8,color:'#ffffff',position:'top',preset:'clean'};assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);
 p.captionStyle.font='Arial,Injected';assert.throws(()=>validateProject(p));
});

test('added music is never estimated or sent for caption transcription',async()=>{
 const {captionEstimate,transcribeCloud}=await import('../desktop/cloud-captions.mjs');
 const {createProject,addAsset,addClip,addMusic}=await import('../src/project.mjs');
 const music={id:'song',name:'song.m4a',kind:'audio',duration:30,width:0,height:0,hasAudio:true};
 let p=addMusic(createProject(),music,{in:0,out:30,start:0});
 assert.equal(captionEstimate(p).seconds,0);
 await assert.rejects(()=>transcribeCloud({project:p,registry:new Map(),fetcher:()=>assert.fail('Music must not reach API')}),/Não há áudio/);
 p=addClip(addAsset(p,{id:'video',name:'video.mp4',duration:4,width:320,height:240,hasAudio:true}),'video');
 assert.equal(captionEstimate(p).seconds,4,'only original video audio is counted');
});
