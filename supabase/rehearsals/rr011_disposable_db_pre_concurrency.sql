\set ON_ERROR_STOP on

DO $$
DECLARE
    v_version BIGINT;
    v_nullable TEXT;
    v_default TEXT;
    v_validated BOOLEAN;
BEGIN
    SELECT version INTO v_version
    FROM public.product_source_documents
    WHERE id = 'legacy-backfill';

    IF v_version IS DISTINCT FROM 1 THEN
        RAISE EXCEPTION 'BACKFILL failed: expected 1, got %', v_version;
    END IF;

    SELECT is_nullable, column_default
    INTO v_nullable, v_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'product_source_documents'
      AND column_name = 'version';

    IF v_nullable IS DISTINCT FROM 'NO' OR v_default IS NULL OR v_default NOT LIKE '1%' THEN
        RAISE EXCEPTION 'BACKFILL contract failed: nullable %, default %', v_nullable, v_default;
    END IF;

    SELECT convalidated INTO v_validated
    FROM pg_constraint
    WHERE conname = 'product_source_documents_version_safe'
      AND conrelid = 'public.product_source_documents'::regclass;

    IF v_validated IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'BACKFILL contract failed: safe-range check absent or unvalidated';
    END IF;

    BEGIN
        UPDATE public.product_source_documents SET version = 0 WHERE id = 'legacy-backfill';
        RAISE EXCEPTION 'safe-range CHECK accepted version 0';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    BEGIN
        UPDATE public.product_source_documents SET version = NULL WHERE id = 'legacy-backfill';
        RAISE EXCEPTION 'NOT NULL accepted null version';
    EXCEPTION WHEN not_null_violation THEN
        NULL;
    END;

    RAISE NOTICE '[RR011][BACKFILL][PASS] version=1, NOT NULL, validated safe-range CHECK';
END;
$$;

SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

DO $$
DECLARE
    v_result JSONB;
    v_persisted public.product_source_documents;
BEGIN
    v_result := public.upsert_source_document_v2(
        '{"id":"cas-doc","title":"Created by editor","documentType":"manual","revision":"R1","language":"pt-BR","metadata":{"source":"rr011"}}'::jsonb,
        0
    );

    SELECT * INTO v_persisted FROM public.product_source_documents WHERE id = 'cas-doc';

    IF (v_result->>'version')::bigint IS DISTINCT FROM 1
       OR v_result->>'sourceDocumentId' IS DISTINCT FROM 'cas-doc'
       OR v_result->'document'->>'id' IS DISTINCT FROM v_persisted.id
       OR v_result->'document'->>'title' IS DISTINCT FROM v_persisted.title
       OR v_persisted.version IS DISTINCT FROM 1 THEN
        RAISE EXCEPTION 'CREATE / result protocol mismatch: result %, row %', v_result, to_jsonb(v_persisted);
    END IF;

    RAISE NOTICE '[RR011][CREATE-0-TO-1][PASS] result and persisted row agree';
    RAISE NOTICE '[RR011][AUTHORIZED][PASS] active editor allowed by require_document_editor_v1';
END;
$$;

DO $$
DECLARE
    v_state TEXT;
    v_message TEXT;
    v_detail TEXT;
BEGIN
    BEGIN
        PERFORM public.upsert_source_document_v2(
            '{"id":"cas-doc","title":"Duplicate create","documentType":"manual"}'::jsonb,
            0
        );
        RAISE EXCEPTION 'DUPLICATE CREATE unexpectedly succeeded';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS
            v_state = RETURNED_SQLSTATE,
            v_message = MESSAGE_TEXT,
            v_detail = PG_EXCEPTION_DETAIL;
        IF v_state IS DISTINCT FROM '40001'
           OR v_message IS DISTINCT FROM 'SOURCE_DOCUMENT_CONFLICT'
           OR (v_detail::jsonb->>'actualVersion')::bigint IS DISTINCT FROM 1 THEN
            RAISE EXCEPTION 'DUPLICATE CREATE wrong error: state %, message %, detail %', v_state, v_message, v_detail;
        END IF;
    END;

    RAISE NOTICE '[RR011][DUPLICATE-CREATE][PASS] SQLSTATE 40001, SOURCE_DOCUMENT_CONFLICT, actualVersion=1';
END;
$$;

DO $$
DECLARE
    v_result JSONB;
    v_title TEXT;
    v_version BIGINT;
BEGIN
    v_result := public.upsert_source_document_v2(
        '{"id":"cas-doc","title":"Updated to version 2","documentType":"datasheet","revision":"R2","externalUrl":"https://example.com:65535/spec"}'::jsonb,
        1
    );

    SELECT title, version INTO v_title, v_version
    FROM public.product_source_documents WHERE id = 'cas-doc';

    IF (v_result->>'version')::bigint IS DISTINCT FROM 2
       OR v_result->'document'->>'title' IS DISTINCT FROM v_title
       OR v_version IS DISTINCT FROM 2 THEN
        RAISE EXCEPTION 'UPDATE / result protocol mismatch: result %, title %, version %', v_result, v_title, v_version;
    END IF;

    RAISE NOTICE '[RR011][UPDATE-1-TO-2][PASS] result version=2 and payload persisted';
    RAISE NOTICE '[RR011][RESULT-PROTOCOL][PASS] create and update responses match persisted rows';
END;
$$;

RESET request.jwt.claims;
RESET ROLE;
