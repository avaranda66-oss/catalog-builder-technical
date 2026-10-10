# Contrato de planejamento e composição

Versão 1: compilador determinístico limitado com planejamento simulado.

## Plano permitido

CatalogPlanSchema permite template comparison-a4-v1, preset existente comparison ou technical-specification, ordem completa/única das seções e máximo fixo de 8 linhas por página. Dados vêm exclusivamente da entrada validada; o plano decide apresentação.

Pedidos iniciais simulados: “Crie uma comparação por seção” e “Comece pelas especificações elétricas”, quando a seção existir, com variantes equivalentes documentadas. Fora da lista, rejeitar sem aplicação parcial. Isso não representa compreensão geral de linguagem natural.

## Compilação e integridade

DocumentSession isolada compila PageTemplateRegistry validado por page.template.insert e remove a página inicial vazia na mesma transação. Comandos existentes alocam/remapeiam IDs. parseCanonicalDocument/validateDocument continuam autoridades.

Cada página contém título, seção, comparação, aviso sintético, IDs/revisões da entrada e paginação. Colunas preservam rótulo, modelo, valor, unidade e condição. Unidade/condição são compartilhadas por linha; diferenças por modelo exigem linhas separadas, nunca agregação silenciosa. RichText escapado conserva multiline e vazios; não aceita HTML livre.

Linhas são compostas uma vez, em blocos inteiros, com cabeçalho repetido nas continuações. Verificador compara a matriz completa às disposições e mantém 42 referências técnicas na fixture de três modelos.

## Layout físico

A4 retrato 210 × 297 mm, margem segura 12 mm, tabela 176 mm de largura e região autorada 173 mm de altura, Noto Sans 10 pt, paleta/presets do baseline.

O primeiro navegador detectou overflow do cabeçalho “Unidade” em 16 mm. Correção: 20 mm sem reduzir fonte/remover guardas. Para 2/3 modelos, descrição/condição usam 44/38 mm e modelos dividem 74 mm. Para 4 modelos, descrição/condição usam 40/30 mm e cada modelo recebe 21,5 mm. Tracks conservam mínimo de 16 mm.

Limite estrutural não garante encaixe. reviewPublication mede fontes/ranges/texto/frames, captura snapshots e verifica overflow/sobreposição. Palavra longa deve continuar BLOCKED. Aprovação técnica e salvamento não dispensam preflight final.

## Propostas e histórico

“Deixe mais compacto” propõe somente padding de 0,8 mm. Valores, unidades, fonte e páginas permanecem iguais. Ações CAS table.style.setBase são pré-validadas em sessão isolada e aplicadas em uma transação do histórico existente. Cancelar não muda o documento; desfazer/refazer restaura exatamente os estados. Aplicar invalida aprovação.

Reordenar após aceitação exige novo plano/revisão e não está implementado como refinamento. Plano inicial permite iniciar pela seção elétrica. Editor manual é opcional; mudar valor fora da proposta rompe origem e exige restaurar/regenerar, sem inventar fonte.

## Persistência e publicação

Registro aprovado guarda documento/fontes/plano/decisões; reabrir verifica associação completa. PublicationReview/verifyPublicationForPrint originais permanecem autoridades. O protótipo instala/restaura a política de impressão do body: somente portal READY autorizado imprime, sem controles.

Prova automatizada captura ação verificada de impressão e gera PDF real do aplicativo inteiro com CSS original. Compara 96 células por texto/posição, incluindo Unicode, multiline e vazio. Origem/canônico/DOM têm comparação literal completa; extração PDF normaliza whitespace porque não conserva separadores semânticos de parágrafo, mantendo texto e limites por célula. Diálogo nativo “Salvar PDF” é uma fronteira diferente e não foi testado automaticamente.
