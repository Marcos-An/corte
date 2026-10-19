import {prepareExportWindow} from '../src/export-range.mjs';
import {sliceClip} from '../src/clip-slicing.mjs';
import {clipSpeed,clipDuration,zoomAt} from '../src/clip-time.mjs';
import {adjustmentFilter} from '../src/color-adjustments.mjs';
// Smooth zoom: zoompan keeps the framed size and recentres every frame (a per-frame scale + crop drifted to a corner).
function zoomFilter(c,a){if(!c.zoom)return '';const {from,to}=c.zoom,d=clipDuration(c),r=c.crop,even=v=>Math.max(2,Math.round(v/2)*2);return `zoompan=z='${from}+${Number((to-from).toFixed(6))}*min(1,it/${Number(d.toFixed(6))})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${even(a.width*r.w)}x${even(a.height*r.h)}:fps=30,`;}
import {audioFadeFilter} from '../src/audio-envelope.mjs';
import {shapeAss} from '../src/shapes.mjs';
import {keyframeExpression,pointsOf,animated} from '../src/keyframes.mjs';
import {projectCaptions,toAss} from '../src/captions.mjs';
import {existsSync} from 'node:fs';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, readFile, writeFile, rename, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import {packagedTool} from './runtime.mjs';
import { ASPECTS, validateProject, layerOrder, transitionAt, duration } from '../src/project.mjs';
const require=createRequire(import.meta.url);
export function binaries() {
  const unpack=p=>p?.replace(/app\.asar([\\/])/,'app.asar.unpacked$1');
  return {ffmpeg:packagedTool('ffmpeg',unpack(require('ffmpeg-static'))),ffprobe:packagedTool('ffprobe',unpack(require('ffprobe-static').path))};
}
export function run(file,args,{signal,onData,env=process.env,timeout=180000,maxOutput=2e6}={}) {
  return new Promise((resolve,reject)=>{
    let stdout='',stderr='',settled=false,processError=null;
    const child=spawn(file,args,{windowsHide:true,shell:false,env,signal});
    const timer=setTimeout(()=>{processError=new Error('Tempo limite atingido. Tente um vídeo menor.');child.kill('SIGKILL');},timeout);
    function finish(error){if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve({stdout,stderr});}
    child.stdout.on('data',data=>{stdout+=data;if(stdout.length>maxOutput){processError=new Error('Resposta excedeu o limite.');child.kill('SIGKILL');}onData?.(String(data));});
    child.stderr.on('data',data=>{stderr=(stderr+data).slice(-12000);});
    child.on('error',error=>{if(error.name==='AbortError')processError=new Error('Operação cancelada.');else finish(error);});
    child.on('close',code=>finish(processError||(code===0?null:new Error(signal?.aborted?'Operação cancelada.':`Processamento falhou (${code}). ${stderr.slice(-1800)}`))));
  });
}
export function parseProbe(result) {
  const v=result.streams?.find(s=>s.codec_type==='video'), duration=Number(result.format?.duration ?? v?.duration);
  if(!v&&result.streams?.some(s=>s.codec_type==='audio')&&Number.isFinite(duration)&&duration>0&&duration<=21600)return {kind:'audio',duration,width:0,height:0,hasAudio:true};
  if(!v || !Number.isFinite(duration) || duration<=0 || duration>21600 || !Number.isInteger(v.width) || !Number.isInteger(v.height)) throw new Error('Arquivo sem vídeo válido ou duração não suportada (máximo 6 horas).');
  const rotation=Number(v.tags?.rotate || v.side_data_list?.find(s=>s.rotation)?.rotation || 0);
  return {duration,width:Math.abs(rotation)%180===90?v.height:v.width,height:Math.abs(rotation)%180===90?v.width:v.height,hasAudio:result.streams.some(s=>s.codec_type==='audio')};
}
export async function probe(file,options={}) {const {stdout}=await run(binaries().ffprobe,['-v','error','-show_streams','-show_format','-of','json',file],options);const result=JSON.parse(stdout);
 if(/\.(png|jpe?g|webp)$/i.test(file)){
  const v=result.streams?.find(s=>s.codec_type==='video');if(!v||!['png','mjpeg','webp'].includes(v.codec_name)||!Number.isInteger(v.width)||!Number.isInteger(v.height)||v.width<2||v.height<2||v.width>16384||v.height>16384)throw Error('Imagem inválida.');
  return {kind:'image',duration:5,width:v.width,height:v.height,hasAudio:false};
 }
 return parseProbe(result);}
