**Story — implementação da evolução corporativa**

Status: concluída.

Origem: autorização do usuário para aplicar a revisão de 31/08/2026.

Escopo: corrigir os defeitos registrados, estabelecer persistência segura e cadastro reutilizável, oferecer dashboard de trabalho, editor consistente e publicação revisável. Preservar dados existentes e não declarar migrações remotas aplicadas sem confirmação.

Checklist:

- [x] Integridade de importação, IA e contratos de dados.
- [x] Autenticação, autorização e migrations aditivas.
- [x] Salvamento, concorrência, cache e histórico.
- [x] Cadastro mestre, mídia e documentos reutilizáveis.
- [x] Dashboard, revisão e personalização.
- [x] Editor e impressão isolada com validação.
- [x] Testes de regressão, lint, typecheck e build.
- [x] Verificação visual local e operação documentada.
- [x] Registrar situação exata do Supabase remoto e limitações.
- [x] Fluxo de convite e recuperação de senha com redirecionamento local.
- [x] Atualizar file list ao concluir.

Validação: 47 testes passando ao executar cada arquivo; `npm run lint`, `npm run typecheck` e `npm run build` concluídos sem erros. O executor agregado `npm test` do sandbox não consegue criar os workers dos arquivos e retorna `spawn EPERM`; isso é uma restrição do ambiente, não uma falha de teste. O backup lógico está em `.local-backups/` (ignorado pelo Git), incluindo as 64 entradas da auditoria exportadas por consulta SQL. O Supabase `Catalogpresys` recebeu a migration `00004_team_workspace`, com 1 usuário Auth convidado e perfil `admin` ativo.

Limitações conhecidas: a extração de PDF continua literal (sem OCR/layout de imagens), o rate limit de IA é por processo, a importação Excel adiciona linhas individualmente e links de convite/redefinição expiram por segurança. A tela de login oferece um novo link de recuperação quando isso ocorrer. Cada limitação está documentada e não produz valores técnicos fictícios.

File list:

- `app/page.tsx`, `app/print/`, `app/api/ai/`, `app/globals.css`
- `components/auth/`, `components/dashboard/`, `components/layout/`, `components/forms/`, `components/ai/`, `components/preview/`, `components/ui/`
- `features/editor/`, `features/import/`
- `lib/ai/`, `lib/auth/`, `lib/catalog/`, `lib/import/`, `lib/pdf/`, `lib/storage/`, `lib/supabase/`, `lib/types/`, `lib/validators/`
- `supabase/migrations/00004_team_workspace.sql`, `supabase/tests/workspace_security.sql`, `supabase/README.md`
- `tests/`, `package.json`, `package-lock.json`, `.env.example`, `eslint.config.mjs`, `.gitignore`, `README.md`
