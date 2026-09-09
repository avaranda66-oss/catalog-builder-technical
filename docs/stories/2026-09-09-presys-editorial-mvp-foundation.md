# PRESYS.VNEXT.R0.1.2 — PRINCIPAL FREEZE STAMP

STATUS: READY FOR REVIEW
PRINCIPAL REVIEW: APPROVED
FREEZE STATUS: FROZEN FOR FOUNDATION-PROOF-01

Data: 2026-09-09

Baseline: `616332d6048a4259d2e2b562d8d5e781cea334bd`

Como responsável pelo produto PRESYS, quero transformar o pacote documental R0 em uma proposta R0.1 para auditoria Principal, tornando explícita a fronteira entre FOUNDATION-PROOF-01 e FATHER-USABLE V1 e os contratos editoriais recomendados para que implementadores futuros não precisem reconstruir decisões arquiteturais após aprovação.

## Critérios e checklist

- [x] Confirmar `origin/main` em `616332d6048a4259d2e2b562d8d5e781cea334bd` e baseline ancestral/atual.
- [x] Criar branch/worktree documental isolado sem tocar trabalho de terceiros.
- [x] Importar o pacote R0 fornecido como base, preservando evidence/salvage existentes.
- [x] Renomear conceitualmente MVP-01 para FOUNDATION-PROOF-01 e definir FATHER-USABLE V1.
- [x] Registrar AI Translation/sharing como V1 MUST-CANDIDATE e PIM/Presence/realtime/AI authoring/automation como POST-V1 PROPOSED.
- [x] Registrar geometria autoral completa e `MEASUREMENT NEVER MUTATES AUTHORED FRAME` como FOUNDATION REQUIRED — PROPOSED.
- [x] Registrar table frame height, RowHeightPolicy, column solver, annotations e technical code nowrap como FOUNDATION REQUIRED — PROPOSED.
- [x] Registrar diagnostic severity, safe area sem herdar 8.4667 mm e `LAYOUT_UNSTABLE` como FOUNDATION REQUIRED — PROPOSED.
- [x] Registrar single table engine, salvage seletivo e geometry resolver reimplemented from lessons como arquitetura recomendada PROPOSED.
- [x] Registrar single editorial tree, `T-PARITY-01`, Chromium PDF, anti-raster inspection e PNG evidence derivada do PDF final como FOUNDATION REQUIRED — PROPOSED.
- [x] Registrar G01–G05 e LAB PROMOTION RULE como FOUNDATION REQUIRED — PROPOSED.
- [x] Atualizar o pacote compacto R0.1 sem criar novos documentos temáticos.
- [x] Rodar gates locais finais desta branch e registrar resultados abaixo.
- [x] Registrar Principal final freeze audit: VNEXT GO; FOUNDATION-PROOF-01 FROZEN / READY FOR IMPLEMENTATION; produção não implementada; merge não autorizado.
- [x] Executar FOUNDATION-PROOF-01 e obter verdict empírico da proof.
- [x] Aplicar a correção R0.1.4 de quantização para fit renderizado de rows/rowspans/text objects, preservando geometria autoral em U e comparação bloqueante em Q.
- [x] Revalidar G01–G05, matriz Chromium 8-run, PDF forensics, immutability, stability e gates locais; manter o erro conhecido de `ConflictReviewModal.tsx` fora do escopo somente como único erro de `lint:labs`.

## Escopo e verificação

Nenhum código produtivo, configuração de deploy, migration, dependência ou dado remoto é permitido nesta story.

Evidência local da closure R0.1 antes do commit:

- BASE SHA / pre-commit HEAD: `616332d6048a4259d2e2b562d8d5e781cea334bd`.
- Baseline tree: `26b21e6a06247823c80826e4855ee477a44db2de`.
- `git diff --check`: PASS.
- `npm run lint`: PASS, 0 errors / 268 warnings.
- `npm run typecheck`: PASS, exit 0.
- `npm test`: PASS, 196 test files; 2.046 tests passed / 1 skipped.
- `npm run build`: PASS; Vite 5.4.21, 2.292 modules transformed, built in 16.81s; warnings de imports mistos e chunk >500 kB permanecem não bloqueantes.
- production code touched: NO.
- package touched: NO.
- lockfile touched: NO.
- Supabase touched: NO.
- Legacy runtime touched: NO.

Esses resultados são gates locais. GitHub Quality Gate só pode ser registrado após execução no PR head.

## File list

- `docs/stories/2026-09-09-presys-editorial-mvp-foundation.md`
- `docs/vnext/presys-mvp-r0/README.md`
- `docs/vnext/presys-mvp-r0/01-evidencias.md`
- `docs/vnext/presys-mvp-r0/02-reaproveitamento.md`
- `docs/vnext/presys-mvp-r0/03-arquitetura.md`
- `docs/vnext/presys-mvp-r0/04-tabelas.md`
- `docs/vnext/presys-mvp-r0/05-publicacao-persistencia.md`
- `docs/vnext/presys-mvp-r0/06-execucao.md`
- `docs/vnext/presys-mvp-r0/07-estado-e-riscos.md`
- `docs/vnext/presys-mvp-r0/tasks/MVP-01-prova-editorial.md`
- `docs/vnext/presys-mvp-r0/evidence/source-inventory.json`
- `docs/vnext/presys-mvp-r0/evidence/proof-result.md`
- `docs/vnext/presys-mvp-r0/R0.1.4-rendered-extent-row-projection-amendment.md`
- `src/labs/presys-editorial-proof/physical.ts`
- `src/labs/presys-editorial-proof/proof-layout.ts`
- `src/labs/presys-editorial-proof/proof-measurement.ts`
- `src/labs/presys-editorial-proof/proof-preflight.ts`
- `tests/vnext/proof/arithmetic-adversarial.test.ts`
- `tests/vnext/proof/geometry.test.ts`
- `tests/vnext/proof/export-proof.mjs`

## Handoff

Ler README e estado da revisão R0.1. Próximo incremento após auditoria independente: FOUNDATION-PROOF-01. Se a proof receber GO, MVP-02 começa promovendo o núcleo comprovado para `src/vnext/domain/`, `src/vnext/render/` e `src/vnext/editor/`; não criar um segundo engine de produção em paralelo.
