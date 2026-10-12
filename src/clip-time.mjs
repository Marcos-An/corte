// Source intervals are immutable media coordinates; all editor durations use montage seconds.
export const clipSpeed=c=>c.speed??1;
export const clipDuration=c=>(c.out-c.in)/clipSpeed(c);
export const sourceTime=(c,localTime)=>c.in+localTime*clipSpeed(c);
export const montageTime=(c,source)=>(source-c.in)/clipSpeed(c);
