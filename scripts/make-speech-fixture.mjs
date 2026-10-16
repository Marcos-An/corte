// Regenerates tests/fixtures/speech-pt.m4a and its ground truth. macOS only (`say`); the outputs are committed so CI never needs it.
import {execFileSync} from 'node:child_process';import {mkdtemp,rm,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import {binaries,probe} from '../desktop/media.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'tests/fixtures'),dir=await mkdtemp(path.join(tmpdir(),'corte-speech-'));
// Segment 2 is long continuous speech so it is still running at the 30-second window edge.
const segments=[
 'Oi, hoje eu tô aqui no Kokoro, um restaurante novo em Dourados.',
 'Essa bebida de melão tem um verde radioativo, mas o sabor é muito bom, lembra bastante o picolé de melão que eu tomava quando era criança, e a cor chama muita atenção. Eu escolhi a de melão porque não gosto muito de manga, mas também tinha uma bebida de manga no cardápio, com uma cor alaranjada bem bonita.',
 'Agora o takoyaki, que está muito gostoso.'
],pause=2;
try{
 const parts=[],truth={pauseSeconds:pause,segments:[]};let t=0;
 for(const [i,text] of segments.entries()){
  const aiff=path.join(dir,`s${i}.aiff`);execFileSync('say',['-v','Flo','-r','150','-o',aiff,text]);const {duration}=await probe(aiff);
  truth.segments.push({text,start:Number(t.toFixed(3)),end:Number((t+duration).toFixed(3))});parts.push(aiff);t+=duration;
  if(i<segments.length-1){const gap=path.join(dir,`g${i}.aiff`);execFileSync(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','anullsrc=r=22050:cl=mono','-t',String(pause),gap]);parts.push(gap);t+=pause;}
 }
 const list=path.join(dir,'list.txt');await writeFile(list,parts.map(p=>`file '${p}'`).join('\n'));
 execFileSync(binaries().ffmpeg,['-v','error','-y','-f','concat','-safe','0','-i',list,'-ac','1','-ar','16000','-c:a','aac','-b:a','24k',path.join(out,'speech-pt.m4a')]);
 await writeFile(path.join(out,'speech-pt.json'),JSON.stringify(truth,null,1)+'\n');console.log(JSON.stringify(truth));
}finally{await rm(dir,{recursive:true,force:true});}
