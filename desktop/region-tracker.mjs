// Local, seeded texture tracking. Confidence gates deliberately stop on ambiguity;
// this is not face recognition and cannot certify that a privacy mask is sufficient.
const GRID=16,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function smooth(frame,w,h){const out=new Uint8Array(frame.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let sum=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)sum+=frame[clamp(y+dy,0,h-1)*w+clamp(x+dx,0,w-1)];out[y*w+x]=sum/9;}return out;}
function pixel(frame,w,h,x,y){x=clamp(x,0,w-1.001);y=clamp(y,0,h-1.001);const ix=Math.floor(x),iy=Math.floor(y),dx=x-ix,dy=y-iy,i=iy*w+ix;return (frame[i]*(1-dx)+frame[i+1]*dx)*(1-dy)+(frame[i+w]*(1-dx)+frame[i+w+1]*dx)*dy;}
function patch(frame,w,h,box){
 const values=new Float32Array(GRID*GRID);let mean=0,n=0;
 for(let y=0;y<GRID;y++)for(let x=0;x<GRID;x++){const v=pixel(frame,w,h,box.x+((x+.5)/GRID-.5)*box.w*.8,box.y+((y+.5)/GRID-.5)*box.h*.8);values[n++]=v;mean+=v;}mean/=n;
 let norm=0;for(let i=0;i<n;i++){values[i]-=mean;norm+=values[i]**2;}norm=Math.sqrt(norm);if(norm/n**.5<7)return null;for(let i=0;i<n;i++)values[i]/=norm;return values;
}
const similarity=(a,b)=>{if(!a||!b)return -1;let sum=0;for(let i=0;i<a.length;i++)sum+=a[i]*b[i];return sum;};
export function createRegionTracker(first,width,height,region){
 first=smooth(first,width,height);
 let box={x:region.x*width,y:region.y*height,w:region.w*width,h:region.h*height};
 if(box.w<12||box.h<12)throw Error('A área é pequena demais para acompanhar. Aumente a região.');
 let adaptive=patch(first,width,height,box),anchor=adaptive,previous=first;
 if(!anchor)throw Error('A área tem poucos detalhes. Selecione um rosto ou objeto com contornos visíveis.');
 const initial={...box},inside=b=>b.x-b.w/2>=0&&b.y-b.h/2>=0&&b.x+b.w/2<=width-1&&b.y+b.h/2<=height-1;
 return {next(frame){
  frame=smooth(frame,width,height);
  let change=0,count=0;for(let i=0;i<frame.length;i+=101){change+=Math.abs(frame[i]-previous[i]);count++;}if(change/count>48)return {lost:true,reason:'Mudança brusca de cena.'};
  const radius=Math.min(64,Math.max(14,Math.max(box.w,box.h)*.65)),step=3,candidates=[];
  const score=b=>{if(!inside(b))return null;const p=patch(frame,width,height,b),local=similarity(p,adaptive),fixed=similarity(p,anchor);return {box:b,patch:p,local,fixed,score:local*.75+fixed*.25};};
  for(const scale of [.96,1,1.04])for(let dy=-radius;dy<=radius;dy+=step)for(let dx=-radius;dx<=radius;dx+=step){const b={x:box.x+dx,y:box.y+dy,w:clamp(box.w*scale,initial.w*.6,initial.w*1.7),h:clamp(box.h*scale,initial.h*.6,initial.h*1.7)},c=score(b);if(c)candidates.push(c);}
  candidates.sort((a,b)=>b.score-a.score);let best=candidates[0];if(!best)return {lost:true,reason:'O alvo saiu da imagem.'};
  for(const candidate of candidates.slice(0,4)){const coarse=candidate.box;for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){const c=score({...coarse,x:coarse.x+dx,y:coarse.y+dy});if(c&&c.score>best.score)best=c;}}
  let alternate=candidates.find(c=>Math.hypot((c.box.x-best.box.x)/box.w,(c.box.y-best.box.y)/box.h)>.65);
  if(alternate){const coarse=alternate.box;for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){const c=score({...coarse,x:coarse.x+dx,y:coarse.y+dy});if(c&&Math.hypot((c.box.x-best.box.x)/box.w,(c.box.y-best.box.y)/box.h)>.65&&c.score>alternate.score)alternate=c;}}
  if(best.local<.62||best.fixed<.38||best.score<.60)return {lost:true,reason:'O alvo mudou de aparência, ficou encoberto ou se moveu rápido demais.'};
  if(alternate&&best.score-alternate.score<.055)return {lost:true,reason:'Há áreas parecidas; não foi possível manter o mesmo alvo.'};
  box=best.box;previous=frame;
  if(best.local>.76&&best.fixed>.50){const updated=adaptive.map((v,i)=>v*.85+best.patch[i]*.15),norm=Math.sqrt(updated.reduce((s,v)=>s+v*v,0));adaptive=updated.map(v=>v/norm);}
  return {x:box.x/width,y:box.y/height,w:box.w/width,h:box.h/height,confidence:best.score};
 }};
}
