# Schema Supabase — baseline de descoberta

O baseline possui migrations `00001_initial_schema.sql`, `00002_audit_triggers.sql` e `00003_rls_policies.sql`. Elas definem:

- `profiles`, `catalogs`, `field_definitions`, `products` e `assets`;
- `product_versions`, `audit_log`, `ai_runs` e `templates`;
- enums de papel, status de catálogo/produto e status de execução de IA;
- índices GIN para `products.data` e índices de catálogo, campos e auditoria;
- triggers de auditoria para catálogo, produto e definição de campo.

## Relacionamentos observados

`catalogs` possui muitos `products` e `field_definitions`; `products` possui muitos `assets`, `product_versions` e `ai_runs`; `profiles` é referenciado pelo ator de alterações e pelo autor de versões.

## Lacunas para a reconstrução

- Documento/páginas/seções ainda não possuem tabelas próprias no baseline.
- `assets` não declara checksum, tamanho, MIME, status de processamento ou vínculo a uma versão.
- RLS permite CRUD amplo a qualquer usuário autenticado; não há escopo por organização/equipe.
- Não há entidade explícita para revisão/aprovação nem para propostas de importação.
- O schema deve ser ampliado somente após fechar a matriz de papéis e a política de conflito.

