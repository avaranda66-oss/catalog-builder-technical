import React, { useState } from 'react';
import {
  Plus,
  Search,
  Building2,
  Table as TableIcon,
  Layers,
  Sparkles,
  Zap,
  Package,
  Barcode,
  GalleryHorizontalEnd,
  CircleDot,
  Grid3X3,
  Laptop,
  LayoutTemplate,
  LayoutGrid
} from 'lucide-react';
import { useCatalogStore } from '../../stores/useCatalogStore';
import { ContentBlock, BlockType } from '../../domain/catalog.schema';
import { PageInsertionSafetyModal } from './PageInsertionSafetyModal';
import {
  evaluatePageCompositionInsertion,
  PageContentInsertionSpec
} from '../../domain/page-composition-policy';
import { BlockHoverTooltip } from './BlockHoverTooltip';
import { FullPageCoverBlock } from './blocks/FullPageCoverBlock';
import { HeroBannerBlock } from './blocks/HeroBannerBlock';
import { AdditelTwoColBlock } from './blocks/AdditelTwoColBlock';
import { FlukeHeaderBlock } from './blocks/FlukeHeaderBlock';
import { BottomHeaderBlock } from './blocks/BottomHeaderBlock';
import { TechnicalTableBlock } from './blocks/TechnicalTableBlock';
import { MatrixSpecTableBlock } from './blocks/MatrixSpecTableBlock';
import { ElectricalTableBlock } from './blocks/ElectricalTableBlock';
import { AccessoriesTableBlock } from './blocks/AccessoriesTableBlock';
import { OrderingCodesBlock } from './blocks/OrderingCodesBlock';
import { InsertsVisualBlock } from './blocks/InsertsVisualBlock';
import { MultiModeCalibratorBlock } from './blocks/MultiModeCalibratorBlock';
import { SoftwareConnectivityBlock } from './blocks/SoftwareConnectivityBlock';
import { ImageGalleryBlock } from './blocks/ImageGalleryBlock';
import { FeaturesListBlock } from './blocks/FeaturesListBlock';
import { ContactFooterBlock } from './blocks/ContactFooterBlock';
import { StructuralSectionBlock } from './blocks/StructuralSectionBlock';
import {
  STRUCTURAL_SECTION_PRESETS,
  createStructuralSectionFromPreset
} from '../../domain/structural-presets';

export interface SidebarBlockOption {
  id: string;
  title: string;
  category: 'headers' | 'tables' | 'structures';
  categoryLabel: string;
  badge: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  blockData?: Omit<ContentBlock, 'id'>;
  presetId?: string;
  renderPreview: () => React.ReactNode;
}

