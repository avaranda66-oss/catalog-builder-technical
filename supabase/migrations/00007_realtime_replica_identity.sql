-- ============================================================================
-- Migration 00007: Configure REPLICA IDENTITY FULL for Complete Realtime WAL Capture
-- Data: 2026-09-01
-- Descrição: Configura REPLICA IDENTITY FULL nas tabelas críticas (catalogs, products, templates)
-- garantindo que o PostgreSQL envie todos os dados em eventos de replicação lógica (WAL)
-- para o Supabase Realtime.
-- ============================================================================

ALTER TABLE public.catalogs REPLICA IDENTITY FULL;
ALTER TABLE public.products REPLICA IDENTITY FULL;
ALTER TABLE public.templates REPLICA IDENTITY FULL;
