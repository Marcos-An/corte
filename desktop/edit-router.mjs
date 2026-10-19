import {interpretIntent} from './intent.mjs';
import {requestHybridEdit} from './hybrid.mjs';
import {validatePlan,applyPlan} from '../src/project.mjs';
import {validateScopedPlan} from '../src/editor-experience.mjs';
// Resolve explicit edits without transcribing or decoding media. Content-based edits still need evidence.
export async function requestEditingPlan(options,{interpret=interpretIntent,hybrid=requestHybridEdit}={}){
 if(options.shareEvidence!==true)throw Error('Autorize o envio das evidências para esta análise.');
 if(options.signal?.aborted)throw Error('Análise cancelada.');
 if(options.stage!=null)return hybrid(options);
 options.onProgress?.({stage:'intent'});
 const intent=await interpret(options);
 if(options.signal?.aborted)throw Error('Análise cancelada.');
 if(intent?.route!=='edit_plan'||!intent.plan||intent.plan.questions?.length||intent.plan.unsupported?.length)return hybrid(options);
 validatePlan(options.project,intent.plan);validateScopedPlan(options.project,intent.plan,options.scopeClipId);applyPlan(options.project,intent.plan);
 return {plan:intent.plan,frames:0,mode:'hybrid',reviewRequired:true,pendingRequests:[],analysisWarnings:[],shared:{frames:0,transcriptWords:0},analysisRoute:'metadata'};
}
