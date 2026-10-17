// Run only after compiling the hash-pinned source archives with the reviewed Windows recipe.
import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),file=path.join(root,'vendor/distribution/manifest.json'),manifest=JSON.parse(await readFile(file,'utf8'));
const digest=async name=>createHash('sha256').update(await readFile(path.join(root,name))).digest('hex');
if(process.argv.includes('--bootstrap-source-only')){
 // macOS ships no Windows executable. Record the legacy Windows source archive actually restored there.
 const bootstrap=JSON.parse(await readFile(path.join(root,'scripts/bootstrap-media.json'),'utf8'));
 manifest.win.sources={...bootstrap.win.sources};
}else{
 const ff=path.join(root,'vendor/windows/ffmpeg.exe');
 const license=execFileSync(ff,['-L'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']});
 if(!/GNU General Public License/.test(license)||/not legally redistributable/.test(license))throw Error('Licença de FFmpeg não aprovada.');
 const accels=execFileSync(ff,['-hide_banner','-hwaccels'],{encoding:'utf8',windowsHide:true});
 if(!/d3d11va/.test(accels)||!/dxva2/.test(accels))throw Error('Decodificadores Windows não incluídos.');
 for(const tool of ['ffmpeg','ffprobe']){
  const bytes=await readFile(path.join(root,'vendor/windows',tool+'.exe'));
  if(bytes.readUInt16LE(0)!==0x5a4d||bytes.readUInt16LE(bytes.readUInt32LE(0x3c)+4)!==0x8664)throw Error('Ferramenta deve ser Windows x64.');
  manifest.win[tool]={sha256:createHash('sha256').update(bytes).digest('hex')};
 }
 manifest.win.sources={sha256:await digest('vendor/distribution/ffmpeg-windows-sources.tar.gz')};
}
await writeFile(file,JSON.stringify(manifest,null,2)+'\n');console.log('Manifesto de ferramentas atualizado com os artefatos verificados.');
