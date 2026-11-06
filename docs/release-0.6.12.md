Corte 0.6.12 melhora a execução de pedidos de edição por IA que terminavam sem alterações por falta de evidências suficientes.

- A IA pode solicitar sequências de imagens antes de propor cortes, mesmo quando a primeira análise não produz operações.
- Inspeções são processadas em lotes completos, com contexto visual dos arquivos, sem dividir uma sequência em amostras isoladas.
- Pedidos com duração máxima têm a duração real da proposta medida e uma tentativa adicional de ajuste quando necessário.
- A revisão de acabamento verifica as junções candidatas a transições e mantém atenção às demonstrações e reações visuais, mesmo quando o áudio de fundo trata de outro assunto.
- Resumos visuais podem selecionar cenas com justificativa explícita e imagens do próprio clipe, sem manter fragmentos artificiais apenas por falhas de tempo da transcrição. Cortes de palavras incertas continuam protegidos; seleções visuais que omitem esses trechos apresentam aviso de revisão.
- Formas equivalentes de expressar uma seleção são normalizadas sem descartar a proposta inteira. A recuperação de alterações independentes preserva as referências das seleções.
- Novo teste opt-in permite executar um projeto real pela conexão ChatGPT do Corte, exportar o resultado e conferir duração, cenas exigidas, velocidades, transições e preservação do arquivo original.

Pedidos complexos continuam gerando propostas revisáveis. Reconhecimento de falas e identificação de eventos podem apresentar pendências; confira o áudio e as bordas antes de aplicar ou exportar.

Windows x64: instalador completo e atualização automática sem baixar novamente os modelos básicos. macOS Apple Silicon (arm64): DMG e ZIP. Fontes GPL e SHA256SUMS incluídos.
