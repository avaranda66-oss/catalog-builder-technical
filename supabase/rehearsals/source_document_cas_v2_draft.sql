-- SOURCE DOCUMENT CAS V2 — REHEARSAL / DRAFT ONLY
-- Production migration number: DEFERRED.
-- This file is intentionally outside supabase/migrations until the ledger allocates a number.
-- Do not apply to a live database from this branch.

-- Persistence concurrency is separate from SourceDocument.revision, which remains editorial TEXT.
ALTER TABLE public.product_source_documents
    ADD COLUMN IF NOT EXISTS version BIGINT;

UPDATE public.product_source_documents
SET version = 1
WHERE version IS NULL;

ALTER TABLE public.product_source_documents
    ALTER COLUMN version SET DEFAULT 1,
    ALTER COLUMN version SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'product_source_documents_version_safe'
          AND conrelid = 'public.product_source_documents'::regclass
    ) THEN
        ALTER TABLE public.product_source_documents
            ADD CONSTRAINT product_source_documents_version_safe
            CHECK (version >= 1 AND version <= 9007199254740991)
            NOT VALID;
    END IF;
END $$;

ALTER TABLE public.product_source_documents
    VALIDATE CONSTRAINT product_source_documents_version_safe;

-- Keep direct DML unavailable to application roles.
REVOKE INSERT, UPDATE, DELETE ON public.product_source_documents FROM PUBLIC, anon, authenticated;

