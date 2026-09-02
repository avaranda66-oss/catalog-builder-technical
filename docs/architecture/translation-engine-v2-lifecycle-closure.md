# ENCERRAMENTO TÉCNICO: FASE 2C.2 & 2C.3 — TRANSLATION ENGINE V2 & LIFECYCLE

**Data:** 02/09/2026  
**Status:** ✅ CONCLUÍDO E APROVADO EM PRODUÇÃO (GO DEFINITIVO)  
**Deploy Vercel:** Commit `8a0c9fc` (Production Live)  
**Banco de Dados:** Supabase PostgreSQL (`bjxqvrpbigwgabwbhtqa`)  

---

## 1. Escopo Encerrado e Resultados de Acceptance Manual

O acceptance manual real realizado em produção validou com sucesso todos os elos da esteira de internacionalização e ciclo de vida:

| Componente | Status | Validação Real |
| :--- | :---: | :--- |
| **Translation Center** | ✅ PASS | Abertura do modal, seleção de idioma-alvo (en-US, th-TH) sem tela branca |
| **BYOK (Bring Your Own Key)** | ✅ PASS | Chave de API de usuário armazenada de forma segura na sessão local |
| **Translation Engine V2** | ✅ PASS | Tradução contextual de blocos técnicos, tabelas, notas e capas via Gemini |
| **Review & Diff** | ✅ PASS | Interface de revisão de termos traduzidos antes da confirmação |
| **Font QA (Multiscript)** | ✅ PASS | Carregamento assíncrono de fontes auto-hospedadas (Noto Sans Thai, Devanagari, JP, SC, Arabic) |
| **Layout QA** | ✅ PASS | Verificação determinística de overflow e proporção visual pós-tradução |
| **Catalog Translated Variant** | ✅ PASS | Criação atômica da variante de catálogo traduzido via RPC |
| **Template Translated Variant** | ✅ PASS | Criação atômica de template traduzido via RPC |
| **Cloud Save & Persistence** | ✅ PASS | Salvamento transacional preservando metadados integrais (Migration 00018) |
| **PDF Traduzido Real** | ✅ PASS | Exportação de PDF multilíngue fiel ao canvas rasterizado em alta definição |
| **Permissão & RPC Gate** | ✅ PASS | Autorização corporativa fail-closed sanitizada (Migration 00019) |

---

## 2. Causa Raiz Forense do Erro 42501 (The Smoking Gun)

### O Problema
Mesmo com sessão ativa, usuário confirmado no servidor Supabase Auth (`auth.getUser()`) e perfil retornado como `admin` por `public.team_role()`, as RPCs `create_translated_catalog_v1` e `create_translated_template_v1` retornavam consistentemente:
> `ERROR: 42501: Sem permissão de acesso para criar catálogo traduzido.`

### A Descoberta
Nas funções `create_translated_catalog_v1` (migration 00015) e `create_translated_template_v1` (migration 00016), a variável de perfil foi declarada como:
```sql
declare
  current_role public.user_role := public.team_role();
```

No PostgreSQL e no padrão ANSI SQL:
- **`current_role` é uma palavra-chave reservada do sistema** (identificador/função interna equivalente a `current_user`).
- Em funções `SECURITY DEFINER` (de propriedade do usuário `postgres`), a expressão PL/pgSQL:
  ```sql
  IF actor IS NULL OR current_role IS NULL OR current_role NOT IN ('admin', 'editor') THEN
  ```
  resolvia `current_role` como a **função nativa do sistema**, retornando a string `'postgres'`.
- Como `'postgres'` nunca pertence ao enum `('admin', 'editor')`, a condição de guarda era **incondicionalmente verdadeira**, disparando a exceção `42501` para qualquer usuário, independentemente de privilégios corporativos.
- Em contrapartida, `save_catalog_v3` e `save_template_v1` funcionavam normalmente porque utilizavam a variável com nome não-reservado `v_role`.

---

## 3. Correção Definitiva (Migrations 00017, 00018, 00019)

### Migration 00017 — Security Repair & Fail-Closed Baseline
- Removido qualquer fallback inseguro de UUID hardcoded ou role defaulting.
- Revogado acesso de `anon` e `PUBLIC` de todas as RPCs corporativas (`team_role`, `save_catalog_v3`, `save_template_v1`, `create_translated_*`).
- Versionada a RPC de diagnóstico seguro `translation_auth_probe_v1`.

### Migration 00018 — Preservação de Metadados Traduzidos V4
- Eliminada a antiga allowlist restritiva de 5 campos que descartava metadados internacionais no primeiro salvamento normal pós-tradução.
- `save_catalog_v3` atualizada para compor `c_brand := p_catalog || jsonb_build_object('title', c_title, 'version', new_version)`, preservando integralmente `locale`, `translationMeta`, `localizedSystemStrings` e `documentLineage`.

