// Actual offline Whisper on committed synthetic Portuguese speech (tests/fixtures, regenerate with scripts/make-speech-fixture.mjs). No provider calls.
import assert from 'node:assert/strict';import {readFile,mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import {probe,run,binaries} from '../desktop/media.mjs';import {transcribeLocally} from '../desktop/transcribe.mjs';import {createProject,addAsset,addClip} from '../src/project.mjs';import {resolveSpeechOperations} from '../desktop/speech-edit.mjs';
const audio=path.resolve(import.meta.dirname,'fixtures/speech-pt.m4a'),dir=await mkdtemp(path.join(tmpdir(),'corte-speech-')),file=path.join(dir,'speech.mp4'),truth=JSON.parse(await readFile(path.resolve(import.meta.dirname,'fixtures/speech-pt.json'),'utf8'));
try{
await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=black:s=160x90:r=2','-i',audio,'-shortest','-c:v','libx264','-c:a','aac',file]);
const project=addClip(addAsset(createProject(),{id:'speech',name:'Fala sintética',...await probe(file)}),'speech','c'),started=performance.now();
const [t]=await transcribeLocally({project,registry:new Map([['speech',{path:file}]]),purpose:'edit'});
const norm=s=>s.toLowerCase().normalize('NFD').replace(/[^a-z]/g,''),[,second,third]=truth.segments,gapSeconds=t.gaps.reduce((n,g)=>n+g.end-g.start,0);
assert.ok(t.words.some(w=>w.start>=28&&w.start<second.end),'speech crossing the 30s window edge keeps word times');
assert.ok(gapSeconds<5,`uncertain speech stays local, not a window blackout (${gapSeconds.toFixed(1)}s)`);
for(let i=0;i<truth.segments.length-1;i++){const from=truth.segments[i].end+.3,to=truth.segments[i+1].start-.3;assert.ok(!t.words.some(w=>w.start>from&&w.start<to),`no word inside the planted pause ${from.toFixed(1)}-${to.toFixed(1)}s`);}
// With the accurate model installed, the words the Kokoro prompt depends on must come out right.
if(t.recognizer?.includes('large-v3-turbo'))for(const word of ['radioativo','takoyaki','picole','crianca','cardapio'])assert.ok(t.words.some(w=>norm(w.text)===word),`accurate model recognizes "${word}" (${t.words.map(w=>w.text).join(' ')})`);
// Anchors are timing, not spelling: whisper-small mangles Portuguese food words ("Kojaki"), which is a recognition limit, not a timing one.
for(const segment of [second,third]){const w=t.words.find(w=>w.start>=segment.start-1);assert.ok(w&&Math.abs(w.start-segment.start)<.4,`first word after the pause starts within 0.4s of ${segment.start}s (got ${w?.start})`);}
for(let i=0;i<truth.segments.length-1;i++){const from=truth.segments[i].end,to=truth.segments[i+1].start;assert.ok(t.pauses?.some(p=>Math.abs(p.start-from)<.35&&Math.abs(p.end-to)<.35),`planted pause ${from.toFixed(2)}-${to.toFixed(2)}s is measured (${JSON.stringify(t.pauses)})`);}
assert.equal(t.words.filter(w=>norm(w.text).includes('radio')).length,1,'the forbidden phrase is addressable as exactly one word');
for(let i=1;i<t.words.length;i++){assert.ok(t.words[i].start>=t.words[i-1].start,'words are ordered across windows');assert.ok(!(norm(t.words[i].text)===norm(t.words[i-1].text)&&t.words[i].start-t.words[i-1].start<.3),`no duplicate from window overlap at ${t.words[i].start}s`);}
// Cutting the first word after a pause must start just after the previous speech really ends, even when Whisper stretched that word's end into the silence.
const k=t.words.findIndex(w=>w.start>=third.start-1),[[cut]]=resolveSpeechOperations(project,{plan:{operations:[{type:'remove_words',clipId:'c',ranges:[[k,k]]}]},coverage:[]},[{assetId:'speech',words:t.words,pauses:t.pauses}]).plan.operations.map(o=>o.ranges);
assert.ok(cut[0]>=second.end-.1&&cut[0]<=second.end+.35,`cut starts at the real end of speech ${second.end}s, not the stretched word end ${t.words[k-1].end}s (got ${cut[0]})`);
console.log(JSON.stringify({passed:true,recognizer:t.recognizer,words:t.words.length,gaps:t.gaps.length,gapSeconds:Number(gapSeconds.toFixed(2)),pauses:t.pauses.length,cutAfterPause:Number(cut[0].toFixed(2)),stretchedWordEnd:t.words[k-1].end,elapsedMs:Math.round(performance.now()-started)}));
}finally{await rm(dir,{recursive:true,force:true});}
