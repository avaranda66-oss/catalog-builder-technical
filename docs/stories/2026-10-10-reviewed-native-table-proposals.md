# Proposta de tabela PDF nativa em quarentena

Status: In Progress — GO do root para contrato/verificador em quarentena, sem promoção.
Data: 2026-10-10. Branch: `codex/native-pdf-composition-20261010`.
Worktree: `C:/Users/Usuario/.codex/worktrees/native-pdf-composition-20261010/catalog-builder`.
Base CLEAN conferida: `a1b11b1fdd0dbe2872884a32da3cb9f077d6485b`.
Responsáveis: @po/@sm (story), root/@architect/@dev (contrato/verificador), @qa (auditoria), @devops (Git/gates).

GO registrado em 2026-10-10 antes do código: implementação isolada pelo agente reference_po, somente proposta/verificador e provas. Copiar reader e fixture congelados; nenhuma modificação desses dois arquivos. SHA256 reader `76cc5b53cec9f046ff408722ab5fa53f2a1eb50e54a4690b33cb8b0073fdab31`; fixture `d3e39e5b3126f06f3506b64bb099879d6684c36ab48939d78526b95303dc2390`. Sem import entre worktrees. Dependem do intake existente intacto `822a19ba60f8c160c03c72f9abb468d25aa12f209ef7546643a4aef6a2ebb9e2`. QA demonstrou que LITERAL não atesta pintura/clip; candidatos deverão registrar essa revisão futura obrigatória.

## Problema e direção

Marc quer fornecer materiais, pedir o catálogo e revisar dúvidas antes de publicar. A tabela PRESYS nativa separa modelos, rótulos e valores em regiões 2D. Uma quote concatenada com cabeçalho + rótulo + célula seria uma origem inventada. O verifier atômico permanece próprio e não será enfraquecido para acomodar essa tabela.

O leitor isolado preserva bytes/SHA/IDs e comprovou Artifact por marcadores nativos. As 11 regiões reais p6–7 continuam BLOCKED por `REGION_CUTS_RUN`: envelopes globais de fontes se sobrepõem entre linhas. Isso não comprova corte de glifos. Modelos e valores fragmentados também contêm microgaps/espaços heurísticos. O [ADR](../ai-catalog/ADR_REVIEWED_NATIVE_PDF_TABLES.md) separa evidência literal, relação geométrica e revisão assistida.

## Primeira entrega delimitada

Somente `NativeTableProposal` JSON estrito e verificador dos bytes/posições, com candidatos em quarentena: `geometry_verified`, `needs_review` ou `blocked`. Nenhum `Known`, Compiler, documento ou aprovação automática resulta dessa etapa. Entrada por fixture original/sugestão determinística primeiro; uma resposta Google futura só sugere IDs/roles e permanece não confiável.

MVP: tabela da página física6 do manual, colunas específicas TA-25N/TA-35N/TA-50N, começando por Power Consumption e Weight. Operating Range depende do vínculo verificável de `*` à nota/condição; deve ficar bloqueado enquanto faltar essa prova. Células compartilhadas/mescladas não replicam valores por inferência.

## Acceptance criteria da quarentena

