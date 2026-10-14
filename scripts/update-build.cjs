// Full installers bootstrap models; this NSIS package is only for existing installs.
const {build}=require('../package.json');
const {createHash}=require('node:crypto');
const manifest=require('../vendor/models/manifest.json');
// Changing models needs its own migration/download, not a code-only update.
if(createHash('sha256').update(JSON.stringify(manifest)).digest('hex')!=='42530998cbc04494a8437e93d25a213f00d3954b89991ae66d336656b58e12c7')throw Error('Modelo de IA mudou: atualize a estratégia de migração antes de gerar um update sem modelos.');
module.exports={...build,directories:{output:'release/update'},extraResources:build.extraResources.filter(r=>r.to!=='models'),win:{...build.win,artifactName:'Corte.Update.${version}.${ext}'}};
