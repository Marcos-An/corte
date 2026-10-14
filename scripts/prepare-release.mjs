import {realpathSync} from 'node:fs';
// Reuse only hash-pinned dependencies, never execute the bootstrap application.
import {createReadStream} from 'node:fs';
import {readFile,mkdtemp,cp,mkdir,chmod,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function verifyFile(file,expected){
 const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);
 if(hash.digest('hex')!==expected)throw Error('Checksum incorreto: '+path.basename(file));
}
async function verify(platform){
 const seed=JSON.parse(await readFile(root+'scripts/release-bootstrap.json'));
 const manifest=JSON.parse(await readFile(root+'vendor/distribution/manifest.json'));
 for(const p of ['mac','win'])await verifyFile(root+`vendor/distribution/ffmpeg-${p==='mac'?'macos':'windows'}-sources.tar.gz`,manifest[p].sources.sha256);
 for(const tool of ['ffmpeg','ffprobe'])await verifyFile(root+`vendor/${platform==='mac'?'darwin-arm64':'windows'}/${tool}${platform==='win'?'.exe':''}`,manifest[platform][tool].sha256);
 for(const [name,hash] of Object.entries(seed.extraTools[platform]))await verifyFile(root+`vendor/${platform==='mac'?'darwin-arm64':'windows'}/${name}`,hash);
 const models=JSON.parse(await readFile(root+'vendor/models/manifest.json'));for(const f of models.files)await verifyFile(root+'vendor/models/'+f.path,f.sha256);
}
async function prepare(platform){
 try{await verify(platform);console.log('Dependências em cache verificadas.');return;}catch{}
 const seed=JSON.parse(await readFile(root+'scripts/release-bootstrap.json')),work=await mkdtemp(path.join(tmpdir(),'corte-bootstrap-'));
 const run=(cmd,args)=>execFileSync(cmd,args,{cwd:root,stdio:'inherit'});
 try{
 const download=async asset=>{run('gh',['release','download',seed.tag,'--repo',seed.repo,'--pattern',asset.name,'--dir',work]);const file=path.join(work,asset.name);await verifyFile(file,asset.sha256);return file;};
 const zip=await download(seed.macZip),mac=path.join(work,'mac');await mkdir(mac);
 if(platform==='mac')run('ditto',['-x','-k',zip,mac]);else run('7z',['x',zip,'-o'+mac,'-y']);
 const resources=path.join(mac,'Corte.app/Contents/Resources');
 const models=JSON.parse(await readFile(root+'vendor/models/manifest.json'));
 for(const f of models.files){const to=path.join(root,'vendor/models',f.path);await mkdir(path.dirname(to),{recursive:true});await cp(path.join(resources,'models',f.path),to);}
 for(const p of ['macos','windows'])await cp(path.join(resources,'distribution',`ffmpeg-${p}-sources.tar.gz`),root+`vendor/distribution/ffmpeg-${p}-sources.tar.gz`);
 let tools=path.join(resources,'tools');
 if(platform==='win'){
 const exe=await download(seed.winInstaller),outer=path.join(work,'nsis'),inner=path.join(work,'win');
 run('7z',['x',exe,'-o'+outer,'-y','$PLUGINSDIR/app-64.7z']);
 run('7z',['x',path.join(outer,'$PLUGINSDIR/app-64.7z'),'-o'+inner,'-y','resources/tools/*']);tools=path.join(inner,'resources/tools');
 }
 for(const name of [...['ffmpeg','ffprobe'].map(tool=>tool+(platform==='win'?'.exe':'')),...Object.keys(seed.extraTools[platform])]){const to=root+`vendor/${platform==='mac'?'darwin-arm64':'windows'}/${name}`;await cp(path.join(tools,name),to);if(platform==='mac')await chmod(to,0o755);}
 await verify(platform);console.log('Dependências reutilizadas e verificadas, sem recompilar FFmpeg.');
 }finally{await rm(work,{recursive:true,force:true});}
}
if(process.argv[1]&&process.argv[1]!=='-'&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 const platform=process.platform==='darwin'?'mac':process.platform==='win32'?'win':null;
 if(!platform){console.error('Build somente em macOS arm64 ou Windows x64.');process.exitCode=1;}
 else prepare(platform).catch(e=>{console.error(e.message);process.exitCode=1;});
}
