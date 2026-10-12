import {applyPlan,validatePlan} from '../src/project.mjs';
import {refinementTimes} from './local.mjs';
export async function refineVisualPlan({project,prompt,frames,request,signal}){
 const check=()=>{if(signal?.aborted)throw new Error('Análise cancelada.');};check();
 const first=await request(frames,{phase:'overview'});check();
 if(first.plan.questions?.length||first.plan.unsupported?.length)return {...first,rounds:1};
 validatePlan(project,first.plan);applyPlan(project,first.plan);
 const dense=refinementTimes(project,first.plan,frames,60);
 if(!dense.length)return {...first,rounds:1};
 const refined=await request(dense,{phase:'refinement',preliminary:first.plan});check();
 if(!refined.plan.questions?.length&&!refined.plan.unsupported?.length){validatePlan(project,refined.plan);applyPlan(project,refined.plan);}
 const usage={};for(const result of [first,refined])for(const [k,v]of Object.entries(result.usage||{}))if(typeof v==='number')usage[k]=(usage[k]||0)+v;
 return {...refined,rounds:2,usage,refinementFrames:dense.length};
}
