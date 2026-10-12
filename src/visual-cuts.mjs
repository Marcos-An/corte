export function validateVisualDecision(value){
 if(!value||!['remove','keep','uncertain'].includes(value.decision)||typeof value.reason!=='string'||value.reason.length>2000)throw new Error('Decisão visual inválida.');
 return value;
}
// Samples describe temporal cells, including half-steps at each transition.
// Reject missing coverage: a partial scan is not a complete editable plan.
export function decisionsToRanges(samples,duration){
 if(!Number.isFinite(duration)||duration<=0||!Array.isArray(samples)||!samples.length||samples[0].time!==0||duration-samples.at(-1).time>.251)throw new Error('Análise sem cobertura completa.');
 for(let i=0;i<samples.length;i++){
  const s=samples[i];if(!Number.isFinite(s.time)||s.time<0||s.time>=duration||!['remove','keep','uncertain'].includes(s.decision)||(i&&(s.time<=samples[i-1].time||s.time-samples[i-1].time>.251)))throw new Error('Análise sem cobertura completa.');
  if(s.decision==='uncertain')throw new Error('Análise visual incerta. Nenhum corte foi aplicado.');
 }
 const ranges=[];for(let i=0;i<samples.length;i++)if(samples[i].decision==='remove'){
  const start=i?(samples[i-1].time+samples[i].time)/2:0,end=i<samples.length-1?(samples[i].time+samples[i+1].time)/2:duration;
  if(ranges.length&&Math.abs(ranges.at(-1)[1]-start)<1e-6)ranges.at(-1)[1]=end;else ranges.push([start,end]);
 }
 return ranges;
}
