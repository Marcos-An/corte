// Verify the fixed pipeline against a lossless reference using the shipped Windows media tools.
// CORTE_TEST_RESOURCES=<installed resources> CORTE_TEST_VIDEO=<authorized local video> node tests/windows-preview.integration.mjs
import assert from 'node:assert/strict';import {mkdtemp,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import sharp from 'sharp';
import {run,binaries,frame,PREVIEW_SCALE} from '../desktop/media.mjs';
if(!process.env.CORTE_TEST_RESOURCES||!process.env.CORTE_TEST_VIDEO)throw Error('Informe as ferramentas e um vídeo local autorizado. Nenhum envio à nuvem.');
process.resourcesPath=path.resolve(process.env.CORTE_TEST_RESOURCES);
const dir=await mkdtemp(path.join(tmpdir(),'corte-preview-'));
try{
 const file=process.env.CORTE_TEST_VIDEO,reference=path.join(dir,'reference.png'),preview=path.join(dir,'preview.jpg'),time=Number(process.env.CORTE_TEST_TIME||3);
 await run(binaries().ffmpeg,['-v','error','-y','-ss',String(time),'-i',file,'-frames:v','1','-vf',PREVIEW_SCALE,reference]);
 await frame(file,time,preview,undefined,{width:720});
 const a=await sharp(await readFile(reference)).removeAlpha().raw().toBuffer({resolveWithObject:true}),b=await sharp(await readFile(preview)).removeAlpha().raw().toBuffer({resolveWithObject:true});
 assert.equal(a.info.width,b.info.width);assert.equal(a.info.height,b.info.height);assert.equal(a.data.length,b.data.length);
 let error=0;for(let i=0;i<a.data.length;i++)error+=Math.abs(a.data[i]-b.data[i]);error/=a.data.length;
 assert.ok(error<12,`Prévia corrompida: diferença RGB média ${error.toFixed(2)}`);
 console.log(JSON.stringify({passed:true,width:b.info.width,height:b.info.height,meanRGBError:Number(error.toFixed(3))}));
}finally{await rm(dir,{recursive:true,force:true});}
