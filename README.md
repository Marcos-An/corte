# Corte

Editor desktop de vídeo com Electron, edição não destrutiva e assistência por IA.

## Download

Pré-release **0.5.4**: [downloads e notas da versão](https://github.com/Marcos-An/corte/releases/tag/v0.5.4).

- **macOS Apple Silicon (arm64):** arquivo `.dmg` ou `.zip`. Não há pacote Intel nesta versão.
- **Windows x64:** instalador `Corte.Setup.0.5.4.exe`.
- Pacotes **sem assinatura digital/notarização**; macOS/Windows podem mostrar avisos de segurança. Não desative a proteção do sistema inteiro.

O aplicativo empacotado foi validado no Mac com mídia sintética, salvar/reabrir e exportação real. As ferramentas Windows passaram por testes nativos de H.264/AAC, probe e legendas; instalação e interface completas no Windows físico ainda não foram validadas. Esta versão é beta, não uma certificação de estabilidade.

A Release inclui fontes correspondentes das ferramentas GPL e `SHA256SUMS`. O ZIP automático do código-fonte não é um aplicativo instalável.

## Editor

- Importação de vídeos/fotos diretamente na timeline, sem biblioteca de arquivos usados.
- Cortes, aparo, reordenação, enquadramento, formatos, volume, histórico e desfazer/refazer.
- Música e narração em trilhas independentes; áudio original vinculado ao vídeo.
- Texto editável no próprio vídeo, imagens/PNG transparente, vídeos sobrepostos silenciosos e formas (retângulo, círculo, linha e seta).
- Fundos preto, cor e borrado; transições dissolver, escurecer e deslizar, respeitando margens reais.
- Brilho, contraste, saturação, velocidade constante de 0,25× a 4× e fades de áudio.
- Presets e keyframes lineares de posição, tamanho e opacidade nos componentes.
- Legendas em um bloco na timeline, até duas linhas por página e karaokê quando há tempos por palavra.
- Menu à esquerda por padrão, alternável para baixo nas configurações.
- Projetos `.corte` editáveis, relocalização de mídia e MP4 H.264/AAC em 720p/1080p.

### Salvar e reabrir

- **Salvar / Ctrl+S:** atualiza o arquivo aberto. Na primeira gravação, escolha um nome; `.corte` é acrescentado se omitido, com confirmação antes de substituir um destino existente.
- **Salvar como… / Ctrl+Shift+S:** cria outra cópia e passa a salvar nela. Cancelar mantém o arquivo anterior.
- **Salvar cópia portátil…:** no menu ao lado de Salvar ou no menu Arquivo, escolha uma pasta. O Corte cria uma subpasta nova com `project.corte` e `media/`. Inclui mídias usadas no projeto **e no histórico** para preservar restauração; pode ocupar bastante espaço. Leve a subpasta inteira, não apenas o `.corte`.
- Duplo clique/Abrir com Corte encaminha o arquivo para o editor, inclusive com ele já aberto. Alterações não salvas exigem confirmação antes da troca.
- O projeto comum não incorpora mídias. Se forem movidas/apagadas, a timeline continua presente e um aviso **Localizar mídias…** permite relocalizá-las. Salvar nesse estado preserva as referências; cópia portátil exige mídias disponíveis/verificadas.

Projetos antigos com referências absolutas continuam legíveis. Cópias portáteis com referências relativas exigem a versão nova do Corte; a release 0.5.4 não entende esse formato adicional. Salvar não reconstitui edições que não estejam no arquivo/histórico. Não altere/copiar vídeos originais sobre o projeto. Música depois do fim da montagem não prolonga o MP4.

## IA e privacidade

A assistência de edição utiliza a conta ChatGPT conectada pelo app. O fluxo atual interpreta texto/metadados para montar um plano validado de operações; planos válidos são aplicados em um único histórico. Erros, pedidos não suportados ou que precisam de esclarecimento não aplicam parte do plano.

Para transições, componentes e trilhas independentes, use **Montagem inteira**. **Trecho selecionado** limita as alterações ao clipe escolhido.

A IA não reconhece semanticamente pessoas/ações nem corta pelo conteúdo da fala nesse fluxo. O detector local de nitidez é uma heurística, não um substituto para esses critérios. O código inclui caminhos visuais experimentais, mas sua presença não significa que estejam disponíveis no fluxo ativo.

Geração de legendas na nuvem usa uma chave OpenAI configurada pelo usuário; seu áudio é enviado ao provedor nessa ação. Há também código de transcrição local que depende de modelos externos. Testes opt-in de IA/transcrição podem consumir cota/créditos ou enviar mídia: leia o teste e autorize o material antes de executar.

Credenciais, cookies, caches, gravações e mídias do usuário pertencem aos dados locais do aplicativo e **não devem ser adicionados ao Git**. Não há credenciais incluídas no repositório. Limites/custos dependem da conta e do uso; não há promessa de custo zero.

## Desenvolvimento

Requer Node.js compatível com as dependências do lockfile e uma plataforma suportada por Electron.

```sh
npm ci
npm test
npm run check
npm start
```

A edição básica usa as dependências instaladas por npm. Fontes e ícones estão incluídos com os avisos disponíveis em `vendor/fonts`. Não é necessário conectar uma conta para editar manualmente.

### Dependências externas para recursos opcionais e empacotamento

Binários de ferramentas, modelos ONNX e instaladores **não são versionados**. Antes de usar inferência/transcrição local ou empacotar, prepare os arquivos esperados:

- Modelos em `vendor/models`: veja `vendor/models/manifest.json` para o modelo CLIP, revisão e hashes fixados. A transcrição local usa `onnx-community/whisper-small_timestamped` com arquivos de configuração/tokenizer e modelos ONNX quantizados na estrutura esperada pelo Transformers.js.
- Ferramentas de cada plataforma em `vendor/darwin-arm64` e `vendor/windows`: veja os arquivos `.README` e `.LICENSE` incluídos para procedência. As ferramentas efetivamente incluídas no pacote são definidas em `package.json`. As receitas isoladas, versões/hash fixados e fontes correspondentes estão documentadas em `vendor/distribution/README.md`; o workflow manual compila e testa as ferramentas no Windows nativo.
- `yt-dlp` é necessário para a integração não oficial de música. Essa integração pode falhar por faixa ou mudança do serviço; não usa login/cookies/bypass. Disponibilidade da faixa não concede licença para reutilizá-la.

Obtenha arquivos somente das fontes oficiais indicadas, respeite as licenças e confira hashes quando houver. Este repositório não inclui um provisionador automático completo de todas essas dependências. Não publique dados de autenticação para resolver dependências ausentes.

```sh
npm run dist:mac
npm run dist:win
```

Build bem-sucedido não comprova instalação, assinatura, reprodução ou exportação no computador do usuário. Os pacotes precisam de QA próprio antes de uma Release pública.

## Releases rápidas

Requer `gh` autenticado, Node/npm e o commit atual já enviado para `origin/main`, com checkout limpo. O comando **não faz commit/push** nem publica uma versão automaticamente:

```sh
# Apenas validar e gerar artefatos (sem criar release):
npm run release -- 0.5.5 --dry-run
# Gerar um rascunho de pré-release para aprovação manual:
npm run release -- 0.5.5
```

Escolha uma versão numérica maior que as anteriores; versões/tags existentes nunca são sobrescritas. Acompanhe [Draft release no GitHub Actions](https://github.com/Marcos-An/corte/actions/workflows/release.yml). A execução só aceita `main` e o SHA exato solicitado. A versão é carimbada em `package.json`/lockfile **no build do CI**, sem modificar o commit de origem; o rascunho registra ambos.

Mac arm64 e Windows x64 são empacotados nativamente em paralelo. Os modelos e ferramentas vêm dos pacotes **0.5.4 com hashes fixados** em `scripts/release-bootstrap.json`; o cache é verificado a cada execução. Não há recompilação de FFmpeg para uma mudança comum no editor. A primeira execução baixa os pacotes-base; as seguintes podem usar o cache. Se mudar ferramentas/modelos/fontes correspondentes, atualize explicitamente seus manifests e a base verificada — divergência bloqueia o build.

Os gates incluem testes, sintaxe, varredura sanitizada de padrões de segredos, auditoria dos arquivos empacotados/fontes/licenças/hashes e smoke com exportação MP4 real nos dois runners. Só depois de ambos passarem os instaladores e fontes recebem `SHA256SUMS`. Artefatos de dry-run ficam disponíveis por 7 dias. Runners não substituem QA físico, assinatura ou revisão jurídica.

Para publicar, revise o rascunho, downloads e notas no GitHub e clique em **Publish release**. Falha de upload pode deixar um rascunho incompleto: não o publique; confira os nove arquivos e retome/corrija manualmente, sem sobrescrever uma release publicada. A instalação inicial continua manual; atualizações seguintes no Windows usam o feed descrito abaixo.

## Testes

```sh
npm test
npm run check
node tests/ai-complex.e2e.mjs
# Depois de gerar os dois pacotes:
node tests/distribution.integration.mjs
# Testar o app empacotado no Mac:
CORTE_TEST_APP="$PWD/release/mac-arm64/Corte.app/Contents/MacOS/Corte" node tests/ai-complex.e2e.mjs
```

A suíte inclui testes do modelo/histórico, validação de planos e MP4 reais com medidas de pixels/PCM. E2Es usam Electron/Playwright e fontes sintéticas temporárias. Alguns testes exploratórios antigos dependem de mídia/artefatos locais, que não fazem parte do repositório.

`tests/ai-complex.integration.mjs` é opt-in: `CORTE_TEST_CODEX_HOME` deve apontar para a autenticação local autorizada; usa texto/metadados sintéticos e pode consumir cota. Nunca compartilhe essa pasta. Outros testes opt-in podem enviar frames/áudio à nuvem.

## Licenças

As dependências, fontes, modelos e ferramentas têm licenças próprias; avisos/proveniência disponíveis em `vendor`. FFmpeg/FFprobe 6.1.1 são executáveis separados, compilados com componentes GPL e sem `--enable-nonfree`. Textos GPL e fontes correspondentes acompanham os pacotes e a Release; veja `vendor/distribution/README.md`. Essa verificação técnica não constitui parecer jurídico sobre todos os usos do aplicativo.

A licença de uso do código autoral do Corte ainda será definida. Repositório público não deve ser interpretado como concessão de licença MIT/Apache ou de direitos sobre músicas/mídias de terceiros.

## Atualizações automáticas (Windows)

A próxima versão instalada para Windows consulta as releases públicas deste repositório ao abrir e a cada 6 horas. Também há **Configurações → Verificar atualizações**. O download ocorre em segundo plano; **Reiniciar e atualizar** só instala quando o projeto está salvo e nenhuma operação/gravação está em andamento. Sair normalmente não instala atualizações. Erros de rede, checksum ou preparação da IA mantêm a versão atual e permitem tentar novamente. Nenhum token GitHub é distribuído no aplicativo.

- **Primeira instalação / transição da 0.5.4:** use o instalador completo `Corte.Setup.<versão>.exe`. A 0.5.4 publicada não possui atualizador. O novo aplicativo verifica e copia os modelos para uma pasta versionada em `userData/models` antes de buscar atualizações; exige espaço livre para essa cópia (aproximadamente 326 MB). Se falhar, não baixa/instala o update.
- **Atualizações seguintes:** o feed `latest.yml` aponta exclusivamente para `Corte.Update.<versão>.exe`, sem pesos de IA. O NSIS tenta download diferencial usando os `.blockmap`; se não for possível, baixa o pacote de atualização completo, ainda sem modelos. Não há promessa de tamanho fixo: Electron, ferramentas e dependências podem mudar.
- **Modelos:** o pacote de atualização bloqueia mudanças no fingerprint dos modelos. Trocar modelos exigirá uma migração/download próprio antes de liberar um update sem pesos. Não apague `userData/models` após migrar para o pacote menor.
- **Release:** o workflow gera o instalador completo, o pacote de atualização, blockmap e feed; valida tamanho/SHA-512 e adiciona SHA-256 de todos os assets. Continua criando somente **rascunho**, sem publicar automaticamente. Mantenha blockmaps das versões anteriores nas releases públicas para permitir deltas.
- **Limites de segurança:** builds atuais não têm assinatura de publisher. HTTPS e SHA-512 detectam corrupção no download, mas não substituem assinatura se a conta/repositório de releases for comprometido. macOS continua com atualização manual até configurar assinatura/notarização.

Verificações: `node --test tests/updates.test.mjs tests/models-store.test.mjs tests/release.test.mjs`, `node tests/updates.e2e.mjs` (Chromium Playwright), `node tests/updater-download.integration.mjs` (Electron e download real, sem executar o instalador de teste). Essas verificações não substituem testar instalação/reinício entre duas versões em um Windows real, incluindo modelos e projetos preservados.

Para medir o delta real sem instalar nada: `CORTE_TEST_OLD_UPDATE=/caminho/Corte.Update.0.5.4.exe CORTE_TEST_NEW_UPDATE=/caminho/Corte.Update.0.5.5.exe node tests/updater-differential.integration.mjs` (ambos precisam dos `.blockmap` adjacentes). Um smoke local que alterou somente versão/metadados transferiu 1.309 MB de um pacote de 481.197 MB. Isso valida o mecanismo de ranges/reuso/SHA-512, não promete esse tamanho para mudanças reais de código e não executa a instalação Windows.
