# PDF, durabilidade e evolução

STATUS: PROPOSED
PRINCIPAL REVIEW: PENDING
FREEZE STATUS: NOT FROZEN
DATE: 2026-09-09

BASELINE: `616332d6048a4259d2e2b562d8d5e781cea334bd`

## Saída editorial — FOUNDATION REQUIRED, PROPOSED

FOUNDATION-PROOF-01 usa HTML/CSS editorial com impressão Chromium/browser PDF controlada. É proibido usar como mecanismo da prova: `html2canvas`, screenshot-as-PDF, PNG full-page, PNG full-table ou o atual `PDFService.exportToPDF()`. Raster é permitido somente para conteúdo naturalmente imagem, como fotografia de produto.

O PDF final deve preservar text layer, códigos, unidades, símbolos, bordas finas, número de página, image content e notes/footnotes/captions. Texto extraível sozinho não prova que a tabela não foi rasterizada: um PDF pode conter uma imagem da tabela e texto auxiliar/overlay ainda extraível. O runner deve usar `pdfjs-dist` 4.10.38 já presente no baseline para inspeção estrutural/textual do PDF; outra ferramenta existente pode complementar evidência visual/objetos, mas não substituir essa inspeção mínima.

O legado tem dois caminhos distintos: `window.print()` e html2canvas + jsPDF. Neste último cada folha vira PNG. Aumentar scale melhora resolução raster, mas não devolve texto pesquisável nem garante linhas finas ou baixo tamanho de arquivo. A existência de print nativo é reaproveitável; a integração atual não comprova um job reproduzível com assets congelados.

Para a prova, a árvore editorial é única: `ProofDocument → ProofPage → ProofTable` e demais primitivas. A tela renderiza essa árvore; o editor futuro acrescenta overlays externos; o PDF imprime a mesma árvore com `@media print`. É proibida a arquitetura `EditorRenderer != PDFRenderer`. Medição usa fonte e largura editoriais iguais, independentemente do zoom. Uma folha autoral válida produz uma página física; conteúdo excedente bloqueia o job, não cria continuação automaticamente.

Acceptance conceitual `T-PARITY-01`: o mesmo documento e manifesto produzem a mesma árvore editorial, frames e conteúdo semântico na visualização screen e no print/PDF; diferenças permitidas são somente estilos de mídia declarados que não mudem autoria, conteúdo ou geometria contratada.

