# STORY-006: Hardening do PDF.js para ingestão de documentos

- **Status:** Ready for Review
- **Prioridade:** P1, bloqueante de company readiness
- **Base:** `9d21da430cba872c333d47cf42f666ad7cd1abfa` (RR016)
- **Branch:** `remediation/security-pdfjs-p1`
- **Escopo:** dependência/runtime PDF.js e remoção do worker executável via CDN

## Objetivo

Eliminar a exposição de `CVE-2024-4367`/`GHSA-wgrm-67xf-hhpq` no fluxo de importação de PDFs enviados pelo usuário e remover o worker PDF.js carregado de infraestrutura externa. O comportamento atual do modal de importação deve ser preservado.

## Critérios de aceite

1. `pdfjs-dist` resolve para versão segura `>= 4.2.67`, sem `3.11.174` alcançável pela aplicação.
2. Documentos não confiáveis são abertos com `isEvalSupported: false`, ou equivalente comprovado pela API selecionada.
3. Parser e worker vêm da mesma instalação de `pdfjs-dist`; o worker é empacotado/self-hosted pelo Vite e não usa `http`, `https` ou CDN.
4. Um PDF benigno de uma página abre com sucesso.
5. O fluxo de renderização/importação de ao menos uma página benigna continua funcionando.
6. PDF inválido/malformado falha de forma segura, com tratamento de erro e sem crash da aplicação.
7. Testes permanentes cobrem configuração segura, origem do worker, abertura/renderização/importação benigna, falha inválida e resolução da dependência.
8. Não são alteradas dependências ou versões não relacionadas; os scripts e tooling introduzidos por RR016 são preservados.
9. Referências de produção a worker PDF.js remoto são zero após a mudança.
10. Gates executados: testes focados, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` e `git diff --check`. O único erro de lint aceito nesta ancestry é o `QUALITY-HOOK-001` já conhecido em `SemanticEditor`.

## Decisão de versão

- [x] Confirmar versão 4.x segura e compatível com Node 20, Vite 5, ESM e TypeScript.
- [x] Confirmar entradas `build/pdf.mjs`, worker ESM e declarações TypeScript do pacote selecionado.
- [x] Registrar a versão exata resolvida e o motivo da escolha no Dev Agent Record.

## Tarefas

- [x] Atualizar `pdfjs-dist` e lockfile sem upgrades não relacionados.
- [x] Adaptar `PDFImportModal` para worker local/bundled do mesmo pacote.
- [x] Desabilitar avaliação dinâmica no carregamento de documentos não confiáveis.
- [x] Adicionar testes permanentes de segurança e regressão do fluxo PDF.
- [x] Remover referências executáveis remotas de PDF.js dentro do escopo encontrado.
- [x] Inspecionar configuração de deploy e registrar decisão de CSP.
- [x] Executar verificações de dependência e todos os gates da missão.
- [x] Revisar diff; commit e push são a etapa final da lane.

## Dev Agent Record

### Agent Model Used

Codex

### Debug Log References

- Base RR016 verificada com pai H0A antes da criação do worktree.
- `npm ls pdfjs-dist --all`: somente `pdfjs-dist@4.10.38`.
- Testes focados: 2 arquivos, 6 testes, todos aprovados.
- Regressão completa: 158 arquivos, 1668 testes, todos aprovados.
- Build Vite produziu `dist/assets/pdf.worker.min-*.mjs`, comprovando worker empacotado localmente.
- Busca de produção por `cdnjs`, `unpkg`, `jsdelivr` e worker HTTP(S): zero referências.

### Completion Notes

- `pdfjs-dist` foi fixado exatamente em `4.10.38`, a versão final da linha 4.x disponível no registry durante a execução. Ela está acima da primeira versão corrigida `4.2.67`, fornece `build/pdf.mjs`, `build/pdf.worker.min.mjs` e tipos TypeScript, exige Node 20 e é compatível com o runtime de deploy declarado pelo projeto. A escolha evita um salto de major desnecessário nesta lane de segurança.
- Todo PDF selecionado pelo usuário entra em `getDocument` com `isEvalSupported: false` por meio de `getUntrustedPdfDocument`.
- O worker usa `pdfjs-dist/build/pdf.worker.min.mjs?url`; parser e worker vêm da mesma instalação e o Vite materializa o worker como asset local no build.
- O utilitário legado `tests/render_pdf_to_image.mjs` também deixou de carregar PDF.js por CDN e usa somente os arquivos da instalação local, com avaliação dinâmica desabilitada.
- `npm audit --json` não reportou vulnerabilidade para `pdfjs-dist`. O audit geral ainda reporta 6 advisories não relacionados em `dompurify`/`jspdf`/`esbuild`/`vite`/`vite-node`/`vitest`; não foram alterados nesta lane.
- CSP foi inspecionada em `vercel.json`, `netlify.toml`, `vite.config.ts` e `index.html`. Não existe CSP de aplicação no baseline e uma política global estreita exigiria mapear Google Fonts/Supabase e demais origens. CSP fica **DEFERRED** para hardening próprio; o P1 não depende dela.
- `npm run lint` permanece no baseline RR016 esperado: 272 problemas (4 erros, 268 warnings). Os 4 erros são exclusivamente o `QUALITY-HOOK-001` conhecido em `src/components/library/product-workspace-v2/SemanticEditor.tsx:21-24`; esta lane introduz zero erros de lint.
- `npm run typecheck`, `npm test`, `npm run build` e `git diff --check` passam. O build mantém warnings preexistentes de chunking/imports, sem falha.

### File List

- `docs/stories/story-006-security-pdfjs-p1.md` (criado)
- `package.json` (alterado)
- `package-lock.json` (alterado)
- `src/services/pdfjs.service.ts` (criado)
- `src/components/editor/PDFImportModal.tsx` (alterado)
- `tests/security/pdfjs-security.test.ts` (criado)
- `tests/components/pdf-import-modal-security.test.tsx` (criado)
- `tests/render_pdf_to_image.mjs` (alterado)

### Change Log

| Data | Versão | Alteração | Autor |
|---|---|---|---|
| 2026-09-05 | 0.1.0 | Story criada a partir do finding SECURITY.PDFJS.VERIFY1 e da missão de remediation | @sm / @dev |
| 2026-09-05 | 1.0.0 | PDF.js atualizado para 4.10.38, eval desabilitado, worker local/bundled, testes permanentes e gates concluídos | @dev |
