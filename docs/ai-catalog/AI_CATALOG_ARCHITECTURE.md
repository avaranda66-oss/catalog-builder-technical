# Arquitetura do catálogo assistido por IA

Data: 2026-10-09. Decisão registrada antes da implementação; atualização após a demonstração local. O MVP é um compilador determinístico com planejamento simulado, não uma integração operacional de IA.

## Base e isolamento

Branch codex/ai-first-catalog-prototype-20261009, criada da main aprovada 1c3dbb1a4dfb6fd7b0a32ebbb5dea1dee151d014, tree cce806774a5167cd6060ededb443ed2651db0257, CI 37831959325 SUCCESS. A PR #67 permanece em sua própria branch/worktree, sem código novo de IA. Sua autorização de merge é separada.

A entrada Vite ai-catalog-prototype.html é aditiva. A Library de produção, a autenticação e o bootstrap principal permanecem iguais. A demonstração usa somente dados originais sintéticos e armazenamento local isolado.

## Componentes reutilizados

| Responsabilidade | Implementação neste MVP |
| --- | --- |
| Entrada | JSON sintético com schema estrito, revisão e hash do conteúdo estruturado das fontes |
| Conhecimento técnico | Strings literais, modelo/campo/unidade/condição, página e trecho; ausência e conflito explícitos |
| Planejamento | Provedor simulado que escolhe uma intenção editorial permitida |
| Composição | PageTemplateRegistry, page.template.insert, createDocumentSession e presets aprovados |
| Documento | Schema canônico existente, sem nova versão ou modelo paralelo |
| Layout e validação | DocumentRenderer e reviewPublication, fontes reais, medição DOM e snapshots imutáveis |
| Revisão | Proposta completa, disposição de dúvidas e aprovação vinculada ao documento/fontes |
| Persistência | CatalogRepository/CAS existente, adaptador local sintético e registro atômico |
| Publicação | PublicationReview e verifyPublicationForPrint, política existente e PDF real |

O compilador lê dados exclusivamente da entrada validada. O planejador decide apresentação; não pode alterar especificações, executar comandos arbitrários ou produzir HTML/CSS livre. Entrada, decisões e plano acompanham o documento em um sidecar, sem mudar o schema canônico.

## Composição limitada

2–4 modelos, até 6 seções/48 características. Cada página recebe uma seção ou continuação explícita de até 8 linhas, com cabeçalho repetido e linhas inteiras. A fixture principal gera duas páginas A4, térmica e elétrica; 9 linhas térmicas geram uma continuação adicional.

O limite reduz o escopo, mas não garante encaixe. A publicação existente mede texto, fontes, células, margens, overflow e sobreposição. Conteúdo excessivo deve permanecer BLOCKED mesmo quando válido no contrato. Não há motor geral de paginação nem redução automática da fonte.

## Integridade e aprovação

1. Validar schema, identidades, hash e associação literal à página.
2. Compilar em sessão isolada e instalar somente a proposta completa validada.
3. Exigir reconhecimento de ausência e escolha explícita entre fontes conflitantes.
4. Vincular aprovação ao documento, entrada, plano e disposições completos.
5. Capturar dados antes das esperas assíncronas. Uma Web Lock serializa CAS local; documento, fontes e aprovação são gravados juntos.
6. Revalidar o registro ao reabrir. Editar/refinar invalida aprovação até nova revisão.
7. Verificar novamente o snapshot antes de imprimir; BLOCKED não recebe autorização de impressão.

O refinamento implementado reduz somente padding. Uma transação do histórico existente permite desfazer/refazer. Alterar valor técnico manualmente rompe a associação de origem e exige restauração/regeneração neste MVP.

## Alternativas

- HTML livre: rejeitado por perda de geometria, integridade e controle de execução.
- Segundo editor/modelo/PDF: rejeitado para evitar validações divergentes.
- Paginação universal: adiada; grupos, notas e cabeçalhos exigem decisões amplas do modelo.
- Dados comerciais como fixtures: rejeitados. Os seis PDFs estudados orientam estrutura editorial, sem copiar valores concorrentes.
- Provedor externo imediato: adiado até autorização explícita dos materiais, destino e orçamento.

## Fronteira futura

Intake real deverá registrar hash dos bytes originais, versão, autorização, proprietário/tenant, páginas e qualidade de extração. Antes de enviar material a um modelo externo, definir destino autorizado, minimização, acesso e limite de custo.

OCR, leitura visual de PDFs/imagens, chamada de modelo, segurança multiusuário do sidecar e integração à Library de produção não estão implementados. O hash atual cobre JSON de páginas sintéticas, não bytes/autenticidade de PDF. O MVP não depende das mudanças não incorporadas da PR #67; integração/rebase requer decisão separada.

Matriz de testes e RELEASE_READINESS identificam a autoridade atual. Demonstração de agente não aprova Marc nem uso por funcionários.
