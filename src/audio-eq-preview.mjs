import {audioEQCoefficients} from './audio-eq.mjs';
export function createAudioEQPreview(context,source,output){
 const input=context.createGain(),dry=context.createGain(),wet=context.createGain();source.connect(input);dry.gain.value=1;wet.gain.value=0;dry.connect(output);wet.connect(output);let filters=[],key=null,bypassed=null,active=false;
 const rebuild=value=>{input.disconnect();for(const f of filters)f.disconnect();filters=audioEQCoefficients(value,context.sampleRate).map(({a,b})=>context.createIIRFilter(b,a));input.connect(dry);let previous=input;for(const filter of filters){previous.connect(filter);previous=filter;}previous.connect(wet);active=filters.length>0;};
 return {
  configure(value,identity,bypass=false){const next=JSON.stringify([identity,value]);if(next!==key){rebuild(value);key=next;bypassed=null;}const audible=active&&!bypass;if(audible!==bypassed){const at=context.currentTime;for(const [node,target]of [[dry,audible?0:1],[wet,audible?1:0]]){node.gain.cancelScheduledValues(at);node.gain.setValueAtTime(node.gain.value,at);node.gain.linearRampToValueAtTime(target,at+.01);}bypassed=audible;}},
  reset(){key=null;},
  dispose(){source.disconnect(input);input.disconnect();dry.disconnect();wet.disconnect();for(const f of filters)f.disconnect();filters=[];}
 };
}
