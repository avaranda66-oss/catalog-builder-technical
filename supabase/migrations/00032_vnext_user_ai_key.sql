-- "Minha chave de IA" (docs/ai-catalog/MINHA_CHAVE_IA.md): UMA chave Gemini por usuário.
-- Apenas arquivo de migração (sem db push nesta fatia). Aditiva: não altera tabelas nem RPCs existentes.
--
-- Regras:
--   * A chave fica criptografada no Supabase Vault. A tabela guarda só o id do segredo, o provedor,
--     os 4 últimos caracteres e o último resultado do teste.
--   * Cada usuário só vê/gerencia a SUA linha (RLS). Ninguém, nem admin, lê a chave de outro.
--   * Salvar/trocar/remover: RPCs SECURITY DEFINER sempre sobre auth.uid() (nunca recebem user_id).
--   * Ler o segredo em texto: só service_role (funções Edge), nunca authenticated/anon.
BEGIN;

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

CREATE TABLE public.vnext_user_ai_keys (
  user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'gemini' CHECK (provider = 'gemini'),
  secret_id UUID NOT NULL,
  key_last4 TEXT NOT NULL CHECK (key_last4 ~ '^[A-Za-z0-9_-]{4}$'),
  check_status TEXT NOT NULL DEFAULT 'untested' CHECK (check_status IN ('untested', 'ok', 'error')),
  checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.vnext_user_ai_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vnext_user_ai_keys FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.vnext_user_ai_keys FROM PUBLIC, anon, authenticated;
-- Leitura direta só da própria linha e sem secret_id (as telas usam a RPC de status).
GRANT SELECT (user_id, provider, key_last4, check_status, checked_at, updated_at)
  ON public.vnext_user_ai_keys TO authenticated;
CREATE POLICY vnext_user_ai_keys_own_select ON public.vnext_user_ai_keys
  FOR SELECT TO authenticated USING (user_id = auth.uid());
-- Sem políticas de INSERT/UPDATE/DELETE: escrita só pelas RPCs abaixo.

-- 1. Status (o que a tela mostra) -----------------------------------------------------------------------------------
CREATE FUNCTION public.vnext_ai_key_status_v1()
RETURNS TABLE (provider TEXT, key_last4 TEXT, check_status TEXT, checked_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT k.provider, k.key_last4, k.check_status, k.checked_at, k.updated_at
  FROM public.vnext_user_ai_keys k
  WHERE k.user_id = auth.uid();
$$;

-- 2. Salvar ou trocar a própria chave -------------------------------------------------------------------------------
CREATE FUNCTION public.vnext_ai_key_save_v1(p_provider TEXT, p_api_key TEXT)
RETURNS TABLE (provider TEXT, key_last4 TEXT, check_status TEXT)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_secret_id UUID;
  v_last4 TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'VNEXT_UNAUTHENTICATED' USING ERRCODE = '28000'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.is_active AND p.role IN ('admin', 'editor')) THEN
    RAISE EXCEPTION 'VNEXT_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF p_provider IS DISTINCT FROM 'gemini' THEN RAISE EXCEPTION 'VNEXT_INVALID_REQUEST: provider' USING ERRCODE = '22023'; END IF;
  IF p_api_key IS NULL OR length(p_api_key) < 20 OR length(p_api_key) > 256 OR p_api_key !~ '^[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION 'VNEXT_INVALID_REQUEST: key format' USING ERRCODE = '22023';
  END IF;
  v_last4 := right(p_api_key, 4);

  SELECT k.secret_id INTO v_secret_id FROM public.vnext_user_ai_keys k WHERE k.user_id = v_uid FOR UPDATE;
  IF v_secret_id IS NULL THEN
    v_secret_id := vault.create_secret(p_api_key, 'vnext_ai_key_' || v_uid::text, 'Minha chave de IA (Gemini)');
    INSERT INTO public.vnext_user_ai_keys (user_id, provider, secret_id, key_last4)
    VALUES (v_uid, 'gemini', v_secret_id, v_last4);
  ELSE
    PERFORM vault.update_secret(v_secret_id, p_api_key);
    UPDATE public.vnext_user_ai_keys
    SET key_last4 = v_last4, check_status = 'untested', checked_at = NULL, updated_at = now()
    WHERE user_id = v_uid;
  END IF;
  RETURN QUERY SELECT 'gemini'::TEXT, v_last4, 'untested'::TEXT;
END;
$$;

-- 3. Apagar a linha apaga o segredo do Vault ----------------------------------------------------------------------
-- Vale para "Remover" e também para o CASCADE quando a conta é apagada em auth.users (sem segredo órfão).
CREATE FUNCTION public.vnext_user_ai_keys_drop_secret()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM vault.secrets s WHERE s.id = OLD.secret_id;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.vnext_user_ai_keys_drop_secret() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER vnext_user_ai_keys_drop_secret
  AFTER DELETE ON public.vnext_user_ai_keys
  FOR EACH ROW EXECUTE FUNCTION public.vnext_user_ai_keys_drop_secret();

-- 4. Remover a própria chave (o gatilho acima apaga o segredo do Vault) --------------------------------------------
CREATE FUNCTION public.vnext_ai_key_remove_v1()
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_secret_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'VNEXT_UNAUTHENTICATED' USING ERRCODE = '28000'; END IF;
  DELETE FROM public.vnext_user_ai_keys k WHERE k.user_id = v_uid RETURNING k.secret_id INTO v_secret_id;
  RETURN v_secret_id IS NOT NULL;
END;
$$;

-- 5. Somente funções Edge (service_role): ler a chave e anotar o resultado do teste ---------------------------------
CREATE FUNCTION public.vnext_ai_key_secret_for_v1(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT d.decrypted_secret
  FROM public.vnext_user_ai_keys k
  JOIN vault.decrypted_secrets d ON d.id = k.secret_id
  WHERE k.user_id = p_user_id AND k.provider = 'gemini';
$$;

CREATE FUNCTION public.vnext_ai_key_mark_checked_v1(p_user_id UUID, p_status TEXT)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_status NOT IN ('ok', 'error') THEN RAISE EXCEPTION 'VNEXT_INVALID_REQUEST: status' USING ERRCODE = '22023'; END IF;
  UPDATE public.vnext_user_ai_keys SET check_status = p_status, checked_at = now() WHERE user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.vnext_ai_key_status_v1() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.vnext_ai_key_save_v1(TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.vnext_ai_key_remove_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vnext_ai_key_status_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.vnext_ai_key_save_v1(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vnext_ai_key_remove_v1() TO authenticated;

REVOKE ALL ON FUNCTION public.vnext_ai_key_secret_for_v1(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vnext_ai_key_mark_checked_v1(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vnext_ai_key_secret_for_v1(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.vnext_ai_key_mark_checked_v1(UUID, TEXT) TO service_role;

COMMIT;