export function sampleTimes(duration,step=2,max=60) {
  if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(step)||step<=0||!Number.isInteger(max)||max<1)throw new Error('Amostragem inválida.');
  const actualStep=Math.max(step,duration/max);const result=[];for(let i=0;i<max && i*actualStep<duration;i++)result.push(Number((i*actualStep).toFixed(3)));return result;
}
// Previews sent to the provider are bounded by their long side: a vertical 720-wide frame costs ~2.6x the image tokens.
export const PREVIEW_SCALE='scale=720:720:force_original_aspect_ratio=decrease:force_divisible_by=2',PREVIEW_PNG=['-c:v','png','-pix_fmt','rgb24','-compression_level','1'];
export async function frame(file,time,out,signal,options={}) {
  const {width=480,...runOptions}=options;if(!Number.isInteger(width)||width<64||width>1920)throw new Error('Resolução da amostra inválida.');
  const still=/\.(png|jpe?g|webp)$/i.test(file);
  await rm(out,{force:true});
  // The shipped Windows MJPEG encoder corrupts RGB previews. Decode losslessly, then encode with libvips.
  const jpeg=/\.jpe?g$/i.test(out),decoded=jpeg?out+'.'+crypto.randomUUID()+'.png':out;
  try{
   await run(binaries().ffmpeg,['-hide_banner','-loglevel','error','-y',...(!still?['-hwaccel','auto']:[]),'-ss',String(still?0:time),'-i',file,'-frames:v','1','-vf',width===720?`${PREVIEW_SCALE},format=rgb24`:`scale=${width}:-2`,...(jpeg?PREVIEW_PNG:[]),decoded],{...runOptions,signal});
   const image=await stat(decoded).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
   if(!image?.size)throw new Error('Nenhum frame disponível nesse instante. A análise não pode reutilizar uma imagem anterior.');
   signal?.throwIfAborted();if(jpeg){const {default:sharp}=await import('sharp');const bytes=await sharp(await readFile(decoded)).jpeg({quality:80}).toBuffer();signal?.throwIfAborted();await writeFile(out,bytes);signal?.throwIfAborted();}
  }catch(error){await rm(out,{force:true});throw error;}finally{if(jpeg)await rm(decoded,{force:true});}
}
export function dimensions(aspect,height=720) {
  if(!ASPECTS.includes(aspect) || ![720,1080].includes(height))throw new Error('Formato ou resolução inválidos.');
  const [w,h]=aspect.split(':').map(Number);return w>=h?{width:Math.round(height*w/h/2)*2,height}:{width:height,height:Math.round(height*h/w/2)*2};
}
function tempoFilter(speed){const filters=[];while(speed<.5){filters.push('atempo=0.5');speed/=.5;}while(speed>2){filters.push('atempo=2');speed/=2;}if(speed!==1)filters.push('atempo='+speed);return filters.length?filters.join(',')+',':'';}
// A transition re-renders a window of the clip: its smooth zoom continues from where the clip is, not from the start.
export function transitionSegment(c,start,end){
 const segment=sliceClip(c,start,end);segment.volume=0;
 // Only these frames are composited. Audio stays on the main montage, including its original fades.
 delete segment.fadeWindow;delete segment.fadeIn;delete segment.fadeOut;return segment;
}
export function buildSegmentArgs(c,a,input,out,aspect,height=720) {
  validateProject({version:1,name:'Render',aspect,assets:[a],clips:[c]});
  // A frozen frame loops its first decoded frame for the hold; its sound is silence.
  const speed=clipSpeed(c),timing=c.freeze?'trim=end_frame=1,loop=loop=-1:size=1:start=0,setpts=N/30/TB,':speed===1?'':`trim=duration=${c.out-c.in},setpts=(PTS-STARTPTS)/${speed},`,audioTiming=speed===1?'asetpts=PTS-STARTPTS,':`atrim=duration=${c.out-c.in},asetpts=PTS-STARTPTS,${tempoFilter(speed)}`;
  const size=dimensions(aspect,height),r=c.crop,bg=c.background==='color'?c.backgroundColor.replace('#','0x'):'black';
  const filter=`${timing}${adjustmentFilter(c.adjustments)}crop=iw*${r.w}:ih*${r.h}:iw*${r.x}:ih*${r.y},${zoomFilter(c,a)}scale=${size.width}:${size.height}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${size.width}:${size.height}:(ow-iw)/2:(oh-ih)/2:${bg},setsar=1,fps=30,format=yuv420p`;
  const args=['-hide_banner','-loglevel','error','-y',...(a.kind==='image'?['-loop','1']:['-ss',String(c.in)]),'-i',input];
  const silent=!a.hasAudio||!!c.freeze;
  if(silent)args.push('-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000');
  let vf=c.background==='blur'?['-filter_complex',`[0:v]${timing}${adjustmentFilter(c.adjustments)}crop=iw*${r.w}:ih*${r.h}:iw*${r.x}:ih*${r.y},${zoomFilter(c,a)}split=2[bg][fg];[bg]scale=${size.width}:${size.height}:force_original_aspect_ratio=increase,crop=${size.width}:${size.height},gblur=sigma=${size.width*.015}[blur];[fg]scale=${size.width}:${size.height}:force_original_aspect_ratio=decrease:force_divisible_by=2[front];[blur][front]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=30,format=yuv420p[v]`]:['-vf',filter];
  if(a.kind==='image'){
    const source=`[0:v]${timing}format=rgba,${adjustmentFilter(c.adjustments,true)}crop=iw*${r.w}:ih*${r.h}:iw*${r.x}:ih*${r.y}${c.zoom?','+zoomFilter(c,a).slice(0,-1):''}`,front=`scale=${size.width}:${size.height}:force_original_aspect_ratio=decrease:force_divisible_by=2[front]`,canvas=`color=c=${bg}:s=${size.width}x${size.height}:r=30,format=rgba[base]`;
    const layers=c.background==='blur'?`${source},split=2[bg][fg];[bg]scale=${size.width}:${size.height}:force_original_aspect_ratio=increase,crop=${size.width}:${size.height},gblur=sigma=${size.width*.015}[blur];${canvas};[base][blur]overlay=format=auto[canvas];[fg]${front}`:`${source},${front};${canvas};[base]null[canvas]`;
    vf=['-filter_complex',`${layers};[canvas][front]overlay=(W-w)/2:(H-h)/2:format=auto,setsar=1,fps=30,format=yuv420p[v]`];
  }
  args.push('-t',String(clipDuration(c)),'-map',a.kind==='image'||c.background==='blur'?'[v]':'0:v:0','-map',silent?'1:a:0':'0:a:0',...vf,'-af',`${audioTiming}volume=${c.volume}${audioFadeFilter(c,clipDuration(c))},aresample=48000,apad`,'-c:v','libx264','-preset','fast','-crf','20','-c:a','aac','-ar','48000','-ac','2','-movflags','+faststart',out);
  return args;
}
export async function renderProject(project,registry,destination,{height=720,signal,onProgress=()=>{},range=null}={}) {
  const window=prepareExportWindow(project,range),scene=window.scene;if(!project.clips.length)throw new Error('A timeline está vazia.');
  for(const c of [...project.clips,...(project.music||[]),...(project.imageLayers||[]),...(project.videoLayers||[])])if(!registry.get(c.assetId)?.path)throw new Error('Mídia ausente. Importe ou relocalize o arquivo.');
  if([...registry.values()].some(a=>path.resolve(a.path)===path.resolve(destination)))throw new Error('A exportação não pode substituir uma mídia original.');
  dimensions(project.aspect,height);
  project=window.project;const renderLength=window.range?window.range.end-window.range.start:duration(project),sceneWindow=window.range?{start:window.offset,end:window.end}:null;
  const temp=await mkdtemp(path.join(tmpdir(),'corte-render-'));const partial=path.join(path.dirname(destination),`.corte-${crypto.randomUUID()}.mp4`);
  try {
    for(let i=0;i<project.clips.length;i++) {
      const c=project.clips[i],a=project.assets.find(a=>a.id===c.assetId);
      await run(binaries().ffmpeg,buildSegmentArgs(c,a,registry.get(c.assetId).path,path.join(temp,`${i}.mp4`),project.aspect,height),{signal,timeout:1800000});
      onProgress({stage:'render',completed:i+1,total:project.clips.length});
    }
    const preciseClock=project.clips.some(c=>Math.abs(clipDuration(c)*30-Math.round(clipDuration(c)*30))>1e-7);
    await writeFile(path.join(temp,'concat.txt'),project.clips.map((c,i)=>`file '${i}.mp4'${preciseClock?'\nduration '+clipDuration(c):''}`).join('\n'));
    // Fractional clips must share a clock: individually rounded MP4 lengths accumulate at every cut.
    const concatEncoding=preciseClock?['-vf','fps=30:round=up','-af','aresample=48000:async=1:first_pts=0,apad','-t',String(duration(project)),'-c:v','libx264','-preset','fast','-crf','20','-c:a','aac']:['-c','copy'];
    await run(binaries().ffmpeg,['-hide_banner','-loglevel','error','-y',...(preciseClock?['-copyts']:[]),'-f','concat','-safe','1','-i',path.join(temp,'concat.txt'),...concatEncoding,'-movflags','+faststart',partial],{signal,timeout:1800000});
    if(project.transitions?.length){
      const overlays=[],fx={dissolve:'fade',fade:'fadeblack',slide:'slideleft'};let cut=0;
      for(let i=0;i<project.clips.length-1;i++){
        const left=project.clips[i],right=project.clips[i+1];cut+=clipDuration(left);const t=project.transitions.find(t=>t.leftId===left.id&&t.rightId===right.id);if(!t)continue;
        const at=transitionAt(project,cut),files=[];
        for(const [side,c,time] of [['left',left,at.leftTime],['right',right,at.rightTime]]){
          const a=project.assets.find(a=>a.id===c.assetId),out=path.join(temp,`transition-${i}-${side}.mp4`),start=time-t.duration/2*clipSpeed(c);
          await run(binaries().ffmpeg,buildSegmentArgs(transitionSegment(c,a.kind==='image'?0:start,a.kind==='image'?t.duration*clipSpeed(c):start+t.duration*clipSpeed(c)),a,registry.get(a.id).path,out,project.aspect,height),{signal,timeout:1800000});files.push(out);
        }
        const merged=path.join(temp,`transition-${i}.mp4`),effect=t.type==='fade'?`[a]fade=t=out:st=0:d=${t.duration/2}[blackA];[b]fade=t=in:st=${t.duration/2}:d=${t.duration/2}[blackB];[blackA][blackB]blend=all_expr='if(lt(T,${t.duration/2}),A,B)'[v]`:`[a][b]xfade=transition=${fx[t.type]}:duration=${t.duration}:offset=0[v]`;
        await run(binaries().ffmpeg,['-hide_banner','-loglevel','error','-y','-i',files[0],'-i',files[1],'-filter_complex',`[0:v]settb=AVTB,setpts=PTS-STARTPTS[a];[1:v]settb=AVTB,setpts=PTS-STARTPTS[b];${effect}`,'-map','[v]','-t',String(t.duration),'-an','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p',merged],{signal,timeout:1800000});
        overlays.push({path:merged,start:at.start,end:at.end});onProgress({stage:'transition',completed:overlays.length,total:project.transitions.length});
      }
      const args=['-hide_banner','-loglevel','error','-y','-i',partial],filters=[];let previous='0:v';
      for(const [i,t] of overlays.entries()){
        args.push('-i',t.path);filters.push(`[${i+1}:v]setpts=PTS-STARTPTS+${t.start}/TB[t${i}]`);filters.push(`[${previous}][t${i}]overlay=enable='gte(t,${t.start})*lt(t,${t.end})':eof_action=pass[j${i}]`);previous=`j${i}`;
      }
      const transitioned=path.join(temp,'transitioned.mp4');args.push('-filter_complex',filters.join(';'),'-map',`[${previous}]`,'-map','0:a','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-c:a','copy',transitioned);
      await run(binaries().ffmpeg,args,{signal,timeout:1800000});await rename(transitioned,partial);
    }
    const music=(window.range?window.music:project.music||[]).filter(c=>c.start<duration(project));
    if(music.length){const mixed=path.join(temp,'mixed.mp4'),args=['-hide_banner','-loglevel','error','-y','-i',partial];for(const c of music)args.push('-ss',String(c.in),'-t',String(c.out-c.in),'-i',registry.get(c.assetId).path);const filters=music.map((c,i)=>`[${i+1}:a]aresample=48000,aformat=channel_layouts=stereo,asetpts=PTS-STARTPTS,volume=${c.volume}${audioFadeFilter(c,c.out-c.in)},adelay=${Math.round(c.start*1000)}:all=1[m${i}]`);filters.push(`[0:a]${music.map((_,i)=>`[m${i}]`).join('')}amix=inputs=${music.length+1}:duration=first:normalize=0,alimiter=limit=0.95:latency=1[a]`);args.push('-filter_complex',filters.join(';'),'-map','0:v:0','-map','[a]','-c:v','copy','-c:a','aac','-movflags','+faststart',mixed);await run(binaries().ffmpeg,args,{signal,timeout:1800000});await rename(mixed,partial);}
    const captions=projectCaptions(scene).filter(c=>!sceneWindow||c.end>sceneWindow.start&&c.start<sceneWindow.end),size=dimensions(project.aspect,height),output=path.join(temp,'composition.mp4');
    const packed=process.resourcesPath&&path.join(process.resourcesPath,'fonts'),fonts=packed&&existsSync(packed)?packed:path.resolve(import.meta.dirname,'../vendor/fonts');
    const escape=v=>v.replace(/\\/g,'/').replace(/:/g,'\\:').replace(/'/g,"\\'");
    const args=['-hide_banner','-loglevel','error','-y','-i',partial],filters=[];let input=0,previous='0:v';
    if(window.range||[...(scene.imageLayers||[]),...(scene.videoLayers||[]),...(scene.shapeLayers||[]),...(scene.textLayers||[])].some(t=>animated(t))){
      filters.push(`[0:v]setpts=PTS-STARTPTS${window.range?'+'+window.offset+'/TB':''}[montage]`);previous='montage';
    }
    for(const id of layerOrder(scene)){
      const component=[...(scene.textLayers||[]),...(scene.shapeLayers||[]),...(scene.imageLayers||[]),...(scene.videoLayers||[])].find(t=>t.id===id);if(sceneWindow&&component&&(component.end<=sceneWindow.start||component.start>=sceneWindow.end))continue;
      const text=scene.textLayers?.find(t=>t.id===id),words=id==='@captions'?captions:text?[text]:null;
      const shape=scene.shapeLayers?.find(t=>t.id===id);
      if(words||shape){
        if(words&&!words.length)continue;
        const ass=path.join(temp,`text-${filters.length}.ass`),next=`layer${filters.length}`;
        await writeFile(ass,shape?shapeAss(shape,size.width,size.height,sceneWindow):toAss(words,size.width,size.height,scene.captionStyle,sceneWindow));
        filters.push(`[${previous}]ass='${escape(ass)}':fontsdir='${escape(fonts)}'[${next}]`);previous=next;
      }else{
        const t=[...(scene.imageLayers||[]),...(scene.videoLayers||[])].find(t=>t.id===id),a=project.assets.find(a=>a.id===t.assetId);
        const w=Math.max(2,Math.round(size.width*t.width/100/2)*2),h=Math.max(2,Math.round(w*a.height/a.width/2)*2),next=`layer${filters.length}`;
        const visibleStart=sceneWindow?Math.max(t.start,sceneWindow.start):t.start,visibleEnd=sceneWindow?Math.min(t.end,sceneWindow.end):t.end;
        args.push(...(a.kind==='image'?['-loop','1',...(animated(t)?['-framerate','30']:[])]:['-ss',String(t.in+(t.freeze?0:visibleStart-t.start)),'-t',String(t.freeze?.1:visibleEnd-visibleStart)]),'-i',registry.get(t.assetId).path);input++;
        const imageClock=a.kind==='image'&&sceneWindow?`setpts=PTS-STARTPTS+${window.offset}/TB,`:'';
        const hold=t.freeze?'trim=end_frame=1,loop=loop=-1:size=1:start=0,setpts=N/30/TB,':'';
        if(animated(t)){
          const maxSize=Math.max(...pointsOf(t).map(p=>p.size)),sizeExpr=keyframeExpression(t,'size','T'),opacity=keyframeExpression(t,'opacity','T'),x=keyframeExpression(t,'x'),y=keyframeExpression(t,'y');
          const maxW=Math.max(2,Math.round(size.width*maxSize/100/2)*2),maxH=Math.max(2,Math.round(maxW*a.height/a.width/2)*2),diagonal=Math.ceil(Math.hypot(maxW,maxH))+4;
          // Keep one fixed frame size: rotate/geq cache input geometry, so a variable scale upstream can freeze the rendered size.
          const sx=`(X-${diagonal}/2)*${maxSize}/(${sizeExpr})+${diagonal}/2`,sy=`(Y-${diagonal}/2)*${maxSize}/(${sizeExpr})+${diagonal}/2`;
          filters.push(`[${input}:v]${hold}fps=30,${a.kind==='image'?imageClock:`setpts=PTS-STARTPTS+${visibleStart}/TB,`}scale=${maxW}:${maxH},format=rgba,pad=${diagonal}:${diagonal}:(ow-iw)/2:(oh-ih)/2:color=0x00000000,geq=r='r(${sx},${sy})':g='g(${sx},${sy})':b='b(${sx},${sy})':a='alpha(${sx},${sy})*(${opacity})/100',rotate=${t.rotation}*PI/180:ow=${diagonal}:oh=${diagonal}:c=none[img${input}]`);
          filters.push(`[${previous}][img${input}]overlay=x='${size.width}*(${x})/100-w/2':y='${size.height}*(${y})/100-h/2':enable='gte(t,${t.start})*lt(t,${t.end})':eof_action=pass[${next}]`);
        }else{
          filters.push(`[${input}:v]${hold}${a.kind==='image'?imageClock:`setpts=PTS-STARTPTS+${visibleStart}/TB,`}scale=${w}:${h},format=rgba,colorchannelmixer=aa=${t.opacity/100},rotate=${t.rotation}*PI/180:ow=rotw(${t.rotation}*PI/180):oh=roth(${t.rotation}*PI/180):c=none[img${input}]`);
          filters.push(`[${previous}][img${input}]overlay=x=${size.width*t.x/100}-w/2:y=${size.height*t.y/100}-h/2:enable='gte(t,${t.start})*lt(t,${t.end})':eof_action=pass[${next}]`);
        }previous=next;
      }
    }
    if(window.range){filters.push(`[${previous}]trim=start=${window.range.start}:end=${window.range.end},setpts=PTS-STARTPTS[ranged]`);previous='ranged';filters.push(`[0:a]atrim=start=${window.range.start-window.offset}:end=${window.range.end-window.offset},asetpts=PTS-STARTPTS[rangeAudio]`);}
    if(filters.length){
      args.push('-filter_complex',filters.join(';'),'-map',`[${previous}]`,'-map',window.range?'[rangeAudio]':'0:a','-t',String(renderLength),'-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-c:a',window.range?'aac':'copy','-movflags','+faststart',output);
      await run(binaries().ffmpeg,args,{signal,timeout:1800000});await rename(output,partial);
    }
    if(signal?.aborted)throw new Error('Operação cancelada.');
    await rename(partial,destination);return {path:destination};
  } finally {await rm(temp,{recursive:true,force:true});await rm(partial,{force:true});}
}
