import {existsSync} from 'node:fs';import path from 'node:path';
// Native regression tests must exercise the bundled decoder/encoder and fonts, not npm's fallback tools.
export function usePackagedMedia(){
 const app=process.env.CORTE_TEST_APP;if(!app)return false;
 const resources=process.platform==='darwin'?path.resolve(path.dirname(app),'../Resources'):path.join(path.dirname(app),'resources'),suffix=process.platform==='win32'?'.exe':'';
 for(const tool of ['ffmpeg','ffprobe'])if(!existsSync(path.join(resources,'tools',tool+suffix)))throw Error('Packaged media tool not found: '+tool);
 process.resourcesPath=resources;return true;
}
