-- ============================================================================
-- MIGRATION 00010: COLLABORATIVE PRODUCT LIBRARY SCHEMA
-- Tables: product_families, product_family_fields, library_change_events
-- Relations: products.family_id FK -> product_families.id
-- Indexes, RLS Policies, and Supabase Realtime Publication
-- ============================================================================

-- 1. Tabela de Famílias de Produtos
CREATE TABLE IF NOT EXISTS public.product_families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Chave Estrangeira family_id na tabela products
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'products' 
          AND column_name = 'family_id'
    ) THEN
        ALTER TABLE public.products ADD COLUMN family_id UUID REFERENCES public.product_families(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Tabela de Campos / Colunas Dinâmicas por Família
CREATE TABLE IF NOT EXISTS public.product_family_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.product_families(id) ON DELETE CASCADE,
    field_key TEXT NOT NULL,
    label TEXT NOT NULL,
    field_type TEXT DEFAULT 'text',
    unit TEXT,
    sort_order INTEGER DEFAULT 0,
    width INTEGER DEFAULT 130,
    visible BOOLEAN DEFAULT true,
    is_system BOOLEAN DEFAULT false,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT product_family_fields_family_id_field_key_key UNIQUE (family_id, field_key)
);

-- 4. Tabela de Eventos e Auditoria da Biblioteca (Imutável)
CREATE TABLE IF NOT EXISTS public.library_change_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    family_id UUID REFERENCES public.product_families(id) ON DELETE SET NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    field_key TEXT,
    old_value TEXT,
    new_value TEXT,
    action TEXT NOT NULL,
    summary TEXT,
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_email TEXT,
    actor_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 5. Índices de Performance
CREATE INDEX IF NOT EXISTS idx_products_family_id ON public.products(family_id);
CREATE INDEX IF NOT EXISTS idx_product_family_fields_family ON public.product_family_fields(family_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_library_change_events_created ON public.library_change_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_library_change_events_entity ON public.library_change_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_library_change_events_product ON public.library_change_events(product_id);

-- 6. Row Level Security (RLS)
ALTER TABLE public.product_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_family_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_change_events ENABLE ROW LEVEL SECURITY;

-- Policies para product_families
DROP POLICY IF EXISTS "allow_read_product_families" ON public.product_families;
CREATE POLICY "allow_read_product_families" ON public.product_families
    FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "allow_write_product_families" ON public.product_families;
CREATE POLICY "allow_write_product_families" ON public.product_families
    FOR ALL TO public USING (true) WITH CHECK (true);

-- Policies para product_family_fields
DROP POLICY IF EXISTS "allow_read_product_family_fields" ON public.product_family_fields;
CREATE POLICY "allow_read_product_family_fields" ON public.product_family_fields
    FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "allow_write_product_family_fields" ON public.product_family_fields;
CREATE POLICY "allow_write_product_family_fields" ON public.product_family_fields
    FOR ALL TO public USING (true) WITH CHECK (true);

-- Policies para library_change_events
DROP POLICY IF EXISTS "allow_read_library_change_events" ON public.library_change_events;
CREATE POLICY "allow_read_library_change_events" ON public.library_change_events
    FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "allow_write_library_change_events" ON public.library_change_events;
CREATE POLICY "allow_write_library_change_events" ON public.library_change_events
    FOR ALL TO public USING (true) WITH CHECK (true);

-- 7. Publicação Supabase Realtime
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'product_families'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.product_families;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'product_family_fields'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.product_family_fields;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'library_change_events'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.library_change_events;
    END IF;
END $$;
