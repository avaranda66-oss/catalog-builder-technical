# Story 006 — QUALITY-HOOK-001: SemanticEditor rules-of-hooks remediation

Status: Implemented — ready for Wave0B integration

Origem: `docs/release-readiness/RR016_QUALITY_GATES_PREFLIGHT.md` e `docs/release-readiness/QUALITY_HOOKS_PREFLIGHT.md`.

## Story

Como owner do Product Workspace V2, quero remover a violação estática de `react-hooks/rules-of-hooks` em `SemanticEditor.tsx` preservando o comportamento do modal e a atualização correta quando o descritor muda.

## Acceptance Criteria

1. `SemanticEditor.tsx` não chama hooks após um early return condicional.
2. O modal continua oculto quando `isOpen` é falso ou `descriptor` é nulo.
3. Abrir, fechar e reabrir o editor preserva o comportamento atual sem erro de lifecycle de hooks.
4. Trocar o `descriptor` enquanto o editor está aberto reinicializa os campos com o novo descritor, eliminando o risco de estado obsoleto identificado no preflight.
5. Nenhum `eslint-disable`, relaxamento de `react-hooks/rules-of-hooks`, alteração em `src/labs/**` ou mudança de tooling faz parte desta story.
6. Os gates aplicáveis do repositório são executados e seus resultados ficam registrados nesta story.

## Tasks / Subtasks

- [x] Refatorar `SemanticEditor` para que hooks sejam executados incondicionalmente em um componente montado somente quando houver descritor aberto. (AC: 1, 2, 5)
- [x] Garantir reinicialização do estado ao trocar de descritor. (AC: 4)
- [x] Adicionar regressão cobrindo fechado → aberto → troca de descritor → fechado/reaberto. (AC: 2, 3, 4)
- [x] Fechar cobertura permanente de StrictMode, descriptor recriado com mesma `canonicalKey`, Cancel e Save → Close. (AC: 2, 3, 4)
- [x] Executar typecheck, testes e build aplicáveis; lint final fica deferido ao H0B integrado após RR-016. (AC: 6)

## Dev Agent Record

### Agent Model Used

- Codex / aiox-dev

### Debug Log References

- `npx vitest run tests/components/library/product-workspace-v2/mega-workspace-components.test.tsx`: 8/8 testes passando.
- `npm run typecheck`: passou.
- `npm test`: 156 arquivos / 1666 testes passando.
- `npm run build`: passou; apenas warnings preexistentes de chunking/imports e `pdfjs-dist`.
- `npm run lint`: bloqueado porque o script `lint` e as dependências ESLint ainda não existem neste checkout; implantação pertence ao RR-016.
- CodeRabbit: não requerido para esta missão.

### Completion Notes List

- A guarda `isOpen/descriptor` ficou em um wrapper sem hooks; o conteúdo que usa estado só monta quando o contrato está válido, eliminando a violação estática de hooks sem `eslint-disable`.
- `SemanticEditorContent` recebe `key={descriptor.canonicalKey}`, forçando reinicialização limpa dos campos quando o descritor muda durante uma sessão aberta.
- Regressões permanentes cobrem lifecycle em React 18 `StrictMode`, preservação de draft quando o parent recria o descriptor com a mesma `canonicalKey`, cancelamento sem save e ordem Save → Close.
- Nenhum arquivo em `src/labs/**`, tooling ou configuração de lint foi alterado.
- Implementação concluída e pronta para integração Wave0B. A validação final de lint fica deferida ao H0B integrado após o RR-016; não há claim de lint standalone. CodeRabbit não é requisito desta missão.

### File List

- `docs/stories/story-006-quality-hook-001.md`
- `src/components/library/product-workspace-v2/SemanticEditor.tsx`
- `tests/components/library/product-workspace-v2/mega-workspace-components.test.tsx`

### Change Log

- 2026-09-05: Story criada a partir dos findings QUALITY-HOOK-001 para implementação da remediação.
- 2026-09-05: Remediação implementada e validada por testes, typecheck e build; lint final deferido ao H0B integrado após RR-016.
- 2026-09-05: Test-closure concluído com regressões permanentes adicionais; produção permaneceu inalterada.

