# Briefing do Catalog Builder

**Status:** rascunho de descoberta AIOX  
**Data:** 2026-08-31  
**Baseline visual:** `HEAD` do repositório `catalog-builder-technical`

## Visão do produto

O Catalog Builder é o workspace institucional da Presys para cadastrar produtos de engenharia elétrica, organizar dados técnicos e montar catálogos e datasheets em PDF. O produto precisa servir a uma equipe, manter uma biblioteca mestre de produtos e permitir que cada publicação seja composta visualmente em páginas A4.

O editor antigo do repositório é a referência visual aprovada. A reconstrução deve preservar sua barra de ferramentas, proporções, cores, tipografia, sidebar, grid, formulário e folha de pré-visualização. Mudanças de aparência só entram mediante decisão explícita registrada em uma story.

## Problemas que o produto resolve

- Informações de produtos ficam espalhadas em planilhas, PDFs, fotos e documentos.
- A mesma especificação é copiada para várias publicações e pode divergir.
- A montagem de um PDF técnico depende de trabalho manual e revisão difícil.
- A equipe precisa saber quem editou, aprovou e publicou cada versão.
- Importações e sugestões de IA precisam ser revisadas antes de alterar dados técnicos.

## Resultado esperado

Uma pessoa autorizada consegue selecionar ou cadastrar um produto, completar seus dados e mídias, compor páginas com blocos reutilizáveis, revisar o documento e exportar um PDF institucional consistente. Outra pessoa da equipe consegue acompanhar alterações, revisar e publicar uma versão sem perder o histórico.

## Requisitos confirmados na conversa

1. Catálogos técnicos institucionais para produtos de engenharia elétrica.
2. Dashboard rico e personalizável, com criação dinâmica de páginas, blocos, tabelas e imagens.
3. Biblioteca mestre com todos os dados de cada produto, fotos, diagramas e tabelas.
4. Edição por formulário, planilha e diretamente na pré-visualização A4.
5. Importação de Excel/CSV e PDF, com validação e revisão humana.
6. Assistente de IA para apoiar extração, edição e tradução, sem aplicar alterações silenciosamente.
7. Trabalho em equipe com contas individuais, permissões, aprovação, publicação, auditoria e versões.
8. Supabase como plataforma de dados, autenticação e armazenamento quando o usuário estiver conectado.
9. Modo local explícito para testes ou trabalho sem conexão.
10. Reconstrução orientada pelo AIOX Core e pelas suas stories, gates e rastreabilidade.
11. O design antigo do GitHub é o baseline visual e não deve ser trocado pelo design da implementação intermediária.

## Restrições e decisões já tomadas

- A branch de reconstrução parte do commit visual antigo e fica separada do trabalho intermediário.
- O diretório original não será apagado; ele é material de comparação e recuperação.
- CLI/domínio vêm antes de observabilidade e UI, conforme a Constitution do AIOX.
- Nenhuma migração destrutiva ou exclusão de dados do Supabase faz parte desta etapa de descoberta.
- Requisitos novos serão adicionados somente em briefing, PRD ou stories aprovados.

## Perguntas que permanecem abertas

- A empresa usará apenas convite por e-mail ou também SSO corporativo?
- Quais áreas podem editar, revisar, aprovar e publicar?
- O PDF final será gerado no navegador, em serviço do servidor, ou nos dois?
- Qual limite de tamanho, formato e retenção para fotos e diagramas?
- Haverá mais de um catálogo/projeto simultâneo por equipe?
- Quais idiomas entram na primeira entrega além de `pt-BR`?

As perguntas não bloqueiam a fundação do produto. Elas bloqueiam somente decisões específicas que possam criar retrabalho ou alterar o contrato de dados.

