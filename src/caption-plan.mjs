import {captionStyle,validateTranscript} from './captions.mjs';
export const CAPTION_PATCH_FIELDS=['font','size','color','accent','position','preset','positionX','positionY','width'];
export const captionTracks=(p,source)=>source==='narration'?(p.music||[]).filter(c=>c.role==='narration'):p.clips.filter(c=>!c.freeze);
export function applyCaptionAppearance(p,style,{allowNull=false}={}){
 if(style===null?!allowNull:!style||typeof style!=='object'||Array.isArray(style)||!Object.keys(style).length||Object.keys(style).some(k=>!CAPTION_PATCH_FIELDS.includes(k)))throw Error('Estilo de legenda inválido.');
 const q=structuredClone(p);q.captionStyle={...captionStyle(q.captionStyle),...style};
 if(style&&'position'in style&&!('positionY'in style))delete q.captionStyle.positionY;
 captionStyle(q.captionStyle);return q;
}
export function applyCaptionRequest(p,op,{allowUnprepared=false}={}){
 if(!['original','narration'].includes(op.source))throw Error('Fonte de legenda inválida.');
 const q=applyCaptionAppearance(p,op.style,{allowNull:true});q.captionSource=op.source;
 const used=new Set(captionTracks(q,op.source).map(c=>c.assetId)),assets=q.assets.filter(a=>used.has(a.id)&&a.hasAudio);
 if(op.transcripts===undefined&&allowUnprepared)return q;
 if(!assets.length)throw Error('A voz escolhida não tem áudio para gerar legendas.');
 if(op.transcripts===undefined)throw Error('Prepare as legendas localmente antes de aplicar a proposta.');
 if(!Array.isArray(op.transcripts)||op.transcripts.length!==assets.length||new Set(op.transcripts.map(t=>t?.assetId)).size!==assets.length)throw Error('Legendas preparadas incompletas.');
 for(const t of op.transcripts){const a=assets.find(a=>a.id===t?.assetId);if(!a||t.provider!=='local')throw Error('As legendas preparadas devem vir do reconhecimento local da voz escolhida.');validateTranscript(t,a.duration);}
 q.transcripts=[...(q.transcripts||[]).filter(t=>!assets.some(a=>a.id===t.assetId)),...structuredClone(op.transcripts)];
 for(const track of captionTracks(q,op.source))delete track.captionWords;
 return q;
}
// Provider requests describe the action; they never supply recognized text or timestamps.
export function assertCaptionProviderPlan(plan){
 if(Array.isArray(plan?.operations)&&plan.operations.some(op=>op?.type==='generate_captions'&&'transcripts'in op))throw Error('O planejador não pode fornecer transcrições para gerar legendas.');
 return plan;
}
