import {clipDuration,sourceTime} from './clip-time.mjs';
import {validateProject,duration,applyPlan} from './project.mjs';
export function removeTimelineRange(project,start,end){
 validateProject(project);if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>duration(project)||end-start<.02)throw new Error('Selecione um intervalo válido de pelo menos 0,02 s.');
 let offset=0;const operations=[];for(const c of project.clips){const length=clipDuration(c),left=Math.max(start,offset),right=Math.min(end,offset+length);if(right>left){if(c.freeze){const rest=c.freeze-(right-left);operations.push(rest<.1?{type:'delete',clipId:c.id}:{type:'update',clipId:c.id,freeze:rest});}else operations.push({type:'remove_ranges',clipId:c.id,ranges:[[sourceTime(c,left-offset),sourceTime(c,right-offset)]]});}offset+=length;}
 return applyPlan(project,{summary:'Remover intervalo selecionado',operations,questions:[],unsupported:[]});
}
export function initialRange(cursor,total){const start=Math.max(0,Math.min(cursor,total-.02));return {start,end:Math.min(total,start+8)};}
export function moveRange(range,delta,total){const length=range.end-range.start,start=Math.max(0,Math.min(total-length,range.start+delta));return {start,end:start+length};}
