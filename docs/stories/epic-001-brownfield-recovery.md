# EPIC-001: Brownfield Recovery, Security, Test Isolation & Core Reliability

- **Status:** Em Progresso
- **Data de Início:** 2026-09-01
- **Responsável:** @sm (Dex / Scrum Master)
- **Base Arquitetural:** `docs/adr-001-brownfield-architecture.md`
- **PRD:** `docs/prd-release-recovery.md`

---

## 1. Visão Geral do Épico

Este épico abrange a recuperação integral do Catalog Builder para torná-lo um produto seguro, confiável e operável pelo pai do solicitante (Administrador) e colaboradores autorizados. A execução prioriza estritamente os gates P0 de segurança e isolamento antes de implementar funcionalidades adicionais.

---

## 2. Árvore de Stories e Dependências

```
EPIC-001
 ├── [P0] STORY-001: Isolamento Completo de Testes & Mocking do Supabase (Zero writes em produção)
 ├── [P0] STORY-002: Remoção Segura da Chave Gemini do Cliente & IA Determinística Local
 ├── [P0] STORY-003: Runbook de Backup, Rotação de Credencial & Reconciliação
 ├── [P0] STORY-004: Supabase Auth & Papéis Admin/Colaborador no Frontend
 ├── [P0] STORY-005: RPCs Transacionais, CAS & RLS Estrita no Supabase
 ├── [P1] STORY-006: Motor de Divergências e Overrides Locais
 ├── [P1] STORY-007: Gestão de Mídia Verificada vs Demo com Bucket Controlado
 └── [P1] STORY-008: Fixtures de QA Visual do PDF & Impressão Vetorial A4
```

---

## 3. Matriz de Rastreabilidade

| Story ID | Título | Prioridade | Gate Associado | Status |
|---|---|---|---|---|
| STORY-001 | Isolamento Completo de Testes & Mocking Supabase | P0 | G6 (Testes Seguros) | Pronto para Dev |
| STORY-002 | Remoção de Chave Gemini do Cliente & IA Local | P0 | G3 (Credencial Exposta) | Pendente |
| STORY-003 | Runbook de Backup & Reconciliação | P0 | G1 / G2 (Backup & Reconciliação) | Pendente |
| STORY-004 | Supabase Auth & Papéis no Frontend | P0 | G4 (Identidade & Autorização) | Pendente |
| STORY-005 | RPCs Transacionais & RLS Estrita | P0 | G5 (Persistência Segura) | Pendente |
| STORY-006 | Motor de Divergências e Overrides Locais | P1 | G5 (Integridade da Biblioteca) | Pendente |
| STORY-007 | Gestão de Mídia Verificada vs Demo | P1 | G7 (Mídia Segura) | Pendente |
| STORY-008 | Fixtures de QA Visual do PDF & Vetorial A4 | P1 | G8 (PDF Limpo & Qualidade) | Pendente |
