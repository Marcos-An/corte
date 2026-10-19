const {app,BrowserWindow,ipcMain,dialog,protocol,safeStorage,clipboard,screen,Menu,MenuItem}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
app.setName('Corte');
protocol.registerSchemesAsPrivileged([{scheme:'corte-media',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,corsEnabled:true}}]);
let window,registry=new Map(),abort=null,dirty=false,loginRunning=false;
let updates=null,updateTimer=null,activeOperations=0,rendererBusy=false;
let pendingProject=null,projectReady=false,activeProjectFile=null,savingProject=false,sourcePaths=new Map();
function projectArgument(argv){return argv.slice(1).find(file=>path.isAbsolute(file)&&file.toLowerCase().endsWith('.corte'));}
function deliverProject(){if(projectReady&&pendingProject&&window&&!window.isDestroyed()){window.show();window.focus();window.webContents.send('editor:open-project',pendingProject.token);}}
function requestProject(file){if(typeof file!=='string'||!path.isAbsolute(file)||!file.toLowerCase().endsWith('.corte'))return;pendingProject={file,token:crypto.randomUUID()};deliverProject();}
const primary=app.requestSingleInstanceLock();
if(!primary)app.quit();
app.on('second-instance',(_event,argv)=>requestProject(projectArgument(argv)));
app.on('open-file',(event,file)=>{event.preventDefault();requestProject(file);});
requestProject(projectArgument(process.argv));
if(primary)app.whenReady().then(async()=>{
 const {createSessionDiagnostics,diagnosticError}=await import('./session-diagnostics.mjs');
 const sessionLog=createSessionDiagnostics({directory:path.join(app.getPath('userData'),'diagnostics'),version:app.getVersion()});
 process.on('uncaughtExceptionMonitor',error=>sessionLog.record({event:'uncaught-exception',stage:'main',...diagnosticError(error)}));
 app.on('child-process-gone',(_event,details)=>sessionLog.record({event:'process-gone',stage:'main',processType:details.type,reason:details.reason,exitCode:details.exitCode}));
 app.on('will-quit',()=>sessionLog.close());

 const {saveRecording,microphoneAllowed}=await import('./recording.mjs');let microphoneArmedUntil=0;
 const core=await import('../src/project.mjs'),media=await import('./media.mjs'),ai=await import('./ai.mjs'),storage=await import('./storage.mjs'),stream=await import('./stream.mjs');
 const cache=path.join(app.getPath('userData'),'cache'),home=path.join(app.getPath('userData'),'chatgpt');await fs.mkdir(cache,{recursive:true});
 const {keyStore}=await import('./credentials.mjs'),{captionEstimate,transcribeCloud}=await import('./cloud-captions.mjs');
 const keys=keyStore(path.join(app.getPath('userData'),'openai-key.enc'),safeStorage);
 const subtitleFiles=await import('../src/subtitle-files.mjs');
 handler('subtitle-import',async()=>{
  const picked=await dialog.showOpenDialog(window,{title:'Importar legendas',properties:['openFile'],filters:[{name:'Legendas SRT / WebVTT',extensions:['srt','vtt']}]});
  if(picked.canceled)return null;
  const file=picked.filePaths[0],stat=await fs.stat(file);if(stat.size>2*1024*1024)throw Error('O arquivo de legendas deve ter até 2 MB.');
  const text=await fs.readFile(file,'utf8');subtitleFiles.parseSubtitles(text);return text;
 });
 handler('subtitle-export',async(project,format)=>{
  const text=subtitleFiles.exportSubtitles(project,format);
  const picked=await dialog.showSaveDialog(window,{title:'Exportar legendas',defaultPath:`Legendas.${format}`,filters:[{name:format==='vtt'?'WebVTT':'SubRip',extensions:[format]}]});
  if(picked.canceled)return false;
  const file=picked.filePath.toLowerCase().endsWith('.'+format)?picked.filePath:picked.filePath+'.'+format;
  await fs.writeFile(file,text,'utf8');return true;
 });
 const {createDiagnostics}=await import('./diagnostics.mjs'),{beginMediaHydration}=await import('./open-media.mjs');
 const diagnostics=createDiagnostics(path.join(app.getPath('userData'),'diagnostics','performance.jsonl'));let hydration=null,ensureModels=async()=>{};
 async function timed(stage,fn){const started=performance.now();try{const value=await fn();diagnostics.record({stage,elapsedMs:performance.now()-started,outcome:'ok'});return value;}catch(error){diagnostics.record({stage,elapsedMs:performance.now()-started,outcome:'error'});throw error;}}
 function notify(p){if(p.stage==='worker-diagnostic')return;if(window && !window.isDestroyed())window.webContents.send('editor:progress',p);}
 function expose(a,entry=registry.get(a.id)){return {...a,url:entry?`corte-media://local/${entry.token}/video`:null,thumbnail:entry?.thumbnail?`corte-media://local/${entry.token}/thumb`:null,missing:!entry};}
 function authorized(p){core.validateProject(p);for(const a of p.assets){const r=registry.get(a.id);if(!r){if(hydration?.state.assets.some(s=>s.id===a.id&&s.pending))throw Error(`Ainda validando ${a.name}. Aguarde a validação da mídia.`);throw new Error(`Mídia ausente: ${a.name}. Relocalize o arquivo.`);}for(const key of ['duration','width','height','hasAudio','kind'])if((key==='kind'?(a[key]||'video'):a[key])!==(key==='kind'?(r.asset[key]||'video'):r.asset[key]))throw new Error('Os dados da mídia não correspondem ao arquivo importado.');}return p;}
 function handler(name,fn){ipcMain.handle(`editor:${name}`,async(event,...args)=>{
   if(event.sender!==window?.webContents || event.senderFrame!==window.webContents.mainFrame)return {ok:false,error:'Origem não autorizada.'};
   const blocking=!['dirty','busy','ready','update-status','update-check','update-install','status','api-status','cancel','speech-model','speech-model-install'].includes(name);
   if(blocking)activeOperations++;
   try{return {ok:true,value:await fn(...args)};}catch(error){return {ok:false,error:error.message || 'Não foi possível concluir.'};}finally{if(blocking)activeOperations--;}
 });}
 const {createMediaRegistration}=await import('./import-media.mjs');
 const registration=createMediaRegistration({cache,probe:media.probe,frame:media.frame,onProgress:notify,onTiming:event=>diagnostics.record(event),onWarning:message=>notify({stage:'media-warning',message})});
 app.on('before-quit',()=>{hydration?.cancel();registration.cancelThumbnails();});
 async function mediaOperation(fn){
  if(abort||savingProject)throw Error('Aguarde a operação atual.');const controller=new AbortController();abort=controller;
  try{return await fn(controller.signal);}finally{if(abort===controller)abort=null;}
 }
 async function register(file,assetId,expected,{signal,target=registry}={}){
  const entry=await registration.register(file,{assetId,expected,signal});signal?.throwIfAborted();target.set(entry.asset.id,entry);return expose(entry.asset,entry);
 }
 protocol.handle('corte-media',async request=>{
   const url=new URL(request.url),parts=url.pathname.split('/').filter(Boolean);
   if(url.hostname==='fonts'){const name=url.pathname.slice(1);if(!/^[A-Za-z0-9]+-Regular\.ttf$/.test(name))return new Response('Not found',{status:404});const font=app.isPackaged?path.join(process.resourcesPath,'fonts',name):path.join(__dirname,'../vendor/fonts',name);try{return await stream.fileResponse(font,request);}catch{return new Response('Not found',{status:404});}}
   const entry=[...registry.values()].find(r=>r.token===parts[0]);if(url.hostname!=='local' || !entry || !['video','thumb'].includes(parts[1]) || parts.length!==2)return new Response('Not found',{status:404});
   try{if(parts[1]==='thumb'&&entry.thumbnailReady&&!await entry.thumbnailReady)return new Response('Thumbnail unavailable',{status:404});return await stream.fileResponse(parts[1]==='video'?entry.path:entry.thumbnail,request);}catch{return new Response('Media unavailable',{status:404});}
 });
 const musicProvider=await import('./music.mjs');let musicAbort=null;
 handler('music-search',(query,kind)=>musicProvider.searchMusic(query,kind));
 handler('music-replay',id=>musicProvider.replay(id));
 handler('music-cancel',()=>{musicAbort?.abort();return null;});
 handler('music-prepare',async(id)=>{musicAbort?.abort();const job=new AbortController();musicAbort=job;try{const file=await musicProvider.prepareMusic(id,path.join(cache,'music-preview'),job.signal);job.signal.throwIfAborted();return await register(file);}finally{if(musicAbort===job)musicAbort=null;}});
 handler('music-adopt',async(id)=>{const r=registry.get(id);if(!r||r.asset.kind!=='audio')throw Error('Música não preparada.');const dir=path.join(app.getPath('userData'),'music');await fs.mkdir(dir,{recursive:true});const out=path.join(dir,`${id}.m4a`);if(path.resolve(r.path)!==path.resolve(out))await fs.copyFile(r.path,out);r.path=out;return expose(r.asset);});
 handler('import',async(kind)=>mediaOperation(async signal=>{
   const picked=await dialog.showOpenDialog(window,{title:kind==='video-layer'?'Adicionar vídeo sobreposto':kind==='image'?'Adicionar imagem':'Adicionar mídias à timeline',properties:['openFile','multiSelections'],filters:[{name:kind==='image'?'Imagem':'Mídia',extensions:kind==='video-layer'?['mp4','mov','mkv','webm','m4v','avi']:kind==='image'?['png','jpg','jpeg','webp']:['mp4','mov','mkv','webm','m4v','avi','mp3','m4a','wav','ogg','flac','aac','png','jpg','jpeg','webp']}]});
   if(picked.canceled)return {assets:[],errors:[]};const assets=[],errors=[],staged=new Map();
   for(const file of picked.filePaths.slice(0,100)){try{if(kind==='video-layer'&&!/\.(mp4|mov|mkv|webm|m4v|avi)$/i.test(file))throw Error('Escolha um vídeo.');if(kind==='image'&&!/\.(png|jpe?g|webp)$/i.test(file))throw Error('Escolha uma imagem PNG, JPEG ou WebP.');const a=await register(file,undefined,undefined,{signal,target:staged});if(kind==='video-layer'&&a.kind!==undefined&&a.kind!=='video')throw Error('Escolha um arquivo com vídeo.');assets.push(a);}catch(e){if(signal.aborted)throw Error('Importação cancelada.');errors.push(`${path.basename(file)}: ${e.message}`);}}signal.throwIfAborted();for(const a of assets)registry.set(a.id,staged.get(a.id));return {assets,errors};
 }));
 handler('relink',async asset=>mediaOperation(async signal=>{
   core.validateProject({...core.createProject(),assets:[asset]});
   const picked=await dialog.showOpenDialog(window,{title:`Localizar ${asset.name}`,properties:['openFile'],filters:[{name:asset.kind==='image'?'Imagem':'Mídia',extensions:asset.kind==='image'?['png','jpg','jpeg','webp']:['mp4','mov','mkv','webm','m4v','avi','mp3','m4a','wav','ogg','flac','aac','png','jpg','jpeg','webp']}]});
   return picked.canceled?null:register(picked.filePaths[0],asset.id,asset,{signal});
 }));
 handler('save',async(p,history,mode='save')=>{
   if(!['save','as','portable'].includes(mode))throw Error('Modo de salvamento inválido.');
   if(abort||savingProject)throw Error('Aguarde a operação atual.');
   core.validateProject(p);savingProject=true;
   try{
    const sources=new Map([...sourcePaths].map(([id,file])=>[id,{path:file}]));for(const [id,entry] of registry)sources.set(id,entry);
    const name=p.name.replace(/[<>:"/\\|?*]/g,'_').trim()||'Projeto';
    if(mode==='portable'){
     if(hydration?.state.pending)throw Error('Aguarde a validação das mídias antes de criar uma cópia portátil.');
     const picked=await dialog.showOpenDialog(window,{title:'Escolha onde criar a cópia portátil (inclui as mídias)',properties:['openDirectory','createDirectory']});if(picked.canceled)return null;
     const folder=path.join(picked.filePaths[0],`${name}-portatil-${crypto.randomUUID().slice(0,8)}`);
     const file=await storage.savePortableProject(folder,p,registry,history);return {name:path.basename(folder),file,portable:true};
    }
    let file=mode==='save'?activeProjectFile:null;
    if(!file){
     const picked=await dialog.showSaveDialog(window,{title:mode==='as'?'Salvar projeto como…':'Salvar projeto editável',defaultPath:activeProjectFile||`${name}.corte`,filters:[{name:'Projeto Corte',extensions:['corte']}]});if(picked.canceled)return null;
     file=picked.filePath;if(!path.extname(file))file+='.corte';
     if(file!==picked.filePath){
      const exists=await fs.stat(file).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;});
      if(exists){const choice=await dialog.showMessageBox(window,{type:'warning',buttons:['Cancelar','Substituir'],defaultId:0,cancelId:0,message:`O arquivo ${path.basename(file)} já existe. Substituir?`});if(choice.response!==1)return null;}
     }
    }
    await storage.saveProjectFile(file,p,sources,history);activeProjectFile=file;dirty=false;return {name:path.basename(file),file};
   }finally{savingProject=false;}
 });
 handler('ready',()=>{projectReady=true;deliverProject();return null;});
 handler('open',async token=>mediaOperation(async signal=>{
   let file;
   if(token){if(token!==pendingProject?.token)throw new Error('Solicitação de abertura inválida.');file=pendingProject.file;pendingProject=null;}
   else{const picked=await dialog.showOpenDialog(window,{title:'Abrir projeto',properties:['openFile'],filters:[{name:'Projeto Corte',extensions:['corte']}]});if(picked.canceled)return null;file=picked.filePaths[0];}
   const data=await timed('project-read',()=>storage.readProjectFile(file));signal.throwIfAborted();
   const savedAssets=[...new Map((data.history?data.history.entries.flatMap(e=>e.state.assets):data.project.assets).map(a=>[a.id,a])).values()];
   hydration?.cancel();registration.cancelThumbnails();registry=new Map();const staged=registry;let session;
   session=beginMediaHydration({assets:savedAssets,sources:data.sources,register:(file,id,expected,options)=>register(file,id,expected,{...options,target:staged}),onChange:state=>{
    if(hydration!==session||window.isDestroyed())return;window.webContents.send('editor:media-state',state);
    if(!state.pending&&updates?.status().phase==='waiting')void updates.check();
   }});hydration=session;
   activeProjectFile=file;sourcePaths=new Map(data.sources.map(s=>[s.assetId,s.path]));dirty=false;return {project:data.project,history:data.history,assets:session.state.assets,file,hydrationId:session.state.id};
 }));
 handler('media-state',id=>hydration?.state.id===id?hydration.state:null);
 handler('cancel-media',id=>{if(hydration?.state.id!==id)throw Error('Validação de outro projeto.');hydration.cancel();return true;});
 handler('preview-timing',elapsedMs=>{if(Number.isFinite(elapsedMs)&&elapsedMs>=0&&elapsedMs<=180000)diagnostics.record({stage:'preview-load',elapsedMs,outcome:'ok'});return true;});
 handler('diagnostic-status',()=>sessionLog.status());
 handler('diagnostic-error',error=>{sessionLog.record({event:'renderer-error',stage:'renderer',...diagnosticError(error)});return true;});
 handler('diagnostic-export',async()=>{const picked=await dialog.showSaveDialog(window,{title:'Exportar diagnóstico local',defaultPath:`Corte-diagnostico-${new Date().toISOString().slice(0,10)}.json`,filters:[{name:'Diagnóstico JSON',extensions:['json']}]});if(picked.canceled)return false;const file=/\.json$/i.test(picked.filePath)?picked.filePath:picked.filePath+'.json';await fs.writeFile(file,sessionLog.export(),{mode:0o600});return true;});
 handler('performance-diagnostics',async()=>{const text=await diagnostics.read();clipboard.writeText(`Corte ${app.getVersion()} · ${process.platform}\n${text||'Sem medições disponíveis.'}`);return true;});
 handler('export',async(p,height,range=null)=>{
   authorized(p);if(abort)throw new Error('Já há uma operação em andamento.');
   const {validateExportRange}=await import('../src/export-range.mjs');validateExportRange(p,range);media.dimensions(p.aspect,height);
   const picked=await dialog.showSaveDialog(window,{title:'Exportar vídeo',defaultPath:`${p.name.replace(/[<>:"/\\|?*]/g,'_')}${range?'-trecho':''}.mp4`,filters:[{name:'Vídeo MP4',extensions:['mp4']}]});if(picked.canceled)return null;
   if(!/\.mp4$/i.test(picked.filePath))throw new Error('Use a extensão .mp4.');
   abort=new AbortController();try{return await media.renderProject(p,registry,picked.filePath,{height,range,signal:abort.signal,onProgress:notify});}finally{abort=null;}
 });
 handler('status',async()=>({...await ai.loginStatus(home),platform:process.platform}));
 // Accurate speech recognition is an optional ~1.1 GB download; recognition verifies every checksum before using it.
 const speechManifest=JSON.parse(await fs.readFile(path.join(__dirname,'../vendor/models/speech-accurate-manifest.json'),'utf8'));
 const searchManifest=JSON.parse(await fs.readFile(path.join(__dirname,'../vendor/models/search-manifest.json'),'utf8'));
 {const {modelStorePath}=await import('./models-store.mjs'),stored=modelStorePath(app.getPath('userData'),searchManifest);if(require('node:fs').existsSync(path.join(stored,'manifest.json')))process.env.CORTE_SEARCH_MODEL_PATH=stored;}
 let searchInstall=null;
 handler('search-model',async()=>({installed:!!await (await import('./local.mjs')).searchModels(),installing:!!searchInstall}));
 handler('search-model-install',async()=>{
  searchInstall??=(async()=>{const {installOptionalModel}=await import('./models-store.mjs');process.env.CORTE_SEARCH_MODEL_PATH=await installOptionalModel({manifest:searchManifest,userData:app.getPath('userData'),onProgress:p=>{if(!window.isDestroyed())window.webContents.send('editor:search-model',p);}});return {installed:true};})().finally(()=>{searchInstall=null;});
  return searchInstall;
 });
 {const {modelStorePath}=await import('./models-store.mjs'),stored=modelStorePath(app.getPath('userData'),speechManifest);if(require('node:fs').existsSync(path.join(stored,'manifest.json')))process.env.CORTE_SPEECH_MODEL_PATH=stored;}
 let speechInstall=null;
 handler('speech-model',async()=>({installed:!!await (await import('./transcribe.mjs')).readyAccurateSpeechModel(),installing:!!speechInstall,sizeMB:Math.round(1085)}));
 handler('speech-model-install',async()=>{
  speechInstall??=(async()=>{const {installOptionalModel}=await import('./models-store.mjs');process.env.CORTE_SPEECH_MODEL_PATH=await installOptionalModel({manifest:speechManifest,userData:app.getPath('userData'),onProgress:p=>{if(!window.isDestroyed())window.webContents.send('editor:speech-model',p);}});return {installed:true};})().finally(()=>{speechInstall=null;});
  return speechInstall;
 });
 handler('login',async()=>{if(loginRunning)throw new Error('O login já está aberto no navegador.');loginRunning=true;try{await ai.startLogin(home);return ai.loginStatus(home);}finally{loginRunning=false;}});
 handler('analyze',async(p,prompt,step,clipId=null,engine='chatgpt',shareEvidence=false,stage=null)=>{
  if(stage!==null&&(engine!=='hybrid'||![1,2,3].includes(stage)))throw Error('Etapa de edição inválida.');
  core.validateProject(p);const {scopeProject,validateScopedPlan}=await import('../src/editor-experience.mjs');const scoped=scopeProject(p,clipId);authorized(scoped);if(!['hybrid','chatgpt'].includes(engine))throw Error('Motor de IA inválido.');if(engine==='hybrid'&&shareEvidence!==true)throw Error('Autorize o envio das evidências para esta análise.');if(abort)throw Error('Já há uma operação em andamento.');abort=new AbortController();
  const diagnosticOperation=sessionLog.begin();const diagnosticTimer=setInterval(()=>sessionLog.heartbeat(),5000);diagnosticTimer.unref();let outcome='ok';
  try{await ensureModels();const options={home,cache,project:scoped,scopeClipId:clipId,prompt,step,registry,signal:abort.signal,onProgress:p=>{sessionLog.progress(p,diagnosticOperation);notify(p);},shareEvidence,stage};
   const result=engine==='hybrid'?await (await import('./edit-router.mjs')).requestEditingPlan(options):await (await import('./intent.mjs')).requestPromptPlan(options);validateScopedPlan(p,result.plan,clipId);return await (await import('./caption-proposal.mjs')).prepareCaptionProposal(options,result);
  }catch(error){outcome=abort?.signal.aborted?'canceled':'error';sessionLog.failure(error);throw error;}finally{clearInterval(diagnosticTimer);sessionLog.end(outcome);abort=null;}
 });
 handler('api-status',async()=>({configured:!!await keys.read()}));
 handler('api-save',async key=>{if(abort)throw new Error('Aguarde a operação atual.');await keys.save(key);return {configured:true};});
 handler('api-clipboard',async()=>{if(abort)throw new Error('Aguarde a operação atual.');await keys.save(clipboard.readText());return {configured:true};});
 handler('api-remove',async()=>{if(abort)throw new Error('Aguarde a operação atual.');await keys.remove();return {configured:false};});
 handler('caption-estimate',p=>{authorized(p);return captionEstimate(p);});
 handler('transcribe-local',async p=>{authorized(p);return mediaOperation(async signal=>{
  const operation=sessionLog.begin(),timer=setInterval(()=>sessionLog.heartbeat(),5000);timer.unref();let outcome='ok';
  try{await ensureModels();return await (await import('./local-captions.mjs')).generateLocalCaptions({project:p,registry,cache,signal,onProgress:event=>{sessionLog.progress(event,operation);notify(event);}});}
  catch(error){outcome=signal.aborted?'canceled':'error';sessionLog.failure(error);throw error;}
  finally{clearInterval(timer);sessionLog.end(outcome);}
 });});
 handler('transcribe',async(p)=>{authorized(p);if(abort)throw new Error('Já há uma operação em andamento.');const key=await keys.read();abort=new AbortController();try{return await transcribeCloud({project:p,registry,key,cache,signal:abort.signal,onProgress:notify});}finally{abort=null;}});
 handler('cancel',()=>{abort?.abort();return true;});
 handler('recording-arm',()=>{if(abort)throw Error('Aguarde a operação atual.');microphoneArmedUntil=Date.now()+15000;return true;});
 handler('recording-disarm',()=>{microphoneArmedUntil=0;return true;});
 handler('recording-save',async(bytes,mime)=>{if(abort)throw Error('Aguarde a operação atual.');const file=await saveRecording(bytes,mime,path.join(app.getPath('userData'),'narrations'));try{return await register(file);}catch(e){await fs.rm(file,{force:true});throw e;}});
 handler('busy',value=>{rendererBusy=value===true;if(!rendererBusy&&updates?.status().phase==='waiting')void updates.check();return true;});
 handler('dirty',value=>{dirty=value===true;return true;});
 handler('update-status',()=>updates?.status()||{phase:'unavailable',platform:process.platform,installedVersion:app.getVersion()});
 handler('update-check',()=>{if(!updates)throw Error('Atualizações automáticas estão disponíveis no Corte instalado para Windows.');return updates.check();});
 handler('update-install',()=>{if(!updates)throw Error('Atualização automática indisponível.');return updates.install();});
 const workArea=screen.getPrimaryDisplay().workArea;
 window=new BrowserWindow({width:Math.min(1400,workArea.width),height:Math.min(960,workArea.height),minWidth:Math.min(960,workArea.width),minHeight:Math.min(680,workArea.height),backgroundColor:'#101113',title:'Corte — Editor de vídeo',show:false,autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 window.webContents.on('render-process-gone',(_event,details)=>sessionLog.record({event:'process-gone',stage:'renderer',processType:'renderer',reason:details.reason,exitCode:details.exitCode}));
 const menu=Menu.getApplicationMenu(),fileMenu=menu?.items.find(item=>item.role==='filemenu');
 if(fileMenu){fileMenu.submenu.insert(0,new MenuItem({id:'open-project',label:'Abrir projeto…',accelerator:'CmdOrCtrl+O',click:()=>window.webContents.send('editor:open-project')}));for(const [index,label,mode] of [[1,'Salvar','save'],[2,'Salvar como…','as'],[3,'Salvar cópia portátil…','portable']])fileMenu.submenu.insert(index,new MenuItem({label,click:()=>window.webContents.send('editor:save-project',mode)}));fileMenu.submenu.insert(4,new MenuItem({type:'separator'}));Menu.setApplicationMenu(menu);}
 window.webContents.on('before-input-event',(event,input)=>{if(input.type==='keyDown'&&(input.control||input.meta)&&input.key.toLowerCase()==='o'){event.preventDefault();window.webContents.send('editor:open-project');}});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());
 window.webContents.session.setPermissionRequestHandler((contents,permission,cb,details)=>{
  const allowed=contents===window.webContents&&microphoneAllowed(permission,details,Date.now()<microphoneArmedUntil);cb(allowed);
 });
 window.webContents.session.setPermissionCheckHandler((contents,permission,origin,details)=>contents===window.webContents&&permission==='media'&&details.mediaType==='audio'&&details.isMainFrame===true&&Date.now()<microphoneArmedUntil);
 window.on('close',event=>{if(savingProject){event.preventDefault();dialog.showMessageBoxSync(window,{type:'info',buttons:['Aguardar'],message:'Aguarde o salvamento ou a cópia das mídias antes de fechar o projeto.'});return;}if(abort || dirty){const choice=dialog.showMessageBoxSync(window,{type:'question',buttons:['Continuar editando','Fechar sem salvar'],defaultId:0,cancelId:0,title:'Fechar projeto?',message:abort?'Uma operação está em andamento. Fechar irá cancelá-la.':'Há alterações não salvas. Deseja fechar mesmo assim?'});if(choice===0)event.preventDefault();else abort?.abort();}});
 if(app.isPackaged&&process.platform==='win32'){
  const {createUpdates}=await import('./updates.mjs'),{preserveModels,modelStorePath}=await import('./models-store.mjs');
  const manifest=JSON.parse(await fs.readFile(path.join(__dirname,'../vendor/models/manifest.json'),'utf8'));
  process.env.CORTE_MODEL_PATH=modelStorePath(app.getPath('userData'),manifest);
  const {autoUpdater}=require('electron-updater');autoUpdater.logger=null;autoUpdater.disableWebInstaller=true;
  let modelsReady;ensureModels=()=>{if(!modelsReady)modelsReady=timed('models',async()=>{process.env.CORTE_MODEL_PATH=await preserveModels({bundled:path.join(process.resourcesPath,'models'),userData:app.getPath('userData'),manifest});
   // Optional visual-search encoder: a code-only update may not carry it; search then stays off.
   try{const search=JSON.parse(await fs.readFile(path.join(__dirname,'../vendor/models/search-manifest.json'),'utf8'));process.env.CORTE_SEARCH_MODEL_PATH=await preserveModels({bundled:path.join(process.resourcesPath,'models'),userData:app.getPath('userData'),manifest:search});}catch{}}).catch(error=>{modelsReady=null;throw error;});return modelsReady;};
  updates=createUpdates({updater:autoUpdater,installedVersion:app.getVersion(),prepare:ensureModels,busy:()=>savingProject||!!abort||rendererBusy||activeOperations>0||!!hydration?.state.pending,blocked:()=>dirty||savingProject||!!abort||rendererBusy||activeOperations>0||microphoneArmedUntil>Date.now(),notify:state=>{if(!window.isDestroyed())window.webContents.send('editor:update',state);}});
 }
 await window.loadFile(path.join(__dirname,'../src/index.html'));window.show();
 if(updates){void updates.check();updateTimer=setInterval(()=>void updates.check(),6*60*60*1000);updateTimer.unref();}
}).catch(error=>{dialog.showErrorBox('Não foi possível iniciar o Corte',error.message);app.quit();});
app.on('window-all-closed',()=>{clearInterval(updateTimer);app.quit();});
