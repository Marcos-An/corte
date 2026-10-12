import {existsSync} from 'node:fs';
import path from 'node:path';
export function packagedTool(name,fallback,{platform=process.platform,resources=process.resourcesPath}={}) {
 if(!['ffmpeg','ffprobe','codex'].includes(name))throw new Error('Ferramenta não permitida.');
 const candidate=resources?path.join(resources,'tools',`${name}${platform==='win32'?'.exe':''}`):null;
 return ['win32','darwin'].includes(platform) && candidate && existsSync(candidate)?candidate:fallback;
}
