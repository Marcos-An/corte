// Opt-in: two locally built NSIS update packages. Never executes either installer.
import assert from 'node:assert/strict';
import path from 'node:path';
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,stat,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{_electron}=require('playwright');
const old=process.env.CORTE_TEST_OLD_UPDATE,next=process.env.CORTE_TEST_NEW_UPDATE;
if(!old||!next)throw Error('Informe CORTE_TEST_OLD_UPDATE e CORTE_TEST_NEW_UPDATE com dois pacotes NSIS locais.');
const version=f=>path.basename(f).match(/^Corte\.Update\.(\d+\.\d+\.\d+)\.exe$/)?.[1];assert.ok(version(old)&&version(next));
const hash=createHash('sha512');for await(const b of createReadStream(next))hash.update(b);const sha512=hash.digest('base64'),size=(await stat(next)).size;
const files=new Map([[path.basename(old)+'.blockmap',old+'.blockmap'],[path.basename(next)+'.blockmap',next+'.blockmap'],[path.basename(next),next]]);
let downloadedBytes=0,rangeRequests=0,app,cache;const dir=await mkdtemp(path.join(tmpdir(),'corte-delta-'));
const server=createServer(async(req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname.slice(1),file=files.get(name);
 if(!file){if(!name.endsWith('.yml')){res.statusCode=404;res.end();return;}res.end(JSON.stringify({version:version(next),files:[{url:path.basename(next),sha512,size}],path:path.basename(next),sha512}));return;}
 const length=(await stat(file)).size;res.setHeader('Accept-Ranges','bytes');let start=0,end=length-1;
 if(req.headers.range){const m=/^bytes=(\d+)-(\d+)$/.exec(req.headers.range);if(!m||Number(m[1])>Number(m[2])||Number(m[2])>=length){res.statusCode=416;res.end();return;}start=Number(m[1]);end=Number(m[2]);rangeRequests++;res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${length}`);}
 if(name.endsWith('.exe'))downloadedBytes+=end-start+1;res.setHeader('Content-Length',end-start+1);createReadStream(file,{start,end}).pipe(res);
});await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{
 await writeFile(path.join(dir,'package.json'),JSON.stringify({name:'corte-delta-test',version:version(old),main:'main.cjs'}));await writeFile(path.join(dir,'dev-app-update.yml'),'updaterCacheDirName: '+path.basename(dir)+'\n');
 await writeFile(path.join(dir,'main.cjs'),`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(dir,'profile'))});app.whenReady().then(async()=>{const {NsisUpdater}=require(${JSON.stringify(require.resolve('electron-updater'))});const updater=new NsisUpdater({provider:'generic',url:${JSON.stringify('http://127.0.0.1:'+server.address().port)},useMultipleRangeRequest:false});updater.forceDevUpdateConfig=true;updater.autoInstallOnAppQuit=false;updater.disableWebInstaller=true;updater.logger=null;global.updater=updater;const window=new BrowserWindow({show:false});await window.loadURL('about:blank');});`);
 app=await _electron.launch({executablePath:require('electron'),args:[dir],env:{...process.env,ELECTRON_RUN_AS_NODE:''}});await app.firstWindow();cache=await app.evaluate(async()=>{const h=await global.updater.getOrCreateDownloadHelper();return h.cacheDir;});
 await mkdir(cache,{recursive:true});await copyFile(old,path.join(cache,require('builder-util-runtime').CURRENT_APP_INSTALLER_FILE_NAME));
 await app.evaluate(async()=>{const result=await global.updater.checkForUpdates();await result.downloadPromise;});
 const file=await app.evaluate(()=>global.updater.installerPath),actual=createHash('sha512');for await(const b of createReadStream(file))actual.update(b);assert.equal(actual.digest('base64'),sha512);assert.ok(rangeRequests>0);assert.ok(downloadedBytes<size,'differential download must reuse bytes from installed package');
 console.log(JSON.stringify({test:'real NSIS differential download; no installation',fullBytes:size,downloadedBytes,rangeRequests,savedPercent:Number((100*(1-downloadedBytes/size)).toFixed(2))}));
}finally{await app?.close();if(cache)await rm(cache,{recursive:true,force:true});await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
