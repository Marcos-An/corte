# Corte

Editor desktop de vídeo com Electron, edição não destrutiva e assistência por IA.

## Download

Windows x64 e macOS Apple Silicon **0.6.6**: [downloads e notas da versão](https://github.com/Marcos-An/corte/releases/tag/v0.6.6).

- **macOS Apple Silicon (arm64):** arquivo `.dmg` ou `.zip`. Não há pacote Intel nesta versão.
- **Windows x64:** instalador `Corte.Setup.0.6.6.exe`.
- Pacotes **sem assinatura digital/notarização**; macOS/Windows podem mostrar avisos de segurança. Não desative a proteção do sistema inteiro.

O aplicativo empacotado foi validado no Mac com mídia sintética, salvar/reabrir e exportação real. A interface Windows foi validada nesta máquina com edição complexa, salvar/reabrir, desfazer, exportação MP4 e atualização; o instalador e o feed passaram por auditoria de integridade. Esta versão é beta, não uma certificação de estabilidade.

A Release inclui fontes correspondentes das ferramentas GPL e `SHA256SUMS`. O ZIP automático do código-fonte não é um aplicativo instalável.

Em desenvolvimento após 0.6.4: **Componentes → Animação → Personalizar movimento → Curva** oferece Linear, Acelerar, Desacelerar e Suave entre o ponto selecionado e o próximo. Aparar o componente mantém a curva; adicionar um ponto sem mudar a pose preserva o movimento. Funciona em texto, imagem, vídeo e forma, inclusive por prompt, com desfazer e salvar/reabrir. Não muda a velocidade do vídeo.

Em desenvolvimento após 0.6.4: **Exportar → Intervalo** permite informar início/fim em segundos; uma seleção da timeline já preenche os campos. O projeto e seu histórico permanecem intactos. O render processa os clipes próximos, mantém a fase de legendas/animações e usa margem de transição quando necessário. Saída MP4 720p/1080p a 30 fps; intervalos de pelo menos 0,1 s. Em **Vários trechos**, monte uma fila temporária de até 20 vídeos com nome, início e fim. Escolha a pasta ao exportar; nomes existentes recebem um sufixo, sem sobrescrever. Cancelar preserva os concluídos, e **Exportar pendentes** retoma os restantes. **Mostrar** localiza cada arquivo pronto. A fila permanece ao fechar a janela Exportar e é reiniciada ao alterar/reabrir o projeto ou fechar o aplicativo; não modifica o projeto nem seu histórico. O formato e a resolução são comuns à fila.

## Editor

Na versão 0.6.4: **Arquivos de legenda** importa SRT/VTT e exporta os tempos atuais da montagem, sem serviço externo. Em música/narração, **Volume por intervalo** permite definir início/fim e volume manual; a IA usa `adjust_audio_range` para a mesma edição. Veja o [inventário e as próximas prioridades](docs/revisao-recursos-2026-10.md).

Também na versão 0.6.4: **Legendas → Transcrição → Neste computador** gera legendas de áudio original ou narração com os modelos locais, sem chave de API nem envio de áudio. Usa o reconhecimento preciso quando instalado, ou o básico incluído, e reutiliza análises compatíveis. A transcrição roda num processo isolado, inclusive no modo básico; cancelar pode encerrar esse processo sem fechar o editor. A opção **OpenAI · nuvem** continua exigindo chave, envio do áudio e cobrança separada. O reconhecimento local pode errar; revise os textos. Karaokê usa os tempos medidos por palavra, sem inventar tempos para trechos incertos.

Em desenvolvimento após 0.6.4: **Idioma do áudio** permite escolher a língua falada para a análise local, ou detectar automaticamente. A escolha fica salva no projeto e pode ser desfeita; trocar o idioma preserva as legendas atuais até gerar novamente. Idiomas diferentes têm caches separados. Por prompt, “gere legendas do áudio original falado em inglês, sem traduzir” usa o mesmo reconhecimento local e revisão. Português permanece o padrão de projetos antigos. Essa escolha não altera o modo nuvem e não oferece tradução.

A tela mostra qual reconhecimento está disponível. **Instalar preciso · 1,1 GB** é opcional; o aplicativo não faz esse download automaticamente ao gerar legendas. `tests/local-captions.e2e.mjs` usa fala sintética pt-BR, testa a transcrição real, o cache, o karaokê no vídeo e o cancelamento. A fixture curta pode ser regenerada no Windows por `scripts/make-caption-fixture.ps1`, que verifica a cultura da voz; não é necessária para executar os testes em outros sistemas.

Legendas locais também podem ser solicitadas por prompt, em **Montagem inteira**, tanto no motor por texto quanto no híbrido. Exemplo: “Corte o primeiro segundo e gere legendas do áudio original, brancas, embaixo, com karaokê”. O planejador solicita `generate_captions`; o aplicativo prepara o reconhecimento local antes de mostrar a proposta, sem aceitar texto/tempos inventados pelo planejador. A prévia paginada permite conferir todas as legendas antes de aplicar; cortes e legendas entram no mesmo desfazer. Uma falha de reconhecimento deixa essa parte pendente e preserva os ajustes independentes; cancelar não aplica nada. Uma única voz (original ou narração) fica ativa por projeto. Quando há evidência local completa e confiável da análise híbrida, ela é reutilizada sem uma segunda inferência. Pedidos só por metadados não enviam a nova transcrição ao ChatGPT.

Para alterar somente a aparência, a IA usa `edit_caption_style`: muda fonte/tamanho/cor/posição/estilo sem reconhecer novamente nem substituir correções manuais. O contrato recebe apenas fonte/quantidade de legendas, sem os textos salvos. `tests/caption-prompt.live.mjs` é opt-in com a conexão ChatGPT existente: envia metadados sintéticos, enquanto a fala sintética é reconhecida localmente; requer `CORTE_TEST_CODEX_HOME` e `CORTE_PROMPT_REPORT` e aceita `CORTE_PROMPT_FILTER` para selecionar casos.

- Importação de vídeos/fotos diretamente na timeline, sem biblioteca de arquivos usados.
- Cortes, aparo, reordenação, enquadramento, formatos, volume, histórico e desfazer/refazer.
- Música e narração em trilhas independentes; áudio original vinculado ao vídeo.
- Texto editável no próprio vídeo, imagens/PNG transparente, vídeos sobrepostos silenciosos e formas (retângulo, círculo, linha e seta).
- Fundos preto, cor e borrado; transições dissolver, escurecer e deslizar, respeitando margens reais.
- Brilho, contraste, saturação, velocidade constante de 0,25× a 4× e fades de áudio.
- Presets e keyframes de posição, tamanho e opacidade nos componentes, lineares por padrão.
- Legendas em um bloco na timeline, até duas linhas por página e karaokê quando há tempos por palavra.
- Menu à esquerda por padrão, alternável para baixo nas configurações.
- Projetos `.corte` editáveis, relocalização de mídia e MP4 H.264/AAC em 720p/1080p.

A partir da versão 0.6.3, **Selecionar trecho** permite informar início/fim em segundos e aplicar volume, brilho, contraste, saturação, temperatura, nitidez, velocidade ou zoom apenas nesse intervalo, inclusive atravessando clipes. Cada aplicação entra no histórico e preserva os demais ajustes. Alterar velocidade muda a duração selecionada. Ajustes sucessivos preservam a posição do zoom e dos fades existentes. Quadros congelados devem ser selecionados inteiros.

Também na versão 0.6.3: visuais **Natural, Comida, Quente e P&B** aplicam correção leve em um toque, com ajustes manuais e desfazer. A timeline se encaixa ao abrir/importar o primeiro material; o botão **Encaixar timeline** restaura essa vista. Zoom manual é preservado ao redimensionar a janela. O marcador da régua permite arrastar o cursor sem a linha bloquear clipes/transições.

Música e narração mantêm volumes independentes e manuais, com fades de entrada/saída. A presença de narração não reduz o volume da música. Configurações antigas de redução automática são aceitas ao abrir projetos, mas ficam inativas na prévia e na exportação.

As propostas da IA apresentam a decisão e as pendências primeiro; resumo, motivos, operações e evidências ficam recolhidos. Os detalhes continuam acessíveis e aplicar/descartar permanece explícito. Os testes `clean-editing.e2e.mjs` e `interval-controls.e2e.mjs` também integram a validação dos pacotes Windows/macOS na pipeline de release.

### Salvar e reabrir

- **Salvar / Ctrl+S:** atualiza o arquivo aberto. Na primeira gravação, escolha um nome; `.corte` é acrescentado se omitido, com confirmação antes de substituir um destino existente.
- **Salvar como… / Ctrl+Shift+S:** cria outra cópia e passa a salvar nela. Cancelar mantém o arquivo anterior.
- **Salvar cópia portátil…:** no menu ao lado de Salvar ou no menu Arquivo, escolha uma pasta. O Corte cria uma subpasta nova com `project.corte` e `media/`. Inclui mídias usadas no projeto **e no histórico** para preservar restauração; pode ocupar bastante espaço. Leve a subpasta inteira, não apenas o `.corte`.
- Duplo clique/Abrir com Corte encaminha o arquivo para o editor, inclusive com ele já aberto. Alterações não salvas exigem confirmação antes da troca.
- O projeto comum não incorpora mídias. Se forem movidas/apagadas, a timeline continua presente e um aviso **Localizar mídias…** permite relocalizá-las. Salvar nesse estado preserva as referências; cópia portátil exige mídias disponíveis/verificadas.

Projetos antigos com referências absolutas continuam legíveis. Cópias portáteis com referências relativas exigem a versão nova do Corte; a release 0.5.4 não entende esse formato adicional. Salvar não reconstitui edições que não estejam no arquivo/histórico. Não altere/copiar vídeos originais sobre o projeto. Música depois do fim da montagem não prolonga o MP4.

## IA e privacidade

A assistência utiliza a conta ChatGPT conectada pelo app. O modo por texto interpreta metadados e tempos explícitos; um pedido com recursos não suportados ou perguntas não aplica operações. O modo híbrido transcreve localmente e compartilha a transcrição e quadros selecionados após autorização. Ele apresenta uma proposta revisável, com alterações independentes possíveis e pendências explícitas; não equivale a concluir automaticamente todo pedido.

Para transições, componentes e trilhas independentes, use **Montagem inteira**. **Trecho selecionado** limita as alterações ao clipe escolhido.

No modo híbrido, palavras com tempos confiáveis podem orientar cortes de fala; quadros amostrados podem sustentar decisões visuais. Amostras não comprovam eventos nas lacunas nem o instante exato de toda ação. Tempos incertos e recursos ausentes ficam pendentes. O detector local de nitidez é uma heurística e não identifica pessoas, pratos, ingredientes ou ações por si só. Informações oficiais como endereço/data precisam ser fornecidas; não são inventadas.

A partir da versão 0.6.3, pedidos completos resolvíveis por texto/metadados passam por uma rota rápida no fluxo padrão: não transcrevem nem decodificam mídia, mas continuam exigindo revisão antes de aplicar. Pedidos visuais, mistos, ambíguos e edição por etapas seguem para a análise com evidências. Essa otimização não acelera a inferência visual em si.

Há transcrição local com modelos instalados/verificados pelo aplicativo e reutilização de análises em cache. Geração de legendas na nuvem usa uma chave OpenAI configurada pelo usuário; seu áudio é enviado ao provedor nessa ação. Testes opt-in de IA/transcrição podem consumir cota/créditos ou enviar mídia: leia o teste e autorize o material antes de executar. `tests/complex-prompts.live.mjs` testa pedidos reais usando apenas metadados sintéticos, com `CORTE_TEST_CODEX_HOME` e `CORTE_PROMPT_REPORT` definidos explicitamente.

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

Mac arm64 e Windows x64 são empacotados nativamente em paralelo. O Windows recompila as ferramentas de mídia antes de empacotar e registra os hashes dos artefatos produzidos. Os modelos e ferramentas vêm dos pacotes **0.5.4 com hashes fixados** em `scripts/release-bootstrap.json`; o cache é verificado a cada execução. Esta preparação recompila as ferramentas Windows com a receita controlada (NASM/SIMD e D3D11VA/DXVA2); os modelos e ferramentas auxiliares continuam vindo do bootstrap verificado. A primeira execução baixa os pacotes-base; as seguintes podem usar o cache. Se mudar ferramentas/modelos/fontes correspondentes, atualize explicitamente seus manifests e a base verificada — divergência bloqueia o build.

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

## Desenvolvimento e diagnóstico no Windows

Depois de `npm ci`, use `npm run start:win`. Esse comando usa os modelos completos já presentes em `%APPDATA%/Corte/models`, quando disponíveis, sem copiar autenticação. Feche o Corte instalado antes de abrir a versão de desenvolvimento. O código do clone e o aplicativo instalado são versões separadas; editar este repositório não atualiza o instalador existente.

As prévias são decodificadas em PNG/RGB e convertidas para JPEG pelo Sharp. Isso evita a corrupção verde/magenta reproduzida no encoder MJPEG do FFmpeg Windows distribuído. Os caminhos de cache são curtos e a gravação passa pelo Node para tolerar caminhos extensos no Windows.

A busca visual pode ser instalada em **Configurações → Busca visual**. O download usa a revisão e os hashes de `vendor/models/search-manifest.json`; o encoder de texto é independente do encoder de imagens. A busca encontra candidatos por similaridade e não comprova que uma ação aconteceu nem identifica corretamente todos os pratos.

O CLIP q8 usa CPU no Windows: o grafo quantizado caiu nativamente em DirectML na RTX 3060 testada. A transcrição mantém um perfil separado e pode usar DirectML; suas sessões desativam memory patterns e execução paralela, conforme a [documentação do ONNX Runtime](https://onnxruntime.ai/docs/execution-providers/DirectML-ExecutionProvider.html). CPU usa até seis threads internas. Isso não significa que toda GPU ou modelo tenha o mesmo desempenho.

Análises visuais e transcrições completas são reutilizadas localmente em `cache/local-evidence`, com invalidação por origem/tamanho/datas do arquivo, modelo, finalidade e amostragem. Reordenar a montagem não invalida os dados das fontes. O cache contém evidências de mídia e texto local, não é enviado ao Git e pode ser removido com o aplicativo fechado para liberar espaço. Excluir completamente uma fonte da montagem ou trocar a amostragem pode exigir nova análise.

Para medir um projeto autorizado sem chamar o ChatGPT:

```powershell
node scripts/bench-project.mjs "--project=C:\caminho\projeto.corte" "--cache=C:\caminho\cache-de-teste" --speech
```

Configure `CORTE_MODEL_PATH` e, opcionalmente, `CORTE_SPEECH_MODEL_PATH` para as pastas de modelos verificadas. O benchmark mostra a primeira execução e a reutilização, sem imprimir transcrições ou nomes de mídia. `tests/windows-preview.integration.mjs` compara uma prévia JPEG corrigida com uma referência PNG usando `CORTE_TEST_RESOURCES`, `CORTE_TEST_VIDEO` e, opcionalmente, `CORTE_TEST_TIME`.

Em propostas revisáveis, `set_transition_at` aceita `makeRoom:true`: prepara as margens com a mesma função da interface antes de aplicar a transição, encurtando os dois lados quando necessário. É explícito e desfazível; a proteção de fala incerta também valida esses aparos. Sem essa opção, permanece a exigência anterior de margens já disponíveis. Sharpness e temperature já existem no editor e agora são descritos corretamente ao planejador. Endereço, datas oficiais, imagens externas ausentes e novas gravações continuam exigindo os dados correspondentes.

## Pedidos complexos e proposta parcial

A IA pode mover um intervalo de um take (`move_range`), inserir um trecho de uma mídia importada (`insert_clip`) e posicionar música/narração importada (`add_audio`). Nenhuma dessas operações baixa arquivos externos ou gera locução ausente. As operações continuam não destrutivas e são aplicadas em um único histórico após revisão.

Quando um corte encontra fala sem tempos confiáveis, o fluxo revisável tenta preservar alterações independentes. Cortes por palavras/intervalos são filtrados, âncoras de fala são recalculadas e componentes com tempos absolutos dependentes ficam pendentes. A recuperação é validada novamente; se não for segura, o plano permanece bloqueado. Isso não autoriza remover fala incerta.

As três etapas mostram quantas foram aplicadas, puladas e quais pendências continuam abertas. “Proposto” não significa “Feito”. Narração futura, imagens ausentes, ingredientes, endereço e informações oficiais não fornecidos permanecem identificados como pendências. Use **Informações do local** para fornecer os fatos conhecidos.

O refinamento reutiliza imagens próximas com seus tempos reais, conserva evidências de todas as consultas visuais e prepara os demais quadros com até dois decodificadores simultâneos. Quadros exatos também entram no cache. Uma falha transitória na conferência adicional pode deixar uma proposta preliminar explicitamente marcada, somente para revisão; não é aplicação automática.

Sobreposições de vídeo também podem manter um quadro parado: marque **Manter este quadro parado** nas propriedades. A IA usa `place_still` com uma âncora de fala/fonte; o cartaz fica visível durante a âncora inteira, preservando o áudio principal. `place_overlay` continua reproduzindo o trecho e respeitando sua duração original. A exportação e a prévia compartilham esse comportamento.

Quando uma revisão contém cortes que atingem fala com tempos incertos, o sistema tenta preservar operações independentes e resolve novamente as âncoras de origem. Tempos absolutos dependentes de cortes descartados ficam pendentes. O resultado é identificado como parcial e exige revisão, sem afirmar que todos os itens foram concluídos.

Publicação autorizada por tag: após validar e publicar o commit em `main`, enviar uma tag numérica nova `vX.Y.Z` inicia o workflow de release. Ele confere que a tag aponta para `main`, recompila os pacotes, executa os testes e auditorias nas duas plataformas, valida o feed/checksums e só então publica. O disparo manual mantém o comportamento de rascunho; nenhuma credencial de publicação é distribuída no aplicativo.

## Recortes por prompt — em desenvolvimento após 0.6.6

Pedidos com tempos explícitos podem guardar até 20 recortes nomeados. Na análise híbrida, pedidos por conteúdo podem propor recortes com referências às palavras reconhecidas e aos clipes, resolvidas depois dos cortes e mudanças de velocidade. A proposta mostra intervalos e justificativas antes de aplicar. Isso substitui a seleção guardada e não corta a montagem nem cria arquivos. Use Montagem inteira.

Em **Exportar → Vários trechos**, **Ver** localiza o intervalo na timeline e **Salvar trechos** guarda a seleção no projeto, com desfazer/refazer. Use **Salvar projeto** para gravá-la no computador. A seleção reaparece ao reabrir; caminhos, estado de conclusão e permissão para revelar arquivos não são persistidos. Mudanças nos cortes, ordem ou velocidade exigem revisar e salvar os intervalos antes de exportar. Aparência e volume não invalidam os tempos. **Exportar vídeos** continua pedindo uma pasta e preservando arquivos existentes.

O formato da montagem e a resolução são usados por padrão; as opções individuais descritas abaixo permitem substituí-los em cada recorte. Não há pontuação de viralização nem rastreamento automático. A qualidade semântica depende das evidências e da transcrição; revise os candidatos. Esses recursos novos ainda não integram a versão pública 0.6.6.

## Equalizador manual — em desenvolvimento após 0.6.6

Áudio do trecho e edição de música/narração têm **Equalizador** recolhido por padrão: graves, clareza e agudos de −12 a +12 dB; corte de graves de 0 (desligado) a 200 Hz. **Voz suave** é um ponto de partida escolhido manualmente (80 Hz e clareza +2 dB); **Zerar** remove o EQ somente daquela faixa. Segure **Comparar** para ouvir sem EQ, exclusivamente na prévia, sem gravar essa comparação no projeto. Alterar os controles durante a reprodução retoma a audição na posição atual. Ganhos positivos podem saturar; ajuste também o volume.

A seleção da timeline permite equalizar somente parte do áudio original. Em música/narração, **Ajuste por intervalo** oferece volume ou uma banda do EQ, preservando as demais bandas, as partes externas e os fades. Tudo entra no histórico e no salvar/reabrir. Os prompts podem usar `update.audioEQ`, `edit_audio.patch.audioEQ`, `adjust_ranges`/`adjust_timeline` e `adjust_audio_eq_range`; patches mantêm as outras bandas e `null` zera a equalização do alvo.

Prévia e MP4 usam o mesmo cálculo de filtros biquad, adaptado à taxa da prévia e a 48 kHz na exportação. Testes verificam resposta em frequência em Web Audio real, bypass durante a reprodução, MP4 original/narração, intervalos e velocidade. EQ não é remoção de ruído, isolamento vocal, de-esser, compressor nem normalização automática. Volumes continuam manuais e nenhuma música baixa pela presença de narração. Não há novo modelo ou download de IA. Recurso ainda fora do download público 0.6.6.

## Desfoque por região — em desenvolvimento após 0.6.6

Em **Componentes → Desfoque**, escolha uma área oval ou retangular e ajuste posição, largura, altura, rotação, intensidade e opacidade. Há até oito áreas por montagem. Os pontos de animação existentes permitem mover, ampliar e suavizar o trajeto manualmente; o tamanho animado conserva a proporção. A ordem das camadas determina o conteúdo afetado, inclusive textos abaixo da área. Revise o efeito durante toda a duração.

O desfoque funciona na prévia e no MP4, inclusive na exportação por intervalo, com desfazer/refazer e salvar/reabrir. Pedidos por prompt podem criar regiões e editar seus controles; referências à fala acompanham cortes e velocidade. Não há rastreamento automático: pedidos para seguir pessoas ou objetos sem trajetória permanecem pendentes. Nenhum modelo adicional é necessário. Recurso ainda fora da versão pública 0.6.6.

## Seleção de vídeo pelo texto — em desenvolvimento após 0.6.6

Em **Legendas → Revisar**, selecione palavras no campo de texto e clique em **Selecionar vídeo**. O intervalo aparece na timeline para ouvir, ajustar, aplicar controles por intervalo ou marcar para remoção e confirmar. Sem seleção de texto, o botão marca a fala inteira. A seleção não edita nem salva a montagem. Editar ou excluir uma legenda continua alterando somente a legenda.

Seleções parciais exigem tempos por palavra já existentes; o editor não estima durações dividindo o texto. Sem esses tempos, use a fala inteira ou gere legendas locais. Os tempos acompanham aparos, velocidade e a instância correta de mídias repetidas. O botão aparece somente no áudio original; a narração não é usada para selecionar/cortar o vídeo. Reconhecimento e legendas importadas podem ter imprecisões: ouça e ajuste a seleção antes de confirmar o corte. Este recurso não transcreve automaticamente nem envia dados.

## Formato por vídeo — em desenvolvimento após 0.6.6

Em **Exportar → Vários trechos**, cada vídeo tem **Formato** (9:16, 16:9, 1:1 ou 4:5) e **Resolução** (720 ou 1080 no lado menor). **Da montagem** e **Da exportação** preservam os padrões existentes. As escolhas podem ser guardadas com **Salvar trechos**, seguidas de **Salvar projeto**, com desfazer/refazer. Alterar uma escolha de um vídeo pronto o devolve aos pendentes; o arquivo anterior permanece preservado.

O formato global, os clipes e os volumes não mudam. Crop, camadas e posições relativas continuam compartilhados entre as versões; não há reenquadramento automático nem composição independente por vídeo. **Ver tempo** localiza o intervalo na montagem original; o formato individual é aplicado ao MP4. Prompts podem incluir `exportOptions:{aspect,height}` em cada item de `set_export_ranges` ou `select_export_ranges`, com `null` para herdar. A proposta mostra essas escolhas antes de aplicar. Este recurso ainda não está no download público 0.6.6.

## Prévia leve — em desenvolvimento após 0.6.6

Em **Configurações → Prévia leve**, **Preparar prévias** cria cópias locais H.264 de até 720 px no lado maior, a 30 fps. A preparação é manual, sequencial, pode ser cancelada e reaproveita cópias válidas. Vídeo principal, transições e vídeos sobrepostos podem usá-las. Crop e velocidade continuam proporcionais; o áudio da prévia é recodificado em AAC. **Usar cópias leves na edição** alterna a comparação com os originais. A preferência fica neste computador e não altera o projeto.

Exportação, análise da IA, legendas e cópia portátil continuam usando os originais. O cache é separado de modelos e miniaturas e invalida a cópia quando a assinatura do arquivo muda. **Limpar prévias** remove essas cópias e volta ao original; os originais permanecem necessários e não são modificados. Falha de decodificação da cópia também retorna ao original. Preparar ocupa espaço em disco e exige processamento inicial; não é garantia de fluidez em toda configuração. Este recurso ainda não está na versão pública 0.6.6.

## Relocalizar por pasta — em desenvolvimento após 0.6.6

Quando faltarem mídias, **Localizar pasta…** procura na pasta escolhida e nas subpastas. Usa o nome original salvo, mesmo que o título no editor tenha mudado, e valida duração, dimensões, tipo e presença de áudio. Nomes repetidos ou arquivos incompatíveis permanecem pendentes; **Uma por vez…** continua disponível. Nenhuma pasta é pesquisada automaticamente.

A busca pode ser cancelada e mantém as mídias já vinculadas. Cortes, volumes e histórico não mudam; use **Salvar projeto** para guardar os caminhos novos. Uma busca incompleta pede uma pasta menor e não aplica resultados parciais da varredura. A correspondência usa nomes e metadados, não um hash do conteúdo original ausente. Limites: 20 mil entradas, oito níveis; links para outras pastas não são seguidos.

O progresso da IA distingue interpretação, áudio, cenas, planejamento e conferência. A espera pelo planejador mostra tempo decorrido, sem porcentagem ou previsão inventadas. Narração futura permanece pendente até ser importada: não autoriza silenciar o original, e um corte incerto não deve ser substituído por volume zero. Ajustes manuais explícitos de volume continuam disponíveis.

## Revisar falas sem gerar legendas — em desenvolvimento após 0.6.6

Em **Editar com IA → Falas do vídeo**, **Preparar falas** usa o reconhecimento local e seu cache, sem conexão ChatGPT e sem criar legendas. A busca ignora diferenças de acentos. Clique em uma palavra para marcar o vídeo correspondente; **Shift+clique** amplia o intervalo, inclusive entre falas e páginas. A seleção é contínua e inclui tudo entre os pontos: ouça e ajuste na timeline antes de marcar para remoção e confirmar.

**Tempo incerto** identifica lacunas do reconhecimento e unidades cortadas pela borda de um clipe. Esses blocos não recebem tempos por palavra inventados; o botão de tempo apenas marca a região para revisão manual. Uma unidade do reconhecedor com várias palavras continua indivisível. As falas acompanham cortes, velocidade, repetição de mídias e desfazer; quadros congelados ficam fora da revisão de voz.

O idioma é o mesmo configurado em **Legendas → Idioma do áudio**. Alterá-lo exige atualizar as falas. Cancelar preserva a revisão anterior; abrir outro projeto limpa o painel. A transcrição não entra no arquivo do projeto nem altera histórico ou legendas; o cache local pode ser reutilizado ao preparar novamente. O botão **Corrigir** permite ouvir, ajustar texto/início/fim e confirmar a fala. As correções são salvas no projeto, com desfazer/refazer e remoção, e reutilizadas na análise híbrida após conferir a identidade da mídia. Uma frase corrigida é uma unidade inteira: não são inventados tempos internos. Isso não altera áudio nem legendas e não conclui cortes automaticamente. Recurso ainda fora do download público 0.6.6.
