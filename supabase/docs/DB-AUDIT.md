# Auditoria de dados — baseline de descoberta

**Status:** somente leitura  
**Acesso remoto:** não utilizado nesta etapa

## Achados

| ID | Achado | Severidade | Próxima ação |
| --- | --- | --- | --- |
| DB-01 | Policies de catálogo, produto, mídia e IA usam `using (true)` para usuários autenticados | Alta | Definir escopo por equipe e papel antes da migration de produção |
| DB-02 | Não havia modelo relacional para páginas e blocos A4 | Resolvido no draft | Revisar e aplicar `00004_document_workspace.sql` após ensaio |
| DB-03 | JSONB de produto é flexível, mas sem validação no banco | Média | Manter validação na camada de domínio e adicionar constraints essenciais |
| DB-04 | Auditoria registra `before/after`, mas não há política de retenção | Média | Decidir retenção, anonimização e consulta |
| DB-05 | Storage não aparece nas migrations do baseline | Média | Definir bucket privado, limites e URLs temporárias |
| DB-06 | Migration 00004 mantém policies legadas permissivas nas tabelas antigas | Alta | Substituir policies de `00003` por matriz de papéis antes do deploy |

Nenhuma linha de produção é alterada por esta auditoria. A próxima story de dados precisa incluir backup, migration aditiva, ensaio transacional e rollback documentado.
