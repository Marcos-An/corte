import {validateExportRange} from './export-range.mjs';
import {validateExportOutput} from './export-output.mjs';
export const EXPORT_BATCH_LIMIT=20;
export function validateExportJobs(project,jobs){
 if(!Array.isArray(jobs)||!jobs.length||jobs.length>EXPORT_BATCH_LIMIT)throw Error('Escolha de 1 a 20 trechos para exportar.');
 const ids=new Set();return Array.from(jobs,job=>{
  if(!job||typeof job!=='object'||Array.isArray(job)||!['id','name','start','end'].every(k=>k in job)||Object.keys(job).some(k=>!['id','name','start','end','exportOptions'].includes(k))||typeof job.id!=='string'||!/^[-A-Za-z0-9_]{1,64}$/.test(job.id)||ids.has(job.id))throw Error('Trecho da fila inválido.');
  if(typeof job.name!=='string'||!job.name.trim()||job.name.length>100||/[\u0000-\u001f\u007f]/.test(job.name))throw Error('Dê a cada vídeo um nome de até 100 caracteres.');
  ids.add(job.id);return {id:job.id,name:job.name.trim(),...validateExportRange(project,{start:job.start,end:job.end}),...validateExportOutput(job.exportOptions)};
 });
}
export function safeExportStem(name){
 let stem=name.normalize('NFKC').replace(/\.mp4$/i,'').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g,'-').replace(/\s+/g,' ').replace(/^[. ]+|[. ]+$/g,'');
 stem=Array.from(stem).slice(0,80).join('')||'Trecho';if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem))stem='Video-'+stem;return stem;
}
