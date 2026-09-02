-- Migration 00008: Template Versioning, Updated Timestamp and CAS RPC (Hardened)
-- Objetivo: Suportar edição e versionamento seguro de templates corporativos compartilhados com CAS atômico e FOR UPDATE

ALTER TABLE public.templates
ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.templates
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.templates
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);

-- RPC: save_template_v1 com CAS (Compare-And-Swap) estrito, Row Lock e Validação de Role
CREATE OR REPLACE FUNCTION public.save_template_v1(
  p_template_id UUID,
  p_expected_version INTEGER,
  p_layout_config JSONB,
  p_name TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_role public.user_role := public.team_role();
  v_current_version INTEGER;
  v_next_version INTEGER;
  v_result RECORD;
  v_design_tokens JSONB;
BEGIN
  -- 1. Verificação Estrita de Autenticação e Permissão (somente admin / editor autenticado)
  IF v_actor IS NULL OR v_role IS NULL OR v_role NOT IN ('admin', 'editor') THEN
    RAISE EXCEPTION 'Sem permissão de acesso para salvar templates corporativos.' USING ERRCODE = '42501';
  END IF;

  IF p_template_id IS NULL THEN
    RAISE EXCEPTION 'ID do template não informado.' USING ERRCODE = '22023';
  END IF;

  -- 2. Seleção com Row Lock Atômico (FOR UPDATE)
  SELECT version, design_tokens
  INTO v_current_version, v_design_tokens
  FROM public.templates
  WHERE id = p_template_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Inserção de novo template se expected_version for 0 ou 1
    IF p_expected_version IS NOT NULL AND p_expected_version > 1 THEN
      RETURN jsonb_build_object(
        'success', false,
        'conflict', true,
        'errorCode', '40001',
        'error', format('Conflito de Criação: versão esperada %s informada para template inexistente.', p_expected_version),
        'serverVersion', 0,
        'expectedVersion', p_expected_version
      );
    END IF;

    v_next_version := 1;
    v_design_tokens := jsonb_build_object(
      'category', 'layout_template',
      'description', coalesce(p_description, ''),
      'isSystem', false
    );

    INSERT INTO public.templates (
      id,
      name,
      template_key,
      design_tokens,
      layout_config,
      is_system,
      version,
      created_at,
      updated_at,
      updated_by
    ) VALUES (
      p_template_id,
      coalesce(p_name, 'Template Sem Nome'),
      'custom-' || p_template_id::text,
      v_design_tokens,
      p_layout_config,
      false,
      v_next_version,
      now(),
      now(),
      v_actor
    )
    RETURNING * INTO v_result;

    RETURN jsonb_build_object(
      'success', true,
      'data', row_to_json(v_result)
    );
  END IF;

  -- 3. CAS Atômico: Valida expected version sob row lock
  IF p_expected_version IS NULL OR p_expected_version <= 0 OR v_current_version <> p_expected_version THEN
    RETURN jsonb_build_object(
      'success', false,
      'conflict', true,
      'errorCode', '40001',
      'error', format('Conflito de Concorrência: o template foi modificado em outro dispositivo (Versão esperada: %s, Versão no servidor: %s).', p_expected_version, v_current_version),
      'serverVersion', v_current_version,
      'expectedVersion', p_expected_version
    );
  END IF;

  -- 4. Atualização atômica e incremento de versão sob row lock
  v_next_version := v_current_version + 1;

  IF p_description IS NOT NULL THEN
    v_design_tokens := jsonb_set(coalesce(v_design_tokens, '{}'::jsonb), '{description}', to_jsonb(p_description));
  END IF;

  UPDATE public.templates
  SET
    layout_config = p_layout_config,
    name = coalesce(p_name, name),
    design_tokens = v_design_tokens,
    version = v_next_version,
    updated_at = now(),
    updated_by = v_actor
  WHERE id = p_template_id
  RETURNING * INTO v_result;

  RETURN jsonb_build_object(
    'success', true,
    'data', row_to_json(v_result)
  );
END;
$$;

-- Permissões Estritas: REVOGAR DE PUBLIC E ANON, CONCEDER APENAS PARA AUTHENTICATED
REVOKE ALL ON FUNCTION public.save_template_v1(UUID, INTEGER, JSONB, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_template_v1(UUID, INTEGER, JSONB, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_template_v1(UUID, INTEGER, JSONB, TEXT, TEXT) TO authenticated;
