import React, { useState, useRef, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Table as TableIcon,
  Layers,
  Building2,
  ChevronDown,
  Maximize2
} from 'lucide-react';
import { useCatalogStore } from '../../stores/useCatalogStore';
import { usePresenceStore } from '../../stores/usePresenceStore';
import { CatalogPage, ContentBlock } from '../../domain/catalog.schema';
import { TextBlock } from './blocks/TextBlock';
import { ImageBlock } from './blocks/ImageBlock';
import { BoxBlock } from './blocks/BoxBlock';
import { TechnicalTableBlock } from './blocks/TechnicalTableBlock';
import { HeroBannerBlock } from './blocks/HeroBannerBlock';
import { FeaturesListBlock } from './blocks/FeaturesListBlock';
import { ElectricalTableBlock } from './blocks/ElectricalTableBlock';
import { AccessoriesTableBlock } from './blocks/AccessoriesTableBlock';
import { OrderingCodesBlock } from './blocks/OrderingCodesBlock';
import { ImageGalleryBlock } from './blocks/ImageGalleryBlock';
import { ContactFooterBlock } from './blocks/ContactFooterBlock';
import { CustomTableBlock } from './blocks/CustomTableBlock';
import { AdditelTwoColBlock } from './blocks/AdditelTwoColBlock';
import { FlukeHeaderBlock } from './blocks/FlukeHeaderBlock';
import { InsertsVisualBlock } from './blocks/InsertsVisualBlock';
import { MultiModeCalibratorBlock } from './blocks/MultiModeCalibratorBlock';
import { FullPageCoverBlock } from './blocks/FullPageCoverBlock';
import { BottomHeaderBlock } from './blocks/BottomHeaderBlock';
import { MatrixSpecTableBlock } from './blocks/MatrixSpecTableBlock';
import { SoftwareConnectivityBlock } from './blocks/SoftwareConnectivityBlock';
import { StructuralSectionBlock } from './blocks/StructuralSectionBlock';
import { StructuralSectionInteractionFrame } from './frames/StructuralSectionInteractionFrame';
import { BlockHoverTooltip, HoverTooltipItem, TooltipPosition } from './BlockHoverTooltip';
import { PrintStringRegistry } from '../../translation/print-strings.registry';
import { PrintLocalizationProvider } from '../../translation/PrintLocalizationContext';
import {
  STRUCTURAL_SECTION_PRESETS,
  createStructuralSectionFromPreset
} from '../../domain/structural-presets';
import { getCanonicalPagePaddingCss } from '../../domain/page-geometry';

interface BlockMenuOption extends HoverTooltipItem {
  blockData?: Omit<ContentBlock, 'id'>;
  presetId?: string;
}

