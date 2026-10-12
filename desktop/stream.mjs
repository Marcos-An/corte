import {stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {Readable} from 'node:stream';
import path from 'node:path';
const mimes={'.mp4':'video/mp4','.mov':'video/quicktime','.m4v':'video/mp4','.webm':'video/webm','.mkv':'video/x-matroska','.avi':'video/x-msvideo','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp'};
export async function fileResponse(file,request){
 const {size}=await stat(file),range=request.headers.get('range');let start=0,end=size-1,status=200;
 const headers={'Content-Type':mimes[path.extname(file).toLowerCase()]||'application/octet-stream','Accept-Ranges':'bytes','Access-Control-Allow-Origin':'*','Cache-Control':'no-store'};
 if(range){
  const match=/^bytes=(\d*)-(\d*)$/.exec(range);
  if(!match || (!match[1]&&!match[2]))return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${size}`}});
  if(!match[1])start=Math.max(0,size-Number(match[2]));else{start=Number(match[1]);if(match[2])end=Math.min(size-1,Number(match[2]));}
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||start>=size)return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${size}`}});
  status=206;headers['Content-Range']=`bytes ${start}-${end}/${size}`;
 }
 headers['Content-Length']=String(end-start+1);
 if(request.method==='HEAD')return new Response(null,{status,headers});
 const stream=createReadStream(file,{start,end});return new Response(Readable.toWeb(stream),{status,headers});
}
