-- ============================================================================
-- PCON CATALOG BUILDER — SUPABASE SEED DATA
-- ============================================================================

-- 1. Insert System Templates
insert into public.templates (name, template_key, design_tokens, layout_config, is_system)
values
(
  'Presys Premium Industrial',
  'presys-premium',
  '{
    "colors": {
      "primary": "#003366",
      "dark": "#001A33",
      "accent": "#2563EB",
      "surface": "#FAFAFA",
      "border": "#D4D4D4",
      "headerBg": "#1A1A2E",
      "headerText": "#FFFFFF"
    },
    "fonts": {
      "heading": "Inter, sans-serif",
      "body": "Inter, sans-serif",
      "data": "JetBrains Mono, monospace"
    },
    "spacing": {
      "pagePaddingMm": 15,
      "sectionGapPx": 16,
      "cellHeightPx": 44
    }
  }'::jsonb,
  '{
    "pages": [
      { "type": "cover_overview", "title": "Overview & Destaques", "visible": true },
      { "type": "variations", "title": "Modelos e Variações", "visible": true },
      { "type": "specifications", "title": "Especificações Técnicas", "visible": true },
      { "type": "general_electrical", "title": "Geral e Calibrador Elétrico", "visible": true },
      { "type": "ordering_accessories", "title": "Código de Encomenda e Acessórios", "visible": true }
    ]
  }'::jsonb,
  true
),
(
  'Additel Clean Modern',
  'additel-clean',
  '{
    "colors": {
      "primary": "#005596",
      "dark": "#0A2540",
      "accent": "#0088CC",
      "surface": "#FFFFFF",
      "border": "#E2E8F0",
      "headerBg": "#005596",
      "headerText": "#FFFFFF"
    },
    "fonts": {
      "heading": "Inter, sans-serif",
      "body": "Inter, sans-serif",
      "data": "JetBrains Mono, monospace"
    }
  }'::jsonb,
  '{ "pages": [] }'::jsonb,
  true
),
(
  'Fluke Technical Dense',
  'fluke-dense',
  '{
    "colors": {
      "primary": "#FFC20E",
      "dark": "#000000",
      "accent": "#000000",
      "surface": "#FFFFFF",
      "border": "#CCCCCC",
      "headerBg": "#000000",
      "headerText": "#FFC20E"
    },
    "fonts": {
      "heading": "Inter, sans-serif",
      "body": "Inter, sans-serif",
      "data": "JetBrains Mono, monospace"
    }
  }'::jsonb,
  '{ "pages": [] }'::jsonb,
  true
)
on conflict (template_key) do nothing;

-- 2. Insert Default Master Catalog for PCON Series
insert into public.catalogs (id, name, locale, status, template_key, brand, version)
values (
  'a0000000-0000-0000-0000-000000000001',
  'PCON Series — Controladores e Calibradores Automáticos de Pressão',
  'pt-BR',
  'published',
  'presys-premium',
  '{
    "companyName": "Presys Instrumentos",
    "primaryColor": "#003366",
    "darkColor": "#001A33",
    "accentColor": "#2563EB",
    "logoUrl": "/img/logo-presys.png",
    "website": "www.presys.com.br",
    "phone": "+55 (11) 3038-1300",
    "email": "vendas@presys.com.br"
  }'::jsonb,
  1
)
on conflict (id) do nothing;

-- 3. Insert Field Definitions for PCON Catalog
insert into public.field_definitions (catalog_id, section, key, label, field_type, unit, validation, sort_order, visible_in_catalog)
values
-- Seção: Marketing & Visão Geral
('a0000000-0000-0000-0000-000000000001', 'marketing', 'title', 'Título Comercial', 'text', null, '{"required": true}'::jsonb, 1, true),
('a0000000-0000-0000-0000-000000000001', 'marketing', 'subtitle', 'Subtítulo', 'text', null, '{}'::jsonb, 2, true),
('a0000000-0000-0000-0000-000000000001', 'marketing', 'overview', 'Descrição Geral', 'multiline', null, '{"required": true}'::jsonb, 3, true),
('a0000000-0000-0000-0000-000000000001', 'marketing', 'features', 'Principais Recursos (Bullets)', 'multiselect', null, '{}'::jsonb, 4, true),

-- Seção: Especificações de Pressão
('a0000000-0000-0000-0000-000000000001', 'pressure_specs', 'control_range', 'Faixa de Controle', 'range', 'bar', '{"required": true}'::jsonb, 10, true),
('a0000000-0000-0000-0000-000000000001', 'pressure_specs', 'control_stability', 'Estabilidade de Controle', 'measurement', '%FS', '{"required": true}'::jsonb, 11, true),
('a0000000-0000-0000-0000-000000000001', 'pressure_specs', 'display_accuracy', 'Exatidão da Indicação', 'accuracy', '%FS', '{"required": true}'::jsonb, 12, true),
('a0000000-0000-0000-0000-000000000001', 'pressure_specs', 'control_speed', 'Tempo de Estabilização', 'measurement', 'seconds', '{}'::jsonb, 13, true),
('a0000000-0000-0000-0000-000000000001', 'pressure_specs', 'pressure_modules', 'Módulos de Pressão', 'text', null, '{}'::jsonb, 14, true),
('a0000000-0000-0000-0000-000000000001', 'pressure_specs', 'media_compatibility', 'Compatibilidade de Fluido', 'text', null, '{}'::jsonb, 15, true),
('a0000000-0000-0000-0000-000000000001', 'pressure_specs', 'operating_temperature', 'Temperatura de Operação', 'range', '°C', '{}'::jsonb, 16, true),

