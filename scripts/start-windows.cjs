// Development only: use already installed model weights without copying authentication or changing the installed app.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
if(process.platform==='win32'&&env.APPDATA){
 const store=path.join(env.APPDATA,'Corte','models');
 for(const name of fs.existsSync(store)?fs.readdirSync(store):[]){
  const folder=path.join(store,name);let manifest;try{manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8'));}catch{continue;}
  if(!Array.isArray(manifest.files)||!manifest.files.every(f=>typeof f.path==='string'&&!f.path.includes('..')&&fs.existsSync(path.join(folder,f.path))))continue;
  if(manifest.model==='Xenova/clip-vit-base-patch32'&&manifest.files.some(f=>f.path.endsWith('/vision_model_quantized.onnx'))&&!env.CORTE_MODEL_PATH)env.CORTE_MODEL_PATH=folder;
  if(manifest.model==='Xenova/clip-vit-base-patch32'&&manifest.files.some(f=>f.path.endsWith('/text_model_quantized.onnx'))&&!env.CORTE_SEARCH_MODEL_PATH)env.CORTE_SEARCH_MODEL_PATH=folder;
  if(manifest.model==='onnx-community/whisper-large-v3-turbo_timestamped'&&!env.CORTE_SPEECH_MODEL_PATH)env.CORTE_SPEECH_MODEL_PATH=folder;
 }
}
const electron=require('electron'),child=spawn(electron,[root,...process.argv.slice(2)],{cwd:root,env,stdio:'inherit',windowsHide:false});
child.on('error',error=>{console.error('Não foi possível abrir o Corte:',error.message);process.exitCode=1;});
child.on('exit',code=>process.exitCode=code??1);
