# STORY-003-P0: Runbook de Backup, Rotação de Credencial & Reconciliação

- **Épico:** `EPIC-001`
- **Status:** Concluída e Validada por QA (@qa Quinn)
- **Data de Conclusão:** 2026-09-01
- **Prioridade:** P0 (Bloqueante)
- **Gate de Qualidade:** Gate G1 (Congelamento & Backup) e Gate G2 (Reconciliação) — APROVADO
- **Responsável:** @devops / @data-engineer
- **Revisor:** @qa (Quinn)

---

## 1. Descrição e Racional

Para garantir que nenhuma mutação em banco, migração ou alteração remota ocorra sem plano de reversão e integridade comprovada, este runbook formaliza os procedimentos de:
1. Extração de backup lógico de banco e storage antes de qualquer operação remota.
2. Instruções de revogação e rotação da chave Gemini no console do Google Cloud.
3. Protocolo de reconciliação de dados sem exclusão cega.

---

## 2. Critérios de Aceite (Given / When / Then)

### Cenário 1: Protocolo de Backup Documentado
- **Given** a necessidade de aplicar migrations ou alterações no Supabase
- **When** o operador consulta o runbook
- **Then** encontra os passos exatos de dump de dados e storage para a pasta segura `.local-backups/`.

### Cenário 2: Rotação de Credenciais
- **Given** a revogação da chave Gemini comprometida
- **When** a nova chave for provisionada
- **Then** o runbook prescreve a inserção exclusiva no cofre do Supabase (`supabase secrets set`), proibindo qualquer inclusão em bundle do cliente.

---

## 3. Checklist de Implementação

- [x] Criar `docs/runbook-backup-reconciliation.md` cobrindo Gates G1, G2 e G3.
- [x] Definir comandos e queries SQL de exportação de dados.
- [x] Estabelecer política de reconciliação com log de auditoria.
- [x] Revisar com o QA.

---

## 4. File List

- `docs/runbook-backup-reconciliation.md`
- `docs/stories/story-003-p0-runbook-backup-reconciliation.md`
