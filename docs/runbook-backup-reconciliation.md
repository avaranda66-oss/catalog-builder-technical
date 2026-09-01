# Runbook Operacional — Backup, Rotação de Credenciais e Reconciliação de Dados

- **Documento:** `RUNBOOK-001`
- **Data:** 2026-09-01
- **Responsável:** @devops / @data-engineer
- **Aprovador:** Administrador do Sistema

---

## 1. Procedimento de Backup Lógico e Storage (Gate G1)

Antes de qualquer migração, alteração de RLS, alteração de schema ou manipulação de dados:

### 1.1. Backup das Tabelas do Supabase
1. No dashboard do Supabase (ou via Supabase CLI com token seguro):
   ```bash
   # Exportar dump SQL completo dos dados
   supabase db dump --data-only -f backup_data_$(date +%Y%m%d_%H%M%S).sql
   ```
2. Caso o acesso seja via SQL Editor do dashboard, executar consulta de exportação em JSON para as tabelas principais:
   ```sql
   SELECT json_agg(t) FROM (SELECT * FROM products) t;
   SELECT json_agg(t) FROM (SELECT * FROM catalogs) t;
   SELECT json_agg(t) FROM (SELECT * FROM media_library) t;
   ```
3. Salvar os arquivos em local seguro e protegido (`.local-backups/`, ignorado pelo Git).

### 1.2. Backup do Storage
1. Listar e baixar todos os objetos do bucket `product-images`:
   - Verificar arquivos criados/modificados nos últimos 7 dias.
   - Preservar cópia compactada em `backup_storage_product_images_$(date +%Y%m%d).tar.gz`.

---

## 2. Procedimento de Rotação de Credenciais de IA (Gate G3)

A chave da API Gemini legada esteve exposta no histórico do repositório. O procedimento de rotação deve ser executado pelo Administrador:

### 2.1. Revogação no Provedor
1. Acessar o console [Google AI Studio / Google Cloud Console](https://aistudio.google.com/app/apikey).
2. Localizar a chave de API e clicar em **Revoke / Delete** (Revogar imediatamente).
3. Gerar uma **Nova Chave de API** com restrição de IP ou restrição exclusiva para a API Generative Language.

### 2.2. Armazenamento Seguro
1. **NUNCA** inserir a chave em arquivos `.env` locais versionados, commits do Git ou variáveis `VITE_*`.
2. A nova chave será configurada exclusivamente no cofre de segredos do Supabase para consumo pela Edge Function (Fase P2):
   ```bash
   supabase secrets set GEMINI_API_KEY="nova_chave_secreta"
   ```

---

## 3. Plano de Reconciliação de Dados Afetados por Testes (Gate G2)

### 3.1. Identificação de Registros Afetados
Os testes anteriores inseriram registros com códigos/nomes de teste (ex.: imagens `sensor_presys_pcon_jpg.jpg` com timestamp de upload ou SKUs fictícios).

### 3.2. Regra de Não-Exclusão Cega
1. Nenhum registro é apagado via `DELETE` em massa.
2. É gerado um relatório de auditoria (`AUDIT_DIFF`) listando:
   - Produtos cadastrados na nuvem vs. Planilha Mestre PRESYS oficial.
   - Status de cada campo (faixa de pressão, exatidão, unidade).
3. O Administrador revisa o relatório e assina a autorização de reconciliação.
4. Os registros marcados para correção recebem `UPDATE` transacional rastreado com histórico na tabela de auditoria.
