import test from 'node:test';
import assert from 'node:assert/strict';
import {validateVersion, dispatchRelease} from '../scripts/release.mjs';
import {verifyFile} from '../scripts/prepare-release.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
test('release accepts only a newer exact numeric version',()=>{
 assert.equal(validateVersion('0.5.5','0.5.4'),'0.5.5');
 for(const v of ['0.5.4','0.4.9','v0.5.5','01.5.5','0.5.5;echo hi','0.5.5-beta',''])assert.throws(()=>validateVersion(v,'0.5.4'));
});
function boundary({dirty=false,duplicate=false,remote='abc',failTest=false}={}){
 const calls=[];
 const run=(cmd,args)=>{calls.push([cmd,args]);const key=args.join(' ');
  if(key==='status --porcelain')return dirty?' M src/app.mjs':'';
  if(key==='rev-parse HEAD')return 'abc';
  if(key==='ls-remote origin refs/heads/main')return remote+'\trefs/heads/main';
  if(key.includes('releases')&&key.includes('--paginate'))return duplicate?'v0.5.5':'';
  if(key==='ls-remote origin refs/tags/v0.5.5')return duplicate?'tag':'';
  if(cmd==='npm'&&args[0]==='test'&&failTest)throw Error('test failed');
  return '';
 };return {calls,run};
}
test('dispatch validates, tests then requests a draft workflow at exact HEAD',()=>{
 const b=boundary();dispatchRelease({version:'0.5.5',current:'0.5.4',run:b.run});
 assert.deepEqual(b.calls.filter(c=>c[0]==='npm').map(c=>c[1]),[['test'],['run','check']]);
 const dispatch=b.calls.at(-1);assert.equal(dispatch[0],'gh');assert.ok(dispatch[1].includes('release.yml'));assert.ok(dispatch[1].includes('expected_sha=abc'));assert.ok(dispatch[1].includes('dry_run=false'));
});
test('dry run propagates no-release mode; unsafe requests never dispatch',()=>{
 const b=boundary();dispatchRelease({version:'0.5.5',current:'0.5.4',dryRun:true,run:b.run});assert.ok(b.calls.at(-1)[1].includes('dry_run=true'));
 for(const opts of [{dirty:true},{duplicate:true},{remote:'different'},{failTest:true}]){const bad=boundary(opts);assert.throws(()=>dispatchRelease({version:'0.5.5',current:'0.5.4',run:bad.run}));assert.equal(bad.calls.some(c=>c[1][0]==='workflow'),false);}
});
test('bootstrap refuses missing or changed dependency bytes',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-release-test-'));try{
 const file=path.join(dir,'fixture');await writeFile(file,'known');const hash=createHash('sha256').update('known').digest('hex');await verifyFile(file,hash);await writeFile(file,'tampered');await assert.rejects(verifyFile(file,hash));await assert.rejects(verifyFile(file+'-missing',hash));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('release is newer than already published versions, not just package.json',()=>{
 const b=boundary();const run=(cmd,args)=>args.includes('--paginate')?'v0.5.6':b.run(cmd,args);
 assert.throws(()=>dispatchRelease({version:'0.5.5',current:'0.5.4',run}));assert.equal(b.calls.some(c=>c[1][0]==='workflow'),false);
});
async function updateAssets(dir,version='0.5.5'){
 const name=`Corte.Update.${version}.exe`,sha512=createHash('sha512').update('fixture').digest('base64');
 await writeFile(path.join(dir,name),'fixture');await writeFile(path.join(dir,name+'.blockmap'),'fixture');await writeFile(path.join(dir,'latest.yml'),JSON.stringify({version,files:[{url:name,sha512,size:7}],path:name,sha512}));
}
test('asset collection requires both platforms and creates byte-exact checksums',async()=>{
 const {collectAssets}=await import('../scripts/release-assets.mjs');const dir=await mkdtemp(path.join(tmpdir(),'corte-assets-'));
 try{await assert.rejects(collectAssets(dir,'0.5.5'));for(const name of ['Corte-0.5.5-arm64.dmg','Corte-0.5.5-arm64-mac.zip','Corte.Setup.0.5.5.exe','ffmpeg-macos-sources.tar.gz','ffmpeg-windows-sources.tar.gz'])await writeFile(path.join(dir,name),'fixture');await updateAssets(dir);await collectAssets(dir,'0.5.5');const {readFile}=await import('node:fs/promises');const sums=await readFile(path.join(dir,'SHA256SUMS'),'utf8');assert.equal(sums.trim().split('\n').length,8);assert.ok(sums.startsWith(createHash('sha256').update('fixture').digest('hex')));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('CLI invoked through a filesystem alias still rejects invalid arguments',async()=>{
 if(process.platform==='win32')return; // Windows symlink privilege is not needed by this CLI.
 const {symlink}=await import('node:fs/promises'),{spawnSync}=await import('node:child_process');const dir=await mkdtemp(path.join(tmpdir(),'corte-cli-'));
 try{const link=path.join(dir,'release.mjs');await symlink(new URL('../scripts/release.mjs',import.meta.url),link);const result=spawnSync(process.execPath,[link,'invalid'],{encoding:'utf8'});assert.equal(result.status,1);assert.match(result.stderr,/versão numérica/);}finally{await rm(dir,{recursive:true,force:true});}
});
test('bootstrap pins music tools and Windows CLI helpers, preserving baseline features',async()=>{
 const {readFile}=await import('node:fs/promises');const seed=JSON.parse(await readFile(new URL('../scripts/release-bootstrap.json',import.meta.url)));
 for(const [platform,names] of [['mac',['yt-dlp']],['win',['yt-dlp.exe','codex.exe','codex-code-mode-host.exe']]])for(const name of names)assert.match(seed.extraTools?.[platform]?.[name]||'',/^[a-f0-9]{64}$/,name+' must be pinned and restored');
});
test('asset upload allowlist rejects unexpected files',async()=>{
 const {collectAssets}=await import('../scripts/release-assets.mjs');const dir=await mkdtemp(path.join(tmpdir(),'corte-assets-'));
 try{for(const name of ['Corte-0.5.5-arm64.dmg','Corte-0.5.5-arm64-mac.zip','Corte.Setup.0.5.5.exe','ffmpeg-macos-sources.tar.gz','ffmpeg-windows-sources.tar.gz','unexpected.json'])await writeFile(path.join(dir,name),'fixture');await assert.rejects(collectAssets(dir,'0.5.5'));}finally{await rm(dir,{recursive:true,force:true});}
});
test('warm cache includes every pinned extra tool, avoiding baseline downloads',async()=>{
 const {readFile}=await import('node:fs/promises');const seed=JSON.parse(await readFile(new URL('../scripts/release-bootstrap.json',import.meta.url))),workflow=await readFile(new URL('../.github/workflows/release.yml',import.meta.url),'utf8');
 const cache=workflow.slice(workflow.indexOf('- uses: actions/cache@'),workflow.indexOf('- name: Restore verified'));
 for(const [platform,tools] of Object.entries(seed.extraTools))for(const name of Object.keys(tools))assert.ok(cache.includes(`vendor/${platform==='mac'?'darwin-arm64':'windows'}/${name}`),name+' must survive cache restore');
});
test('Windows update package excludes AI weights, keeps manifest and uses differential NSIS feed',async()=>{
 const {createRequire}=await import('node:module');const require=createRequire(import.meta.url),config=require('../scripts/update-build.cjs');
 assert.ok(!config.extraResources.some(r=>r.to==='models'));assert.ok(config.files.includes('vendor/models/manifest.json'));assert.equal(config.nsis.differentialPackage,true);assert.equal(config.win.artifactName,'Corte.Update.${version}.${ext}');assert.equal(config.publish.provider,'github');assert.equal(config.publish.owner,'Marcos-An');assert.equal(config.publish.repo,'corte');
});
test('update feed is required and must point to the verified lean installer',async()=>{
 const {collectAssets}=await import('../scripts/release-assets.mjs'),{readFile}=await import('node:fs/promises');const dir=await mkdtemp(path.join(tmpdir(),'corte-feed-'));
 try{
 const names=['Corte-0.5.5-arm64.dmg','Corte-0.5.5-arm64-mac.zip','Corte.Setup.0.5.5.exe','ffmpeg-macos-sources.tar.gz','ffmpeg-windows-sources.tar.gz'];for(const n of names)await writeFile(path.join(dir,n),'fixture');
 await assert.rejects(collectAssets(dir,'0.5.5'),'a release without auto-update feed must fail');
 await writeFile(path.join(dir,'Corte.Update.0.5.5.exe'),'lean');await writeFile(path.join(dir,'Corte.Update.0.5.5.exe.blockmap'),'blockmap');const digest=createHash('sha512').update('lean').digest('base64');
 const feed={version:'0.5.5',files:[{url:'Corte.Update.0.5.5.exe',sha512:digest,size:4}],path:'Corte.Update.0.5.5.exe',sha512:digest};await writeFile(path.join(dir,'latest.yml'),JSON.stringify(feed));await collectAssets(dir,'0.5.5');assert.equal((await readFile(path.join(dir,'SHA256SUMS'),'utf8')).trim().split('\n').length,8);
 feed.files[0].url='https://evil.invalid/code.exe';await writeFile(path.join(dir,'latest.yml'),JSON.stringify(feed));await assert.rejects(collectAssets(dir,'0.5.5'));
 feed.files[0].url='Corte.Update.0.5.5.exe';feed.files[0].sha512='wrong';await writeFile(path.join(dir,'latest.yml'),JSON.stringify(feed));await assert.rejects(collectAssets(dir,'0.5.5'));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('changing model revision cannot produce an update with missing AI weights',async()=>{
 const {readFile}=await import('node:fs/promises'),{runInNewContext}=await import('node:vm'),{createRequire}=await import('node:module');const require=createRequire(new URL('../scripts/update-build.cjs',import.meta.url));const source=await readFile(new URL('../scripts/update-build.cjs',import.meta.url),'utf8');
 assert.throws(()=>runInNewContext(source,{module:{exports:{}},require:name=>name==='../vendor/models/manifest.json'?{files:[{path:'new.onnx',sha256:'a'.repeat(64)}]}:require(name)}),/Modelo de IA mudou/);
});
