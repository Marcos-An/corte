import path from 'node:path';import {writeFile} from 'node:fs/promises';
import {run,binaries,probe} from '../desktop/media.mjs';import * as m from '../src/project.mjs';
export async function trackingFixture(dir,{occluded=false}={}){
 const width=320,height=180,frames=120,raw=Buffer.alloc(width*height*3*frames);let seed=42;const texture=Uint8Array.from({length:40*48},()=>{seed=(seed*1664525+1013904223)>>>0;return 35+seed%195;});
 for(let n=0;n<frames;n++){
  const cx=60+n*.8,cy=90+Math.sin(n/30)*12;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const tx=Math.floor(x-cx+20),ty=Math.floor(y-cy+24),target=tx>=0&&tx<40&&ty>=0&&ty<48&&(!occluded||n<60),v=target?texture[ty*40+tx]:35+(Math.floor(x/30)+Math.floor(y/30))%2*8,i=((n*height+y)*width+x)*3;raw[i]=v;raw[i+1]=target?v:45;raw[i+2]=target?Math.min(255,v+15):65;}
 }
 const file=path.join(dir,occluded?'occluded.mp4':'moving.mp4'),input=path.join(dir,'input.rgb');await writeFile(input,raw);
 await run(binaries().ffmpeg,['-v','error','-y','-f','rawvideo','-pixel_format','rgb24','-video_size',`${width}x${height}`,'-framerate','60','-i',input,'-f','lavfi','-i','sine=f=777:r=48000','-t','2','-c:v','libx264','-crf','16','-pix_fmt','yuv420p','-c:a','aac',file]);
 let p=m.addClip(m.addAsset(m.createProject(),{id:'v',name:'Movimento',...await probe(file)}),'v','c');p.aspect='16:9';p=m.addBlurLayer(p,{id:'target',start:0,end:2,x:60/320*100,y:50,width:46/320*100,height:54/180*100,rotation:0,opacity:100,strength:100,blurShape:'rectangle'});
 return {p,file,registry:new Map([['v',{path:file}]])};
}
