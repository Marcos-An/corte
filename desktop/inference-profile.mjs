import {availableParallelism} from 'node:os';
// DirectML requires sequential execution and disabled memory patterns. CPU fallbacks use a bounded thread pool.
export function inferenceOptions(device,{cores=availableParallelism()}={}){
 return {dtype:'q8',device,local_files_only:true,session_options:device==='dml'
  ?{executionMode:'sequential',enableMemPattern:false}
  :{intraOpNumThreads:Math.max(1,Math.min(6,Math.floor(cores/2))),interOpNumThreads:1}};
}
// CLIP q8 currently crashes the DirectML runtime on Windows (including RTX 3060).
// Speech has a different graph and retains its own accelerated profile.
export function visualBackend(platform=process.platform){return platform==='darwin'?'coreml':'cpu';}
