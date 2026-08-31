# Especificação Front-end — preservação do baseline

**Status:** contrato visual inicial  
**Referência:** arquivos no commit `1e93d6d` e screenshots fornecidos pelo usuário

## Regra de preservação

O design antigo é a decisão visual aprovada. A reconstrução deve reutilizar sua estrutura e tokens antes de criar qualquer componente novo. Alterações necessárias para estados de erro, loading ou acessibilidade devem ser aditivas e manter as mesmas proporções.

## Elementos que permanecem

- Cabeçalho/toolbar compacto com marca PCON, nome do catálogo, modos Formulário/Planilha e ações de salvar, importar, IA, idiomas e histórico.
- Sidebar de estrutura com abas Produtos, Páginas e Templates.
- Área central dividida entre dados/conteúdo e pré-visualização.
- Folhas A4 com margens, tabelas técnicas e rodapé institucional.
- Paleta Presys baseada em azul `#003366`, azul escuro `#001A33`, superfícies claras e bordas técnicas.
- Tipografia sans-serif para interface e fonte monoespaçada para dados numéricos.

## Estados obrigatórios

Cada ação precisa exibir estado idle, carregando, sucesso, erro recuperável e bloqueio por permissão. A mensagem deve explicar a ação e o próximo passo, sem substituir silenciosamente a tela.

## Contrato de interação

- Botões da toolbar devem executar uma ação real ou indicar por que estão indisponíveis.
- Mudança de modo não perde seleção, foco ou rascunho.
- Upload mostra progresso, validação, preview e origem.
- Erros de autenticação diferenciam convite expirado, senha ausente, sessão expirada e falta de permissão.
- A pré-visualização em modo de edição mostra alvos de edição; no modo de impressão não mostra controles.

## Responsividade e acessibilidade

O layout desktop continua prioritário para produção de PDFs. Em telas menores, toolbar e sidebar podem colapsar sem remover ações. Foco visível, labels, `aria-live` para status e contraste devem ser preservados.

