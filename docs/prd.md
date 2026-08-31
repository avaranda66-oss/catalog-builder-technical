# PRD — Catalog Builder técnico

**Versão:** v0.1 (discovery)  
**Status:** pronto para revisão de escopo  
**Fonte:** [briefing](briefing.md), código antigo no `HEAD` e requisitos registrados na conversa

## Objetivo

Reconstruir o Catalog Builder em cima do design antigo aprovado, mantendo sua experiência de editor e substituindo a base frágil por um fluxo confiável de dados, colaboração, revisão e publicação de PDFs técnicos.

## Personas

- **Editor técnico:** cadastra produtos, confere unidades e monta páginas.
- **Revisor:** verifica completude e consistência do conteúdo antes da publicação.
- **Administrador:** gerencia equipe, permissões, catálogos e políticas de publicação.
- **Leitor/uso local:** consulta ou testa o documento sem alterar dados compartilhados.

## Requisitos funcionais

### FR-01 — Biblioteca mestre de produtos

O sistema deve cadastrar, editar, arquivar e pesquisar produtos com identidade, descrição, especificações, variantes, tabelas, fotos, diagramas e proveniência de cada dado.

### FR-02 — Campos técnicos configuráveis

O administrador deve definir campos, tipos, unidades, obrigatoriedade, ordem e visibilidade. O formulário e as tabelas devem derivar dessas definições.

### FR-03 — Editor de páginas A4

O editor deve criar, remover, ordenar e ocultar páginas e blocos. Deve suportar, no mínimo, capa, destaques, texto, tabelas técnicas, galeria, imagem/diagrama, acessórios, código de encomenda e rodapé.

### FR-04 — Edição em três modos

O mesmo estado deve ser editável pelo formulário assistido, pela planilha técnica e pela pré-visualização visual direta, com undo/redo e indicação de alterações não salvas.

### FR-05 — PDF institucional

O usuário deve visualizar páginas com dimensões A4, conferir quebras e exportar uma versão pronta para impressão, sem incluir controles do editor.

### FR-06 — Importação rastreável

Excel/CSV e PDF devem entrar como proposta validada, exibindo erros por linha/campo, valores originais, fonte e mudanças antes de serem aplicados.

### FR-07 — Assistente de IA controlado

Comandos de IA devem produzir propostas limitadas ao produto/documento selecionado. Toda mudança deve ser comparável, aceita individualmente ou rejeitada, e registrada.

### FR-08 — Equipe, revisão e publicação

Contas são individuais. O sistema deve aplicar permissões, exigir revisor apropriado para aprovação/publicação, registrar auditoria e preservar versões publicadas.

### FR-09 — Supabase e modo local

Usuários autenticados trabalham com dados sincronizados no Supabase. O modo local mantém um rascunho explícito no navegador e oferece exportação/importação de backup.

### FR-10 — Dashboard operacional

O dashboard deve mostrar produtos, páginas, mídias, pendências, status de revisão e atividade da equipe, usando o mesmo domínio do editor.

## Requisitos não funcionais

- **NFR-01 Fidelidade visual:** o baseline antigo é preservado; tokens e componentes devem ser versionados.
- **NFR-02 Impressão:** A4 determinístico, com CSS de impressão e verificação automatizada de páginas críticas.
- **NFR-03 Segurança:** RLS, Storage privado, sessão validada no servidor e princípio do menor privilégio.
- **NFR-04 Integridade:** atualizações concorrentes não podem sobrescrever rascunhos sem detectar conflito.
- **NFR-05 Observabilidade:** erros de importação, IA, sincronização, revisão e exportação devem produzir mensagens acionáveis e logs auditáveis.
- **NFR-06 Qualidade:** lint, typecheck, testes e build passam antes de uma story ser considerada concluída.
- **NFR-07 Acessibilidade:** navegação por teclado, foco visível, rótulos e mensagens associadas aos controles existentes.
- **NFR-08 Desempenho:** listas e mídias devem carregar progressivamente sem bloquear a edição de outros campos.

## Fora do escopo inicial

- CRM, vendas, estoque ou cálculo de preço.
- OCR avançado de imagens sem validação de fonte.
- Publicação pública automática sem revisão.
- Alteração visual ampla não solicitada.

## Roadmap em fatias verticais

1. **Fundação:** AIOX, baseline visual, contratos de domínio, autenticação e health checks.
2. **Biblioteca:** produtos, campos, mídias, proveniência e persistência.
3. **Composição:** páginas, blocos, editor e pré-visualização A4.
4. **Colaboração:** revisão, publicação, auditoria, versões e conflitos.
5. **Importação/IA:** Excel/CSV, PDF, propostas e traduções revisáveis.
6. **Operação:** dashboard, exportação, backup, observabilidade e preparação para produção.

