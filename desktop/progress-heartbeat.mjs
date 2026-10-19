// Elapsed time is observable; completion percentage and ETA are not.
export function progressHeartbeat(event,onProgress,{now=()=>performance.now(),startTimer=setInterval,stopTimer=clearInterval}={}){
 const start=now(),id=startTimer(()=>{try{onProgress({...event,elapsedMs:Math.max(0,Math.round(now()-start))});}catch{}},1000);let stopped=false;
 return ()=>{if(!stopped){stopped=true;stopTimer(id);}};
}