export const SIDEBAR_BLOCK_ITEMS: SidebarBlockOption[] = [
  // 1. CAPAS & HEADERS
    {
      id: 'item-full-cover',
      title: 'Capa Editorial A4 Completa',
      category: 'headers',
      categoryLabel: 'Capa Inteira A4',
      badge: 'Full Page A4',
      description: 'Capa A4 de alto impacto visual com grande fotografia, selos de calibração RBC, badges e rodapé.',
      icon: Sparkles,
      blockData: {
        type: 'full_page_cover',
        title: 'PCON-Y18-LP / SÉRIE CALIBRADORES',
        subtitle: 'Calibrador Automático de Pressão de Alta Estabilidade para Laboratório e Campo',
        badgeText: 'CALIBRAÇÃO RBC · ISO/IEC 17025'
      },
      renderPreview: () => (
        <FullPageCoverBlock
          block={{
            id: 'prev-full-cover',
            type: 'full_page_cover',
            title: 'PCON-Y18-LP / CALIBRADOR',
            subtitle: 'Geração Autônoma de Pressão e Vácuo',
            badgeText: 'RBC · ISO 17025',
            imageUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80',
            customData: {
              highlights: [
                { label: 'Exatidão', value: '0.01% FE' },
                { label: 'Geração', value: '-0.9 a 70 bar' },
                { label: 'Sinais', value: 'HART 7' },
                { label: 'Display', value: 'Touch 5.7"' }
              ]
            }
          }}
          pageId="prev-page"
          isSelected={false}
        />
      )
    },
    {
      id: 'item-hero-banner',
      title: 'Header Presys Industrial (Azul)',
      category: 'headers',
      categoryLabel: 'Header Topo',
      badge: 'Clássico Presys',
      description: 'Degradê azul marinho corporativo, selo metrológico superior e fotografia do equipamento.',
      icon: Building2,
      blockData: {
        type: 'hero_banner',
        title: 'Linha Industrial Presys PCON & Série T',
        subtitle: 'Calibradores de processos com geração autônoma de pressão e rastreabilidade total.',
        badgeText: 'PRESYS — INSTRUMENTAÇÃO INDUSTRIAL DE PRECISÃO'
      },
      renderPreview: () => (
        <HeroBannerBlock
          block={{
            id: 'prev-hero',
            type: 'hero_banner',
            badgeText: 'PRESYS — INSTRUMENTAÇÃO INDUSTRIAL',
            title: 'Presys PCON-Y18',
            subtitle: 'Calibrador automático até 70 bar.',
            imageUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=400&q=80'
          }}
          pageId="prev-page"
          isSelected={false}
        />
      )
    },
    {
      id: 'item-additel-hero',
      title: 'Header Dual-Column Presys (Destaques Laterais)',
      category: 'headers',
      categoryLabel: 'Header Topo',
      badge: 'Dual Column',
      description: 'Foto à esquerda e 7 bullets de diferenciais com checkmarks azuis à direita.',
      icon: LayoutTemplate,
      blockData: {
        type: 'additel_two_col_hero',
        title: 'Presys PCON-Y18 Series',
        subtitle: 'Calibrador Automático de Pressão & Padrão de Calibração',
        badgeText: 'PRESYS Metrology'
      },
      renderPreview: () => (
        <AdditelTwoColBlock
          block={{
            id: 'prev-additel',
            type: 'additel_two_col_hero',
            title: 'Presys PCON-Y18',
            subtitle: 'Automated Pressure Calibrators',
            badgeText: 'PRESYS',
            imageUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=400&q=80'
          }}
          pageId="prev-page"
          isSelected={false}
        />
      )
    },
    {
      id: 'item-fluke-header',
      title: 'Header Presys Metrologia (Tarja Amarela)',
      category: 'headers',
      categoryLabel: 'Header Topo',
      badge: 'Série T',
      description: 'Tarja amarela metrológica, fotografia do bloco seco e caixa de destaques técnicos.',
      icon: Sparkles,
      blockData: {
        type: 'fluke_header',
        title: 'Field Metrology Wells / Presys Série T',
        badgeText: 'PRESYS Calibration'
      },
      renderPreview: () => (
        <FlukeHeaderBlock
          block={{
            id: 'prev-fluke',
            type: 'fluke_header',
            title: 'Field Metrology Wells',
            badgeText: 'PRESYS Calibration',
            imageUrl: 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=400&q=80'
          }}
          pageId="prev-page"
          isSelected={false}
        />
      )
    },
    {
      id: 'item-bottom-header',
      title: 'Header Inferior / Rodapé de Destaque',
      category: 'headers',
      categoryLabel: 'Header Base',
      badge: 'Posição Base',
      description: 'Destaque corporativo posicionado no rodapé da folha com dados de contato e certificados.',
      icon: Building2,
      blockData: {
        type: 'bottom_header',
        title: 'PRESYS INSTRUMENTOS & SISTEMAS LTDA',
        subtitle: 'Soluções completas para calibração de pressão, temperatura e sinais de processo.'
      },
      renderPreview: () => (
        <BottomHeaderBlock
          block={{
            id: 'prev-bottom',
            type: 'bottom_header',
            title: 'PRESYS INSTRUMENTOS & SISTEMAS',
            subtitle: 'Calibração RBC e ISO 9001'
          }}
          pageId="prev-page"
          isSelected={false}
        />
      )
    },

    // 2. TABELAS TÉCNICAS
    {
      id: 'item-tbl-blank-v2',
      title: 'Tabela em Branco — V2 (Core Flexível)',
      category: 'tables',
      categoryLabel: 'Tabela Técnica',
      badge: 'Table Core V2',
      description: 'Tabela técnica em branco sem linhas pré-definidas. Permite adicionar linhas manuais, produtos vinculados ou dados livres.',
      icon: TableIcon,
      blockData: {
        type: 'specs_table',
        title: 'Nova Tabela Técnica',
        tableColumns: [
          { key: 'col_item', label: 'Item', visible: true, width: 70, isCustom: true },
          { key: 'col_desc', label: 'Descrição / Parâmetro', visible: true, width: 220, isCustom: true },
          { key: 'col_val', label: 'Especificação / Valor', visible: true, width: 160, isCustom: true },
          { key: 'col_obs', label: 'Observações', visible: true, width: 150, isCustom: true }
        ],
        tableRows: []
      },
      renderPreview: () => (
        <TechnicalTableBlock
          block={{
            id: 'prev-blank-table',
            type: 'specs_table',
            title: 'NOVA TABELA TÉCNICA (V2)',
            tableColumns: [
              { key: 'col_item', label: 'Item', visible: true, isCustom: true },
              { key: 'col_desc', label: 'Descrição', visible: true, isCustom: true },
              { key: 'col_val', label: 'Especificação', visible: true, isCustom: true },
              { key: 'col_obs', label: 'Observações', visible: true, isCustom: true }
            ],
            tableRows: []
          }}
          pageId="prev-page"
          isSelected={false}
        />
      )
    },
    {
      id: 'item-tbl-products',
      title: 'Tabela de Produtos Presys Oficial',
      category: 'tables',
      categoryLabel: 'Tabela Técnica',
      badge: 'Biblioteca Oficial',
      description: 'Tabela técnica com código, modelo, faixa, unidade e exatidão conectada à biblioteca oficial.',
      icon: TableIcon,
      blockData: {
        type: 'specs_table',
        title: 'Tabela de Especificações Técnicas de Instrumentação',
        tableColumns: [
          { key: 'code', label: 'Código', visible: true, width: 110 },
          { key: 'model', label: 'Modelo', visible: true, width: 130 },
          { key: 'range', label: 'Faixa Operacional', visible: true, width: 130 },
          { key: 'unit', label: 'Unidade', visible: true, width: 70 },
          { key: 'accuracy', label: 'Exatidão', visible: true, width: 100 },
          { key: 'output', label: 'Sinal Saída', visible: true, width: 120 }
        ],
        tableRows: [{ id: `r-${Date.now()}`, productRefId: 'prod-presys-pcon-y18', localOverrides: {}, order: 0 }]
      },
      renderPreview: () => (
        <TechnicalTableBlock
          block={{
            id: 'prev-table',
            type: 'specs_table',
            title: 'ESPECIFICAÇÕES TÉCNICAS',
            tableColumns: [
              { key: 'code', label: 'Código', visible: true },
              { key: 'model', label: 'Modelo', visible: true },
              { key: 'range', label: 'Faixa', visible: true },
              { key: 'accuracy', label: 'Exatidão', visible: true }
            ],
            tableRows: [{ id: 'r1', productRefId: 'prod-presys-pcon-y18', localOverrides: {}, order: 0 }]
          }}
          pageId="prev-page"
          isSelected={false}
        />
      )
    },
    {
      id: 'item-tbl-matrix',
      title: 'Matriz Comparativa de Modelos & Faixas',
      category: 'tables',
      categoryLabel: 'Tabela Matricial',
      badge: 'Comparativo',
      description: 'Matriz lado a lado comparando faixas, exatidão, estabilidade e recursos por modelo.',
      icon: Grid3X3,
      blockData: {
        type: 'matrix_spec_table',
        title: 'MATRIZ COMPARATIVA DE ESPECIFICAÇÕES & FAIXAS OPERACIONAIS'
      },
      renderPreview: () => (
        <MatrixSpecTableBlock
          block={{
            id: 'prev-matrix',
            type: 'matrix_spec_table',
            title: 'MATRIZ COMPARATIVA DE MODELOS'
          }}
          pageId="prev-page"
          isSelected={false}
        />
      )
    },
    {
      id: 'item-tbl-elec',
      title: 'Tabela de Sinais Elétricos & Loop',
      category: 'tables',
      categoryLabel: 'Tabela Elétrica',
      badge: '4-20mA & Loop',
      description: 'Loop 24V, HART 7, RTD, termopares, isolação galvânica e impedância de carga.',
      icon: Zap,
      blockData: {
        type: 'electrical_table',
        title: 'Sinais Elétricos e Conectividade de Processo',
        tableColumns: [
          { key: 'sinal', label: 'Sinal de Saída', visible: true },
          { key: 'alimentacao', label: 'Alimentação', visible: true },
          { key: 'carga', label: 'Carga Máxima', visible: true },
          { key: 'isolacao', label: 'Isolação', visible: true }
        ],
        tableRows: [{ id: `er-${Date.now()}`, localOverrides: { sinal: '4-20 mA + HART 7', alimentacao: 'Bateria Li-Ion / 24 Vdc', carga: '250 a 1100 Ω', isolacao: '1500 Vrms' }, order: 0 }]
      },
      renderPreview: () => (
        <ElectricalTableBlock
          block={{
            id: 'prev-elec',
            type: 'electrical_table',
            title: 'SINAIS ELÉTRICOS & LOOP 24V',
            tableColumns: [
              { key: 'sinal', label: 'Sinal', visible: true },
              { key: 'alimentacao', label: 'Alimentação', visible: true },
              { key: 'carga', label: 'Carga', visible: true }
            ],
            tableRows: [{ id: 'er1', localOverrides: { sinal: '4-20 mA + HART', alimentacao: '24 Vdc', carga: '250 a 1100 Ω' }, order: 0 }]
          }}
          pageId="prev-page"
          isSelected={false}
        />
      )
    },
    {
      id: 'item-tbl-accessories',
      title: 'Tabela de Acessórios & Opcionais',
      category: 'tables',
      categoryLabel: 'Tabela Acessórios',
      badge: 'Acessórios',
      description: 'Manifolds de 2/3 vias, mangueiras de alta pressão, adaptadores e maletas de proteção.',
      icon: Package,
      blockData: {
        type: 'accessories_table',
        title: 'Tabela de Acessórios & Opcionais Presys',
        tableColumns: [
          { key: 'codigo', label: 'Código', visible: true, width: 140 },
          { key: 'descricao', label: 'Descrição do Componente', visible: true },
          { key: 'tipo', label: 'Fornecimento', visible: true, width: 120 }
        ],
        tableRows: [{ id: `ar-${Date.now()}`, localOverrides: { codigo: 'PRESYS-MNF-2V', descricao: 'Válvula Manifold de 2 Vias em Inox 316', tipo: 'Opcional' }, order: 0 }]
      },
      renderPreview: () => (
        <AccessoriesTableBlock
          block={{
            id: 'prev-acc',
            type: 'accessories_table',
            title: 'ACESSÓRIOS & KITS',
            tableColumns: [
              { key: 'codigo', label: 'Código', visible: true },
              { key: 'descricao', label: 'Descrição', visible: true }
            ],
            tableRows: [{ id: 'ar1', localOverrides: { codigo: 'MNF-2V', descricao: 'Manifold Inox 316' }, order: 0 }]
          }}
          pageId="prev-page"
          isSelected={false}
        />
      )
    },
    {
      id: 'item-tbl-ordering',
      title: 'Código de Encomenda (Part Number)',
      category: 'tables',
      categoryLabel: 'Configurador',
      badge: 'Part Number',
      description: 'Estrutura visual configurável para código de encomenda de produtos e opcionais.',
      icon: Barcode,
      blockData: {
        type: 'ordering_codes',
        title: 'ESTRUTURA DO CÓDIGO DE ENCOMENDA PRESYS (PART NUMBER)'
      },
      renderPreview: () => (
        <OrderingCodesBlock
          block={{
            id: 'prev-ord',
            type: 'ordering_codes',
            title: 'CÓDIGO DE ENCOMENDA (PART NUMBER)',
            orderingSegments: [
              { id: 's1', code: 'PCON-Y18', name: 'Modelo', options: ['PCON-Y18-LP'] },
              { id: 's2', code: '70B', name: 'Faixa', options: ['70 bar'] }
            ]
          }}
          pageId="prev-page"
          isSelected={false}
        />
      )
    },

    // 3. ESTRUTURAS VISUAIS & DESTAQUES
    {
      id: 'item-str-multimode',
      title: 'Sistema Multifunção (4 Modos)',
      category: 'structures',
      categoryLabel: 'Estrutura 4 Modos',
      badge: 'Multifunção',
      description: 'Grid visual com 4 modos de calibração térmica com badges, emojis e descrições editáveis.',
      icon: Layers,
      blockData: {
        type: 'multi_mode_calibrator',
        title: 'SISTEMA MULTIFUNÇÃO — 4 MODOS DE CALIBRAÇÃO TÉRMICA EM 1 ÚNICO INSTRUMENTO',
        badgeText: 'Multifunctional Series'
      },
      renderPreview: () => (
        <MultiModeCalibratorBlock
          block={{
            id: 'prev-multi',
            type: 'multi_mode_calibrator',
            title: 'SISTEMA MULTIFUNÇÃO (4 MODOS)',
            badgeText: 'Multifunctional'
          }}
          pageId="prev-page"
          isSelected={false}
        />
      )
    },
    {
      id: 'item-str-inserts',
      title: 'Insertos Circulares & Furações',
      category: 'structures',
      categoryLabel: 'Diagrama Gráfico',
      badge: 'Insertos Gráficos',
      description: 'Círculos com furações técnicas e tabela de part numbers compatíveis por modelo.',
      icon: CircleDot,
      blockData: {
        type: 'inserts_visual',
        title: 'INSERTOS DE EQUALIZAÇÃO TÉRMICA & FURAÇÕES PADRONIZADAS PRESYS'
      },
      renderPreview: () => (
        <InsertsVisualBlock
          block={{
            id: 'prev-ins',
            type: 'inserts_visual',
            title: 'INSERTOS & FURAÇÕES PADRONIZADAS'
          }}
          pageId="prev-page"
          isSelected={false}
        />
      )
    },
    {
      id: 'item-str-software',
      title: 'Software ISOPLAN & Conectividade 4.0',
      category: 'structures',
      categoryLabel: 'Software & LAN',
      badge: 'Indústria 4.0',
      description: 'Cartões para software de calibração ISOPLAN, protocolo HART/Modbus, USB e datalogger.',
      icon: Laptop,
      blockData: {
        type: 'software_connectivity',
        title: 'SOFTWARE DE CALIBRAÇÃO & CONECTIVIDADE INDUSTRIAL'
      },
      renderPreview: () => (
        <SoftwareConnectivityBlock
          block={{
            id: 'prev-soft',
            type: 'software_connectivity',
            title: 'SOFTWARE ISOPLAN & CONECTIVIDADE'
          }}
          pageId="prev-page"
          isSelected={false}
        />
      )
    },
    {
      id: 'item-str-gallery',
      title: 'Galeria de Fotos em Campo',
      category: 'structures',
      categoryLabel: 'Galeria Fotográfica',
      badge: 'Fotos em Campo',
      description: 'Grid com fotografias de aplicação real, legendas e botões diretos de upload local.',
      icon: GalleryHorizontalEnd,
      blockData: {
        type: 'image_gallery',
        title: 'APLICAÇÕES EM BANCADA DE CALIBRAÇÃO & CAMPO'
      },
      renderPreview: () => (
        <ImageGalleryBlock
          block={{
            id: 'prev-gal',
            type: 'image_gallery',
            title: 'APLICAÇÕES EM BANCADA & CAMPO'
          }}
          pageId="prev-page"
          isSelected={false}
        />
      )
    },
    {
      id: 'item-str-features',
      title: 'Recursos Técnicos com Checkmarks',
      category: 'structures',
      categoryLabel: 'Lista Destaques',
      badge: 'Checkmarks',
      description: 'Lista de diferenciais de engenharia com ícones e checkmarks azuis corporativos.',
      icon: Zap,
      blockData: {
        type: 'features_list',
        title: 'Destaques e Recursos Técnicos do Calibrador'
      },
      renderPreview: () => (
        <FeaturesListBlock
          block={{
            id: 'prev-feat',
            type: 'features_list',
            title: 'Destaques Técnicos'
          }}
          pageId="prev-page"
          isSelected={false}
        />
      )
    },
    {
      id: 'item-str-footer',
      title: 'Rodapé Corporativo & Certificações',
      category: 'structures',
      categoryLabel: 'Rodapé',
      badge: 'Contatos Presys',
      description: 'Rodapé oficial com telefones, website, e-mail de vendas e selo de calibração RBC.',
      icon: Building2,
      blockData: {
        type: 'contact_footer'
      },
      renderPreview: () => (
        <ContactFooterBlock
          block={{
            id: 'prev-foot',
            type: 'contact_footer'
          }}
          pageId="prev-page"
          isSelected={false}
        />
      )
    },
    // Presets Estruturais Canônicos (Fase 3A.4)
    ...STRUCTURAL_SECTION_PRESETS.map((preset) => ({
      id: `item-${preset.id}`,
      title: preset.label,
      category: 'structures' as const,
      categoryLabel: 'Seção Estrutural',
      badge: preset.badge || 'Estrutural',
      description: preset.description,
      icon: LayoutGrid,
      presetId: preset.id,
      renderPreview: () => (
        <StructuralSectionBlock
          block={createStructuralSectionFromPreset(preset.id, 'pt-BR')}
          pageId="prev-page"
          isSelected={false}
        />
      )
    }))
  ];

