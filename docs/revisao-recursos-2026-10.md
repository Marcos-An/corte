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
| Legendas | Edição, estilos, karaokê e posição por fala existem | Transcrição local na interface de legendas, revisão de palavras incertas, tradução opcional | Alta |
| Legendas SRT/WebVTT | Implementado nesta revisão; ainda fora da release pública | Importação local e exportação dos tempos atuais; confirmar também no pacote antes da próxima release | Alta |
| Volume em parte da música/narração | Implementado nesta revisão; ainda fora da release pública | Controle manual e operação de IA `adjust_audio_range`; preservar fades, narração e histórico | Alta |
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

Esta lista é um plano de evolução, não uma declaração de paridade com os concorrentes. Tracking, rampas, máscaras, estabilização, lote e tratamento de voz ainda não foram implementados nesta rodada.
