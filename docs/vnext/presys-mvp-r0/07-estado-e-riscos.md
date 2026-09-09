# Estado e passagem de contexto

STATUS: PROPOSED
PRINCIPAL REVIEW: PENDING
FREEZE STATUS: NOT FROZEN
DATE: 2026-09-09

BASELINE: `616332d6048a4259d2e2b562d8d5e781cea334bd`

TREE: `26b21e6a06247823c80826e4855ee477a44db2de`

## Estado real

- Repositório: `avaranda66-oss/catalog-builder-technical`.
- Pacote R0 investigado no worktree `C:/Users/Usuario/.codex/worktrees/00ef/catalog-builder`; R0.1 é amendado em worktree/branch isolados.
- Branch R0.1: `docs/vnext-r0-1-principal-amendments`.
- Escopo desta revisão: documentação apenas; sem código produtivo, runtime, legado, banco, dependências, merge ou deploy.
- Legado: código de produção preservado, quatro gates concluídos; avisos explicitados nas evidências.
- VNext produtivo: não implementado. Nenhuma onda produtiva concluída.
- Pacote: sete documentos temáticos, README e uma foundation proof; a proposta R0.1 documenta a fronteira proof/V1, geometria autoral, contrato de tabelas, severidade, readiness/parity/PDF e promoção do lab para auditoria Principal. Nenhuma dessas decisões está congelada por este PR.
- Próximo passo após auditoria independente: executar FOUNDATION-PROOF-01. FATHER-USABLE V1 continua produto posterior à proof e inclui AI Translation + basic read-only sharing.
- Evidências locais: revisão visual dos PDFs, navegação nos componentes reais com fixture e laboratórios A4. Nuvem/auth/share não validados de ponta a ponta.

## Publication closure evidence

- BASE SHA / pre-commit HEAD: `616332d6048a4259d2e2b562d8d5e781cea334bd`; tree `26b21e6a06247823c80826e4855ee477a44db2de`.
- `git diff --check`: PASS.
- `npm run lint`: PASS, 0 errors / 268 warnings.
- `npm run typecheck`: PASS, exit 0.
- `npm test`: PASS, 196 test files; 2.046 tests passed / 1 skipped.
- `npm run build`: PASS; 2.292 modules transformed, built in 16.81s; warnings não bloqueantes de imports mistos/chunk >500 kB.
- Diff safety: production code NO; package NO; lockfile NO; Supabase NO; Legacy runtime NO.
- GitHub Quality Gate: PENDING until PR execution; local gates are not CI evidence.

## Decisões arquiteturais R0.1

| ADR | Estado | Decisão | Alternativa e motivo |
|---|---|---|---|
| ADR-01 | PROPOSED | Núcleo VNext isolado no mesmo repo; manter Vite/React | Reescrita total de stack não atende um problema demonstrado; continuação integral do legado preservaria limites de composição |
| ADR-02 | PROPOSED — FOUNDATION REQUIRED | Página A4 explícita `210×297 mm`, objects com frame x/y/width/height; measurement nunca muta authored frame | Auto-flow/measurement authority viola composição autoral |
| ADR-03 | PROPOSED — FOUNDATION REQUIRED | Um único motor de tabela; Table Core é salvage seletivo; geometry resolver reimplementado from lessons | Motor paralelo ou port integral preservaria fallbacks/autoridades conflitantes |
| ADR-04 | PROPOSED | Ações tipadas e transações como única mutação | Store/setters públicos expõem superfície ampla e dificultam Undo/IA futura |
| ADR-05 | PROPOSED — FOUNDATION REQUIRED | Mesma árvore editorial para screen e PDF Chromium; editor futuro só adiciona overlays externos | Captura raster integral e renderer PDF paralelo violam parity/text layer |
| ADR-06 | PROPOSED | Documento JSON + CAS + recuperação local; assets separados | SQL por célula precoce aumenta custo; last-write-wins perde alterações |
| ADR-07 | PROPOSED | Presets/componentes copiados com proveniência | Instâncias vivas introduzem propagação e conflitos antes de necessidade comprovada |
| ADR-08 | PROPOSED | FOUNDATION-PROOF-01 exclui IA/sharing/PIM/presence; AI Translation + basic read-only sharing são FATHER-USABLE V1 MUST-CANDIDATE; PIM/Presence/realtime/AI authoring/automation ficam POST-V1 | Evita confundir proof técnica com fronteira real de produto |
| ADR-09 | PROPOSED — FOUNDATION REQUIRED | GO da proof promove/move o núcleo do lab para `src/vnext/domain/`, `src/vnext/render/`, `src/vnext/editor/` | Lab engine + production engine em paralelo reconstruiria o motor |

Todas as decisões acima são PROPOSED e dependem de auditoria Principal; `FOUNDATION REQUIRED` indica força da recomendação para a prova, não freeze status. Revisar D3/D4/D5 em conjunto; não aprovar schema separadamente de geometria, annotations, histórico e exportação.

