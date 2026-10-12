// Opt-in: envia imagens à nuvem. Qualidade do modelo não é determinística.
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {binaries,run,probe} from '../desktop/media.mjs';
import {requestPlan} from '../desktop/ai.mjs';
import {createProject,addAsset,addClip,applyPlan} from '../src/project.mjs';
if(!process.env.CORTE_TEST_VIDEO||!process.env.CORTE_TEST_CODEX_HOME)throw new Error('Requer vídeo autorizado e CODEX_HOME.');
const dir=await mkdtemp(path.join(tmpdir(),'corte-occlusion-'));
try{
 const file=path.join(dir,'visual-regression.mp4');
 await run(binaries().ffmpeg,['-hide_banner','-loglevel','error','-y','-i',process.env.CORTE_TEST_VIDEO,'-filter_complex','[0:v]split=3[a][b][c];[a]trim=start=10:end=16,setpts=PTS-STARTPTS[x];[b]trim=start=34:end=37,setpts=PTS-STARTPTS[y];[c]trim=start=45:end=51,setpts=PTS-STARTPTS[z];[x][y][z]concat=n=3:v=1:a=0[out]','-map','[out]','-an','-c:v','libx264','-pix_fmt','yuv420p',file]);
 const asset={id:'source',name:'Amostra autorizada',...await probe(file)},project=addClip(addAsset(createProject(),asset),'source','clip');
 const result=await requestPlan({home:process.env.CORTE_TEST_CODEX_HOME,cache:dir,project,prompt:'corte as partes que estao borradas ou que a mao esta tampando a camera',registry:new Map([['source',{path:file}]]),step:.5});
 await writeFile(path.resolve(import.meta.dirname,'../../validacao-oclusao-ia.json'),JSON.stringify({fixture:{safe:[[0,6],[9,15]],occluded:[[6,9]],originalSourceIntervals:[[10,16],[34,37],[45,51]]},...result},null,2));
 assert.equal(result.plan.unsupported.length,0);
 if(result.plan.questions.length){assert.equal(result.plan.operations.length,0);console.log('INCONCLUSIVO: IA pediu esclarecimento, sem cortes especulativos.');}
 else{
  assert.ok(result.plan.operations.length,'Esperado reconhecer a obstrução clara.');
  const edited=applyPlan(project,result.plan);const coverage=(start,end)=>edited.clips.reduce((sum,c)=>sum+Math.max(0,Math.min(end,c.out)-Math.max(start,c.in)),0);assert.ok(Math.abs(coverage(0,6)-6)<.001&&Math.abs(coverage(9,15)-6)<.001,'Preservar todos os gestos normais');assert.ok(coverage(6,9)<2.99,'Reconhecer obstrução');
  console.log('PASS IA real: remoção limitada ao trecho obstruído; gestos normais preservados.');
 }
 console.log(result.plan.summary);
}finally{await rm(dir,{recursive:true,force:true});}
