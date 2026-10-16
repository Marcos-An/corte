import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createUpdates} from '../desktop/updates.mjs';
function setup({blocked=false,busy=()=>false,prepare=async()=>{},available=false}={}){
 const updater=new EventEmitter();let checks=0,installs=0;
 updater.checkForUpdates=async()=>{checks++;updater.emit('checking-for-update');updater.emit(available?'update-available':'update-not-available',{version:'0.5.9'});};updater.downloadUpdate=async()=>{updater.emit('download-progress',{percent:42.9});updater.emit('update-downloaded',{version:'0.5.9'});};updater.quitAndInstall=()=>{installs++;};
 const states=[];const updates=createUpdates({updater,prepare,busy,blocked:()=>blocked,installedVersion:'0.5.7',notify:s=>states.push(s)});
 return {updater,updates,states,get checks(){return checks;},get installs(){return installs;}};
}
test('startup checks do not read models; preserve them only before an available update is downloaded',async()=>{
 let prepared=0;const s=setup({prepare:async()=>{prepared++;}});await s.updates.check();assert.equal(prepared,0);assert.equal(s.checks,1);assert.equal(s.updater.autoDownload,false);assert.equal(s.updater.autoInstallOnAppQuit,true);assert.equal(s.updater.allowPrerelease,true);assert.equal(s.updater.allowDowngrade,false);
 const next=setup({available:true,prepare:async()=>{prepared++;}});let downloads=0;next.updater.downloadUpdate=async()=>{assert.equal(prepared,1);downloads++;next.updater.emit('update-downloaded',{version:'0.5.9'});};await next.updates.check();assert.equal(downloads,1);assert.equal(next.updates.status().phase,'ready');assert.equal(next.updates.install(),true);
});
test('busy import/open defers background update work until explicitly retried idle',async()=>{
 let busy=true,prepared=0;const s=setup({available:true,busy:()=>busy,prepare:async()=>prepared++});await s.updates.check();assert.equal(s.checks,0);assert.equal(prepared,0);assert.equal(s.updates.status().phase,'waiting');busy=false;await s.updates.check();assert.equal(prepared,1);assert.equal(s.updates.status().phase,'ready');
});
test('never installs while editing/saving/exporting or before verified download',async()=>{
 const s=setup({blocked:true});assert.throws(()=>s.updates.install(),/conclua|salve/i);assert.equal(s.installs,0);s.updater.emit('update-downloaded',{version:'0.5.5'});assert.throws(()=>s.updates.install(),/conclua|salve/i);assert.equal(s.installs,0);
 const clean=setup();assert.throws(()=>clean.updates.install(),/pronta/i);assert.equal(clean.installs,0);
});
test('offline, interrupted and model preparation failures keep current app and allow retry',async()=>{
 const s=setup();s.updater.checkForUpdates=async()=>{throw Error('private URL or credential');};await s.updates.check();assert.equal(s.updates.status().phase,'error');assert.doesNotMatch(JSON.stringify(s.states),/private URL/);
 s.updater.emit('error',Error('checksum mismatch secret'));assert.equal(s.installs,0);s.updater.checkForUpdates=async()=>s.updater.emit('update-not-available');await s.updates.check();assert.equal(s.updates.status().phase,'current');
 const bad=setup({available:true,prepare:async()=>{throw Error('disk full');}});let downloaded=false;bad.updater.downloadUpdate=async()=>downloaded=true;await bad.updates.check();assert.equal(downloaded,false);assert.equal(bad.checks,1);assert.equal(bad.updates.status().phase,'error');
});
test('concurrent checks and downloaded update never trigger repeated network or restart',async()=>{
 let release;const s=setup({available:true,prepare:()=>new Promise(r=>release=r)});const first=s.updates.check();await s.updates.check();assert.equal(s.checks,1);release();await first;assert.equal(s.checks,1);s.updater.emit('update-downloaded',{version:'0.5.5'});await s.updates.check();assert.equal(s.checks,1);assert.equal(s.installs,0);
});
test('installer failure does not leave updater permanently locked',async()=>{
 const s=setup();s.updater.emit('update-downloaded',{version:'0.5.5'});s.updater.quitAndInstall=()=>s.updater.emit('error',Error('installer failed'));s.updates.install();assert.equal(s.updates.status().phase,'error');s.updater.quitAndInstall=()=>{};s.updater.emit('update-downloaded',{version:'0.5.5'});assert.equal(s.updates.install(),true);
});

test('installed version remains distinct from the downloaded version in every status',()=>{
 const s=setup();assert.equal(s.updates.status().installedVersion,'0.5.7');
 s.updater.emit('update-downloaded',{version:'0.5.8'});
 assert.equal(s.updates.status().installedVersion,'0.5.7');assert.equal(s.updates.status().version,'0.5.8');
 assert.equal(s.states.at(-1).installedVersion,'0.5.7');assert.equal(s.installs,0,'ready must not restart an editing session');
});

test('explicit restart installs silently and reopens only after installation',()=>{
 const s=setup();let args;s.updater.quitAndInstall=(...a)=>args=a;
 s.updater.emit('update-downloaded',{version:'0.5.9'});assert.equal(s.updates.install(),true);
 assert.deepEqual(args,[true,true],'manual restart must skip installer wizard and reopen the app');
 assert.throws(()=>s.updates.install(),/pronta/i,'duplicate restart is refused');
});
test('an import starting during model preparation postpones the installer download',async()=>{
 let busy=false,downloads=0;const s=setup({available:true,busy:()=>busy,prepare:async()=>{busy=true;}});s.updater.downloadUpdate=async()=>downloads++;await s.updates.check();assert.equal(downloads,0);assert.equal(s.updates.status().phase,'waiting');
});
