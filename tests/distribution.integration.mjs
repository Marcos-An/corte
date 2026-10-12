// Post-build audit. Does not execute Windows binaries on macOS.
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url),asar=require('@electron/asar'),root=path.resolve(import.meta.dirname,'..');
const locations=[['mac',path.join(root,'release/mac-arm64/Corte.app/Contents/Resources')],['win',path.join(root,'release/win-unpacked/resources')]];
const digest=b=>createHash('sha256').update(b).digest('hex'),report=[];
for(const [platform,resources] of locations){
 const archive=path.join(resources,'app.asar'),files=asar.listPackage(archive).map(f=>f.replace(/^\//,''));
 assert.ok(!files.some(f=>/^node_modules\/(ffmpeg-static\/ffmpeg(?:\.exe)?$|ffprobe-static\/bin\/)/.test(f)),platform+': unused npm tools are forbidden');
 assert.ok(!files.some(f=>/(?:^|\/)(?:auth\.json|\.env(?:\.|$)|openai-key\.enc|.*\.corte|Cookies)(?:$|\/)/i.test(f)),platform+': private state is forbidden');
 for(const dir of ['src','desktop'])for(const file of await readdir(path.join(root,dir),{recursive:true,withFileTypes:true})){if(!file.isFile())continue;const name=path.relative(root,path.join(file.parentPath||file.path,file.name)).split(path.sep).join('/');assert.equal(digest(asar.extractFile(archive,name)),digest(await readFile(path.join(root,name))),platform+': source mismatch '+name);}
 const manifest=JSON.parse(await readFile(path.join(resources,'distribution/manifest.json'),'utf8'));
 const sourceName=`ffmpeg-${platform==='mac'?'macos':'windows'}-sources.tar.gz`,sourceFile=path.join(resources,'distribution',sourceName);
 assert.ok(manifest[platform].sources?.sha256,platform+': corresponding source hash is required');
 assert.equal(digest(await readFile(sourceFile)),manifest[platform].sources.sha256,platform+': corresponding sources integrity');
 const entries=execFileSync('tar',['-tzf',sourceFile],{encoding:'utf8'}).trim().split('\n');
 assert.ok(entries.every(name=>name.startsWith('archives/')&&!name.split('/').includes('..')),'source archive paths');
 const entry=name=>execFileSync('tar',['-xzOf',sourceFile,'archives/'+name],{maxBuffer:64*1024*1024});
 const recipe=`build-${platform==='mac'?'macos':'windows'}.sh`;
 // Native Windows checkout may use CRLF; archive/input checksums below remain byte-exact.
 const text=b=>b.toString('utf8').replace(/\r\n/g,'\n');
 assert.equal(text(entry(recipe)),text(await readFile(path.join(root,'vendor/distribution',recipe))),'bundled build recipe');
 assert.equal(text(entry('source-checksums.sha256')),text(await readFile(path.join(root,'vendor/distribution/source-checksums.sha256'))),'expected upstream source hashes');
 const sums=entry('SHA256SUMS').toString('utf8').trim().split('\n');
 for(const line of sums){const [hash,name]=line.split(/\s+/);assert.match(hash,/^[a-f0-9]{64}$/);assert.ok(!name.includes('/'),'source checksum name');assert.equal(digest(entry(name)),hash,'source input '+name);}
 const expected=(await readFile(path.join(root,'vendor/distribution/source-checksums.sha256'),'utf8')).trim().split('\n');
 for(const line of expected){const [hash,name]=line.split(/\s+/);if(platform==='mac'&&name==='zlib-1.3.1.tar.gz'&&!entries.includes('archives/'+name))continue;assert.equal(digest(entry(name)),hash,'pinned upstream '+name);}
 for(const tool of ['ffmpeg','ffprobe']){
  const file=path.join(resources,'tools',tool+(platform==='win'?'.exe':'')),bytes=await readFile(file);assert.equal(digest(bytes),manifest[platform][tool].sha256,platform+': controlled binary hash');
  if(platform==='win'){assert.equal(bytes.readUInt16LE(0),0x5a4d);const pe=bytes.readUInt32LE(0x3c);assert.equal(bytes.readUInt16LE(pe+4),0x8664,'Windows x64 executable');assert.ok(!bytes.toString('latin1').includes('--enable-nonfree'),'Windows nonfree flag');}
  else{const license=execFileSync(file,['-L'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});assert.match(license,/GNU General Public License/);assert.doesNotMatch(license,/not legally redistributable/);const libs=execFileSync('otool',['-L',file],{encoding:'utf8'}).trim().split('\n').slice(1);assert.ok(libs.every(line=>/^\s*(\/usr\/lib\/|\/System\/Library\/)/.test(line)),'no external dynamic libraries');}
 }
 for(const file of ['ffmpeg.LICENSE','ffprobe.LICENSE'])assert.ok((await readFile(path.join(resources,'tools',file),'utf8')).includes('GNU GENERAL PUBLIC LICENSE'));
 const clipManifest=JSON.parse(await readFile(path.join(resources,'models/manifest.json'),'utf8'));for(const item of clipManifest.files)assert.equal(digest(await readFile(path.join(resources,'models',item.path))),item.sha256,'bundled CLIP integrity');
 for(const f of files.filter(f=>/\.(?:mjs|cjs|js|json|html|md)$/.test(f)&&!f.startsWith('node_modules/'))){const text=asar.extractFile(archive,f).toString('utf8');assert.ok(!/\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/.test(text),platform+': potential credential in '+f);}
 report.push({platform,version:JSON.parse(asar.extractFile(archive,'package.json')).version,files:files.length,tools:'hashes verified',source:'identical',privateState:'not detected',runtime:platform==='win'?'not executed':'tool license and linking verified'});
}
console.log(JSON.stringify(report,null,2));
