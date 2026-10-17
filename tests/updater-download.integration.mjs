// Real electron-updater + Electron HTTP. Fixture installer is NEVER executed.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
// Windows treats even an empty ELECTRON_RUN_AS_NODE as Node mode. Omit the variable entirely.
const electronEnv=Object.fromEntries(Object.entries(process.env).filter(([key])=>key!=='ELECTRON_RUN_AS_NODE'));
const require=createRequire(import.meta.url),{_electron}=require('playwright'),root=path.resolve(import.meta.dirname,'..'),dir=await mkdtemp(path.join(tmpdir(),'corte-updater-net-'));
const installMarker=path.join(dir,'install.json');
const binary=Buffer.from('MZ — inert updater test fixture'),sha512=createHash('sha512').update(binary).digest('base64');let corrupt=true,app,updateCache;
const server=createServer((req,res)=>{if(req.url?.includes('.exe')){res.end(corrupt?Buffer.from('modified bytes'):binary);return;}res.setHeader('Content-Type','text/yaml');res.end(JSON.stringify({version:'0.5.5',files:[{url:'Corte.Update.0.5.5.exe',sha512,size:binary.length}],path:'Corte.Update.0.5.5.exe',sha512,releaseDate:'2026-10-13T00:00:00Z'}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{
 const updaterEntry=require.resolve('electron-updater');
 await writeFile(path.join(dir,'package.json'),JSON.stringify({name:'corte-update-test',version:'0.5.4',main:'main.cjs'}));await writeFile(path.join(dir,'dev-app-update.yml'),'updaterCacheDirName: '+path.basename(dir)+'\n');
 await writeFile(path.join(dir,'main.cjs'),`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(dir,'profile'))});app.whenReady().then(async()=>{const {NsisUpdater}=require(${JSON.stringify(updaterEntry)});const {createUpdates}=await import(${JSON.stringify(new URL('../desktop/updates.mjs',import.meta.url).href)});const updater=new NsisUpdater({provider:'generic',url:${JSON.stringify('http://127.0.0.1:'+server.address().port)}});updater.forceDevUpdateConfig=true;updater.disableDifferentialDownload=true;updater.disableWebInstaller=true;updater.logger=null;let installs=0;updater.doInstall=options=>{installs++;require('node:fs').writeFileSync(${JSON.stringify(installMarker)},JSON.stringify(options));return true;};global.updateTest={updater,controller:createUpdates({updater,prepare:async()=>{},blocked:()=>global.updateTest?.blocked!==false}),blocked:true,installs:()=>installs};const window=new BrowserWindow({show:false});global.updateTest.window=window;global.updateTest.preventClose=true;window.on('close',e=>{if(global.updateTest.preventClose)e.preventDefault();});await window.loadURL('about:blank');});`);
 app=await _electron.launch({executablePath:require('electron'),args:[dir],env:electronEnv});await app.firstWindow();
 await app.evaluate(async()=>{await global.updateTest.controller.check();});
 assert.equal(await app.evaluate(()=>global.updateTest.controller.status().phase),'error','modified download must fail checksum');assert.equal(await app.evaluate(()=>global.updateTest.installs()),0);
 corrupt=false;await app.evaluate(async()=>{await global.updateTest.controller.check();});assert.equal(await app.evaluate(()=>global.updateTest.controller.status().phase),'ready');
 updateCache=await app.evaluate(()=>global.updateTest.updater.downloadedUpdateHelper.cacheDir);const file=await app.evaluate(()=>global.updateTest.updater.installerPath);assert.deepEqual(await readFile(file),binary);assert.equal(await app.evaluate(()=>{try{global.updateTest.controller.install();return false;}catch{return true;}}),true);assert.equal(await app.evaluate(()=>global.updateTest.installs()),0);
 await app.evaluate(()=>global.updateTest.window.close());assert.equal(await app.evaluate(()=>global.updateTest.window.isDestroyed()),false,'cancelled close keeps app open');assert.equal(await app.evaluate(()=>global.updateTest.installs()),0,'cancelled close must not install');
 await app.evaluate(()=>global.updateTest.preventClose=false);await app.close();app=null;
 assert.equal(require('node:fs').existsSync(installMarker),false,'ordinary quit must never install an update');
 app=await _electron.launch({executablePath:require('electron'),args:[dir],env:electronEnv});await app.firstWindow();
 await app.evaluate(async()=>{await global.updateTest.controller.check();});assert.equal(await app.evaluate(()=>global.updateTest.controller.status().phase),'ready');
 assert.equal(await app.evaluate(()=>{global.updateTest.blocked=false;return global.updateTest.controller.install();}),true);
 const options=JSON.parse(await readFile(installMarker,'utf8'));assert.equal(options.isSilent,true);assert.equal(options.isForceRunAfter,true);
 assert.equal(await app.evaluate(()=>global.updateTest.installs()),1);await app.evaluate(()=>global.updateTest.preventClose=false);await app.close();app=null;
 console.log('PASS real updater checksum rejection/retry, blocked restart, cancelled/ordinary quit without installation and explicit install/relaunch; installer boundary mocked');
}finally{if(app){await app.evaluate(()=>{global.updateTest.preventClose=false;global.updateTest.updater.autoInstallOnAppQuit=false;});await app.close();}if(updateCache)await rm(updateCache,{recursive:true,force:true});await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
