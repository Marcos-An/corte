// A native ONNX/driver failure terminates only this disposable process, not the editor.
const abort=new AbortController();let started=false;
process.on('message',async message=>{
 if(message?.cancel){abort.abort();return;}
 if(started||!message?.data)return;started=true;const data=message.data;
 let response;
 try{const {analyzeVisual}=await import('./local-worker.mjs');response={result:await analyzeVisual(data,{signal:abort.signal,onProgress:progress=>process.send?.({progress})})};}
 catch(error){response={error:abort.signal.aborted?'Análise cancelada.':error.message||'Não foi possível analisar as cenas.'};}
 if(process.connected)process.send(response,error=>{process.disconnect();process.exit(error?1:0);});else process.exit(1);
});
