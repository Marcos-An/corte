// RBJ Audio EQ Cookbook: https://www.w3.org/TR/audio-eq-cookbook/
// The same normalized biquad coefficients feed Web Audio IIRFilterNode and FFmpeg.
export const AUDIO_EQ_DEFAULTS=Object.freeze({low:0,mid:0,high:0,highpass:0});
export const AUDIO_EQ_CONTROLS={low:{label:'Graves',min:-12,max:12,step:.5,unit:' dB'},mid:{label:'Clareza',min:-12,max:12,step:.5,unit:' dB'},high:{label:'Agudos',min:-12,max:12,step:.5,unit:' dB'},highpass:{label:'Cortar abaixo de',min:0,max:200,step:10,unit:' Hz'}};
export function validateAudioEQ(value,{patch=false}={}){
 if(!value||typeof value!=='object'||Array.isArray(value)||!Object.keys(value).length||Object.keys(value).some(k=>!Object.hasOwn(AUDIO_EQ_CONTROLS,k))||!patch&&Object.keys(value).length!==4)throw Error('Equalização inválida.');
 for(const [k,v]of Object.entries(value)){const c=AUDIO_EQ_CONTROLS[k];if(!Number.isFinite(v)||v<c.min||v>c.max)throw Error('Use de −12 a +12 dB e corte de graves de 0 a 200 Hz.');}return value;
}
export function patchAudioEQ(current,patch){if(patch===null)return undefined;validateAudioEQ(patch,{patch:true});const value={...AUDIO_EQ_DEFAULTS,...current,...patch};validateAudioEQ(value);return Object.values(value).some(v=>v!==0)?value:undefined;}
export const audioEQActive=track=>!!track?.audioEQ&&Object.values(track.audioEQ).some(v=>v!==0);
export function audioEQCoefficients(value,sampleRate=48000){
 if(value===undefined)return [];validateAudioEQ(value);if(!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>384000)throw Error('Taxa de áudio inválida.');
 const stages=[],add=(b,a)=>{const scale=a[0];stages.push({b:b.map(v=>v/scale),a:a.map(v=>v/scale)});};
 const terms=f=>{const w=2*Math.PI*Math.min(f,sampleRate*.45)/sampleRate;return {c:Math.cos(w),s:Math.sin(w)};};
 if(value.highpass){const {c,s}=terms(value.highpass),alpha=s/(2*Math.SQRT1_2);add([(1+c)/2,-(1+c),(1+c)/2],[1+alpha,-2*c,1-alpha]);}
 for(const [kind,frequency,gain]of [['low',200,value.low],['mid',2500,value.mid],['high',6000,value.high]]){
  if(!gain)continue;const A=10**(gain/40),{c,s}=terms(frequency),alpha=s/2*Math.SQRT2,beta=2*Math.sqrt(A)*alpha;
  if(kind==='mid'){const qAlpha=s/2;add([1+qAlpha*A,-2*c,1-qAlpha*A],[1+qAlpha/A,-2*c,1-qAlpha/A]);}
  else if(kind==='low')add([A*((A+1)-(A-1)*c+beta),2*A*((A-1)-(A+1)*c),A*((A+1)-(A-1)*c-beta)],[(A+1)+(A-1)*c+beta,-2*((A-1)+(A+1)*c),(A+1)+(A-1)*c-beta]);
  else add([A*((A+1)+(A-1)*c+beta),-2*A*((A-1)+(A+1)*c),A*((A+1)+(A-1)*c-beta)],[(A+1)-(A-1)*c+beta,2*((A-1)-(A+1)*c),(A+1)-(A-1)*c-beta]);
 }return stages;
}
export function audioEQFilter(track){const stages=audioEQCoefficients(track.audioEQ);return stages.length?'aresample=48000,'+stages.map(({a,b})=>`biquad=b0=${b[0]}:b1=${b[1]}:b2=${b[2]}:a0=1:a1=${a[1]}:a2=${a[2]}:precision=f64`).join(',')+',':'';}
