\set ON_ERROR_STOP on
\set VERBOSITY verbose
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
SELECT public.upsert_source_document_v2(
    '{"id":"cas-doc","title":"Writer B must lose","documentType":"manual","revision":"R3-B"}'::jsonb,
    2
) AS writer_b_result;
COMMIT;
