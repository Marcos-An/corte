export const EXPORT_ASPECTS=['9:16','16:9','1:1','4:5'];
export const EXPORT_HEIGHTS=[720,1080,1440,2160];
export const EXPORT_FPS=[24,25,30,50,60];
export const EXPORT_QUALITIES=[{id:'compact',label:'Arquivo menor',crf:23},{id:'standard',label:'Equilibrada',crf:20},{id:'high',label:'Alta qualidade',crf:17}];
export function validateExportSettings({height=720,fps=30,quality='standard'}={}){
 if(!EXPORT_HEIGHTS.includes(height)||!EXPORT_FPS.includes(fps)||!EXPORT_QUALITIES.some(q=>q.id===quality))throw Error('Resolução, quadros por segundo ou qualidade inválidos.');
 return {height,fps,quality};
}
export const exportCrf=quality=>EXPORT_QUALITIES.find(q=>q.id===quality)?.crf??20;
export const exportAudioBitrate=quality=>quality==='compact'?'128k':quality==='high'?'256k':'192k';
export function validateExportOutput(output){
 if(output===undefined)return {};
 if(!output||typeof output!=='object'||Array.isArray(output)||!['aspect','height'].every(k=>k in output)||!Object.keys(output).every(k=>['aspect','height','fps','quality'].includes(k))||output.aspect!==null&&!EXPORT_ASPECTS.includes(output.aspect)||output.height!==null&&!EXPORT_HEIGHTS.includes(output.height)||output.fps!=null&&!EXPORT_FPS.includes(output.fps)||output.quality!=null&&!EXPORT_QUALITIES.some(q=>q.id===output.quality))throw Error('Formato, resolução, fps ou qualidade do trecho inválidos.');
 return Object.values(output).every(v=>v===null)?{}:{exportOptions:{...output}};
}
