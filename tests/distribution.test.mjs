import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{minimatch}=require('minimatch'),pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
test('distribution excludes npm fallback executables, not their runtime modules',()=>{
 const excludes=pkg.build.files.filter(p=>p.startsWith('!')).map(p=>p.slice(1));
 const blocked=file=>excludes.some(pattern=>minimatch(file,pattern));
 for(const file of ['node_modules/ffmpeg-static/ffmpeg','node_modules/ffmpeg-static/ffmpeg.exe','node_modules/ffprobe-static/bin/darwin/arm64/ffprobe','node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe'])assert.ok(blocked(file),'do not distribute unused fallback: '+file);
 for(const file of ['node_modules/ffmpeg-static/index.js','node_modules/ffprobe-static/index.js','node_modules/ffmpeg-static/LICENSE'])assert.equal(blocked(file),false,'keep runtime/provenance: '+file);
});
test('both platforms package controlled tools and dependency notices',()=>{
 for(const platform of ['mac','win'])assert.ok(pkg.build[platform].extraResources.some(r=>r.from===`vendor/${platform==='mac'?'darwin-arm64':'windows'}`&&r.to==='tools'));
 assert.ok(pkg.build.extraResources.some(r=>r.from==='vendor/distribution'&&r.to==='distribution'),'ship redistributable tool manifest and sources/notices');
});
