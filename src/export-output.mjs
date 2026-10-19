export const EXPORT_ASPECTS=['9:16','16:9','1:1','4:5'];
export function validateExportOutput(output){
 if(output===undefined)return {};
 if(!output||typeof output!=='object'||Array.isArray(output)||Object.keys(output).length!==2||!Object.keys(output).every(k=>['aspect','height'].includes(k))||output.aspect!==null&&!EXPORT_ASPECTS.includes(output.aspect)||output.height!==null&&![720,1080].includes(output.height))throw Error('Formato ou resolução do trecho inválidos.');
 return output.aspect===null&&output.height===null?{}:{exportOptions:{aspect:output.aspect,height:output.height}};
}