export const SidebarBlockLibrary: React.FC = () => {
  const { currentCatalog, activePageIndex, addBlock, insertStructuralSection, insertContentOnNewPageAfter } = useCatalogStore();
  const [activeCategory, setActiveCategory] = useState<'all' | 'headers' | 'tables' | 'structures'>('all');
  const [search, setSearch] = useState('');
  const [hoveredItem, setHoveredItem] = useState<SidebarBlockOption | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const [pendingInsertion, setPendingInsertion] = useState<{
    sourcePageId: string;
    spec: PageContentInsertionSpec;
    itemTitle: string;
    reason: 'EXISTING_COVER_WITH_FLOW_BLOCK' | 'INCOMING_COVER_ON_NON_EMPTY_PAGE' | 'PAGE_ALREADY_MIXED';
  } | null>(null);

  if (!currentCatalog) return null;

  const activePage = currentCatalog.pages[activePageIndex] || currentCatalog.pages[0];
  const targetPageId = activePage?.id;
  const pageNumber = activePage?.pageNumber || 1;

  const handleInsert = (option: SidebarBlockOption) => {
    if (!targetPageId || !activePage) return;

    let incomingType: BlockType;
    if (option.presetId) {
      incomingType = 'structural_section';
    } else if (option.blockData) {
      incomingType = option.blockData.type;
    } else {
      return;
    }

    const safety = evaluatePageCompositionInsertion(activePage, incomingType);
    if (!safety.isSafe) {
      setPendingInsertion({
        sourcePageId: targetPageId,
        spec: option.presetId
          ? { kind: 'structural_preset', presetId: option.presetId }
          : { kind: 'block', blockData: option.blockData! },
        itemTitle: option.title,
        reason: safety.reason
      });
      return;
    }

    if (option.presetId) {
      insertStructuralSection(targetPageId, option.presetId);
    } else if (option.blockData) {
      addBlock(targetPageId, option.blockData);
    }
  };

  const filtered = SIDEBAR_BLOCK_ITEMS.filter((item) => {
    const matchesCat = activeCategory === 'all' || item.category === activeCategory;
    const q = search.toLowerCase().trim();
    const matchesSearch =
      !q ||
      item.title.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.badge.toLowerCase().includes(q);

    return matchesCat && matchesSearch;
  });

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden text-xs select-none bg-slate-50/50 relative">
      {/* Floating Tooltip Hover Preview */}
      <BlockHoverTooltip
        item={hoveredItem}
        position={tooltipPos}
        targetPageNumber={pageNumber}
      />

      {/* Barra de Filtros e Busca Rápida */}
      <div className="p-2.5 border-b border-slate-200 bg-white space-y-2 flex-shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveCategory('all')}
            className={`flex-1 py-1 text-[11px] font-bold rounded-none transition-colors ${
              activeCategory === 'all'
                ? 'bg-[#003366] text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setActiveCategory('headers')}
            className={`flex-1 py-1 text-[11px] font-bold rounded-none transition-colors ${
              activeCategory === 'headers'
                ? 'bg-[#003366] text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Covers
          </button>
          <button
            onClick={() => setActiveCategory('tables')}
            className={`flex-1 py-1 text-[11px] font-bold rounded-none transition-colors ${
              activeCategory === 'tables'
                ? 'bg-[#003366] text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Tables
          </button>
          <button
            onClick={() => setActiveCategory('structures')}
            className={`flex-1 py-1 text-[11px] font-bold rounded-none transition-colors ${
              activeCategory === 'structures'
                ? 'bg-[#003366] text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Blocks
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search blocks, tables, covers..."
            className="w-full pl-8 pr-3 py-1 bg-slate-50 border border-slate-300 rounded-none text-xs focus:bg-white focus:outline-none focus:border-[#003366]"
          />
        </div>
      </div>

      {/* Lista Dinâmica de Itens com Preview no Hover */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2">
        <p className="text-[10px] text-slate-400 font-mono px-1">
          Passe o mouse para ver o preview e clique para inserir na Folha {pageNumber}:
        </p>

        {filtered.map((item) => {
          const Icon = item.icon;

          return (
            <div
              key={item.id}
              onClick={() => handleInsert(item)}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setTooltipPos({ x: rect.right, y: rect.top });
                setHoveredItem(item);
              }}
              onMouseLeave={() => {
                setHoveredItem(null);
                setTooltipPos(null);
              }}
              className="p-2.5 bg-white border border-slate-200 hover:border-[#003366] hover:bg-blue-50/40 rounded-xl cursor-pointer transition-all shadow-2xs flex items-center justify-between group"
            >
              <div className="flex items-center gap-2.5 flex-1 min-w-0 pr-2">
                <div className="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-[#003366] text-slate-700 group-hover:text-white flex items-center justify-center flex-shrink-0 transition-colors">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h4 className="font-bold text-xs text-slate-900 group-hover:text-[#003366] truncate">
                      {item.title}
                    </h4>
                  </div>
                  <span className="text-[10px] text-slate-500 line-clamp-1">
                    {item.description}
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="px-2 py-1 bg-[#003366] group-hover:bg-[#002244] text-white rounded text-[10px] font-bold flex items-center gap-1 flex-shrink-0 shadow-2xs transition-colors"
              >
                <Plus className="w-3 h-3" />
                <span>+ Inserir</span>
              </button>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="py-12 text-center text-slate-400 text-xs bg-white rounded-lg border border-dashed border-slate-200">
            Nenhum bloco encontrado.
          </div>
        )}
      </div>

      <PageInsertionSafetyModal
        isOpen={pendingInsertion !== null}
        reason={pendingInsertion?.reason}
        itemTitle={pendingInsertion?.itemTitle}
        onConfirmNewPage={() => {
          if (pendingInsertion) {
            insertContentOnNewPageAfter(pendingInsertion.sourcePageId, pendingInsertion.spec);
            setPendingInsertion(null);
          }
        }}
        onCancel={() => {
          setPendingInsertion(null);
        }}
      />
    </div>
  );
};