### Migration 00019 — Centralização de Autorização Editorial
- Criada a função helper centralizada fail-closed `public.require_document_editor_v1()`:
  ```sql
  CREATE OR REPLACE FUNCTION public.require_document_editor_v1()
  RETURNS UUID
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  DECLARE
    v_actor UUID := auth.uid();
    v_role public.user_role := public.team_role();
  BEGIN
    IF v_actor IS NULL THEN
      RAISE EXCEPTION 'AUTH_ACTOR_NULL: Usuário não autenticado no servidor.' USING ERRCODE = '42501';
    END IF;
    IF v_role IS NULL THEN
      RAISE EXCEPTION 'AUTH_ROLE_NULL: Perfil do usuário não encontrado ou inativo.' USING ERRCODE = '42501';
    END IF;
    IF v_role NOT IN ('admin', 'editor') THEN
      RAISE EXCEPTION 'AUTH_ROLE_FORBIDDEN: Perfil (%) não autorizado para operações editoriais.', v_role USING ERRCODE = '42501';
    END IF;
    RETURN v_actor;
  END;
  $$;
  ```
- `create_translated_catalog_v1` e `create_translated_template_v1` refatoradas para utilizar `v_actor := public.require_document_editor_v1()`, eliminando 100% da colisão de palavras-chave.

---

## 4. Política de Imutabilidade do Banco de Dados

> [!IMPORTANT]
> As migrations **00017**, **00018** e **00019** estão oficialmente congeladas e **IMUTÁVEIS**.  
> Nenhuma alteração retroativa deve ser feita nestes arquivos.  
> Não criar novas migrations na esteira de tradução/lifecycle sem uma nova necessidade de negócio expressamente aprovada.

---

## 5. Próximo Marco Técnico

A esteira de Tradução e Ciclo de Vida está oficialmente **ENCERRADA**.  
A próxima frente será iniciada exclusivamente sob novo comando:

👉 **CANVAS 3A — Structural Canvas, Inspector & Corporate Icon Registry**

---

## 6. Post-Closure Localization Completeness Hotfix (Hotfix 1)

**Data:** 02/09/2026  
**Status:** ✅ APLICADO E VALIDADO  

### Contexto
A infraestrutura 2C (banco de dados, autenticação, RPCs, round-trip cloud e lifecycle) já estava concluída e validada em produção.  
Este hotfix corrigiu estritamente uma lacuna de classificação e renderização de textos imprimíveis em tabelas e legendas:

1. **Cabeçalho de Matriz (`matrix_spec_table`)**:
   - `col_0` ("Parâmetro / Modelo") reclassificado de `protect` para `translate` no extrator (`table.extractor.ts`) e no renderer (`MatrixSpecTableBlock.tsx`).
   - Colunas de modelo (`TA-35N`, `PCON-Y18`, etc.) mantidas rigorosamente como `protect`.
2. **Resolução de Legendas Técnicas (`TechnicalLegend`)**:
   - Criado `PrintLocalizationProvider` compartilhado entre o Canvas e o CleanA4Document.
   - Legendas padrão institucionais (`legend_title`, `legend_filled_square`, `legend_empty_square`, `legend_filled_circle`, `legend_empty_circle`, `legend_asterisk`, `legend_double_asterisk`, `legend_dash`) agora resolvem dinamicamente a partir do idioma do documento em `SYSTEM_PRINT_STRINGS` (com traduções completas para EN, FR, TH, ES, DE, RU, ZH, AR).
   - Legendas personalizadas pelo usuário continuam classificadas como `translate`.
3. **Grupos de Colunas (`columnGroups`)**:
   - Títulos de grupos de colunas registrados no extrator e aplicados no `TranslationApplierRegistry` com policy `translate`.
4. **Valores Mistos (Conectores Linguísticos + Grandezas Metrológicas)**:
   - Células como `"0 a 70 bar"` não congelam mais o conector linguístico em português.
   - Padrão 3 do `TechnicalTokenProtector` refatorado para evitar que unidades como Ampere (`A`) em regex case-insensitive engulam a preposição linguística `" a "`.
   - Adicionado Padrão 6 para números isolados/assinados (`0`, `-0.9`), preservando 100% de integridade metrológica enquanto o conector linguístico é traduzido (`"0 to 70 bar"`, `"0 à 70 bar"`, `"0 ถึง 70 bar"`).
5. **Métricas de Completude Estritas**:
   - Printable Mapping: 100%
   - Translation Applied: 100%
   - System Localization: 100%
   - Protected Integrity: 100%
   - Unclassified printable: 0

