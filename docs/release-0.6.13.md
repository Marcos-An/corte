Corte 0.6.13 corrige falhas de continuidade da análise por IA e a reprodução de transições curtas.

- A análise executa novas inspeções e buscas pedidas nas rodadas seguintes, evita repetir sequências já vistas e mantém o histórico de observações e decisões de acabamento.
- O acabamento tem rodadas reservadas: as inspeções de cenas não podem consumir toda a oportunidade de conferir as junções. Transições já propostas com margens pendentes também são revistas.
- Cada junção recebe uma transição, uma justificativa para corte direto ou uma pendência explícita. A existência de uma única transição não basta para declarar toda a montagem conferida.
- A prévia aguarda os quadros das transições antes de continuar, evitando pular efeitos curtos quando a decodificação demora. Vídeo e música retomam após o carregamento.
- Reconhecimento interno composto apenas por pontuação deixa de ser tratado como palavras confiáveis. Janelas com tempos defeituosos podem receber uma segunda leitura local na CPU, aceita somente se reduzir a incerteza sem perder palavras ou deslocar substancialmente tempos confiáveis. O restante da transcrição mantém o processamento original.
- O cache de transcrição interna foi atualizado para não reutilizar resultados anteriores à correção.
- Os testes de projeto real agora exigem uma decisão para cada junção quando o pedido inclui acabamento, além de cortes, duração, velocidades e transições exportadas.

Validação incluiu a suíte automatizada, reprodução com atraso de decodificação e execução com vídeos reais, seguida de exportação e conferência dos quadros. Falas sobrepostas ou com tempos incertos ainda podem exigir revisão; a atualização não oferece separação de vozes de fundo nem garante limpeza verbal completa.

Windows x64: instalador completo e atualização automática. macOS Apple Silicon (arm64): DMG e ZIP. Fontes GPL e SHA256SUMS incluídos.
