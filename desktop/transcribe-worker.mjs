import {workerData,parentPort} from 'node:worker_threads';
import {recognizeSpeech} from './speech-recognition.mjs';
const abort=new AbortController();parentPort.on('message',m=>{if(m.cancel)abort.abort();});
let response;
try{response={result:(await recognizeSpeech(workerData,{signal:abort.signal,onProgress:progress=>parentPort.postMessage({progress})})).transcripts};}
catch(error){response={error:abort.signal.aborted?'Transcrição cancelada.':error.message};}
parentPort.postMessage(abort.signal.aborted?{error:'Transcrição cancelada.'}:response);