-- Pure server-side payload validation shared by the CAS writer.
CREATE OR REPLACE FUNCTION public.validate_source_document_payload_v2(
    p_document JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_doc_key TEXT;
    v_meta_key TEXT;
    v_meta_val JSONB;
    v_url_port BIGINT;
BEGIN
    IF p_document IS NULL OR jsonb_typeof(p_document) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'INVALID_SOURCE_DOCUMENT_PAYLOAD: p_document deve ser um objeto JSON.'
            USING ERRCODE = '22023';
    END IF;

    -- Persistence version is server-managed and can never be supplied by clients.
    IF p_document ? 'version' THEN
        RAISE EXCEPTION 'CLIENT_CONTROLLED_SOURCE_DOCUMENT_VERSION: version é server-managed.'
            USING ERRCODE = '22023';
    END IF;

    FOR v_doc_key IN SELECT jsonb_object_keys(p_document) LOOP
        IF v_doc_key NOT IN (
            'id', 'title', 'documentType', 'revision', 'language',
            'publicationDate', 'fileReference', 'externalUrl', 'checksum', 'metadata'
        ) THEN
            RAISE EXCEPTION 'INVALID_SOURCE_DOCUMENT_UNKNOWN_KEY: Chave desconhecida "%" não é permitida em SourceDocument.', v_doc_key
                USING ERRCODE = '22023';
        END IF;
    END LOOP;

    IF NOT (p_document ? 'id')
       OR jsonb_typeof(p_document->'id') IS DISTINCT FROM 'string'
       OR trim(p_document->>'id') = '' THEN
        RAISE EXCEPTION 'INVALID_SOURCE_DOCUMENT_ID: id é obrigatório e deve ser string não vazia.'
            USING ERRCODE = '22023';
    END IF;

    IF NOT (p_document ? 'title')
       OR jsonb_typeof(p_document->'title') IS DISTINCT FROM 'string'
       OR trim(p_document->>'title') = '' THEN
        RAISE EXCEPTION 'INVALID_SOURCE_DOCUMENT_TITLE: title é obrigatório e deve ser string não vazia.'
            USING ERRCODE = '22023';
    END IF;

    IF NOT (p_document ? 'documentType')
       OR jsonb_typeof(p_document->'documentType') IS DISTINCT FROM 'string'
       OR (p_document->>'documentType') NOT IN (
            'manual', 'datasheet', 'certificate', 'drawing',
            'standard', 'engineering_note', 'website', 'other'
       ) THEN
        RAISE EXCEPTION 'INVALID_SOURCE_DOCUMENT_TYPE: documentType inválido.'
            USING ERRCODE = '22023';
    END IF;

    -- Editorial revision remains a string. It is unrelated to persistence CAS version.
    IF (p_document ? 'revision')
       AND jsonb_typeof(p_document->'revision') IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION 'INVALID_SOURCE_DOCUMENT_REVISION: revision deve ser string editorial e não pode ser nulo.'
            USING ERRCODE = '22023';
    END IF;

    IF (p_document ? 'language') THEN
        IF jsonb_typeof(p_document->'language') IS DISTINCT FROM 'string'
           OR (p_document->>'language') IS DISTINCT FROM trim(p_document->>'language')
           OR length(p_document->>'language') < 2
           OR length(p_document->>'language') > 35
           OR NOT ((p_document->>'language') ~* '^[a-z]{2,3}(-[a-z]{4})?(-([a-z]{2}|[0-9]{3}))?$') THEN
            RAISE EXCEPTION 'INVALID_SOURCE_DOCUMENT_LANGUAGE: language inválida.'
                USING ERRCODE = '22023';
        END IF;
    END IF;

    IF (p_document ? 'publicationDate') THEN
        IF jsonb_typeof(p_document->'publicationDate') IS DISTINCT FROM 'string'
           OR (p_document->>'publicationDate') IS DISTINCT FROM trim(p_document->>'publicationDate')
           OR NOT ((p_document->>'publicationDate') ~ '^(000[1-9]|00[1-9]\d|0[1-9]\d{2}|[1-9]\d{3})-\d{2}-\d{2}(T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,3})?(Z|[+-](0\d|1[0-5]):?[0-5]\d)?)?$') THEN
            RAISE EXCEPTION 'INVALID_SOURCE_DOCUMENT_DATE: publicationDate inválida.'
                USING ERRCODE = '22023';
        END IF;

        IF (p_document->>'publicationDate') ~ '^0000'
           OR (p_document->>'publicationDate') ~* 'T24:'
           OR (p_document->>'publicationDate') ~ '[+-](1[6-9]|2[0-9]):?[0-9]{2}$' THEN
            RAISE EXCEPTION 'INVALID_SOURCE_DOCUMENT_DATE: publicationDate fora do contrato temporal.'
                USING ERRCODE = '22023';
        END IF;

        BEGIN
            PERFORM (p_document->>'publicationDate')::timestamptz;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'INVALID_SOURCE_DOCUMENT_DATE: publicationDate não é parseável.'
                USING ERRCODE = '22023';
        END;
    END IF;

    IF (p_document ? 'fileReference')
       AND jsonb_typeof(p_document->'fileReference') IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION 'INVALID_SOURCE_DOCUMENT_FILE: fileReference deve ser string e não pode ser nulo.'
            USING ERRCODE = '22023';
    END IF;

    IF (p_document ? 'externalUrl') THEN
        IF jsonb_typeof(p_document->'externalUrl') IS DISTINCT FROM 'string'
           OR (p_document->>'externalUrl') IS DISTINCT FROM trim(p_document->>'externalUrl')
           OR NOT ((p_document->>'externalUrl') ~* '^https?://(([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}|localhost|((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9]))(:(6553[0-5]|655[0-2]\d|65[0-4]\d{2}|6[0-4]\d{3}|[1-5]\d{4}|[1-9]\d{0,3}|0))?(/[^\s]*)?$') THEN
            RAISE EXCEPTION 'INVALID_SOURCE_DOCUMENT_URL: externalUrl inválida.'
                USING ERRCODE = '22023';
        END IF;

        IF (p_document->>'externalUrl') ~ ':(\d+)(/|$|\?|#)' THEN
            v_url_port := (regexp_match(p_document->>'externalUrl', ':(\d+)(/|$|\?|#)'))[1]::bigint;
            IF v_url_port < 0 OR v_url_port > 65535 THEN
                RAISE EXCEPTION 'INVALID_SOURCE_DOCUMENT_URL: porta fora do intervalo permitido.'
                    USING ERRCODE = '22023';
            END IF;
        END IF;
    END IF;

    IF (p_document ? 'checksum')
       AND jsonb_typeof(p_document->'checksum') IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION 'INVALID_SOURCE_DOCUMENT_CHECKSUM: checksum deve ser string e não pode ser nulo.'
            USING ERRCODE = '22023';
    END IF;

    IF (p_document ? 'metadata') THEN
        IF jsonb_typeof(p_document->'metadata') IS DISTINCT FROM 'object' THEN
            RAISE EXCEPTION 'INVALID_SOURCE_DOCUMENT_METADATA: metadata deve ser objeto e não pode ser nulo.'
                USING ERRCODE = '22023';
        END IF;

        FOR v_meta_key, v_meta_val IN SELECT * FROM jsonb_each(p_document->'metadata') LOOP
            IF jsonb_typeof(v_meta_val) IS DISTINCT FROM 'string' THEN
                RAISE EXCEPTION 'INVALID_SOURCE_DOCUMENT_METADATA_VALUE: metadata "%" deve conter string.', v_meta_key
                    USING ERRCODE = '22023';
            END IF;
        END LOOP;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_source_document_v2(
    p_document JSONB,
    p_expected_version BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_actor UUID := public.require_document_editor_v1();
    v_id TEXT;
    v_saved public.product_source_documents;
    v_actual_version BIGINT;
    v_expected_result_version BIGINT;
BEGIN
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'SOURCE_DOCUMENT_WRITE_DENIED'
            USING ERRCODE = '42501';
    END IF;

    IF p_expected_version IS NULL
       OR p_expected_version < 0
       OR p_expected_version > 9007199254740991 THEN
        RAISE EXCEPTION 'INVALID_SOURCE_DOCUMENT_EXPECTED_VERSION: expectedVersion deve estar entre 0 e 9007199254740991.'
            USING ERRCODE = '22023';
    END IF;

    IF p_expected_version = 9007199254740991 THEN
        RAISE EXCEPTION 'SOURCE_DOCUMENT_VERSION_EXHAUSTED: a versão máxima segura não pode ser incrementada.'
            USING ERRCODE = '22023';
    END IF;

    PERFORM public.validate_source_document_payload_v2(p_document);
    v_id := p_document->>'id';
    v_expected_result_version := p_expected_version + 1;

    IF p_expected_version = 0 THEN
        INSERT INTO public.product_source_documents (
            id,
            title,
            document_type,
            revision,
            language,
            publication_date,
            file_reference,
            external_url,
            checksum,
            metadata,
            version,
            created_by,
            updated_by,
            created_at,
            updated_at
        ) VALUES (
            v_id,
            p_document->>'title',
            p_document->>'documentType',
            p_document->>'revision',
            p_document->>'language',
            p_document->>'publicationDate',
            p_document->>'fileReference',
            p_document->>'externalUrl',
            p_document->>'checksum',
            COALESCE(p_document->'metadata', '{}'::jsonb),
            1,
            v_actor,
            v_actor,
            now(),
            now()
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING * INTO v_saved;

        IF v_saved.id IS NULL THEN
            SELECT version
            INTO v_actual_version
            FROM public.product_source_documents
            WHERE id = v_id;

            RAISE EXCEPTION 'SOURCE_DOCUMENT_CONFLICT'
                USING ERRCODE = '40001',
                      DETAIL = jsonb_build_object(
                          'sourceDocumentId', v_id,
                          'expectedVersion', p_expected_version,
                          'actualVersion', v_actual_version
                      )::text;
        END IF;
    ELSE
        UPDATE public.product_source_documents
        SET title = p_document->>'title',
            document_type = p_document->>'documentType',
            revision = p_document->>'revision',
            language = p_document->>'language',
            publication_date = p_document->>'publicationDate',
            file_reference = p_document->>'fileReference',
            external_url = p_document->>'externalUrl',
            checksum = p_document->>'checksum',
            metadata = COALESCE(p_document->'metadata', '{}'::jsonb),
            version = version + 1,
            updated_by = v_actor,
            updated_at = now()
        WHERE id = v_id
          AND version = p_expected_version
          AND version < 9007199254740991
        RETURNING * INTO v_saved;

        IF v_saved.id IS NULL THEN
            SELECT version
            INTO v_actual_version
            FROM public.product_source_documents
            WHERE id = v_id;

            RAISE EXCEPTION 'SOURCE_DOCUMENT_CONFLICT'
                USING ERRCODE = '40001',
                      DETAIL = jsonb_build_object(
                          'sourceDocumentId', v_id,
                          'expectedVersion', p_expected_version,
                          'actualVersion', v_actual_version
                      )::text;
        END IF;
    END IF;

    -- Server-side protocol assertion: create 0->1 and update N->N+1.
    IF v_saved.version IS DISTINCT FROM v_expected_result_version THEN
        RAISE EXCEPTION 'SOURCE_DOCUMENT_PROTOCOL_VIOLATION: versão resultante inesperada.'
            USING ERRCODE = 'XX000',
                  DETAIL = jsonb_build_object(
                      'sourceDocumentId', v_id,
                      'expectedVersion', p_expected_version,
                      'actualVersion', v_saved.version
                  )::text;
    END IF;

    RETURN jsonb_build_object(
        'sourceDocumentId', v_saved.id,
        'version', v_saved.version,
        'document', jsonb_strip_nulls(jsonb_build_object(
            'id', v_saved.id,
            'title', v_saved.title,
            'documentType', v_saved.document_type,
            'revision', v_saved.revision,
            'language', v_saved.language,
            'publicationDate', v_saved.publication_date,
            'fileReference', v_saved.file_reference,
            'externalUrl', v_saved.external_url,
            'checksum', v_saved.checksum,
            'metadata', COALESCE(v_saved.metadata, '{}'::jsonb)
        ))
    );
END;
$$;

-- Legacy last-write-wins writer cannot be executed by application roles after promotion.
REVOKE EXECUTE ON FUNCTION public.upsert_source_document_v1(JSONB) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.validate_source_document_payload_v2(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_source_document_v2(JSONB, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_source_document_v2(JSONB, BIGINT) TO authenticated;

-- Realtime is an observation channel, not a write acknowledgement channel.
-- REPLICA IDENTITY FULL exposes id + resulting version in WAL payloads.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'product_source_documents'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.product_source_documents;
    END IF;
END $$;

ALTER TABLE public.product_source_documents REPLICA IDENTITY FULL;
