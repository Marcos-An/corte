import {realpathSync} from 'node:fs';
import {createReadStream} from 'node:fs';
import {writeFile,lstat,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
const yaml=createRequire(import.meta.url)('js-yaml');
import {validateVersion} from './release.mjs';
export async function collectAssets(dir,version){
 validateVersion(version,'0.0.0');
 const names=[`Corte-${version}-arm64.dmg`,`Corte-${version}-arm64-mac.zip`,`Corte.Setup.${version}.exe`,'ffmpeg-macos-sources.tar.gz','ffmpeg-windows-sources.tar.gz',`Corte.Update.${version}.exe`,`Corte.Update.${version}.exe.blockmap`,'latest.yml'];
 const allowed=new Set([...names,'SHA256SUMS']);for(const name of await readdir(dir))if(!allowed.has(name))throw Error('Asset não permitido: '+name);
 const lines=[];for(const name of names){const file=path.join(dir,name);if(!(await lstat(file)).isFile()||(await lstat(file)).size===0)throw Error('Asset ausente: '+name);const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);lines.push(hash.digest('hex')+'  '+name);}
 const feed=yaml.load(await readFile(path.join(dir,'latest.yml'),'utf8')),{size}=await lstat(path.join(dir,`Corte.Update.${version}.exe`));
 const h=createHash('sha512');for await(const b of createReadStream(path.join(dir,`Corte.Update.${version}.exe`)))h.update(b);const sha512=h.digest('base64');
 if(feed?.version!==version||feed.path!==`Corte.Update.${version}.exe`||feed.sha512!==sha512||feed.files?.length!==1||feed.files[0].url!==feed.path||feed.files[0].sha512!==sha512||feed.files[0].size!==size)throw Error('Metadados de atualização inválidos.');
 await writeFile(path.join(dir,'SHA256SUMS'),lines.join('\n')+'\n');
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url))collectAssets(process.argv[2],process.argv[3]).catch(e=>{console.error(e.message);process.exitCode=1;});
