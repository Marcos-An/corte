# Revisão de recursos — VidIO, CapCut e Corte

Revisão de 19/10/2026. Base publicada: Corte 0.6.3. O inventário do Corte foi conferido no código local (`src`, `desktop` e testes). Recursos dos concorrentes são descrições dos fabricantes, não resultados de testes comparativos.

Referências oficiais consultadas:

- [VidIO](https://www.vidio.ai/en-GB): edição por conversa, destaques, cortes verticais, legendas, tratamento de som, remoção de fundo, desfoque, rastreamento, estabilização e ferramentas de publicação.
- [CapCut — IA](https://www.capcut.com/resource/capcut-ai): legendas, isolamento vocal, remoção de fundo e melhorias de imagem.
- [CapCut — animação](https://www.capcut.com/tools/keyframe-animation): keyframes e curvas de velocidade.
- [CapCut — legendas](https://www.capcut.com/tools/add-subtitles-to-video): legendas e tradução.

## Inventário e lacunas

| Recurso | Situação no Corte | Trabalho necessário | Prioridade |
| --- | --- | --- | --- |
| Edição por conversa | Existe, com proposta, escopo, evidências e pendências | Aumentar cobertura de prompts e medir precisão/tempo por etapa; testar pedidos contraditórios e dependências entre operações | Alta |
| Cortes de fala e pausas | Existem transcrição, âncoras e detector de pausas | Uma revisão visual da transcrição, com seleção para cortar, e controles claros de tolerância | Alta |
| Vários Shorts de um vídeo longo | Há recorte e formato vertical; não há fluxo completo de várias versões | Propor candidatos com início/fim e justificativa, permitir revisar cada um e exportar em lote | Alta |
| Reenquadramento automático | Crop manual, zoom e ajustes por intervalo existem | Rastrear pessoa/objeto com confiança, prévia da trajetória e correção manual; não confundir CLIP com tracking | Alta |
| Legendas | Edição, estilos, karaokê e posição por fala existem; geração local implementada nesta revisão | Revisão de palavras incertas, seleção do idioma local e tradução opcional | Alta |
| Legendas SRT/WebVTT | Publicado na 0.6.4 | Importação local e exportação dos tempos atuais; validado também nos pacotes Windows/macOS da 0.6.4 | Alta |
| Volume em parte da música/narração | Publicado na 0.6.4 | Controle manual e operação de IA `adjust_audio_range`; preservar fades, narração e histórico | Alta |
| Tratamento de voz | Volume/fades existem; sem redução de ruído/EQ/compressor na interface | Controles opt-in com comparação antes/depois, intensidade e coerência entre prévia/MP4 | Alta |
| Curvas de velocidade | Somente velocidade constante, inclusive em intervalos | Rampas com remapeamento correto de áudio, legendas, âncoras e exportação; não aproximar silenciosamente com saltos | Média |
| Curvas de animação | Keyframes lineares e presets existem | Easing e editor compacto; preservar a curva ao aparar um componente | Média |
| Máscaras e privacidade | Camadas/formas existem; sem máscara/desfoque de região rastreado | Começar por região manual animável, depois tracking; verificar desfoque no MP4 | Alta |
| Remoção de fundo | Ausente | Segmentar com modelo separado, benchmark no Windows e bordas/oclusões revisáveis | Média |
| Estabilização | Ausente | Análise de movimento, intensidade e recorte visível; cache por fonte | Média |
| Exportação | MP4 720p/1080p, H.264/AAC, montagem inteira | Intervalo, múltiplos cortes, resolução/FPS/qualidade; custo de 4K explícito | Alta |
| Proxies e desempenho | Há caches, análise reutilizável e limites de concorrência | Proxies para mídia pesada, cancelamento robusto, medição de RAM/VRAM e latência em projeto longo | Alta |
| Organização | Histórico e cópia portátil existem | Marcadores nomeados, busca na transcrição, duplicar versão sem perder a original, presets do usuário | Média |
| Guias para redes sociais | Guia de segurança manual já existe | Presets revisáveis por formato e teste de textos próximos às bordas; não prometer áreas fixas das plataformas | Média |
| Publicar/agendar e métricas | Ausentes | Integrações de conta, consentimento e tratamento de falha; fora da prioridade inicial de edição | Baixa |
| XML para outros editores | Ausente | Definir formato e declarar o que não é transportável; validar no editor de destino | Baixa |

## Revisões transversais necessárias

1. Toda feature deve existir no modelo, na prévia, no salvar/reabrir, no desfazer/refazer e no MP4 antes de ser anunciada como pronta. Uma opção no schema da IA não comprova funcionamento.
2. Pedidos complexos precisam rastrear requisitos cumpridos, dependências, arquivos ausentes e fatos oficiais. Uma proposta parcial deve continuar identificada como parcial.
3. Novas ferramentas temporais precisam de testes com cortes anteriores, mudanças de velocidade, mídias repetidas e trechos de narração deslocados.
4. Desempenho deve separar decodificação, transcrição, inferência, transferência e resposta do planejador, com primeira execução e cache. A rota rápida de metadados não prova inferência visual rápida.
5. A UI deve manter os controles avançados recolhidos, rótulos curtos e uma ação explícita de aplicação. Volumes continuam manuais; não haverá redução automática durante a narração.
6. Próximos gates: testes locais, exportações reais, E2E no pacote Windows/macOS e integridade dos downloads. Não exigir outra máquina Windows do usuário.

## Implementado nesta rodada

- Importar SRT/VTT: texto UTF-8, tempos por fala, validação de sobreposição e limite de arquivo; aplica à voz escolhida sem alterar a transcrição original. Divisões/aparos/velocidade são convertidos para coordenadas da fonte. Lacunas de narração, sobreposição ambígua e quadros congelados são recusados com mensagem, sem modificar o projeto. Não inventa tempos de palavra para karaokê.
- Exportar SRT/VTT: tempos da montagem atual, incluindo cortes e velocidade; sem enviar mídia a serviços.
- Volume por intervalo em música/narração: divide a trilha em partes editáveis, preserva os fades e mantém os demais volumes. A IA usa a mesma implementação; intervalos sucessivos acompanham a identidade original no plano.
- Correção da importação de narração: remove uma referência a variável inexistente que impedia abrir o seletor.
- Correção de exportação: normaliza explicitamente o áudio das trilhas para estéreo antes da avaliação dos fades e da mixagem, evitando a falha nativa reproduzida com fontes mono divididas no Windows.
- Geração local de legendas: seletor local/nuvem com processamento local por padrão; áudio original ou narração, frases com os tempos medidos de palavras, cache e preservação das transcrições de outras fontes. Nuvem permanece uma ação explícita com aviso de envio/cobrança. A UI mantém legendas existentes em falha/cancelamento.
- A transcrição básica passou a usar um processo isolado, assim como o modelo preciso. Cancelamento encerra o processo após um prazo curto se ele não responder; a pasta temporária pertence ao processo pai e é limpa também nessa situação. O cache de análise de fala para edição mantém sua versão anterior, pois seu formato não mudou.
- A tela identifica o modelo básico/preciso e oferece a instalação opcional do preciso (cerca de 1,1 GB). Não há download automático desse modelo. Erros observados no modelo básico continuam exigindo revisão; não há promessa de transcrição perfeita. Os testes usam também uma nova fala sintética com voz de cultura pt-BR verificada; o modelo preciso precisa reconhecer as palavras de referência, além de produzir tempos e karaokê funcionais.

A geração local está integrada também aos prompts, com preparação assíncrona antes da proposta. `generate_captions` solicita fonte/estilo; a transcrição vem exclusivamente do reconhecimento local. O plano só pode ser aplicado depois dessa preparação e a proposta permite revisar todas as legendas em páginas curtas. A aplicação é atômica com os demais ajustes, com desfazer/refazer. Falhas locais deixam legendas pendentes, mantendo alterações independentes. A análise híbrida reutiliza fala já reconhecida quando os tempos estão completos e confiáveis. O recurso exige Montagem inteira e uma voz ativa por projeto; não oferece tradução ou duas trilhas de legendas simultâneas.

Também foi corrigida a exibição de palavras removidas no começo/fim de uma frase: quando há tokens confiáveis, somente as palavras que permanecem no trecho são exibidas. Tempos coincidentes e palavras de duração zero conservam o comportamento anterior, sem inventar sincronismo. Quadros congelados silenciosos não criam legendas de duração zero.

Pedidos só de aparência usam `edit_caption_style`, preservando palavras corrigidas e seus tempos. A contagem/fonte das legendas entra nos metadados do planejador; os textos salvos, inclusive correções por clipe, ficam fora desse contrato. Pedidos para gerar novas legendas continuam separados e precisam da preparação local e revisão.

Esta lista é um plano de evolução, não uma declaração de paridade com os concorrentes. Tracking, rampas, máscaras, estabilização, lote e tratamento de voz ainda não foram implementados nesta rodada.

## Revisão após a publicação 0.6.4

Correção em desenvolvimento: legendas de narração respeitam o fim da montagem ao encurtar ou acelerar o vídeo. Palavras fora desse intervalo não entram na prévia nem no SRT/MP4. A trilha de áudio e a transcrição continuam intactas e voltam a fornecer legendas quando o vídeo é ampliado. Projetos somente de áudio preservam a exportação de legendas sem exigir clipe visual. Essa correção ainda não faz parte do download 0.6.4.
