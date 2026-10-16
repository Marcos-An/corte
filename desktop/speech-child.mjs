// The accurate speech model may run on a GPU driver; a native crash ends only this disposable process.
const abort=new AbortController();let started=false;
process.on('message',async message=>{
 if(message?.cancel){abort.abort();return;}
 if(started||!message?.data)return;started=true;let response;
 try{const {recognizeSpeech}=await import('./speech-recognition.mjs');response={result:await recognizeSpeech(message.data,{signal:abort.signal,onProgress:progress=>process.send?.({progress})})};}
 catch(error){response={error:abort.signal.aborted?'Transcrição cancelada.':error.message||'Não foi possível transcrever.'};}
 if(process.connected)process.send(response,error=>{process.disconnect();process.exit(error?1:0);});else process.exit(1);
});
