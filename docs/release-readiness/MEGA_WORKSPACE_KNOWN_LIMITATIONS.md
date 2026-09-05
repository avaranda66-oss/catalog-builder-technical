# Mega Workspace Known Limitations & Release Matrix

**Document Version:** 1.0.0-rc  
**Status:** AUDITED & FROZEN  
**Target Branch:** `integration/pim-mega-workspace-v1`  
**Head Commit:** `616ead76691a604a83b17e96a66cdb34c61acb31`  

Este documento detalha exaustivamente as limitações técnicas e operacionais conhecidas na frente Mega Workspace (PIM Read-Only RC), permitindo que auditores e a liderança de engenharia decidam a esteira de release com total transparência.

---

## Matriz de Limitações Técnicas

### 1. Migração 00024 de Layout não Aplicada em Produção
- **STATUS:** PENDING_DEPLOYMENT (Draft SQL em `docs/sql-drafts/00024_product_workspace_layouts.sql`).
- **USER IMPACT:** O usuário não tem seus layouts customizados (ordem de seções, blocos reorganizados) salvos no servidor entre sessões.
- **WORKAROUND:** O sistema projeta o layout automaticamente a cada inicialização através do `autoOrganizeProductWorkspace()` em memória, garantindo visualização consistente e estruturada dos dados.
- **BLOCKS COMPANY RELEASE?:** NO (O escopo aprovado para a frente Mega Workspace nesta release é estritamente **Read-Only / Consulta Técnica**).

---

### 2. Edição de Dados Técnicos Desabilitada no Mega Workspace (`edit_data`)
- **STATUS:** INTENTIONALLY_DISABLED.
- **USER IMPACT:** Usuários que precisam alterar valores de especificações, unidades ou aprovar revisões de fatos não conseguem fazê-lo a partir do Mega Workspace.
- **WORKAROUND:** O usuário clica no botão *"Voltar ao Clássico"* e realiza edições no `ProductKnowledgeWorkspace` tradicional.
- **BLOCKS COMPANY RELEASE?:** NO (Preserva a integridade do banco e evita concorrência durante a homologação do novo visualizador).

---

### 3. Persistência de Edição de Layout Desabilitada (`edit_layout`)
- **STATUS:** INTENTIONALLY_DISABLED.
- **USER IMPACT:** Não é possível renomear seções, reordenar tabelas ou adicionar novos blocos visualmente no Mega Workspace em produção.
- **WORKAROUND:** Utilizar os templates oficiais e a organização padronizada do catálogo.
- **BLOCKS COMPANY RELEASE?:** NO.

---

### 4. Ausência de Tabela Live para Registro Semântico (`semantic_registry`)
- **STATUS:** DOMAIN_COMPLETE_PERSISTENCE_ABSENT (O motor de herança semântica e descritores está validado no domínio, mas não possui tabela própria no Supabase).
- **USER IMPACT:** Aliases para IA e descrições semânticas adicionadas manualmente em tempo de execução não sobrevivem a um reload de página.
- **WORKAROUND:** Descritores canônicos padrão são fornecidos a partir dos módulos e dados do `ProductWorkbookV2` e dos metadados da família.
- **BLOCKS COMPANY RELEASE?:** NO (Planejado para fase posterior de governança de IA).

---

### 5. Escritas Semânticas Desabilitadas (`semantic_writes`)
- **STATUS:** INTENTIONALLY_DISABLED.
- **USER IMPACT:** A interface não oferece formulários para renomear chaves canônicas ou associar novos aliases fora do ambiente de teste/laboratório.
- **WORKAROUND:** Manter a nomenclatura canônica estável originada da ingestão oficial.
- **BLOCKS COMPANY RELEASE?:** NO.

---

### 6. Respostas e Escritas por IA Desabilitadas (`ai_answering_writes`)
- **STATUS:** INTENTIONALLY_DISABLED.
- **USER IMPACT:** O componente de IA não realiza inferências ativas nem aplica modificações automáticas sobre a ficha do produto.
- **WORKAROUND:** Consulta manual de evidências e fontes documentais através do `SourceDrawer`.
- **BLOCKS COMPANY RELEASE?:** NO.

---

### 7. Mega Workspace Mantido em Sinalização Beta
- **STATUS:** INTENTIONALLY_FLAGGED.
- **USER IMPACT:** O cabeçalho exibe o selo `"Mega Workspace Beta"` e o modal de ajuda indica que o recurso está em fase de homologação controlada.
- **WORKAROUND:** Nenhum necessário; serve como expectativa correta para os operadores.
- **BLOCKS COMPANY RELEASE?:** NO.

---

### 8. Workspace Clássico Mantido como Autoridade Operacional Exclusiva
- **STATUS:** ACTIVE_AUTHORITY.
- **USER IMPACT:** Toda mutação persistente de produtos continua centralizada na rota do editor clássico.
- **WORKAROUND:** Transição de 1 clique oferecida no cabeçalho do Mega Workspace.
- **BLOCKS COMPANY RELEASE?:** NO (Garante risco zero de regressão para operações rotineiras).

---

### 9. Testes de Homologação Playwright Live Pendentes de Liberação de CPU
- **STATUS:** PAUSED (Suspenso preventivamente para garantir contenção total do incidente Supabase CPU).
- **USER IMPACT:** A validação em navegador real contra o banco online `bjxqvrpbigwgabwbhtqa` ainda não foi reexecutada.
- **WORKAROUND:** Suíte completa de testes de integração, container e renderização executada em JSDOM com mocks de repositório fiéis ao contrato de produção (148 arquivos, 1.612 testes passando).
- **BLOCKS COMPANY RELEASE?:** DEPENDS (A esteira de pré-produção deve rodar a auditoria Read-Only do Playwright em ambiente seguro ou após confirmação de métricas de CPU estáveis no Supabase).