## Dez riscos e mitigação

| Risco | Sinal concreto de falha | Mitigação e prova |
|---|---|---|
| 1. Adiar qualidade PDF | Muitas telas novas e nenhuma página difícil exportada | FOUNDATION-PROOF-01 antes de plataforma; G01–G05 com conteúdo estruturado |
| 2. Reescrita longa sem valor | Port inclui App/stores inteiros | Imports proibidos; manter legado útil; promover somente núcleo comprovado |
| 3. Motor único virar monólito | Um arquivo passa a conter UI, resolver, schema e saves | Separar model/operations/geometry/render/editor; testar contratos |
| 4. Canvas virar ferramenta gráfica geral | Rotação, vetores complexos e grupos infinitos antes de tabela confiável | MVP com página, frames e grupos planos; diagramas importáveis |
| 5. Densidade destruir legibilidade | Golden “passa” diminuindo fonte/linhas ou rasterizando tudo | Código/frames imutáveis, PDF content inspection e PNGs derivados do PDF final |
| 6. Medição dominar autoria | Render/preflight cria páginas, altera width ou grava height | Teste de imutabilidade e comparação de frames |
| 7. Dados técnicos incorretos | Texto de concorrente ou fixture passa a ser “oficial PRESYS” | Fonte/revisão humana e estados pendentes explícitos; nenhum dado técnico inventado |
| 8. Salvamento perder edições | ACK de revisão antiga limpa estado mais novo ou retry duplica | Captura de revisão, CAS, idempotência e teste de dois clientes |
| 9. Exportação variar por ambiente | Fontes/CSS/assets/engine mudam entre prévia e job | Manifesto versionado, readiness explícito e `LAYOUT_UNSTABLE` bloqueante |
| 10. Infra compartilhada vazar escopo | VNext chama RPC legado ou aceita workspace de cliente sem membership | Porta própria, RLS, testes de tenant, rollback sem mudar catálogo legado |

## Questões empíricas abertas

- As composições G01–G05 mantêm legibilidade com a fonte e os assets PRESYS? Provar em tela/PDF/impressão.
- Qual safe area/margem PRESYS deve virar default de FATHER-USABLE V1? O legado `8.4667 mm` não decide isso.
- Qual é a especificação oficial/atual dos produtos e quais imagens podem ser usadas comercialmente? As quatro referências não respondem isso.
- O usuário alvo consegue editar sem ajuda e entende warnings e divisão de tabelas? Registrar uma sessão de aceite.
- Rowspan + altura fixa é confiável no renderer escolhido? Teste adversarial no primeiro pacote; não assumir que height em tr resolve.
- Qual o orçamento real de memória/tempo do worker PDF em hospedagem? Medir 1, 20 e 50 páginas, documentar máquina e assets.
- A gráfica exige PDF/X/CMYK/sangria? Não necessário para hipótese de PDF digital/impressão de escritório; muda exportação se virar requisito.
- Quais tabelas antigas podem ser convertidas sem perda? Importação só após mapa de compatibilidade e amostras reais.

## Contraargumento mais forte

O legado já tem auth, persistência, templates, tradução e muitos testes. Uma melhoria focada nele pode chegar mais cedo a usuários que aceitem composição vertical. O novo núcleo só compensa se provar a liberdade editorial e a saída PDF solicitadas. FOUNDATION-PROOF-01 deve poder refutar a proposta. Se exige trabalho desproporcional, comparar um port mínimo com extensão controlada do legado antes de financiar a migração inteira.

## Checklist de revisão da fundação

- [ ] Conferir fronteira proposta: proof sem IA/sharing/PIM/presence; AI Translation + basic read-only sharing como FATHER-USABLE V1 MUST-CANDIDATE; demais itens POST-V1 PROPOSED.
- [ ] Reproduzir inspeção das páginas difíceis e dimensões dos PDFs.
- [ ] Revisar os paths de reaproveitamento e evitar imports transitivos do legado.
- [ ] Conferir frame completo, table height fixo, RowHeightPolicy, solver de colunas e annotations sem autoridades concorrentes.
- [ ] Conferir ações, revisão local, histórico, CAS e snapshot em conjunto.
- [ ] Validar readiness de fonts/assets/images, `LAYOUT_UNSTABLE`, parity e anti-false-positive de raster PDF.
- [ ] Executar FOUNDATION-PROOF-01 e registrar G01–G05 antes de detalhar todos os pacotes posteriores.
- [ ] Conferir risco de RLS/worker antes de migrações ou deploy.
- [ ] Não confundir suíte verde com aceitação editorial ou jornadas de nuvem testadas.

O trabalho desta sessão entrega análise e proposta revisada. Não entrega uma plataforma pronta, um catálogo comercial final, uma auditoria de segurança completa ou a execução literal das 70 fases do anexo. As limitações foram registradas para que o próximo agente possa continuar sem depender de memória de chat.
