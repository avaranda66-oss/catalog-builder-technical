\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
SELECT public.upsert_source_document_v2(
    '{"id":"cas-doc","title":"Writer A wins","documentType":"manual","revision":"R3"}'::jsonb,
    2
) AS writer_a_result;
SELECT pg_sleep(4);
COMMIT;
