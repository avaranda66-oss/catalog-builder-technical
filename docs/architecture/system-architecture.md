# Descoberta do sistema existente

**Baseline auditado:** commit `1e93d6d`  
**Método:** leitura estática do repositório local; nenhuma escrita no Supabase nesta fase

## Stack observada

- Next.js 16.3.3 com App Router.
- React 19 e TypeScript.
- Tailwind CSS 4, Lucide e CSS de impressão.
- Zustand + Immer para o estado do editor.
- Supabase JS/SSR para Auth, Postgres e Storage.
- ExcelJS/PapaParse para arquivos tabulares e rotas Next para IA.

## Fluxo visual preservado

`app/page.tsx` compõe `Toolbar`, `Sidebar`, uma área de formulário/grid e `CatalogDocument`. A pré-visualização usa `CatalogPage` e `PageSection`; a folha é dimensionada em A4 via CSS. A reconstrução deve preservar esse contrato de composição e mover decisões de domínio para serviços independentes.

## Riscos identificados no baseline

- O estado do editor concentra dados, histórico, persistência e integração externa.
- Tipos de seção e conteúdo ainda permitem objetos genéricos, dificultando validação de cada bloco.
- O contrato inicial de RLS é amplo e precisa ser revisado para equipes, papéis e catálogos.
- A exportação e a importação dependem de caminhos diferentes do preview; precisam compartilhar um snapshot.
- A UI contém estados assíncronos dispersos, o que contribuiu para botões sem ação aparente e mensagens genéricas.

Esses itens são dívida de fundação, não mudanças visuais. Serão tratados em stories separadas, com o baseline como teste de regressão.

