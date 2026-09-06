\set ON_ERROR_STOP on

DO $$
DECLARE
    v_title TEXT;
    v_version BIGINT;
BEGIN
    SELECT title, version INTO v_title, v_version
    FROM public.product_source_documents WHERE id = 'cas-doc';

    IF v_title IS DISTINCT FROM 'Writer A wins' OR v_version IS DISTINCT FROM 3 THEN
        RAISE EXCEPTION 'TWO WRITERS persistence mismatch: title %, version %', v_title, v_version;
    END IF;

    RAISE NOTICE '[RR011][TWO-WRITERS][PASS] Writer A persisted version 3; Writer B did not overwrite';
END;
$$;

SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

DO $$
DECLARE
    v_state TEXT;
    v_message TEXT;
    v_detail TEXT;
BEGIN
    BEGIN
        PERFORM public.upsert_source_document_v2(
            '{"id":"missing-doc","title":"Missing update","documentType":"manual"}'::jsonb,
            1
        );
        RAISE EXCEPTION 'MISSING UPDATE unexpectedly succeeded';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS
            v_state = RETURNED_SQLSTATE,
            v_message = MESSAGE_TEXT,
            v_detail = PG_EXCEPTION_DETAIL;
        IF v_state IS DISTINCT FROM '40001'
           OR v_message IS DISTINCT FROM 'SOURCE_DOCUMENT_CONFLICT'
           OR NOT (v_detail::jsonb ? 'actualVersion')
           OR v_detail::jsonb->>'actualVersion' IS NOT NULL THEN
            RAISE EXCEPTION 'MISSING UPDATE wrong error: state %, message %, detail %', v_state, v_message, v_detail;
        END IF;
    END;

    RAISE NOTICE '[RR011][MISSING-UPDATE][PASS] SQLSTATE 40001 and actualVersion=null';
END;
$$;

DO $$
DECLARE
    v_state TEXT;
BEGIN
    BEGIN
        PERFORM public.upsert_source_document_v2(
            '{"id":"invalid-null","title":"Invalid null","documentType":"manual"}'::jsonb,
            NULL
        );
        RAISE EXCEPTION 'NULL expectedVersion unexpectedly succeeded';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
        IF v_state IS DISTINCT FROM '22023' THEN
            RAISE EXCEPTION 'NULL expectedVersion wrong SQLSTATE %', v_state;
        END IF;
    END;

    BEGIN
        PERFORM public.upsert_source_document_v2(
            '{"id":"invalid-negative","title":"Invalid negative","documentType":"manual"}'::jsonb,
            -1
        );
        RAISE EXCEPTION 'negative expectedVersion unexpectedly succeeded';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
        IF v_state IS DISTINCT FROM '22023' THEN
            RAISE EXCEPTION 'negative expectedVersion wrong SQLSTATE %', v_state;
        END IF;
    END;

    BEGIN
        PERFORM public.upsert_source_document_v2(
            '{"id":"invalid-max","title":"Invalid max","documentType":"manual"}'::jsonb,
            9007199254740991
        );
        RAISE EXCEPTION 'max non-incrementable expectedVersion unexpectedly succeeded';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
        IF v_state IS DISTINCT FROM '22023' THEN
            RAISE EXCEPTION 'max expectedVersion wrong SQLSTATE %', v_state;
        END IF;
    END;

    RAISE NOTICE '[RR011][INVALID-EXPECTED][PASS] null, negative, and max rejected with 22023';
END;
$$;

DO $$
DECLARE
    v_state TEXT;
BEGIN
    BEGIN
        PERFORM public.upsert_source_document_v2(
            '{"id":"client-version","title":"Client version","documentType":"manual","version":7}'::jsonb,
            0
        );
        RAISE EXCEPTION 'client-controlled version unexpectedly succeeded';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
        IF v_state IS DISTINCT FROM '22023' THEN
            RAISE EXCEPTION 'client-controlled version wrong SQLSTATE %', v_state;
        END IF;
    END;

    RAISE NOTICE '[RR011][CLIENT-VERSION][PASS] rejected with 22023';
END;
$$;

DO $$
DECLARE
    v_state TEXT;
BEGIN
    BEGIN
        PERFORM public.upsert_source_document_v2(
            '{"id":"bad-time","title":"Bad time","documentType":"manual","publicationDate":"2026-05-15T24:00:00Z"}'::jsonb,
            0
        );
        RAISE EXCEPTION '24:00 unexpectedly accepted';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
        IF v_state IS DISTINCT FROM '22023' THEN
            RAISE EXCEPTION '24:00 wrong SQLSTATE %', v_state;
        END IF;
    END;

    BEGIN
        PERFORM public.upsert_source_document_v2(
            '{"id":"bad-port","title":"Bad port","documentType":"manual","externalUrl":"http://example.com:65536"}'::jsonb,
            0
        );
        RAISE EXCEPTION 'port 65536 unexpectedly accepted';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
        IF v_state IS DISTINCT FROM '22023' THEN
            RAISE EXCEPTION 'port 65536 wrong SQLSTATE %', v_state;
        END IF;
    END;

    RAISE NOTICE '[RR011][24-00][PASS] rejected with 22023';
    RAISE NOTICE '[RR011][PORT-65536][PASS] rejected with 22023';
