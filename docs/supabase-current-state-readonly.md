# Estado Atual Read-Only do Supabase — Catalogpresys

- **Data da Coleta:** 2026-09-01 19:35:00 BRT (`America/Sao_Paulo`)
- **Projeto Supabase Identificado:** `Catalogpresys`
- **Project Ref / ID:** `bjxqvrpbigwgabwbhtqa`
- **Região:** `sa-east-1` (São Paulo, Brasil)
- **Status da Instância:** `ACTIVE_HEALTHY`
- **Postgres Engine:** PostgreSQL 17 (17.6.1.166)
- **Modo de Operação:** Read-Only Audit & Snapshot (Nenhuma mutação ou alteração executada)

---

## 1. Inventário de Schemas e Tabelas

| Schema | Tabela | RLS Habilitado | Qtd Linhas | Descrição Fática Observada |
|---|---|---|---|---|
| `public` | `products` | Sim | 11 | Catálogo mestre de produtos e especificações |
| `public` | `catalogs` | Sim | 6 | Documentos e configurações de catálogos |
| `public` | `media_library` | Sim | 3 | Registro de mídias e imagens vinculadas |
| `public` | `field_definitions` | Sim | 17 | Metadados de campos e validações do configurador |
| `public` | `templates` | Sim | 3 | Tokens de design (`presys-premium`, `additel-clean`, `fluke-dense`) |
| `public` | `catalog_products` | Sim | 5 | Tabela de junção catálogo x produtos |
| `public` | `profiles` | Sim | 1 | Perfis de usuários internos (`admin`) |
| `public` | `audit_log` | Sim | 807 | Triggers de auditoria do banco |
| `public` | `assets` | Sim | 0 | Tabela de ativos adicionais (vazia) |
| `public` | `product_versions` | Sim | 0 | Histórico versionado de produtos (vazia) |
| `public` | `catalog_versions` | Sim | 0 | Histórico versionado de catálogos (vazia) |
| `public` | `ai_runs` | Sim | 0 | Histórico de execuções de IA (vazia) |
| `auth` | `users` | Sim | 1 | Usuário administrador registrado e confirmado |
| `storage` | `buckets` | Sim | 2 | Buckets de armazenamento de imagens |
| `storage` | `objects` | Sim | 21 | Objetos registrados no Storage |

---

## 2. Inventário do Storage e Buckets

| Bucket ID | Visibilidade | File Size Limit | MIME Types Permitidos | Qtd Objetos | Detalhes |
|---|---|---|---|---|---|
| `product-images` | `public` | Ilimitado | Todos | 19 | Contém 16 artefatos de teste legados (17 bytes) e 3 imagens PNG reais (~1.9 MB) |
| `catalog-images` | `private` | 8 MB | `image/jpeg`, `image/png`, `image/webp` | 2 | Contém 2 imagens do PCON-Y17 (29.7 KB cada) criadas em 2026-08-31 |

---

## 3. Diagnóstico de Políticas RLS (Row Level Security)

As políticas ativas no banco confirmam a vulnerabilidade arquitetural diagnosticada no ADR-001:

- **Vulnerabilidade Identificada:** As tabelas `public.products`, `public.catalogs` e `public.media_library` possuem policies permissivas com `roles: {public}` e regra `qual: true`, `with_check: true` (`Acesso publico total`, `products_all_access`, etc.), permitindo que qualquer requisição anônima executasse `INSERT`/`UPDATE`/`DELETE` direto sem autenticação.
- **Isolamento Aplicado:** O frontend foi isolado em memória nos testes e o app atual teve escritas suspensas preventivamente nesta janela de recuperação.

---

## 4. Resumo de Autenticação (Sem Dados Pessoais)

- **Total de Usuários Auth:** 1 usuário confirmado.
- **Perfis Ativos:** 1 usuário com perfil `role: admin` e `is_active: true`.
- **Nenhum e-mail, senha, hash de credencial ou token foi exposto ou gravado.**

---

## 5. Backups Físicos Exportados (Fora do Git)

Todos os dados brutos foram exportados em formato JSON na pasta externa:
`C:\Users\Usuario\Desktop\CONFIGURATOR PCON\RECOVERY-20260901\`
