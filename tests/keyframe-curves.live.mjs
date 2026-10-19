// Opt-in existing ChatGPT connection; synthetic metadata only, no media or transcription.
import assert from 'node:assert/strict';import path from 'node:path';import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';
import * as m from '../src/project.mjs';import {keyframeAt} from '../src/keyframes.mjs';import {requestEditingPlan} from '../desktop/edit-router.mjs';import {interpretIntent} from '../desktop/intent.mjs';
const home=process.env.CORTE_TEST_CODEX_HOME,output=process.env.CORTE_CURVE_PROMPT_REPORT;if(!home||!output)throw Error('Set CORTE_TEST_CODEX_HOME and CORTE_CURVE_PROMPT_REPORT.');
const dir=await mkdtemp(path.join(tmpdir(),'corte-curve-prompts-')),report={mediaSent:false,providerMetadataOnly:true,cases:[]};
function fixture(){let p=m.addClip(m.addAsset(m.createProject(),{id:'v',name:'Vídeo',duration:6,width:320,height:320,hasAudio:true}),'v','c');p=m.addShapeLayer(p,{id:'s',type:'rectangle',start:1,end:5,x:20,y:50,width:20,height:20,rotation:0,opacity:100,fill:'#ffffff',stroke:null,strokeWidth:0});return m.setKeyframe(m.setKeyframe(p,'s',0,{x:20}),'s',4,{x:80});}
try{
 const cases=[
 ['acelerar movimento','No retângulo, faça o movimento entre os dois pontos existentes começar devagar e acelerar até o final. Preserve as poses, os tempos, a duração do vídeo e os áudios.','ease-in'],
 ['desacelerar movimento','Mude somente a curva do primeiro ponto do retângulo para desacelerar até o próximo ponto. Não mude posição, tamanho, opacidade nem tempos.','ease-out'],
 ['suave nos dois lados','Entre os dois pontos existentes do retângulo, use movimento suave no começo e no final. Preserve os pontos e os áudios.','ease-in-out'],
 ['curva e aparo','Primeiro aplique curva ease-in-out ao movimento completo entre os dois pontos existentes do retângulo. Depois apare esse componente para aparecer só de 1,5 a 4,5 segundos da montagem, preservando exatamente o movimento que ele já teria nesse intervalo. Não altere vídeo, duração ou áudio.','ease-in-out',true]
 ];await mkdir(path.dirname(output),{recursive:true});
 for(const [name,prompt,easing,trim]of cases){if(process.env.CORTE_CURVE_PROMPT_FILTER&&!name.match(new RegExp(process.env.CORTE_CURVE_PROMPT_FILTER)))continue;const p=fixture();let result,intended;try{result=await requestEditingPlan({home,cache:path.join(dir,'cache'),project:p,prompt,shareEvidence:true},{interpret:async options=>{const value=await interpretIntent(options);intended=value.plan;return value;},hybrid:async()=>{throw Error('Curves with explicit existing points need metadata only.');}});const q=m.applyPlan(p,result.plan),t=q.shapeLayers[0];assert.ok(result.reviewRequired);assert.equal(t.keyframes[0].easing,easing);assert.deepEqual(q.clips,p.clips);assert.equal(m.duration(q),6);
  if(trim){assert.equal(t.start,1.5);assert.equal(t.end,4.5);for(const time of [1.5,2,2.5,3.5,4.5]){const u=(time-1)/4,f=u*u*(3-2*u);assert.ok(Math.abs(keyframeAt(t,time-t.start).x-(20+60*f))<1e-6);}}
  else{assert.deepEqual(t.keyframes.map(({easing,curveWindow,...point})=>point),p.shapeLayers[0].keyframes);assert.equal(t.start,1);assert.equal(t.end,5);}
  report.cases.push({name,prompt,passed:true,plan:result.plan});console.log('PASS',name);
 }catch(error){report.cases.push({name,prompt,passed:false,error:error.message,plan:result?.plan||intended});console.log('FAIL',name,error.message);}await writeFile(output,JSON.stringify(report,null,2));}
 report.passed=report.cases.filter(c=>c.passed).length;report.total=report.cases.length;await writeFile(output,JSON.stringify(report,null,2));if(report.passed!==report.total)process.exitCode=1;
}finally{await rm(dir,{recursive:true,force:true});}
