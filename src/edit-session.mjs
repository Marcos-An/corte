import {EDIT_STAGES} from './editor-experience.mjs';
export function newEditSession(prompt,scope=null){return {prompt,scope,stages:EDIT_STAGES.map(()=>null)};}
export function recordEditStage(session,stage,status,result={}){
 if(!session||!Number.isInteger(stage)||stage<1||stage>session.stages.length||!['applied','skipped','empty'].includes(status))throw Error('Etapa de edição inválida.');
 const notes=[...(result.pendingRequests||[])];
 if(status==='skipped')for(const item of result.coverage||[])if(item.status!=='not_needed')notes.push(`Não aplicado: ${item.request}`);
 session.stages[stage-1]={status,pending:[...new Set(notes)]};return session;
}
export function editSessionSummary(session){
 const stages=session?.stages||[],applied=stages.filter(s=>s?.status==='applied').length,skipped=stages.filter(s=>s?.status==='skipped').length;
 const pending=[...new Set(stages.flatMap(s=>s?.pending||[]))];
 return {applied,skipped,pending,text:`Revisão das etapas encerrada: ${applied} aplicada(s), ${skipped} pulada(s), ${pending.length} pendência(s).${pending.length||skipped?' O pedido ainda tem partes não executadas.':' Confira o resultado na timeline antes de exportar.'}`};
}
