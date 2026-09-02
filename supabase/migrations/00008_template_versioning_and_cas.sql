-- Migration 00008: Template Versioning, Updated Timestamp and CAS RPC
-- Objetivo: Suportar edição e versionamento seguro de templates corporativos compartilhados

ALTER TABLE public.templates
ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.templates
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.templates
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);

-- RPC: save_template_v1 com CAS (Compare-And-Swap) estrito
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
SET search_path = public
AS $$
DECLARE
  v_current_version INTEGER;
  v_next_version INTEGER;
  v_result RECORD;
  v_design_tokens JSONB;
BEGIN
  -- 1. Verifica se o template existe
  SELECT version, design_tokens INTO v_current_version, v_design_tokens
  FROM public.templates
  WHERE id = p_template_id;

  IF NOT FOUND THEN
    -- Inserção de novo template
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
      auth.uid()
    )
    RETURNING * INTO v_result;

    RETURN jsonb_build_object(
      'success', true,
      'data', row_to_json(v_result)
    );
  END IF;

  -- 2. CAS: Valida expected version contra a versão atual
  IF p_expected_version > 0 AND v_current_version <> p_expected_version THEN
    RETURN jsonb_build_object(
      'success', false,
      'conflict', true,
      'errorCode', '40001',
      'error', 'Conflito de concorrência: o template foi modificado em outro dispositivo.',
      'serverVersion', v_current_version,
      'expectedVersion', p_expected_version
    );
  END IF;

  -- 3. Atualização atômica e incremento de versão
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
    updated_by = auth.uid()
  WHERE id = p_template_id
  RETURNING * INTO v_result;

  RETURN jsonb_build_object(
    'success', true,
    'data', row_to_json(v_result)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_template_v1 TO authenticated, anon;
