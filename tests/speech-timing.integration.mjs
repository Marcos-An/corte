// Actual offline Whisper on committed synthetic Portuguese speech (tests/fixtures, regenerate with scripts/make-speech-fixture.mjs). No provider calls.
import assert from 'node:assert/strict';import {readFile,mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import {probe,run,binaries} from '../desktop/media.mjs';import {transcribeLocally} from '../desktop/transcribe.mjs';import {createProject,addAsset,addClip} from '../src/project.mjs';
const audio=path.resolve(import.meta.dirname,'fixtures/speech-pt.m4a'),dir=await mkdtemp(path.join(tmpdir(),'corte-speech-')),file=path.join(dir,'speech.mp4'),truth=JSON.parse(await readFile(path.resolve(import.meta.dirname,'fixtures/speech-pt.json'),'utf8'));
try{
await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=black:s=160x90:r=2','-i',audio,'-shortest','-c:v','libx264','-c:a','aac',file]);
const project=addClip(addAsset(createProject(),{id:'speech',name:'Fala sintética',...await probe(file)}),'speech','c'),started=performance.now();
const [t]=await transcribeLocally({project,registry:new Map([['speech',{path:file}]]),purpose:'edit'});
const norm=s=>s.toLowerCase().normalize('NFD').replace(/[^a-z]/g,''),[,second,third]=truth.segments,gapSeconds=t.gaps.reduce((n,g)=>n+g.end-g.start,0);
assert.ok(t.words.some(w=>w.start>=28&&w.start<second.end),'speech crossing the 30s window edge keeps word times');
assert.ok(gapSeconds<5,`uncertain speech stays local, not a window blackout (${gapSeconds.toFixed(1)}s)`);
for(let i=0;i<truth.segments.length-1;i++){const from=truth.segments[i].end+.3,to=truth.segments[i+1].start-.3;assert.ok(!t.words.some(w=>w.start>from&&w.start<to),`no word inside the planted pause ${from.toFixed(1)}-${to.toFixed(1)}s`);}
// Anchors are timing, not spelling: whisper-small mangles Portuguese food words ("Kojaki"), which is a recognition limit, not a timing one.
for(const segment of [second,third]){const w=t.words.find(w=>w.start>=segment.start-1);assert.ok(w&&Math.abs(w.start-segment.start)<.4,`first word after the pause starts within 0.4s of ${segment.start}s (got ${w?.start})`);}
assert.equal(t.words.filter(w=>norm(w.text).includes('radio')).length,1,'the forbidden phrase is addressable as exactly one word');
for(let i=1;i<t.words.length;i++){assert.ok(t.words[i].start>=t.words[i-1].start,'words are ordered across windows');assert.ok(!(norm(t.words[i].text)===norm(t.words[i-1].text)&&t.words[i].start-t.words[i-1].start<.3),`no duplicate from window overlap at ${t.words[i].start}s`);}
console.log(JSON.stringify({passed:true,words:t.words.length,gaps:t.gaps.length,gapSeconds:Number(gapSeconds.toFixed(2)),elapsedMs:Math.round(performance.now()-started)}));
}finally{await rm(dir,{recursive:true,force:true});}
