# Corte

Editor desktop de vídeo com Electron, edição não destrutiva e assistência por IA.

## Download

Ainda não há instalador desta versão publicado neste repositório. O código atual contém melhorias posteriores aos pacotes locais antigos. Os instaladores serão distribuídos pela seção **Releases**, depois de gerar e validar os pacotes de cada plataforma.

Não confunda o ZIP do código-fonte com um aplicativo pronto para instalar. Windows físico e assinatura/notarização dos pacotes ainda precisam de validação para distribuição.

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

Salvar um projeto não incorpora os arquivos de mídia. Preserve e leve/relocalize os originais ao mudar de computador. Música depois do fim da montagem não prolonga o MP4.

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
- Ferramentas de cada plataforma em `vendor/darwin-arm64` e `vendor/windows`: veja os arquivos `.README` e `.LICENSE` incluídos para procedência. As ferramentas efetivamente incluídas no pacote são definidas em `package.json`.
- `yt-dlp` é necessário para a integração não oficial de música. Essa integração pode falhar por faixa ou mudança do serviço; não usa login/cookies/bypass. Disponibilidade da faixa não concede licença para reutilizá-la.

Obtenha arquivos somente das fontes oficiais indicadas, respeite as licenças e confira hashes quando houver. Este repositório não inclui um provisionador automático completo de todas essas dependências. Não publique dados de autenticação para resolver dependências ausentes.

```sh
npm run dist:mac
npm run dist:win
```

Build bem-sucedido não comprova instalação, assinatura, reprodução ou exportação no computador do usuário. Os pacotes precisam de QA próprio antes de uma Release pública.

## Testes

```sh
npm test
npm run check
node tests/ai-complex.e2e.mjs
```

A suíte inclui testes do modelo/histórico, validação de planos e MP4 reais com medidas de pixels/PCM. E2Es usam Electron/Playwright e fontes sintéticas temporárias. Alguns testes exploratórios antigos dependem de mídia/artefatos locais, que não fazem parte do repositório.

`tests/ai-complex.integration.mjs` é opt-in: `CORTE_TEST_CODEX_HOME` deve apontar para a autenticação local autorizada; usa texto/metadados sintéticos e pode consumir cota. Nunca compartilhe essa pasta. Outros testes opt-in podem enviar frames/áudio à nuvem.

## Licenças

As dependências, fontes, modelos e ferramentas têm licenças próprias; avisos/proveniência disponíveis em `vendor`. Revise os requisitos de redistribuição de FFmpeg e de todos os arquivos empacotados antes de publicar instaladores.

A licença de uso do código autoral do Corte ainda será definida. Repositório público não deve ser interpretado como concessão de licença MIT/Apache ou de direitos sobre músicas/mídias de terceiros.
