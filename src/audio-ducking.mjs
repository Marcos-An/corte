// Narration clips are explicit timeline anchors, so preview and export use the same envelope.
// Music returns smoothly between narration clips; no speech detection or audio uploads are involved.
export const DUCK_RAMP=.2;
export function narrationWindows(project,end=Math.max(project.clips.reduce((n,c)=>n+(c.freeze??(c.out-c.in)/(c.speed??1)),0),...(project.music||[]).map(c=>c.start+c.out-c.in))){
 const windows=(project.music||[]).filter(c=>c.role==='narration'&&c.volume>0).map(c=>[c.start,Math.min(end,c.start+c.out-c.in)]).filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0]);
 const merged=[];for(const w of windows){if(merged.length&&w[0]<=merged.at(-1)[1])merged.at(-1)[1]=Math.max(merged.at(-1)[1],w[1]);else merged.push([...w]);}return merged;
}
export function duckingLevel(track,time,windows){
 if(track.role==='narration'||track.ducking===undefined||track.ducking===1)return 1;
 let activity=0;for(const [start,end]of windows)activity=Math.max(activity,Math.max(0,Math.min(1,(time-start+DUCK_RAMP)/DUCK_RAMP,(end+DUCK_RAMP-time)/DUCK_RAMP)));
 return 1-(1-track.ducking)*activity;
}
export function duckingFilter(track,windows){
 if(track.role==='narration'||track.ducking===undefined||track.ducking===1||!windows.length)return '';
 const t=`(t+${track.start})`,terms=windows.map(([start,end])=>`clip(min((${t}-${start}+${DUCK_RAMP})/${DUCK_RAMP},(${end}+${DUCK_RAMP}-${t})/${DUCK_RAMP}),0,1)`);
 // A balanced expression also supports projects with many separated narration clips.
 let groups=terms;while(groups.length>1){const next=[];for(let i=0;i<groups.length;i+=2)next.push(groups[i+1]?`max(${groups[i]},${groups[i+1]})`:groups[i]);groups=next;}
 return `,volume='1-${1-track.ducking}*(${groups[0]})':eval=frame`;
}
