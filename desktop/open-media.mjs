import {randomUUID} from 'node:crypto';
// Restore the editable montage first. Only successfully validated files receive media URLs.
export function beginMediaHydration({assets,sources,register,onChange=()=>{}}){
 const controller=new AbortController(),state={id:randomUUID(),assets:assets.map(a=>({...a,url:null,thumbnail:null,missing:false,pending:true})),pending:assets.length,errors:[],canceled:false};let next=0;
 const changed=()=>onChange(structuredClone(state));
 async function worker(){
  while(!controller.signal.aborted&&next<assets.length){
   const index=next++,asset=assets[index],source=sources.find(s=>s.assetId===asset.id);let result;
   try{if(!source?.path)throw Error('Referência de mídia ausente.');result=await register(source.path,asset.id,asset,{signal:controller.signal});controller.signal.throwIfAborted();}
   catch(error){result={...asset,url:null,thumbnail:null,missing:true};if(!controller.signal.aborted)state.errors.push(`${asset.name}: ${error.message}`);}
   if(controller.signal.aborted)return;
   state.assets[index]={...result,pending:false};state.pending--;changed();
  }
 }
 const done=Promise.resolve().then(()=>Promise.all([worker(),worker()])).then(()=>{if(controller.signal.aborted){state.canceled=true;state.assets=state.assets.map(a=>a.pending?{...a,pending:false,missing:true,url:null,thumbnail:null}:a);state.pending=0;changed();}});
 return {state,done,cancel(){controller.abort();}};
}
