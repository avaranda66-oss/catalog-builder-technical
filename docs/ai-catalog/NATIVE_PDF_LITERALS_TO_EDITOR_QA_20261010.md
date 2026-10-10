# Catalog Builder VNext — PDF original → revisão de evidências → células nativas → salvamento/PDF

**Data:** 2026-10-10. **Branch:** `codex/agent-pdf-native-grounding-20261010`, empilhada na PR #85.
**Status:** ponte técnica de fontes textuais controladas, **NÃO pronta para o uso autônomo de Marc**.

## Implementação
- `native-pdf-cell-fill.ts`: ponte determinística entre a validação pré-existente `prepareGroundedPdfInput()` — que lê bytes completos dos PDFs originais, calcula SHA-256 por arquivo e verifica cláusulas literais contíguas por modelo/parâmetro/valor/unidade — e uma tabela real do `DocumentSession`.
- Exige uma tabela selecionada editável, cabeçalhos de modelos e rótulos de linhas **exatamente iguais**, mesmo número de linhas/modelos, uma seção, até quatro modelos, e apenas células técnicas vazias e não mescladas.
- `missing`: deixa vazio. `conflict`: bloqueia a operação inteira. Condições de medição não vazias são bloqueadas enquanto não houver coluna de condição para exibição explícita. Nunca arredonda decimais, transforma `00017` em `17`, muda unidade ou infere valor por proximidade espacial.
- Gera a prévia `NativePdfCellFillPreview` em memória, com linhas, modelos, citações exatas, página de origem e SHA-256; executa preflight numa sessão isolada. O documento permanece **inalterado**.
- Após aprovação explícita, envia **uma única ação canônica atômica** `table.cells.setContents` com revisão CAS, topologia e conteúdos esperados. Sem sobrescrever dados existentes. Previews são emitidas via `WeakMap`, de uso único, ligadas à mesma sessão para impedir confirmações falsificadas ou replays.
- `VerifiedPdfTableReview` aparece no painel lateral de criação quando uma tabela é selecionada, em detalhes avançados `Preencher tabela com PDFs (revisão técnica)`. O usuário fornece os PDFs + um **manifesto JSON de extração** com `sources` e `proposal`; o sistema confere mapeamento de nomes sem ambiguidades e hashes. Nenhum PDF é enviado ao Gemini nesse caminho. Exibe cada trecho antes de aprovar e disponibiliza comprovante de fontes/valores em JSON depois.
- O app pode desfazer/refazer a alteração e preservá-la no catálogo.

## Provas de execução
- `tests/vnext/ai-catalog/native-pdf-cell-fill.test.ts`: bytes reais de PDFs criados com jsPDF, modelo AX-041/BX-062, três características, seis valores. Testa que o documento permanece igual antes de aprovar, atomicidade, CAS/replay, hash/quote/model/unit, sinais/decimais/códigos literais, conflito, missing, condições bloqueadas e Undo.
- `tests/vnext/proof/native-pdf-cell-fill-browser-proof.mjs`: Chromium **real** usando `VNextApp`, `VNextPersistenceRuntime`, editor A4, repositório CAS **LOCAL E ISOLADO**, upload real de dois PDFs e manifesto. Confere as seis citações, confirma preenchimento, exporta comprovante de fontes com os hashes, desfaz/refaz, salva, usa `PublicationReview` oficial para um PDF A4, verifica no PDF exportado todos os valores, reabre e compara a matriz exata. Capturas de tela + recibos JSON e originais são anexados ao CI no HEAD exato.
- PDF final de aceitação: `CATALOGO_FICHA_TECNICA_PDF_FONTE_LITERAL_VALIDADA.pdf`, **uma página A4**, bytes/hashes registrados no `receipt.json`. Os próprios PDFs AX/BX também ficam na pasta de QA.

## LIMITAÇÕES CRÍTICAS
- Originais são **fixtures PDF recém-geradas**, não fichas PRESYS. Cada cláusula tem modelo, rótulo, valor e unidade em uma linha. PDFs com tabelas densas 2D, células visualmente relacionadas, páginas escaneadas, símbolos soltos, conteúdo ilegível ou associação duvidosa ainda não são suportados. A presença de texto numa linha não equivale a atestado de geometria/célula industrial.
- O manifesto JSON de extração deve ser preparado externamente; **o chat Gemini ainda não consegue propor e conferir automaticamente esse manifesto**. Isso é uma ponte supervisionada e avançada, não um fluxo simples para Marc.
- As citações/SHAs ficam no **comprovante JSON exportável**; ainda não há trilha de proveniência imutável no armazenamento persistente do catálogo nem verificação automática dessa trilha no ato da publicação.
- Testes de navegador usam repositório CAS LOCAL, não Supabase real; **0 chamadas reais Gemini**, 0 cobranças e 0 gravações em tabelas reais da PRESYS. Não há aprovações de clientes nem piloto real de Marc.
- O PDF final comprova valores preservados e impressão A4, **não** qualidade estética comercial, imagens ou capacidade de criar catálogos complexos sem ajuda.
- A implantação anterior da Edge Function Gemini segue **desabilitada**; este recurso não a habilita.

**Critério de produto:** pipeline de fontes literais `PASS`, catalogação industrial autônoma `NOT_READY`.

## Arquivos de prova no PC
`C:\Users\Usuario\Documents\Codex\2026-10-10\CATALOG_BUILDER_REAL_ACCEPTANCE\07_PDF_FONTE_REAL_TABELA_NATIVA_QA`
