# ADR — Proveniência de tabelas nativas com revisão explícita

Status: Proposto para revisão técnica do root antes da ponte.
Data: 2026-10-10. Implementação inicial: [story de quarentena](../stories/2026-10-10-reviewed-native-table-proposals.md).

## Decisão delimitada

Criar uma proposta tipada e não confiável de tabela, validada contra bytes/roles/posições e mantida em quarentena. Não concatenar modelo, label, célula e nota separados para fabricar uma quote. Uma futura terceira origem `reviewed-native-pdf-specifications` será distinta de dados sintéticos e de PDF atômico; preservará a revisão humana como parte da evidência.

| Origem | Prova requerida | O que não permite |
|---|---|---|
| Sintética original | Contrato do exemplo/JSON sintético | Alegar que veio de PDF real. |
| PDF atômico | Bytes reais + quote literal inequívoca, com guardas integrais | Associação 2D por substring/join inventado. |
| PDF nativo revisado, futura | SHA + runs/roles/regiões/relação + revisão persistente quando necessária | Apresentar curadoria assistida como autonomia ou tornar resposta livre aprovada. |

O reader atual em branch separada usa `disableNormalization:true`, copia bytes antes do await, preserva todos os runs e limita exclusão diagnóstica a Artifact nativo com mapping/balanceamento válidos. Marcadores do texto mantêm IDs ignorando eventos auxiliares. As 11 regiões PRESYS não são literais certificados: depois de excluir Artifact, envelopes de fontes ainda cortam envelopes vizinhos. Diminuir altura por heurística para gerar PASS esconderia esse limite.

## Contrato proposto

`NativeTableProposal` conterá somente versão, digest do PDF, página, região da tabela, colunas/linhas e anchors dos papéis `modelHeader`, `rowLabel`, `quantity`, `unit`, `condition`. Anchors referenciam IDs de runs e spans exatos de caracteres quando necessários; uma string sugerida é comparação, nunca fonte de verdade. Arrays e tamanhos são bounded. Unknown keys/HTML/CSS/comandos ficam fora do contrato.

O verificador reextrai bytes atuais, confere parser/configuração/CropBox/marcadores, limites da tabela e relação única coluna/cabeçalho e linha/rótulo/valor. Runs/positions/marker proofs são evidências separadas, sem pseudoquote. Célula mesclada/shared exige regra própria futura; MVP bloqueia esse caso e não replica por modelo.

Saída inicial: candidato com `geometry_verified`, `needs_review` ou `blocked`, fragments intactos, relações conferidas, motivos e perguntas. Não há Compiler/Known/DocumentSession nesta saída. Mesmo geometry_verified exige aprovação explícita posterior para criar catálogo.

`needs_review` é adequado para microgap sem separador codificado, parserWhitespace e sobreposição apenas de envelope métrico. A revisão assistida deverá mostrar crop dos bytes exatos, valor proposto, fragments e pergunta clara; registrar a decisão específica e preservar o literal original. Ela não converte um número editado em dado extraído nem altera símbolo/sinal/decimal silenciosamente. Corte comprovado, fonte errada, PUA/unidade ilegível, scan, truncamento, association conflitante e marcador inválido ficam blocked sem override humano.

Para diferenciar envelope conservador de corte real, a futura implementação precisa sustentar essa distinção com origem/posição e crop visual, ou glyph bounds verificáveis. Até lá, o motivo do reader permanece BLOCKED e o candidato não é promovido. Evidência por baseline/coluna não é apresentada como caixa exata de glifo.

## Aprovação e canônico, etapa seguinte

Uma futura aprovação tipada vincula SHA dos bytes, digest da proposta, roles/anchors, versão do verificador, perguntas/respostas e identificador da revisão. Toda mudança invalida essa aprovação. A persistência conserva a evidência revisada e a fonte correspondente; JSON serializado não recebe autoridade sem revalidação.

Após esse contrato passar QA, um adapter transforma somente fatos aprovados no modelo canônico existente, reutilizando DocumentSession, commands, templates, histórico/CAS e publicação. Literal de quantidade/unidade/condição permanece intacto; estilo não altera valores. UI em `/v2` apresenta valor, fonte e dúvida, usando o editor/pipeline existentes. Primeiro Power Consumption e Weight por coluna da p6; Operating Range exige vínculo `*` → nota antes de aprovação.

Composição em múltiplos blocos, melhor ocupação da página, fotos e PDF real são requisitos posteriores de produto, não resultados comprovados pelo reader. Marc e um piloto sem orientação ainda não foram validados.

## ADR de acesso Google/BYOK

O código existente `byok-catalog-gateway.ts` envia a credencial ao gateway autenticado `vnext-catalog-agent` e requer verificações de tenant/origin/role e reserva de quota durável no servidor antes do provider. Esse contrato local não prova que o serviço esteja implantado ou funcional; não fazer deploy Edge implicitamente.

| Alternativa | Uso possível | Limite concreto |
|---|---|---|
| Chave do usuário só em memória + Google REST no browser | Prova local isolada, se explicitamente escolhida, com chamada única de sugestão de IDs/roles após verificador pronto | Chave acessível ao runtime do browser; ledger do dispositivo não garante teto global nem resiste a tamper/reinicialização. Não habilitar automaticamente em produção. |
| Gateway autenticado existente | Caminho previsto para produto, após confirmação de implementação e provas | Edge/gates/deploy precisam de escopo e autorização próprios; indisponibilidade deve falhar fechada. |

A documentação oficial [Using Gemini API keys](https://ai.google.dev/gemini-api/docs/api-key) recomenda não expor chaves no cliente em produção. Memória apenas reduz persistência; não cria proteção de segredo contra o próprio browser. Isso é motivo técnico para limitar a alternativa direta à prova local explicitamente escolhida, e não declarar equivalente ao gateway.

O usuário autorizou teto cumulativo R$50. O checkpoint informado pelo root inclui reservas USD0,08896; o ledger real deve ser lido/reconciliado antes de qualquer reserva adicional, sem converter câmbio por estimativa neste ADR. Não houve chamada por este agente. Nova execução, quando pronta, tem objetivo mapping somente, input bounded, preços/câmbio atuais, reserva anterior à chamada, sem retries automáticos ou repetição de rodadas atômicas. Chave não vai para documento/transcript/recibos; não pedir ou reproduzir credencial já fornecida.

## Gates antes de avançar

Reader/Artifact e nova quarentena têm worktrees, snapshots e gates separados. O root deve aprovar este contrato antes da ponte. Positivos e ataques devem provar associação correta, rejection sem efeito parcial e aprovação inválida após mutation. Integração `/v2`, revisão humana, third-origin compiler, persistência/PDF e chamada real são próximos gates, não capacidades atuais. Nenhum merge, produção ou migração por este ADR; merge aprovado pelo usuário continua condicionado a gates exatos e coordenação root/DevOps.
