# Schema Supabase — baseline de descoberta

O baseline possui migrations `00001_initial_schema.sql`, `00002_audit_triggers.sql` e `00003_rls_policies.sql`. Elas definem:

- `profiles`, `catalogs`, `field_definitions`, `products` e `assets`;
- `product_versions`, `audit_log`, `ai_runs` e `templates`;
- enums de papel, status de catálogo/produto e status de execução de IA;
- índices GIN para `products.data` e índices de catálogo, campos e auditoria;
- triggers de auditoria para catálogo, produto e definição de campo.

## Relacionamentos observados

`catalogs` possui muitos `products` e `field_definitions`; `products` possui muitos `assets`, `product_versions` e `ai_runs`; `profiles` é referenciado pelo ator de alterações e pelo autor de versões.

## Migration local 00004 — documento e workspace

O arquivo `supabase/migrations/00004_document_workspace.sql` adiciona, sem remover o
baseline:

- `catalog_members`, com papel por catálogo (`admin`, `editor`, `reviewer`, `viewer`);
- `catalog_pages` e `page_sections`, para a composição ordenável das páginas A4;
- `catalog_versions`, com snapshot JSON imutável por versão;
- `catalog_reviews`, com autor, revisor, decisão e proteção contra autoaprovação;
- `catalog_proposals`, unificando propostas manuais, importadas e de IA;
- `catalog_product_links`, permitindo reutilizar um produto da biblioteca mestre em vários catálogos;
- metadados de arquivo em `assets` (`mime_type`, `byte_size`, `checksum`, `processing_status`).

A migration faz backfill apenas dos produtos que já possuem `products.catalog_id`.
Ela não inventa membros para catálogos existentes e mantém `products.catalog_id`
durante a transição para o vínculo N:N.

As novas tabelas usam a função `is_catalog_member` e políticas RLS escopadas ao
catálogo. As políticas permissivas de `00003` para tabelas legadas continuam no
em vigor até uma revisão operacional da matriz de papéis; portanto, este artefato é
um draft local e ainda não foi aplicado ao Supabase remoto.
