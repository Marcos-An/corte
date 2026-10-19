// Concrete image layer controls; text continues using its existing editor.
export function createImageScene(stage,canvas,{pause,select,preview,commit,error}){
 const surface=document.createElement('div');surface.className='composition-scene image-scene';stage.append(surface);const nodes=new Map();let current=[],disabled=false;
 function align(){const r=canvas.getBoundingClientRect(),s=stage.getBoundingClientRect();Object.assign(surface.style,{left:r.left-s.left+'px',top:r.top-s.top+'px',width:canvas.width+'px',height:canvas.height+'px',transform:'scale('+r.width/canvas.width+')',transformOrigin:'top left'});}
 new ResizeObserver(align).observe(canvas);
 function gesture(node,e){
  if(disabled||e.button!==0)return;e.preventDefault();e.stopPropagation();pause();select(node.entry.id);
  const initial={...node.entry},r=surface.getBoundingClientRect(),resize=e.target.classList.contains('image-resize'),box=node.getBoundingClientRect(),cx=box.left+box.width/2,cy=box.top+box.height/2,from=Math.hypot(e.clientX-cx,e.clientY-cy)||1;
  let patch=null;node.setPointerCapture(e.pointerId);
  const move=ev=>{
   const round=n=>Math.round(n*10)/10,clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
   patch=resize?{width:round(clamp(initial.width*Math.hypot(ev.clientX-cx,ev.clientY-cy)/from,5,100))}:{x:round(clamp(initial.x+(ev.clientX-e.clientX)/r.width*100,0,100)),y:round(clamp(initial.y+(ev.clientY-e.clientY)/r.height*100,0,100))};
   if(resize&&['shape','blur'].includes(initial.kind)){const factor=clamp(Math.hypot(ev.clientX-cx,ev.clientY-cy)/from,Math.max(5/initial.width,5/initial.height),Math.min(100/initial.width,100/initial.height));patch={width:round(initial.width*factor),height:round(initial.height*factor)};}
   preview(initial.id,patch);
  };
  const end=ev=>{
   node.removeEventListener('pointermove',move);node.removeEventListener('pointerup',end);node.removeEventListener('pointercancel',end);
   try{if(patch&&ev.type!=='pointercancel')commit(initial.id,patch);}catch(e){error(e.message);}finally{preview(initial.id,null);}
  };
  node.addEventListener('pointermove',move);node.addEventListener('pointerup',end);node.addEventListener('pointercancel',end);
 }
 function update(entries,busy){
  current=entries;disabled=busy;align();
  for(const [id,node] of nodes)if(!current.some(t=>t.id===id)){node.querySelector('video')?.pause();node.remove();nodes.delete(id);}
  for(const t of entries){
   let node=nodes.get(t.id);
   if(!node){
    node=document.createElement('div');node.className='image-layer';node.tabIndex=0;node.setAttribute('role','button');
    const img=t.kind==='blur'?null:document.createElement(t.kind==='video'?'video':'img');if(img){img.draggable=false;img.alt='';if(t.kind==='video'){img.muted=true;img.preload='auto';img.playsInline=true;img.crossOrigin='anonymous';}img.onerror=()=>error('Mídia ausente ou inválida. Relocalize o arquivo pela timeline.',img.getAttribute('src'));}
    const handle=document.createElement('span');handle.className='image-resize';handle.title='Arraste para redimensionar';
    node.append(...(img?[img]:[]),handle);node.addEventListener('pointerdown',e=>gesture(node,e));node.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();select(node.entry.id);}});
    surface.append(node);nodes.set(t.id,node);
   }
   node.entry=t;node.classList.toggle('blur-layer',t.kind==='blur');node.style.backdropFilter=t.kind==='blur'?`blur(${t.radius}px)`:'';node.style.borderRadius=t.kind==='blur'&&t.blurShape==='ellipse'?'50%':'';node.classList.toggle('shape-layer',t.kind==='shape');node.setAttribute('aria-label','Selecionar '+(t.kind==='blur'?'desfoque ':t.kind==='shape'?'forma ':t.kind==='video'?'vídeo ':'imagem ')+t.name);node.classList.toggle('selected',t.selected);
   Object.assign(node.style,{zIndex:t.z||1,left:t.x+'%',top:t.y+'%',width:t.width+'%',aspectRatio:t.assetWidth+'/'+t.assetHeight,transform:'translate(-50%,-50%) rotate('+t.rotation+'deg)',opacity:t.opacity/100,pointerEvents:busy?'none':'auto'});
   const img=node.querySelector('img,video');if(img&&img.getAttribute('src')!==t.url){if(t.url)img.src=t.url;else img.removeAttribute('src');}
   if(t.kind==='video'){if(!t.playing)img.pause();if(!img.seeking&&Math.abs(img.currentTime-t.sourceTime)>(t.playing ? .2 : .015))img.currentTime=t.sourceTime;if(t.playing&&img.paused&&img.readyState>=2)img.play().catch(()=>error('Não foi possível reproduzir o vídeo sobreposto.'));}
  }
 }
 return {update};
}
