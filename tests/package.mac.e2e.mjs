import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {_electron as electron} from 'playwright';
import {run,binaries} from '../desktop/media.mjs';
const root=path.resolve(import.meta.dirname,'..'),exe=path.join(process.env.CORTE_TEST_APP||path.join(root,'release/mac-arm64/Corte.app'),'Contents/MacOS/Corte'),dir=await mkdtemp(path.join(tmpdir(),'corte-package-'));let app;
try{
 const file=path.join(dir,'fixture.mp4');await run(binaries().ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=320x240:rate=24','-t','3','-c:v','libx264','-pix_fmt','yuv420p',file]);
 app=await electron.launch({executablePath:exe,args:[`--user-data-dir=${path.join(dir,'clean-profile')}`],env:{...process.env,ELECTRON_RUN_AS_NODE:''}});const page=await app.firstWindow();await page.getByRole('button',{name:'Importar vídeos',exact:true}).waitFor();
 await app.evaluate(({dialog,session},file)=>{session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_,cb)=>cb({cancel:true}));dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);
 await page.getByRole('button',{name:'Importar vídeos',exact:true}).click();await page.getByRole('button',{name:'Adicionar fixture.mp4 à timeline'}).click();await page.waitForFunction(()=>document.querySelector('video').readyState>=2);
 const report=await app.evaluate(async({app},{file,dir})=>{
  const {scanLocally}=process.mainModule.require(app.getAppPath()+'/desktop/local.mjs');
  const project={version:1,name:'Offline',aspect:'1:1',assets:[{id:'test',name:'Fixture',duration:3,width:320,height:240,hasAudio:false}],clips:[{id:'clip',assetId:'test',in:0,out:3,volume:1,crop:{x:0,y:0,w:1,h:1}}]};
  const result=await scanLocally({project,registry:new Map([['test',{path:file}]]),directory:dir,step:2});return {local:result.report,resources:process.resourcesPath};
 },{file,dir});assert.ok(report.local.assets[0].localFrames>=5);assert.ok(report.resources.includes('Corte.app'));assert.equal(await page.locator('#consent-dialog').count(),0);
 await writeFile(path.resolve(import.meta.dirname,'../../validacao-pacote-mac.json'),JSON.stringify(report,null,2));await page.evaluate(()=>window.editor.setDirty(false));console.log('PASS MAC PACKAGED: clean profile, embedded native probe/import/playback, bundled model inference offline in Electron worker.');
}finally{if(app){await app.evaluate(({dialog})=>{dialog.showMessageBoxSync=()=>1;});await app.close();}await rm(dir,{recursive:true,force:true});}
