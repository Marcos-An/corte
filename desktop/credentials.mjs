import {readFile,writeFile,rename,rm} from 'node:fs/promises';
export function keyStore(file,safe){
 const secure=()=>{if(!safe.isEncryptionAvailable()||safe.getSelectedStorageBackend?.()==='basic_text')throw new Error('Armazenamento seguro indisponível neste sistema.');};
 return {
  async read(){try{const data=await readFile(file);secure();return safe.decryptString(data);}catch(e){if(e.code==='ENOENT')return null;throw new Error('Não foi possível acessar a chave protegida. Cadastre-a novamente.');}},
  async save(key){secure();if(typeof key!=='string'||!/^sk-[A-Za-z0-9_-]{20,}$/.test(key.trim())||key.length>1000)throw new Error('Formato de chave inválido.');const temp=file+'.tmp';try{await writeFile(temp,safe.encryptString(key.trim()),{mode:0o600});await rename(temp,file);}finally{await rm(temp,{force:true});}},
  async remove(){await rm(file,{force:true});}
 };
}