export const A4Canvas: React.FC = () => {
  const {
    currentCatalog,
    selectedBlockId,
    selectedChildId,
    setSelectedBlockId,
    selectEditorElement,
    setActivePageIndex,
    addBlock,
    insertStructuralSection,
    addPage,
    removePage
  } = useCatalogStore();

  const getParticipantsOnBlock = usePresenceStore((state) => state.getParticipantsOnBlock);
  const [activeMenuPageId, setActiveMenuPageId] = useState<string | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<'headers' | 'tables' | 'structures' | null>(null);
  const [hoveredTooltip, setHoveredTooltip] = useState<HoverTooltipItem | null>(null);
  const [tooltipPos, setTooltipPos] = useState<TooltipPosition | null>(null);
  const [autoFitPages, setAutoFitPages] = useState<Record<string, boolean>>({});

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScrollRef = useRef<boolean>(false);
  const programmaticScrollTimerRef = useRef<any>(null);
  const locationBroadcastTimerRef = useRef<any>(null);

  // Listener para scroll programático disparado pela thumbnail
  useEffect(() => {
    const handleProgrammaticScrollStart = () => {
      isProgrammaticScrollRef.current = true;
      if (programmaticScrollTimerRef.current) {
        clearTimeout(programmaticScrollTimerRef.current);
      }
      programmaticScrollTimerRef.current = setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 750);
    };

    window.addEventListener('presys:programmatic-page-scroll', handleProgrammaticScrollStart);
    return () => {
      window.removeEventListener('presys:programmatic-page-scroll', handleProgrammaticScrollStart);
      if (programmaticScrollTimerRef.current) clearTimeout(programmaticScrollTimerRef.current);
    };
  }, []);

  // IntersectionObserver para seguir o scroll do usuário
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !currentCatalog?.pages?.length) return;

    const pageElements = container.querySelectorAll<HTMLElement>('[data-page-index]');
    if (!pageElements.length) return;

    const entriesMap = new Map<number, IntersectionObserverEntry>();

    const observer = new IntersectionObserver(
      (entries) => {
        if (isProgrammaticScrollRef.current) return;

        entries.forEach((entry) => {
          const idx = Number(entry.target.getAttribute('data-page-index'));
          if (!isNaN(idx)) {
            entriesMap.set(idx, entry);
          }
        });

        const containerRect = container.getBoundingClientRect();
        const containerCenterY = containerRect.top + containerRect.height / 2;

        let bestIndex = -1;
        let minDistanceToCenter = Infinity;
        let maxIntersectionRatio = 0;

        entriesMap.forEach((entry, idx) => {
          if (entry.isIntersecting || entry.intersectionRatio > 0) {
            const rect = entry.boundingClientRect;
            const pageCenterY = rect.top + rect.height / 2;
            const distanceToCenter = Math.abs(pageCenterY - containerCenterY);

            if (
              distanceToCenter < minDistanceToCenter ||
              (Math.abs(distanceToCenter - minDistanceToCenter) < 40 && entry.intersectionRatio > maxIntersectionRatio)
            ) {
              minDistanceToCenter = distanceToCenter;
              maxIntersectionRatio = entry.intersectionRatio;
              bestIndex = idx;
            }
          }
        });

        if (bestIndex >= 0 && bestIndex !== useCatalogStore.getState().activePageIndex) {
          const currentIdx = useCatalogStore.getState().activePageIndex;
          const currentEntry = entriesMap.get(currentIdx);
          
          let shouldSwitch = true;
          if (currentEntry && currentEntry.isIntersecting) {
            const currentCenterY = currentEntry.boundingClientRect.top + currentEntry.boundingClientRect.height / 2;
            const currentDist = Math.abs(currentCenterY - containerCenterY);
            if (minDistanceToCenter > currentDist - 30 && maxIntersectionRatio < (currentEntry.intersectionRatio + 0.1)) {
              shouldSwitch = false;
            }
          }

          if (shouldSwitch) {
            setActivePageIndex(bestIndex);

            // Consistência: se o bloco selecionado não pertencer à nova página, desseleciona
            const { selectedBlockId, setSelectedBlockId, currentCatalog } = useCatalogStore.getState();
            if (selectedBlockId && currentCatalog) {
              const newActivePage = currentCatalog.pages[bestIndex];
              const blockBelongs = newActivePage?.blocks?.some((b) => b.id === selectedBlockId);
              if (!blockBelongs) {
                setSelectedBlockId(null);
              }
            }

            // Notifica Presence com debounce leve (150ms)
            if (locationBroadcastTimerRef.current) {
              clearTimeout(locationBroadcastTimerRef.current);
            }
            locationBroadcastTimerRef.current = setTimeout(() => {
              const cat = useCatalogStore.getState().currentCatalog;
              const newPage = cat?.pages[bestIndex];
              if (newPage) {
                const selBlockId = useCatalogStore.getState().selectedBlockId;
                const selBlock = newPage.blocks?.find((b) => b.id === selBlockId);
                usePresenceStore.getState().trackLocation(
                  bestIndex + 1,
                  newPage.id,
                  selBlock ? selBlockId : null,
                  selBlock ? selBlock.type : null
                );
              }
            }, 150);
          }
        }
      },
      {
        root: container,
        threshold: [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1.0]
      }
    );

    pageElements.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
      if (locationBroadcastTimerRef.current) {
        clearTimeout(locationBroadcastTimerRef.current);
      }
    };
  }, [currentCatalog?.pages?.length, setActivePageIndex]);

  if (!currentCatalog || currentCatalog.pages.length === 0) return null;

  const handleSelectMenuOption = (pageId: string, opt: BlockMenuOption) => {
    if (opt.presetId) {
      insertStructuralSection(pageId, opt.presetId);
    } else if (opt.blockData) {
      addBlock(pageId, opt.blockData as any);
    }
    setActiveDropdown(null);
    setActiveMenuPageId(null);
    setHoveredTooltip(null);
  };

  const handleToggleAutoFit = (pageId: string) => {
    setAutoFitPages((prev) => ({
      ...prev,
      [pageId]: !prev[pageId]
    }));
  };

  // --- 1. CAPAS & HEADERS ---
  const HEADER_OPTIONS: BlockMenuOption[] = [
    {
      id: 'full-cover',
      title: 'Capa Editorial A4 Completa (Full Page Hero)',
      categoryLabel: 'Capa Inteira A4',
      badge: 'Full Page A4',
      description: 'Capa A4 de alto impacto visual com grande fotografia, selos de calibração RBC, badges e rodapé.',
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
      id: 'hero-presys',
      title: 'Header Presys Industrial (Degradê Azul)',
      categoryLabel: 'Header Topo',
      badge: 'Clássico Presys',
      description: 'Degradê azul marinho corporativo, selo metrológico superior e fotografia do equipamento.',
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
      id: 'additel-hero',
      title: 'Header Dual-Column Presys (Destaques Laterais)',
      categoryLabel: 'Header Topo',
      badge: 'Dual Column',
      description: 'Foto à esquerda e 7 bullets de diferenciais com checkmarks azuis à direita.',
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
      id: 'fluke-header',
      title: 'Header Presys Metrologia (Tarja Amarela)',
      categoryLabel: 'Header Topo',
      badge: 'Série T',
      description: 'Tarja amarela metrológica, fotografia do bloco seco e caixa de destaques técnicos.',
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
      id: 'bottom-header',
      title: 'Header Inferior / Rodapé de Destaque',
      categoryLabel: 'Header Base',
      badge: 'Posição Base',
      description: 'Destaque corporativo posicionado no rodapé da folha com dados de contato e certificados.',
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
    }
  ];

  // --- 2. TABELAS TÉCNICAS ---
  const TABLE_OPTIONS: BlockMenuOption[] = [
    {
      id: 'tbl-products',
      title: 'Tabela de Produtos Presys Oficial',
      categoryLabel: 'Tabela Técnica',
      badge: 'Biblioteca Oficial',
      description: 'Tabela técnica com código, modelo, faixa, unidade e exatidão conectada à biblioteca oficial.',
      blockData: {
        type: 'table',
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
            type: 'table',
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
      id: 'tbl-matrix',
      title: 'Matriz Comparativa de Modelos & Faixas',
      categoryLabel: 'Tabela Matricial',
      badge: 'Comparativo',
      description: 'Matriz lado a lado comparando faixas, exatidão, estabilidade e recursos por modelo.',
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
      id: 'tbl-elec',
      title: 'Tabela de Sinais Elétricos & Loop',
      categoryLabel: 'Tabela Elétrica',
      badge: '4-20mA & Loop',
      description: 'Loop 24V, HART 7, RTD, termopares, isolação galvânica e impedância de carga.',
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
      id: 'tbl-accessories',
      title: 'Tabela de Acessórios & Opcionais',
      categoryLabel: 'Tabela Acessórios',
      badge: 'Acessórios',
      description: 'Manifolds de 2/3 vias, mangueiras de alta pressão, adaptadores e maletas de proteção.',
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
      id: 'tbl-ordering',
      title: 'Código de Encomenda (Part Number)',
      categoryLabel: 'Configurador',
      badge: 'Part Number',
      description: 'Estrutura visual configurável para código de encomenda de produtos e opcionais.',
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
    }
  ];

  // --- 3. ESTRUTURAS VISUAIS & DESTAQUES ---
  const STRUCTURE_OPTIONS: BlockMenuOption[] = [
    {
      id: 'str-multimode',
      title: 'Sistema Multifunção (4 Modos de Calibração)',
      categoryLabel: 'Estrutura 4 Modos',
      badge: 'Multifunção',
      description: 'Grid visual com 4 modos de calibração térmica com badges, emojis e descrições editáveis.',
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
      id: 'str-inserts',
      title: 'Insertos Circulares & Furações Padronizadas',
      categoryLabel: 'Diagrama Gráfico',
      badge: 'Insertos Gráficos',
      description: 'Círculos com furações técnicas e tabela de part numbers compatíveis por modelo.',
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
      id: 'str-software',
      title: 'Software ISOPLAN & Conectividade 4.0',
      categoryLabel: 'Software & LAN',
      badge: 'Indústria 4.0',
      description: 'Cartões para software de calibração ISOPLAN, protocolo HART/Modbus, USB e datalogger.',
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
      id: 'str-gallery',
      title: 'Galeria de Fotos em Campo & Bancada',
      categoryLabel: 'Galeria Fotográfica',
      badge: 'Fotos em Campo',
      description: 'Grid com fotografias de aplicação real, legendas e botões diretos de upload local.',
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
      id: 'str-features',
      title: 'Recursos Técnicos com Checkmarks',
      categoryLabel: 'Lista Destaques',
      badge: 'Checkmarks',
      description: 'Lista de diferenciais de engenharia com ícones e checkmarks azuis corporativos.',
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
      id: 'str-footer',
      title: 'Rodapé Corporativo & Certificações Presys',
      categoryLabel: 'Rodapé',
      badge: 'Contatos Presys',
      description: 'Rodapé oficial com telefones, website, e-mail de vendas e selo de calibração RBC.',
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
      id: preset.id,
      title: preset.label,
      categoryLabel: 'Seção Estrutural',
      badge: preset.badge || 'Estrutural',
      description: preset.description,
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

  return (
    <PrintLocalizationProvider locale={currentCatalog?.locale || 'pt-BR'} localizedSystemStrings={currentCatalog?.localizedSystemStrings}>
      <div
        ref={scrollContainerRef}
        id="canvas-scroll-container"
        className="flex-1 min-h-0 h-full overflow-y-auto p-8 flex flex-col items-center bg-[#E2E8F0] space-y-10 scroll-smooth select-none relative a4-canvas-scroll-area"
      onClick={() => {
        setSelectedBlockId(null);
        setActiveDropdown(null);
        setActiveMenuPageId(null);
        setHoveredTooltip(null);
      }}
    >
      {/* Floating Tooltip Hover Preview de Alta Resolução */}
      <BlockHoverTooltip
        item={hoveredTooltip}
        position={tooltipPos}
        targetPageNumber={
          currentCatalog.pages.find((p) => p.id === activeMenuPageId)?.pageNumber || 1
        }
      />

      {currentCatalog.pages.map((page: CatalogPage, pageIndex: number) => {
        const isAutoFit = autoFitPages[page.id] ?? true;
        const blockCount = (page.blocks || []).length;
        const isSingleFullCover = blockCount === 1 && page.blocks[0]?.type === 'full_page_cover';
        const isMenuOpenForThisPage = activeMenuPageId === page.id;

        return (
          <div
            key={page.id}
            id={`page-container-${page.id}`}
            data-page-index={pageIndex}
            data-page-id={page.id}
            className="flex flex-col items-center space-y-2 flex-shrink-0 print:m-0 print:p-0 print:space-y-0"
          >
            {/* Barra Técnica Superior da Folha no Meio com Menus e Hover Tooltip (Oculta na Impressão) */}
            <div
              className="w-[794px] bg-white px-3.5 py-2 rounded-t border border-slate-300 flex items-center justify-between z-20 text-xs shadow-xs relative no-print"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2.5">
                <span className="px-2 py-0.5 bg-[#003366] text-white rounded text-[10px] font-mono font-bold">
                  FOLHA {page.pageNumber} DE {currentCatalog.pages.length}
                </span>
                <span className="text-xs font-bold text-slate-800">
                  {page.title || `Página ${page.pageNumber}`}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  (210 mm × 297 mm)
                </span>
              </div>

              {/* Botões Centrais Rápidos com Dropdown List e Tooltips de Preview */}
              <div className="flex items-center gap-1.5">
                {/* 1. Menu Capas & Headers */}
                <div className="relative">
                  <button
                    onClick={() => {
                      setActiveMenuPageId(page.id);
                      setActiveDropdown(activeDropdown === 'headers' && isMenuOpenForThisPage ? null : 'headers');
                    }}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded border transition-colors shadow-2xs ${
                      isMenuOpenForThisPage && activeDropdown === 'headers'
                        ? 'bg-[#003366] text-white border-[#003366]'
                        : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-300'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5 text-blue-700" />
                    <span>+ Capas & Headers</span>
                    <ChevronDown className="w-3 h-3 text-slate-400" />
                  </button>

                  {isMenuOpenForThisPage && activeDropdown === 'headers' && (
                    <div className="absolute left-0 top-full mt-1.5 w-72 bg-white border-2 border-[#003366] rounded-xl shadow-2xl p-1.5 z-50 space-y-1 text-left animate-in fade-in zoom-in-95">
                      <div className="p-1 text-[9px] font-bold text-slate-400 uppercase font-mono border-b border-slate-100">
                        Capas e Cabeçalhos (Passe o mouse para preview)
                      </div>
                      {HEADER_OPTIONS.map((opt) => (
                        <div
                          key={opt.id}
                          onClick={() => handleSelectMenuOption(page.id, opt)}
                          onMouseEnter={(e) => {
                            const rowRect = e.currentTarget.getBoundingClientRect();
                            const dropdownMenu = e.currentTarget.parentElement?.getBoundingClientRect();
                            setTooltipPos({
                              x: dropdownMenu ? dropdownMenu.right : rowRect.right,
                              y: rowRect.top,
                              menuLeft: dropdownMenu ? dropdownMenu.left : rowRect.left
                            });
                            setHoveredTooltip(opt);
                          }}
                          onMouseLeave={() => setHoveredTooltip(null)}
                          className="p-2 hover:bg-blue-50/70 rounded-lg cursor-pointer transition-colors flex items-center justify-between group"
                        >
                          <div className="min-w-0 pr-1">
                            <p className="font-bold text-slate-900 text-xs group-hover:text-[#003366] truncate">
                              {opt.title}
                            </p>
                            <p className="text-[10px] text-slate-500 line-clamp-1">{opt.description}</p>
                          </div>
                          <span className="text-[8px] bg-blue-100 text-[#003366] font-bold px-1.5 py-0.5 rounded font-mono shrink-0">
                            {opt.badge}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. Menu Tabelas Técnicas */}
                <div className="relative">
                  <button
                    onClick={() => {
                      setActiveMenuPageId(page.id);
                      setActiveDropdown(activeDropdown === 'tables' && isMenuOpenForThisPage ? null : 'tables');
                    }}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded border transition-colors shadow-2xs ${
                      isMenuOpenForThisPage && activeDropdown === 'tables'
                        ? 'bg-[#003366] text-white border-[#003366]'
                        : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-300'
                    }`}
                  >
                    <TableIcon className="w-3.5 h-3.5 text-[#003366]" />
                    <span>+ Tabelas</span>
                    <ChevronDown className="w-3 h-3 text-slate-400" />
                  </button>

                  {isMenuOpenForThisPage && activeDropdown === 'tables' && (
                    <div className="absolute left-0 top-full mt-1.5 w-72 bg-white border-2 border-[#003366] rounded-xl shadow-2xl p-1.5 z-50 space-y-1 text-left animate-in fade-in zoom-in-95">
                      <div className="p-1 text-[9px] font-bold text-slate-400 uppercase font-mono border-b border-slate-100">
                        Tabelas Metrológicas (Passe o mouse para preview)
                      </div>
                      {TABLE_OPTIONS.map((opt) => (
                        <div
                          key={opt.id}
                          onClick={() => handleSelectMenuOption(page.id, opt)}
                          onMouseEnter={(e) => {
                            const rowRect = e.currentTarget.getBoundingClientRect();
                            const dropdownMenu = e.currentTarget.parentElement?.getBoundingClientRect();
                            setTooltipPos({
                              x: dropdownMenu ? dropdownMenu.right : rowRect.right,
                              y: rowRect.top,
                              menuLeft: dropdownMenu ? dropdownMenu.left : rowRect.left
                            });
                            setHoveredTooltip(opt);
                          }}
                          onMouseLeave={() => setHoveredTooltip(null)}
                          className="p-2 hover:bg-blue-50/70 rounded-lg cursor-pointer transition-colors flex items-center justify-between group"
                        >
                          <div className="min-w-0 pr-1">
                            <p className="font-bold text-slate-900 text-xs group-hover:text-[#003366] truncate">
                              {opt.title}
                            </p>
                            <p className="text-[10px] text-slate-500 line-clamp-1">{opt.description}</p>
                          </div>
                          <span className="text-[8px] bg-blue-100 text-[#003366] font-bold px-1.5 py-0.5 rounded font-mono shrink-0">
                            {opt.badge}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. Menu Estruturas & Destaques */}
                <div className="relative">
                  <button
                    onClick={() => {
                      setActiveMenuPageId(page.id);
                      setActiveDropdown(activeDropdown === 'structures' && isMenuOpenForThisPage ? null : 'structures');
                    }}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded border transition-colors shadow-2xs ${
                      isMenuOpenForThisPage && activeDropdown === 'structures'
                        ? 'bg-[#003366] text-white border-[#003366]'
                        : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-300'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5 text-purple-700" />
                    <span>+ Estruturas</span>
                    <ChevronDown className="w-3 h-3 text-slate-400" />
                  </button>

                  {isMenuOpenForThisPage && activeDropdown === 'structures' && (
                    <div className="absolute left-0 top-full mt-1.5 w-72 bg-white border-2 border-[#003366] rounded-xl shadow-2xl p-1.5 z-50 space-y-1 text-left animate-in fade-in zoom-in-95">
                      <div className="p-1 text-[9px] font-bold text-slate-400 uppercase font-mono border-b border-slate-100">
                        Estruturas & Recursos (Passe o mouse para preview)
                      </div>
                      {STRUCTURE_OPTIONS.map((opt) => (
                        <div
                          key={opt.id}
                          onClick={() => handleSelectMenuOption(page.id, opt)}
                          onMouseEnter={(e) => {
                            const rowRect = e.currentTarget.getBoundingClientRect();
                            const dropdownMenu = e.currentTarget.parentElement?.getBoundingClientRect();
                            setTooltipPos({
                              x: dropdownMenu ? dropdownMenu.right : rowRect.right,
                              y: rowRect.top,
                              menuLeft: dropdownMenu ? dropdownMenu.left : rowRect.left
                            });
                            setHoveredTooltip(opt);
                          }}
                          onMouseLeave={() => setHoveredTooltip(null)}
                          className="p-2 hover:bg-blue-50/70 rounded-lg cursor-pointer transition-colors flex items-center justify-between group"
                        >
                          <div className="min-w-0 pr-1">
                            <p className="font-bold text-slate-900 text-xs group-hover:text-[#003366] truncate">
                              {opt.title}
                            </p>
                            <p className="text-[10px] text-slate-500 line-clamp-1">{opt.description}</p>
                          </div>
                          <span className="text-[8px] bg-blue-100 text-[#003366] font-bold px-1.5 py-0.5 rounded font-mono shrink-0">
                            {opt.badge}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 4. Alternador de Preenchimento Inteligente A4 */}
                <button
                  onClick={() => handleToggleAutoFit(page.id)}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-none border transition-colors shadow-2xs ${
                    isAutoFit
                      ? 'bg-blue-50 text-blue-900 border-blue-300'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                  title="Adjusts vertical spacing to fill the 297mm A4 sheet harmoniously"
                >
                  <Maximize2 className="w-3 h-3 text-[#003366]" />
                  <span>{isAutoFit ? 'Auto-Fit Active' : 'Auto-Fit Off'}</span>
                </button>

                {/* Excluir Folha */}
                {currentCatalog.pages.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removePage(page.id);
                    }}
                    className="p-1 text-slate-400 hover:text-red-600 rounded-none transition-colors ml-1"
                    title="Delete this A4 page"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Régua Milimétrica Superior (Oculta na Impressão) */}
            <div className="w-[794px] h-3.5 bg-slate-200 border-l border-r border-t border-slate-300 flex items-center justify-between px-2 text-[8px] font-mono text-slate-500 select-none no-print">
              <span>0 mm</span>
              <span>50 mm</span>
              <span>100 mm</span>
              <span>150 mm</span>
              <span>210 mm (A4 Width)</span>
            </div>

            {/* Folha A4 WYSIWYG Milimétrica com Suporte a Preenchimento Integral */}
            <div
              className={`a4-page-container flex flex-col ${isAutoFit && !isSingleFullCover ? 'justify-between' : ''}`}
              style={{ padding: getCanonicalPagePaddingCss(isSingleFullCover) }}
              onClick={(e) => {
                e.stopPropagation();
                setActivePageIndex(pageIndex);
                selectEditorElement({ blockId: null, childId: null });
              }}
            >
              {/* Cabeçalho Técnico da Folha (Editor-only chrome / Oculto se for Capa Full Page) */}
              {!isSingleFullCover && (
                <div className="no-print editor-only flex items-center justify-between pb-2 border-b border-slate-300 text-[10px] text-slate-400 font-mono flex-shrink-0">
                  <span className="font-semibold text-slate-600">
                    PRESYS INSTRUMENTS & SYSTEMS — CATALOG STUDIO
                  </span>
                  <span>
                    <span data-print-string-key="page_label">
                      {PrintStringRegistry.get('page_label', currentCatalog.locale || 'pt-BR')}
                    </span>{' '}
                    {page.pageNumber}{' '}
                    <span data-print-string-key="of_label">
                      {PrintStringRegistry.get('of_label', currentCatalog.locale || 'pt-BR')}
                    </span>{' '}
                    {currentCatalog.pages.length}
                  </span>
                </div>
              )}

              {/* Área de Conteúdo com Distribuição Inteligente de Altura */}
              <div
                className={`flex-1 ${
                  isSingleFullCover ? 'p-0 h-full w-full' : 'py-3'
                } flex flex-col ${
                  isAutoFit && !isSingleFullCover && blockCount > 1
                    ? 'justify-between space-y-4'
                    : isSingleFullCover
                    ? 'space-y-0'
                    : 'space-y-3'
                }`}
              >
                {(page.blocks || []).map((block, blockIndex) => {
                  const isSelected = block.id === selectedBlockId;
                  const remoteOnBlock = getParticipantsOnBlock(block.id);
                  const hasRemote = remoteOnBlock.length > 0;
                  const primaryRemote = remoteOnBlock[0];

                  return (
                    <div
                      key={block.id}
                      data-block-id={block.id}
                      data-block-type={block.type}
                      onClick={() => {
                        setActivePageIndex(pageIndex);
                        selectEditorElement({ blockId: block.id, childId: null });
                      }}
                      className={`relative ${
                        isSingleFullCover
                          ? 'h-full w-full'
                          : isAutoFit && blockCount === 1
                          ? 'my-auto'
                          : ''
                      }`}
                      style={
                        hasRemote
                          ? {
                              outline: `2px dashed ${primaryRemote.color}`,
                              outlineOffset: '2px'
                            }
                          : undefined
                      }
                    >
                      {/* Overlay de Presença e Awareness do Bloco (Oculto no PDF / Editor-Only) */}
                      {hasRemote && (
                        <div
                          className="no-print editor-only absolute -top-3.5 right-3 z-30 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9.5px] font-bold text-white shadow-md pointer-events-auto transition-all duration-150 cursor-default"
                          style={{ backgroundColor: primaryRemote.color }}
                          title={
                            remoteOnBlock.length > 1
                              ? remoteOnBlock.map((r) => `${r.displayLabel} (${r.activity === 'editing' ? 'editando' : 'aqui'})`).join(', ')
                              : `${primaryRemote.displayLabel} (${primaryRemote.activity === 'editing' ? 'editando' : 'aqui'})`
                          }
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                          <span>
                            {primaryRemote.displayLabel}{' '}
                            {primaryRemote.activity === 'editing' ? 'editando' : 'aqui'}
                          </span>
                          {remoteOnBlock.length > 1 && (
                            <span className="bg-black/25 px-1.5 py-0.2 rounded-full text-[8.5px]">
                              +{remoteOnBlock.length - 1}
                            </span>
                          )}
                        </div>
                      )}

                      {block.type === 'full_page_cover' && (
                        <FullPageCoverBlock block={block} pageId={page.id} isSelected={isSelected} />
                      )}
                      {block.type === 'bottom_header' && (
                        <BottomHeaderBlock block={block} pageId={page.id} isSelected={isSelected} />
                      )}
                      {block.type === 'matrix_spec_table' && (
                        <MatrixSpecTableBlock block={block} pageId={page.id} isSelected={isSelected} />
                      )}
                      {block.type === 'software_connectivity' && (
                        <SoftwareConnectivityBlock block={block} pageId={page.id} isSelected={isSelected} />
                      )}
                      {block.type === 'structural_section' && (
                        <StructuralSectionInteractionFrame
                          block={block}
                          pageId={page.id}
                          pageIndex={pageIndex}
                          blockIndex={blockIndex}
                          totalBlocks={page.blocks?.length || 0}
                          isSelected={isSelected}
                          selectedChildId={isSelected ? selectedChildId : null}
                          onSelectSection={() => {
                            setActivePageIndex(pageIndex);
                            selectEditorElement({ blockId: block.id, childId: null });
                          }}
                          onSelectCard={(childId) => {
                            setActivePageIndex(pageIndex);
                            selectEditorElement({ blockId: block.id, childId });
                          }}
                        />
                      )}
                      {block.type === 'hero_banner' && (
                        <HeroBannerBlock block={block} pageId={page.id} isSelected={isSelected} />
                      )}
                      {block.type === 'additel_two_col_hero' && (
                        <AdditelTwoColBlock block={block} pageId={page.id} isSelected={isSelected} />
                      )}
                      {block.type === 'fluke_header' && (
                        <FlukeHeaderBlock block={block} pageId={page.id} isSelected={isSelected} />
                      )}
                      {block.type === 'inserts_visual' && (
                        <InsertsVisualBlock block={block} pageId={page.id} isSelected={isSelected} />
                      )}
                      {block.type === 'multi_mode_calibrator' && (
                        <MultiModeCalibratorBlock block={block} pageId={page.id} isSelected={isSelected} />
                      )}
                      {block.type === 'features_list' && (
                        <FeaturesListBlock block={block} pageId={page.id} isSelected={isSelected} />
                      )}
                      {block.type === 'table' && (
                        <TechnicalTableBlock block={block} pageId={page.id} isSelected={isSelected} />
                      )}
                      {block.type === 'electrical_table' && (
                        <ElectricalTableBlock block={block} pageId={page.id} isSelected={isSelected} />
                      )}
                      {block.type === 'accessories_table' && (
                        <AccessoriesTableBlock block={block} pageId={page.id} isSelected={isSelected} />
                      )}
                      {block.type === 'ordering_codes' && (
                        <OrderingCodesBlock block={block} pageId={page.id} isSelected={isSelected} />
                      )}
                      {block.type === 'image_gallery' && (
                        <ImageGalleryBlock block={block} pageId={page.id} isSelected={isSelected} />
                      )}
                      {block.type === 'contact_footer' && (
                        <ContactFooterBlock block={block} pageId={page.id} isSelected={isSelected} />
                      )}
                      {block.type === 'custom_table' && (
                        <CustomTableBlock block={block} pageId={page.id} isSelected={isSelected} />
                      )}
                      {block.type === 'text' && (
                        <TextBlock block={block} pageId={page.id} isSelected={isSelected} />
                      )}
                      {block.type === 'image' && (
                        <ImageBlock block={block} pageId={page.id} isSelected={isSelected} />
                      )}
                      {block.type === 'box' && (
                        <BoxBlock block={block} pageId={page.id} isSelected={isSelected} />
                      )}
                    </div>
                  );
                })}

                {(!page.blocks || page.blocks.length === 0) && (
                  <div
                    onClick={() => {
                      setActiveMenuPageId(page.id);
                      setActiveDropdown('headers');
                    }}
                    className="h-72 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 hover:border-[#003366] hover:bg-blue-50/20 rounded-none text-slate-400 hover:text-[#003366] text-xs cursor-pointer transition-all p-6 text-center"
                  >
                    <Plus className="w-8 h-8 mb-2 text-[#003366]" />
                    <span className="font-bold text-slate-800 text-sm">This A4 page is empty</span>
                    <span className="text-[11px] text-slate-500 mt-1">
                      Use '+ Covers', '+ Tables' or '+ Blocks' in the toolbar to insert elements.
                    </span>
                  </div>
                )}
              </div>

              {/* Rodapé Técnico da Folha (Oculto se for Capa Full Page) */}
              {!isSingleFullCover && (
                <div className="pt-2 border-t border-slate-300 flex items-center justify-between text-[9px] text-slate-400 font-mono flex-shrink-0">
                  <span>PRESYS Instruments & Systems — Specifications subject to change without notice</span>
                  <span>Page {page.pageNumber}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Botão de Adicionar Folha A4 */}
      <div className="w-[794px] py-4 flex items-center justify-center">
        <button
          onClick={() => addPage('technical')}
          className="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs rounded-none border border-slate-300 shadow-xs hover:border-[#003366] transition-all"
        >
          <Plus className="w-4 h-4 text-[#003366]" />
          <span>Insert New A4 Page</span>
        </button>
      </div>
    </div>
    </PrintLocalizationProvider>
  );
};
