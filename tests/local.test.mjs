import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {selectEvidence,refinementTimes,pixelMetrics,cosineDistance,modelPath} from '../desktop/local.mjs';
import {createProject,addAsset,addClip} from '../src/project.mjs';
test('local selection preserves coverage and adds dense evidence around visual changes, not fixed objects',()=>{
 const samples=Array.from({length:200},(_,i)=>({time:i*.5,change:i===75?1:.001,blur:10}));
 const times=selectEvidence(samples,24);assert.ok(times.length<=24);assert.ok(times.includes(0));assert.ok(times.includes(99.5));assert.ok(times.includes(37.5));assert.ok(times.some(t=>Math.abs(t-37.5)===.5));
 assert.ok(times.some(t=>t>70));assert.throws(()=>selectEvidence(samples,1));
});
test('metrics differentiate blank/texture and embedding changes without class labels',()=>{
 const blank={width:4,height:4,channels:3,data:new Uint8Array(48).fill(40)},texture={...blank,data:Uint8Array.from({length:48},(_,i)=>i%6<3?0:255)};
 assert.ok(pixelMetrics(texture).sharpness>pixelMetrics(blank).sharpness);assert.equal(cosineDistance([1,0],[1,0]),0);assert.equal(cosineDistance([1,0],[0,1]),1);
 assert.match(modelPath(),/models/);
});
test('refinement targets proposed source ranges including both borders and retains global overview',()=>{
 const p=addClip(addAsset(createProject(),{id:'a',name:'a.mp4',duration:100,width:640,height:360,hasAudio:false}),'a','c');
 const result=refinementTimes(p,{operations:[{type:'remove_ranges',clipId:'c',ranges:[[35,37]]}]},[{assetId:'a',time:80},{assetId:'a',time:0}],30);
 assert.ok(result.some(f=>f.time===35.25));assert.ok(result.some(f=>f.time===34.5));assert.ok(result.some(f=>f.time===37.5));assert.ok(result.some(f=>f.time===80));assert.ok(result.length<=30);
 assert.deepEqual(refinementTimes(p,{operations:[{type:'update',clipId:'c',volume:.5}]},[],30),[]);
});
test('media output directories cannot escape temporary root or collide through path sanitization',async()=>{
 const {frameDirectory}=await import('../desktop/local.mjs');const root='/tmp/analysis';assert.notEqual(frameDirectory(root,'a/b'),frameDirectory(root,'a_b'));assert.equal(path.dirname(frameDirectory(root,'../../secret')),path.normalize(root));assert.equal(frameDirectory(root,'asset'),frameDirectory(root,'asset'));
});
test('visual candidate screening bounds expensive inference while retaining coverage and abrupt changes',async()=>{
 const {visualCandidates,pixelChange}=await import('../desktop/local.mjs');
 const a={width:4,height:4,channels:3,data:new Uint8Array(48)},b={...a,data:new Uint8Array(48).fill(255)};
 assert.equal(pixelChange(a,a),0);assert.equal(pixelChange(a,b),1);
 const samples=Array.from({length:1724},(_,i)=>({time:i/4,change:i===681?1:0,sharpness:20}));
 const candidates=visualCandidates(samples,12);assert.ok(candidates.length<=12);assert.ok(candidates.some(s=>s.time===681/4));assert.equal(candidates[0].time,0);assert.equal(candidates.at(-1).time,1723/4);
 assert.deepEqual(visualCandidates(samples.slice(0,3),1),samples.slice(0,3));
});
test('one decode pass writes the screening thumbnails and the preview pool on the same clock',async()=>{
 const {samplingArgs}=await import('../desktop/local.mjs');const args=samplingArgs('in.mov',4,'dir');
 assert.equal(args.filter(a=>a==='-i').length,1,'the source is decoded once');assert.equal(args[args.indexOf('-hwaccel')+1],'auto','GPU decoding when the build has it, software otherwise');
 const graph=args[args.indexOf('-filter_complex')+1];assert.match(graph,/^\[0:v\]fps=4:start_time=0,split=2/);assert.match(graph,/scale=96:-2/);assert.match(graph,/scale=720:720:force_original_aspect_ratio=decrease/);
 assert.ok(args.includes(path.join('dir','%06d.png'))&&args.includes(path.join('dir','pool-%06d.jpg')));assert.equal(args[args.indexOf('-q:v')+1],'5');
 for(const fps of [0,NaN,-1])assert.throws(()=>samplingArgs('in.mov',fps,'dir'));
});
test('semantic change compares each candidate with its temporal neighbour, never with a distant candidate',async()=>{
 const {semanticChanges,selectEvidence}=await import('../desktop/local.mjs');
 const samples=Array.from({length:140},(_,i)=>({time:i/4,change:0,sharpness:20})),candidates=[0,40,69,70,139].map(i=>({...samples[i]}));
 const calls=[];const embed=async i=>{calls.push(i);const a=i*.02;return [Math.cos(a),Math.sin(a),i>=69?1.5:0];};
 await semanticChanges(samples,candidates,embed);
 const top=candidates.slice().sort((a,b)=>b.change-a.change)[0];assert.equal(top.time,69/4,'the real cut wins over slow drift across a long gap');
 assert.ok(candidates.find(c=>c.time===139/4).change<.01);assert.equal(candidates[0].change,0);
 assert.equal(new Set(calls).size,calls.length,'each frame is embedded once');assert.ok(calls.length<=candidates.length*2);
 assert.ok(selectEvidence(candidates,3).includes(69/4),"beyond the first and last coverage frames, the cut is chosen");
});
test('final evidence keeps time coverage even when candidates cluster around early changes',async()=>{
 const {visualCandidates,selectEvidence}=await import('../desktop/local.mjs');
 const samples=Array.from({length:2400},(_,i)=>({time:i/4,change:i<240&&i%7===0?1:0,sharpness:20})),times=selectEvidence(visualCandidates(samples,1),48);
 const holes=times.slice(1).map((t,i)=>t-times[i]);assert.ok(Math.max(...holes)<=60,`largest blind stretch ${Math.max(...holes)}s`);
 assert.deepEqual(selectEvidence(samples.slice(0,400),20),selectEvidence(samples.slice(0,400),20),'deterministic');
});
test('visual search ranks frames by text similarity, spreads picks in time and labels each match',async()=>{
 const {searchFrames}=await import('../desktop/local.mjs');
 const unit=v=>{const n=Math.hypot(...v);return v.map(x=>x/n);},index=[];
 for(let t=0;t<20;t++)index.push({assetId:'facade',time:t,path:`f${t}`,vector:unit([1,t===7?.2:1,0])});
 for(let t=0;t<20;t++)index.push({assetId:'food',time:t,path:`d${t}`,vector:unit([0,1,t===3||t===4?3:1])});
 const found=searchFrames(index,[{query:'restaurant facade sign',vector:unit([1,0,0])},{query:'takoyaki cut open',vector:unit([0,0,1])}],{k:2,spacing:2});
 assert.deepEqual(found.map(f=>[f.match,f.assetId,f.time]),[['restaurant facade sign','facade',7],['restaurant facade sign','facade',0],['takoyaki cut open','food',3],['takoyaki cut open','food',0]].map(([m,a,t],i)=>i===1?[m,a,found[1].time]:i===3?[m,a,found[3].time]:[m,a,t]));
 assert.ok(Math.abs(found[3].time-3)>=2,'the second pick for a query is not the neighbour of the first');
 assert.ok(found.every(f=>typeof f.score==='number'&&f.path));
 assert.deepEqual(searchFrames(index,[],{}),[]);
});
test('blurry stretches are reported per asset from the sharpness of real previews',async()=>{
 const {blurryRanges}=await import('../desktop/local.mjs');
 const s=Array.from({length:12},(_,t)=>({time:t,sharpness:t>=4&&t<=6?5:100}));
 assert.deepEqual(blurryRanges(s),[[4,7]]);assert.deepEqual(blurryRanges(s.map(x=>({...x,sharpness:100}))),[]);assert.deepEqual(blurryRanges([]),[]);
});
test('the accurate speech model is used only from a folder holding every file of its manifest',async()=>{
 const {accurateSpeechModel}=await import('../desktop/local.mjs'),{mkdtemp,mkdir,writeFile,rm,readFile}=await import('node:fs/promises'),{tmpdir}=await import('node:os');
 const manifest=JSON.parse(await readFile(new URL('../vendor/models/speech-accurate-manifest.json',import.meta.url),'utf8')),dir=await mkdtemp(path.join(tmpdir(),'corte-speech-model-')),saved=process.env.CORTE_SPEECH_MODEL_PATH;
 try{
  for(const f of manifest.files){await mkdir(path.dirname(path.join(dir,f.path)),{recursive:true});await writeFile(path.join(dir,f.path),'x');}
  process.env.CORTE_SPEECH_MODEL_PATH=dir;const found=await accurateSpeechModel();assert.equal(found.path,dir);assert.equal(found.manifest.model,'onnx-community/whisper-large-v3-turbo_timestamped');
  await rm(path.join(dir,manifest.files[0].path));assert.notEqual((await accurateSpeechModel())?.path,dir,'an incomplete folder is skipped');
 }finally{if(saved===undefined)delete process.env.CORTE_SPEECH_MODEL_PATH;else process.env.CORTE_SPEECH_MODEL_PATH=saved;await rm(dir,{recursive:true,force:true});}
});
test('a clip blurry from start to end is caught against the sharpness of the whole project',async()=>{
 const {blurryRanges}=await import('../desktop/local.mjs'),soft=Array.from({length:6},(_,t)=>({time:t,sharpness:8}));
 assert.deepEqual(blurryRanges(soft),[],'alone it has nothing sharper to compare with');assert.deepEqual(blurryRanges(soft,.3,100),[[0,6]]);
});
test('a corrupted accurate speech model is reported as not ready, so transcription falls back to the bundled one',async()=>{
 const {readyAccurateSpeechModel}=await import('../desktop/transcribe.mjs'),{mkdtemp,mkdir,writeFile,rm,readFile}=await import('node:fs/promises'),{tmpdir}=await import('node:os');
 const manifest=JSON.parse(await readFile(new URL('../vendor/models/speech-accurate-manifest.json',import.meta.url),'utf8')),dir=await mkdtemp(path.join(tmpdir(),'corte-speech-bad-')),saved=process.env.CORTE_SPEECH_MODEL_PATH;
 try{for(const f of manifest.files){await mkdir(path.dirname(path.join(dir,f.path)),{recursive:true});await writeFile(path.join(dir,f.path),'corrupted');}
  process.env.CORTE_SPEECH_MODEL_PATH=dir;assert.equal(await readyAccurateSpeechModel(),null);
 }finally{if(saved===undefined)delete process.env.CORTE_SPEECH_MODEL_PATH;else process.env.CORTE_SPEECH_MODEL_PATH=saved;await rm(dir,{recursive:true,force:true});}
});
