const controller=new AbortController();let started=false;
process.on('message',async message=>{
 if(message?.cancel){controller.abort();return;}if(started||!message?.data)return;started=true;let response;
 try{const {trackRegionLocal}=await import('./tracking.mjs');response={result:await trackRegionLocal(message.data,{signal:controller.signal,onProgress:progress=>process.send?.({progress})})};}catch(error){response={error:controller.signal.aborted?'Acompanhamento cancelado.':error.message};}
 if(process.connected)process.send(response,error=>{process.disconnect();process.exit(error?1:0);});else process.exit(1);
});
