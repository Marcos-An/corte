import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createUpdates} from '../desktop/updates.mjs';
function setup({blocked=false,prepare=async()=>{}}={}){
 const updater=new EventEmitter();let checks=0,installs=0;
 updater.checkForUpdates=async()=>{checks++;updater.emit('checking-for-update');};updater.quitAndInstall=()=>{installs++;};
 const states=[];const updates=createUpdates({updater,prepare,blocked:()=>blocked,installedVersion:'0.5.7',notify:s=>states.push(s)});
 return {updater,updates,states,get checks(){return checks;},get installs(){return installs;}};
}
test('automatic check prepares persistent models before network; progress and ready are visible',async()=>{
 let prepared=false;const s=setup({prepare:async()=>{prepared=true;}});await s.updates.check();assert.equal(prepared,true);assert.equal(s.checks,1);assert.equal(s.updater.autoDownload,true);assert.equal(s.updater.autoInstallOnAppQuit,true);assert.equal(s.updater.allowPrerelease,true);assert.equal(s.updater.allowDowngrade,false);
 s.updater.emit('update-available',{version:'0.5.5'});s.updater.emit('download-progress',{percent:42.9});assert.equal(s.updates.status().percent,42);s.updater.emit('update-downloaded',{version:'0.5.5'});assert.equal(s.updates.status().phase,'ready');assert.equal(s.updates.install(),true);assert.equal(s.installs,1);
});
test('never installs while editing/saving/exporting or before verified download',async()=>{
 const s=setup({blocked:true});assert.throws(()=>s.updates.install(),/conclua|salve/i);assert.equal(s.installs,0);s.updater.emit('update-downloaded',{version:'0.5.5'});assert.throws(()=>s.updates.install(),/conclua|salve/i);assert.equal(s.installs,0);
 const clean=setup();assert.throws(()=>clean.updates.install(),/pronta/i);assert.equal(clean.installs,0);
});
test('offline, interrupted and model preparation failures keep current app and allow retry',async()=>{
 const s=setup();s.updater.checkForUpdates=async()=>{throw Error('private URL or credential');};await s.updates.check();assert.equal(s.updates.status().phase,'error');assert.doesNotMatch(JSON.stringify(s.states),/private URL/);
 s.updater.emit('error',Error('checksum mismatch secret'));assert.equal(s.installs,0);s.updater.checkForUpdates=async()=>s.updater.emit('update-not-available');await s.updates.check();assert.equal(s.updates.status().phase,'current');
 const bad=setup({prepare:async()=>{throw Error('disk full');}});await bad.updates.check();assert.equal(bad.checks,0);assert.equal(bad.updates.status().phase,'error');
});
test('concurrent checks and downloaded update never trigger repeated network or restart',async()=>{
 let release;const s=setup({prepare:()=>new Promise(r=>release=r)});const first=s.updates.check();await s.updates.check();assert.equal(s.checks,0);release();await first;assert.equal(s.checks,1);s.updater.emit('update-downloaded',{version:'0.5.5'});await s.updates.check();assert.equal(s.checks,1);assert.equal(s.installs,0);
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