- [ ] **AC01 — JSON restrito.** `NativeTableProposal` tem versão, SHA, página, região/tabela, colunas/linhas e anchors dos papéis `modelHeader`, `rowLabel`, `quantity`, `unit`, `condition`. Reject unknown keys/types, limites excessivos, HTML/CSS/comandos, página/IDs inexistentes e strings auto declaradas como evidência. Nenhuma quote contígua inventada.
- [ ] **AC02 — Revalidar bytes.** Reextrair com leitor nativo e conferir SHA/versão/páginas/IDs/strings/transform/CropBox/marcadores. Envelopes de fonte são identificados como tais; PDF alterado, stale snapshot, role/caixa fabricado ou marcador inválido bloqueiam antes de efeitos no catálogo.
- [ ] **AC03 — Relação específica.** Conferir cabeçalho completo dentro da coluna correspondente e label/quantity/unit dentro da linha/célula correspondente, com limites de tabela sustentados. Trocas de coluna/linha/campo, papéis concorrentes, role fora da tabela, merge/shared ambíguo e associação a outro modelo bloqueiam. Modelo não é deduzido do header geral com três nomes.
- [ ] **AC04 — Literal e incerteza separados.** Preservar strings/sinais/decimais/símbolos/variantes. Gap positivo, parserWhitespace e interseção causada só por envelope global resultam em pergunta/revisão requerida, nunca em literal certificado. Corte de conteúdo comprovado, scan, truncamento, PUA ou glifo ilegível bloqueiam; nenhuma revisão pode destravar esses bloqueios de integridade.
- [ ] **AC05 — Condição.** Condição preenchida tem anchor e vínculo com o mesmo fato; nota exige marcador inequívoco e literal original. Vazio é permitido quando o fato não depende de qualificador ausente. Operating Range não vira fato incondicional enquanto a nota necessária não estiver sustentada.
- [ ] **AC06 — Saída sem promoção.** Candidatos registram fragments/IDs/posições, relação conferida, motivos e perguntas. Mesmo `geometry_verified` não é Known/aprovado. Rejeitar proposta conserva documento, histórico, aprovação e persistência anteriores.
- [ ] **AC07 — Provas.** PDFs originais cobrem trio de modelos, números fragmentados, unidades, notas, troca de modelos/linhas, merges, counterfeit role/hash/Artifact e byte race. CLI real PRESYS registra candidatos/limites sem afirmar sucesso onde o leitor bloqueia. QA independente e gates do novo snapshot.
- [ ] **AC08 — Preservar produto.** Modelo canônico, DocumentSession, templates, comandos, histórico/CAS e PDF existentes não são alterados nesta primeira entrega. Nenhuma chamada paga, produção, deploy, migração ou merge por esta story. A autorização de merge aprovado exige gates exatos e decisão root/DevOps.

## Etapa seguinte, ainda não implementada

Apenas após contrato aprovado: terceiro tipo `reviewed-native-pdf-specifications`, com aprovação humana persistente vinculada ao digest da proposta/evidência e bytes exatos. Marc verá valor, crop da fonte e pergunta; coordenadas/JSON não serão o fluxo principal. Aprovação assistida de um join incerto é registrada como revisão, não como extração autônoma ou quote atômica. Mutação de bytes/roles/valores invalida a aprovação. Fonte ou número não sustentado não vira PDF-grounded por edição humana; correção manual precisa de origem própria.

Depois vêm integração em `/v2`, BYOK conforme ADR, catálogo original em múltiplos blocos com melhor ocupação do espaço, salvar/reabrir, preflight e PDF real. Não criar editor paralelo. Essas capacidades e piloto Marc permanecem pendentes.

## Checklist / File List

- [x] Confirmar nova worktree CLEAN e registrar story antes da ponte.
- [x] Registrar causas reais Artifact/envelope/microgaps e contrato em ADR.
- [ ] Root implementar somente proposta/quarentena e provas positivas/negativas.
- [ ] QA independente e gates atuais.
- [ ] Definir a terceira origem/aprovação persistente antes de promoção canônica.
- [ ] Validar integração/UX/PDF e execução real autorizada em escopo posterior.

Criados: `docs/stories/2026-10-10-reviewed-native-table-proposals.md`, `docs/ai-catalog/ADR_REVIEWED_NATIVE_PDF_TABLES.md`. Código/testes previstos: arquivos reais de contrato/verificador/fixtures definidos pelo root após revisão; manter File List atualizada.

## Evidência de base

- [Leitor e story separados](<C:/Users/Usuario/.codex/worktrees/native-pdf-provenance-20261010/catalog-builder/docs/stories/2026-10-10-native-pdf-cell-provenance.md>)
- [Resultado real das 11 regiões após Artifact](<C:/Users/Usuario/Documents/Codex/2026-10-10/CATALOG_BUILDER_REAL_ACCEPTANCE/native-prototype-cli/manual-after-artifact/result.json>)
- [Mapping plain/marked integral](<C:/Users/Usuario/Documents/Codex/2026-10-10/CATALOG_BUILDER_REAL_ACCEPTANCE/native-prototype-cli/marked-content-diagnostic/result.json>)

Checkpoint: primeira entrega é quarentena somente. Nenhum catálogo gerado/aprovado, Google chamado, piloto Marc ou produto pronto por esta story.
