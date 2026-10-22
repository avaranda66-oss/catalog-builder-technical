# Story — Onda 4D: biblioteca completa (Equipe C)

## Status

In Progress

## Origem e critérios de aceite

Solicitação da Equipe C de 22/10/2026 e plano `docs/plans/2026-10-15-plano-father-ready.md`, FR-02, FR-04, FR-05 e Onda 4D.

- [ ] Restaurar um catálogo arquivado mediante confirmação, mantendo identidade e conteúdo, com autorização e revisão CAS.
- [ ] Abrir pelo cartão com mouse e teclado; menu com Duplicar, Renomear, Usar como modelo e Arquivar.
- [ ] Usar como modelo cria uma cópia independente com nome escolhido.
- [ ] Exibir tempo relativo de edição e nome disponível do autor; buscar e filtrar localmente.
- [ ] Avaliar miniatura da primeira página com o render existente, sem alterar áreas da Onda 3.5.
- [ ] Cobrir comportamento novo em Vitest; executar J11 em 1366 e 1280 com restauração efetiva no harness.
- [ ] Aprovar lint, typecheck, testes e build; registrar números e limitações no handoff.
- [ ] Entregar migração 00030 somente escrita, commits locais, sem push, PR, merge ou deploy.

## Implementação e validação

Em andamento. As provas de navegador locais usam harness; não equivalem à validação da migração no Supabase real nem ao aceite observado com o pai.

## File List

- `src/vnext/app/CatalogLibrary.tsx`
- `src/vnext/library/service.ts`
- `src/vnext/persistence/contracts.ts`
- `src/vnext/persistence/supabase-repository.ts`
- `supabase/migrations/00030_vnext_catalog_unarchive.sql`
- Testes e jornada: lista final após validação.