Referências técnicas: [Playwright page.pdf](https://playwright.dev/docs/api/class-page#page-pdf) documenta mídia print e opções de página/fundo; [CSS Paged Media](https://www.w3.org/TR/css-page-3/) define o modelo de páginas. Não se assume que todo recurso da especificação está implementado no browser.

## Pipeline e readiness — FOUNDATION REQUIRED, PROPOSED

1. Capturar uma revisão local consistente. Exportar rascunho local é permitido, com identidade `draft:documentId:localRevision`, sem afirmar que está salvo na nuvem.
2. Para publicação persistida/compartilhada, salvar primeiro e obter ACK da versão N. Capturar documento exato de N; não ler “latest” depois e fingir que corresponde a N.
3. Resolver manifesto: asset IDs + revisões/hashes, fontes e versões, locale, schemaVersion, rendererVersion, document hash. URLs assinadas são obtidas no momento do job.
4. Montar renderer isolado.
5. Esperar **required fonts loaded**.
6. Resolver **required assets**.
7. Confirmar **images decoded successfully**.
8. Executar measurement.
9. Produzir layout report/preflight da mesma revisão/manifesto.
10. Executar stability check pelo contrato `PhysicalLayoutFact` de D3: capturar dois snapshots normalizados da mesma árvore/revisão/manifesto após resources-ready, com preflight somente-leitura entre eles. Qualquer diferença normalizada gera `LAYOUT_UNSTABLE / ERROR`; igualdade inteira exata gera STABLE.
11. Gerar PDF Chromium controlado.
12. Inspecionar estrutura/conteúdo do PDF, extrair texto e validar páginas.
13. Renderizar as páginas **a partir do PDF final** para PNG e fazer inspeção visual. Screenshot de screen pode ser adicional para `T-PARITY-01`, nunca substituto da evidência do PDF.
14. Persistir artefato/metadata quando aplicável. Exportação nunca altera autoria, seleção, frame, estilo, conteúdo ou ordem.

Sequência mínima de readiness: `render → required fonts loaded → required assets resolved → images decoded successfully → measurement → layout report/preflight → stability check → PDF`. `setTimeout` não prova readiness. Falha de required asset/font é ERROR. O stability check não possui epsilon próprio: posições, dimensões, alturas intrínsecas, widths de coluna e line-flow facts são normalizados para `PhysicalLengthU = 0.0001 mm` conforme D3 antes de comparar. Ruído bruto só é ignorado quando cai no mesmo valor normalizado; reflow, row-height change, late image intrinsic-size change e late font/layout change são bloqueantes quando alteram qualquer fato canônico.

A primeira prova é CLI local. No produto, o adapter de exportação pode chamar um worker Chromium isolado. Não se promete que caiba na função Vercel existente sem medir memória, duração, binário e tamanho do job. A escolha final de hospedagem do worker é uma questão empírica de FOUNDATION-PROOF-01, não motivo para adiar a prova local.

Como alternativa operacional inicial, print nativo pode ser apresentado com instruções claras (A4, escala 100%, sem cabeçalhos do navegador). Isso deve ser rotulado como fluxo manual; não equivale ao download controlado exigido no aceite final do MVP.

## Diagnostic severity policy — FOUNDATION REQUIRED, PROPOSED

Para FOUNDATION-PROOF-01, `ERROR` é blocking e impede GREEN/PDF final nos seguintes casos:

- NaN/Infinity geometry;
- width <= 0;
- height <= 0;
- object outside physical page bounds;
- impossible table column geometry;
- column width <= 0;
- column below min width;
- `PHYSICAL_ARITHMETIC_OVERFLOW`;
- `TABLE_CONTENT_OVERFLOW`;
- `ROW_CONTENT_OVERFLOW` para FIXED_MM;
- invalid merge;
- invalid `coveredBy`/span state;
- duplicate IDs;
- invalid annotation reference;
- required asset missing;
- required font missing;
- `LAYOUT_UNSTABLE` após resources-ready/preflight.

`WARNING` é non-blocking por default para safe-area violation e object overlap. Overlap deve ser detectado porque pode indicar erro, mas também pode ser composição intencional. Safe area orienta o usuário e jamais reposiciona automaticamente. O limite físico da página é diferente: cruzá-lo é ERROR.

Imagem de baixa resolução pode ser WARNING conforme política editorial calibrada. Dados técnicos sem fonte validada pertencem ao estado editorial de conteúdo, separado do preflight físico; não devem ser rotulados como aprovados só porque a geometria passou.

Diagnóstico tem `code`, `severity`, `pageId`, `objectId`, `tableId`/`cellId` quando aplicável, details determinísticos e sugestão de correção. Uma ocorrência deixa de existir quando a causa deixa de existir; warnings não são persistidos como verdade autoral.

## Escopo de impressão

FOUNDATION-PROOF-01 e o baseline proposto de FATHER-USABLE V1 têm como alvo provar PDF digital profissional e impressão de escritório em RGB. PDF/X, CMYK, sangria e marcas de corte para gráfica são escopo posterior sujeito a requisitos da gráfica. Não confundir PDF visualmente correto com arquivo homologado para qualquer processo industrial de impressão.

PDF deve ser pesquisável; copiar/colar é testado em unidades e códigos. Texto disponível em extração não basta para atestar ordem de leitura ou acessibilidade PDF/UA; semantic HTML e ordem editorial são a fundação, certificação é outro trabalho.

## Salvamento e recuperação

Porta proposta `DocumentRepository`: get/list/create/save(expectedServerVersion, document, operationId). Retorno estrito: saved(version), conflict(actualVersion), forbidden, unavailable ou invalid. Nenhuma função do domínio chama banco.

Documento JSONB com metadata de workspace, owner, versão do servidor, created/updatedBy e timestamps é candidato suficiente para MVP. Assets e snapshots publicados ficam separados. Não normalizar cada célula em tabela SQL agora.

Três revisões diferentes:

- schemaVersion: forma do documento;
- localRevision: transações da sessão, inclusive Undo;
- serverVersion: incrementada atomicamente pelo servidor em cada save confirmado.

Save captura localRevision L e versão N. ACK grava N+1; só marca sessão limpa se a revisão atual ainda é L. Se houve edição durante a requisição, mantém dirty e envia próxima captura com base N+1. Resposta tardia de outro documento/sessão não altera a tela atual. Operação idempotente evita duplicação após timeout de confirmação; client consulta/reconcilia antes de reenviar cegamente.

Recuperação local em IndexedDB grava checkpoint com workspace/user/documentId, baseServerVersion, localRevision, documento e assets necessários. Falha de quota aparece como falha de durabilidade. Logout/troca de usuário não expõe drafts de outra identidade. Recuperação compara a base com servidor: se remoto avançou, oferece abrir cópia local ou revisar remoto; não sobrescreve silenciosamente.

Coleta de assets não usados precisa considerar drafts, histórico e snapshots; excluir imagem da página não deve remover bytes ainda usados em outra revisão.

## Mesma infraestrutura com isolamento

Proposta: mesmo repositório e projeto de autenticação, VNext acessível por entrada isolada que não monta o bootstrap legado. Novas tabelas `vnext_*` no schema público são opção inicial simples, com RLS explícita por workspace. Decisão final exige revisão de migração, quotas e backup; nenhuma migração foi escrita nesta tarefa.

RLS deve validar membership e role no servidor, não confiar em workspaceId enviado pelo navegador. Downloads privados também exigem escopo; service-role não vai ao cliente. Testes de isolamento incluem usuário membro A tentando ler/escrever B, viewer tentando editar e arquivo com ID válido de outro workspace.

Manter mesma infraestrutura não significa preservar `catalogs.brand.pages`, RPCs legados ou schema ContentBlock como autoridade nova. Importação do legado é explícita, cria novo documento e relatório de recursos não convertidos. Não alterar nem “corrigir” automaticamente o original.

Extração futura: mover módulos VNext e dependências declaradas, exportar documentos/metadata/assets com IDs/revisões, migrar memberships/auth de forma planejada, apontar adapters a novo host e validar fixtures. URLs de storage não devem estar espalhadas no documento. Separação de import e ports é o que torna essa migração controlável; mesmo repo sozinho não a garante.

## Extensões de FATHER-USABLE V1 e POST-V1

FATHER-USABLE V1 inclui save/reopen com identidade/CAS, **Undo/Redo**, **local recovery**, **basic read-only sharing** e **AI Translation**. Undo/Redo e local recovery são `MUST-CANDIDATE — PROPOSED`: reversão segura cobre ações editoriais; recovery cobre trabalho ainda não confirmado e portanto não é substituído por save/reopen. Sharing publica snapshot imutável: o link referencia snapshot, não documento vivo; revogar/expirar corta novos acessos; republicar troca o ponteiro somente por comando explícito. Essa capacidade é read-only e não implica coedição.

AI Translation extrai leaves com identidade `{objectId, cellId?, paragraphId, runId}` e `sourceHash`. Códigos, números/unidades, normas, modelos e outros runs técnicos são protegidos. A saída cobre somente IDs permitidos, preserva tokens e passa revisão; fonte alterada marca tradução stale e nunca apaga edição humana revisada. V1 DISPOSITION: MUST-CANDIDATE; DECISION STATUS: PROPOSED. Permanece OUT OF SCOPE em FOUNDATION-PROOF-01.

POST-V1: central PIM/product knowledge oferece fatos via provider; Presence e realtime co-editing exigem lifecycle e semântica próprios; autonomous AI catalog authoring usa consultas/a ações tipadas com preview, revisão esperada, limites e permissão; deeper workflow automation vem depois. IDs estáveis e portas já previstas preservam seams, mas nenhum desses motores entra na foundation proof.

Multiusuário com contas, papéis e CAS pode existir antes de realtime; conflito entre editores do mesmo documento é explícito. Não chamar isso de coedição simultânea. CRDT/OT, presence e Undo colaborativo exigirão desenho específico quando virarem requisito pós-V1.