-- Seção: Especificações Gerais
('a0000000-0000-0000-0000-000000000001', 'general_specs', 'user_interface', 'Interface do Usuário', 'text', null, '{}'::jsonb, 20, true),
('a0000000-0000-0000-0000-000000000001', 'general_specs', 'interfaces', 'Conexões e Comunicação', 'text', null, '{}'::jsonb, 21, true),
('a0000000-0000-0000-0000-000000000001', 'general_specs', 'protocols', 'Protocolos Suportados', 'text', null, '{}'::jsonb, 22, true),
('a0000000-0000-0000-0000-000000000001', 'general_specs', 'dimensions', 'Dimensões (A x L x P)', 'text', 'mm', '{}'::jsonb, 23, true),
('a0000000-0000-0000-0000-000000000001', 'general_specs', 'weight', 'Peso', 'text', 'kg', '{}'::jsonb, 24, true),
('a0000000-0000-0000-0000-000000000001', 'general_specs', 'warranty', 'Garantia', 'text', 'ano', '{}'::jsonb, 25, true);

-- 4. Seed Standard PCON Core Products
insert into public.products (id, catalog_id, sku, name, family, status, sort_order, data, version)
values
(
  'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'PCON-Y17',
  'PCON-Y17 Controlador de Bancada de Alta Precisão',
  'PCON',
  'published',
  1,
  '{
    "marketing": {
      "title": "Controlador e Calibrador Automático de Pressão de Alta Precisão",
      "subtitle": "Calibradores de Pressão Documentadores de Laboratório",
      "overview": "O PCON-Y17 é um controlador e calibrador automático de pressão de alta precisão projetado para aplicações metrológicas exigentes em laboratórios e oficinas. Suporta geração e controle automático de pressão de vácuo até 3000 psi (210 bar), oferecendo uma solução rápida, precisa e totalmente documentadora.",
      "features": [
        "Controle automático de pressão desde vácuo até 3000 psi (210 bar)",
        "Estabilidade de controle de 0,002% do Fundo de Escala (FS)",
        "Exatidão metrológica de até ± 0,012% FS com sensores internos",
        "Display touchscreen gráfico colorido de 5,7 polegadas",
        "Medição e calibração simultânea de sinais elétricos (mA, V, mV, Ω, RTD)",
        "Configurador e comunicador HART® integrado opcional",
        "Totalmente compatível com software de gerenciamento ISOPLAN®",
        "Gera relatórios de calibração automatizados em PDF, CSV e XML"
      ]
    },
    "pressure_specs": {
      "control_range": { "min": 0, "max": 210, "unit": "bar", "display": "Vácuo a 3000 psi (210 bar)" },
      "control_stability": { "value": 0.002, "unit": "%FS", "basis": "full_scale", "display": "± 0,002% FS" },
      "display_accuracy": { "value": 0.012, "unit": "%FS", "note": "compensado em temperatura", "display": "± 0,012% FS" },
      "control_speed": { "value": 10, "unit": "seconds", "display": "Aprox. 10 segundos" },
      "pressure_modules": "Até 3 sensores de alta exatidão (interno simples/duplo ou externo)",
      "media_compatibility": "Gás limpo e seco (ar, nitrogênio ou gases inertes)",
      "operating_temperature": { "min": 0, "max": 50, "unit": "°C", "display": "0 °C a 50 °C" }
    },
    "general_specs": [
      { "param": "Interface do Usuário", "desc": "Touchscreen colorido 5,7 pol com teclado virtual" },
      { "param": "Processador & Memória", "desc": "Dual Core 1 GHz com 16 GB de memória Flash" },
      { "param": "Interfaces", "desc": "Ethernet RJ45, USB Host/Device, Wi-Fi opcional" },
      { "param": "Protocolos", "desc": "SCPI, Modbus RTU/TCP, HART® (opcional)" },
      { "param": "Dimensões", "desc": "135 x 350 x 270 mm (versão Mesa DT)" },
      { "param": "Peso", "desc": "Aprox. 5,0 kg (Mesa) / 9,5 kg (Rack 19 polegadas)" },
      { "param": "Alimentação", "desc": "100 a 240 Vac, 50/60 Hz universal" },
      { "param": "Garantia", "desc": "1 Ano contra defeitos de fabricação" }
    ],
    "electrical_specs": [
      { "signal": "Medição de Corrente (mA)", "range": "-1 a 24,5 mA", "resolution": "0,0001 mA", "accuracy": "± 0,02% FS", "note": "Impedância < 10 Ω" },
      { "signal": "Medição de Tensão (V)", "range": "-1 a 30 Vdc", "resolution": "0,0001 V", "accuracy": "± 0,01% FS", "note": "Impedância > 1 MΩ" },
      { "signal": "Medição de Milivolt (mV)", "range": "-10 a 150 mV", "resolution": "0,001 mV", "accuracy": "± 0,01% FS", "note": "Impedância > 1 GΩ" },
      { "signal": "Medição de Resistência (Ω)", "range": "0 a 400 Ω / 0 a 2500 Ω", "resolution": "0,01 Ω", "accuracy": "± 0,01% FS", "note": "2, 3 ou 4 fios" },
      { "signal": "Temperatura RTD", "range": "-200 a 850 °C", "resolution": "0,01 °C", "accuracy": "± 0,1 °C", "note": "Pt-100, Pt-500, Pt-1000" },
      { "signal": "Fonte de Loop 24V", "range": "24 Vdc regulado", "resolution": "N/A", "accuracy": "± 1 V", "note": "60 mA máx, protegido contra curto" }
    ],
    "accessories": [
      { "code": "06.01.1031-00", "description": "Bolsa de transporte reforçada para campo", "type": "Standard" },
      { "code": "06.07.0025-00", "description": "Kit de cabos de ponta de prova de alta precisão", "type": "Standard" },
      { "code": "01.14.0100-10", "description": "Cabo de alimentação padrão brasileiro/universal", "type": "Standard" },
      { "code": "SI-1000", "description": "Filtro separador de impurezas e umidade", "type": "Optional" },
      { "code": "ISOPLAN-5", "description": "Software de calibração metrológica ISOPLAN", "type": "Optional" }
    ]
  }'::jsonb,
  1
),
(
  'b0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000001',
  'PCON-Y18-LP',
  'PCON-Y18-LP Calibrador Automático para Baixa Pressão e Pressão Diferencial',
  'PCON',
  'published',
  2,
  '{
    "marketing": {
      "title": "Calibrador Automático para Baixa Pressão e Pressão Diferencial",
      "subtitle": "Calibração Metrológica em Nível Pascal",
      "overview": "O PCON-Y18-LP é um controlador e calibrador de pressão especializado projetado especificamente para baixas pressões e calibrações diferenciais. Fornece estabilidade de controle de grau metrológico em níveis de Pascal, ideal para salas limpas, sistemas de ventilação e filtros.",
      "features": [
        "Calibração dedicada de baixíssima pressão e pressão diferencial",
        "Estabilidade de controle ultra-fina de até ± 0,05 Pa",
        "Exatidão metrológica de até ± 0,25 Pa",
        "Display touchscreen de 5,7 pol com layout gráfico interativo",
        "Calibrador de sinais elétricos integrado (mA, V, mV, Ω, RTD)",
        "Geração automática de relatórios em PDF via USB"
      ]
    },
    "pressure_specs": {
      "control_range": { "min": -0.1, "max": 0.1, "unit": "bar", "display": "Baixa Pressão e Diferencial (±10 mbar, ±100 mbar)" },
      "control_stability": { "value": 0.05, "unit": "Pa", "display": "± 0,05 Pa" },
      "display_accuracy": { "value": 0.25, "unit": "Pa", "display": "Até ± 0,25 Pa" },
      "control_speed": { "value": 15, "unit": "seconds", "display": "Aprox. 10 a 15 segundos" },
      "media_compatibility": "Ar limpo e seco ou gases não-corrosivos",
      "operating_temperature": { "min": 0, "max": 50, "unit": "°C", "display": "0 °C a 50 °C" }
    }
  }'::jsonb,
  1
),
(
  'b0000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000001',
  'PCON-Kompressor-Y18',
  'PCON-Kompressor-Y18 Calibrador Automático com Compressor Interno',
  'PCON',
  'published',
  3,
  '{
    "marketing": {
      "title": "Calibrador Automático de Pressão com Compressor Interno Isento de Óleo",
      "subtitle": "Autonomia Completa para Calibrações em Campo",
      "overview": "O PCON Kompressor-Y18 é um calibrador de pressão automatizado totalmente autônomo que integra um compressor elétrico isento de óleo. Este design elimina a necessidade de cilindros pesados de gás ou bombas manuais.",
      "features": [
        "Compressor isento de óleo integrado - sem necessidade de bombas externas",
        "Gera e controla pressão até 70 bar (1000 psi)",
        "Gera vácuo até -0,9 bar (-13 psi) automaticamente",
        "Estabilidade de controle de ± 0,002% FS",
        "Exatidão de ± 0,012% FS com sensores de referência internos",
        "Maleta reforçada para serviço de campo portátil (FS)"
      ]
    },
    "pressure_specs": {
      "control_range": { "min": -0.9, "max": 70, "unit": "bar", "display": "-0,9 bar (-13 psi) até 70 bar (1000 psi)" },
      "control_stability": { "value": 0.002, "unit": "%FS", "basis": "full_scale", "display": "± 0,002% FS" },
      "display_accuracy": { "value": 0.012, "unit": "%FS", "display": "± 0,012% FS" }
    }
  }'::jsonb,
  1
)
on conflict (id) do nothing;