END;
$$;

RESET request.jwt.claims;
SET request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

DO $$
DECLARE
    v_state TEXT;
BEGIN
    BEGIN
        PERFORM public.upsert_source_document_v2(
            '{"id":"viewer-denied","title":"Viewer denied","documentType":"manual"}'::jsonb,
            0
        );
        RAISE EXCEPTION 'viewer unexpectedly authorized';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
        IF v_state IS DISTINCT FROM '42501' THEN
            RAISE EXCEPTION 'viewer denial wrong SQLSTATE %', v_state;
        END IF;
    END;

    RAISE NOTICE '[RR011][UNAUTHORIZED][PASS] active viewer rejected with 42501';
END;
$$;

RESET request.jwt.claims;
SET request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

DO $$
DECLARE
    v_state TEXT;
BEGIN
    IF has_function_privilege('authenticated', 'public.upsert_source_document_v1(jsonb)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.upsert_source_document_v1(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'LEGACY V1 remains executable by an application role';
    END IF;

    BEGIN
        PERFORM public.upsert_source_document_v1(
            '{"id":"legacy-bypass","title":"Legacy bypass","documentType":"manual"}'::jsonb
        );
        RAISE EXCEPTION 'LEGACY V1 call unexpectedly succeeded';
    EXCEPTION WHEN insufficient_privilege THEN
        GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
        IF v_state IS DISTINCT FROM '42501' THEN
            RAISE EXCEPTION 'LEGACY V1 denial wrong SQLSTATE %', v_state;
        END IF;
    END;

    RAISE NOTICE '[RR011][LEGACY-V1][PASS] anon/authenticated blocked; actual call returned 42501';
END;
$$;

DO $$
DECLARE
    v_state TEXT;
BEGIN
    IF has_table_privilege('authenticated', 'public.product_source_documents', 'INSERT')
       OR has_table_privilege('authenticated', 'public.product_source_documents', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.product_source_documents', 'DELETE')
       OR has_table_privilege('anon', 'public.product_source_documents', 'INSERT')
       OR has_table_privilege('anon', 'public.product_source_documents', 'UPDATE')
       OR has_table_privilege('anon', 'public.product_source_documents', 'DELETE') THEN
        RAISE EXCEPTION 'DIRECT DML privilege remains open';
    END IF;

    BEGIN
        INSERT INTO public.product_source_documents (id, title, document_type)
        VALUES ('direct-bypass', 'Direct bypass', 'manual');
        RAISE EXCEPTION 'DIRECT INSERT unexpectedly succeeded';
    EXCEPTION WHEN insufficient_privilege THEN
        GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
        IF v_state IS DISTINCT FROM '42501' THEN
            RAISE EXCEPTION 'DIRECT INSERT denial wrong SQLSTATE %', v_state;
        END IF;
    END;

    BEGIN
        UPDATE public.product_source_documents SET title = 'Direct bypass' WHERE id = 'cas-doc';
        RAISE EXCEPTION 'DIRECT UPDATE unexpectedly succeeded';
    EXCEPTION WHEN insufficient_privilege THEN
        GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
        IF v_state IS DISTINCT FROM '42501' THEN
            RAISE EXCEPTION 'DIRECT UPDATE denial wrong SQLSTATE %', v_state;
        END IF;
    END;

    BEGIN
        DELETE FROM public.product_source_documents WHERE id = 'cas-doc';
        RAISE EXCEPTION 'DIRECT DELETE unexpectedly succeeded';
    EXCEPTION WHEN insufficient_privilege THEN
        GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
        IF v_state IS DISTINCT FROM '42501' THEN
            RAISE EXCEPTION 'DIRECT DELETE denial wrong SQLSTATE %', v_state;
        END IF;
    END;

    RAISE NOTICE '[RR011][DIRECT-DML][PASS] INSERT/UPDATE/DELETE blocked with 42501';
END;
$$;

RESET request.jwt.claims;
RESET ROLE;

DO $$
DECLARE
    v_replica_identity "char";
    v_published BOOLEAN;
BEGIN
    SELECT relreplident INTO v_replica_identity
    FROM pg_class
    WHERE oid = 'public.product_source_documents'::regclass;

    SELECT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'product_source_documents'
    ) INTO v_published;

    IF v_replica_identity IS DISTINCT FROM 'f' OR v_published IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'REALTIME contract mismatch: relreplident %, published %', v_replica_identity, v_published;
    END IF;

    RAISE NOTICE '[RR011][REPLICA-IDENTITY][PASS] FULL';
    RAISE NOTICE '[RR011][REALTIME-PUBLICATION][PASS] table included in supabase_realtime';
END;
$$;

\echo [RR011][ALL-ASSERTIONS][PASS]
