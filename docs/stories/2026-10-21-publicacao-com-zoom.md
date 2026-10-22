# Publicar com zoom do navegador ou escala do Windows diferente de 100%

Status: **InReview**

Data: 2026-10-21

## Story

Como usuário do Catalog Builder (inclusive o pai do Gabriel, que pode usar zoom ou escala de tela maior), quero que a revisão de publicação dê o mesmo resultado com qualquer zoom, para que um catálogo correto não fique bloqueado com milhares de itens "Não foi possível confirmar as medidas da página".

## Problema reproduzido

Produção (Chrome 155): o mesmo catálogo fica "Pronto para imprimir" em 100% e "Publicação bloqueada" em 90% ou 110%, com 2.000 a 3.700 `RENDER_GEOMETRY_MISMATCH`. Causa: `captureSnapshot` compara a geometria do DOM com o plano em Q (1/64 px CSS) sem nenhuma folga. Em 100% o layout do Chrome usa exatamente essa grade; com zoom ou escala do sistema, ele arredonda em 1/64 de pixel **físico**, e o desvio (normalmente 1 Q) se acumula por linha e coluna. As checagens de transbordo (célula, linha, tabela e texto) sofrem o mesmo arredondamento (`ROW_CONTENT_OVERFLOW` em massa).

## Acceptance Criteria

1. Em `devicePixelRatio` 1 a verificação continua exata (tolerância 0, sem nenhuma mudança de comportamento).
2. Com `devicePixelRatio` diferente de 1, aceita-se no máximo 1 pixel físico mais o arredondamento da conversão (`deviceSnapToleranceQ`); acima disso o erro continua bloqueando.
3. A mesma tolerância vale para geometria (`RENDER_GEOMETRY_MISMATCH`) e para transbordo de célula, linha, tabela e texto no preflight.
4. Prova em Chromium real, no mesmo pipeline de "Publicar / PDF" (`reviewPublication` + `verifyPublicationForPrint`): em 90%, 110% e 125%, cada catálogo tem exatamente os mesmos diagnósticos que em 100%, e o catálogo pronto em 100% é aprovado para impressão em todas as escalas.

## Tasks

- [x] Reproduzir em produção e no harness local (linha de base sem a correção).
- [x] `deviceSnapToleranceQ` em `physical.ts`; `measurementToleranceQ` e checagem com tolerância em `measurement.ts`.
- [x] Tolerância nas checagens de transbordo de `preflight.ts` (parâmetro opcional; padrão 0).
- [x] Testes unitários e prova de navegador `tests/vnext/proof/publication-zoom-proof.mjs`.
- [x] Gates: lint, typecheck, test e build.

## Evidências

Prova `publication-zoom-proof.mjs` com os 5 catálogos profissionais reais (PCON-KOMPRESSOR-Y18, MCS-XV, ST-501, LC-505, T-500PIR; JSON e imagens locais em `scratch/`, sem backend):

| Escala | Sem a correção (por catálogo) | Com a correção |
| --- | --- | --- |
| 90% | 1.937–4.831 `RENDER_GEOMETRY_MISMATCH` + 33–63 `ROW_CONTENT_OVERFLOW` | idêntico a 100% |
| 110% | 944–2.399 + 32–56 | idêntico a 100% |
| 125% | 658–1.459 | idêntico a 100% |

PCON: READY e impressão aprovada em 100/90/110/125%. Os outros 4 seguem bloqueados em todas as escalas, igualmente, por `UNRESOLVED_PLACEHOLDER` (texto "a confirmar" nas células): é a checagem de conteúdo FR-51 deste ramo, não um efeito do zoom.

Gates: lint 0 erros (268 avisos preexistentes, nenhum nos arquivos alterados); typecheck ok; build ok; test 5.200 passam. As 3 falhas de `tests/vnext/app/table-panel-integration.test.tsx` aparecem só na suíte completa, passam com o arquivo isolado (7/7) e falham igualmente sem esta mudança (instabilidade de carga preexistente).

## File List

- `src/vnext/domain/physical.ts`
- `src/vnext/rendering/measurement.ts`
- `src/vnext/publication/preflight.ts`
- `tests/vnext/rendering/measurement-identity.test.tsx`
- `tests/vnext/publication/zoom-tolerance.test.ts`
- `tests/vnext/proof/publication-zoom-proof.mjs`
- `tests/vnext/proof/fixtures/publication-zoom-browser.html`
- `tests/vnext/proof/fixtures/publication-zoom-browser.tsx`
- `docs/stories/2026-10-21-publicacao-com-zoom.md`

## Change Log

| Data | Versão | Descrição | Autor |
| --- | --- | --- | --- |
| 2026-10-21 | 0.1.0 | Tolerância de 1 pixel físico só fora de 100%, prova de navegador e testes. Sem push/PR/deploy. | @dev |
