import React, { useState } from 'react';
import {
  X,
  Search,
  Table as TableIcon,
  Layers,
  LayoutTemplate,
  Building2
} from 'lucide-react';
import { ContentBlock, BlockType } from '../../domain/catalog.schema';

interface BlockTemplateOption {
  id: string;
  type: BlockType;
  title: string;
  category: 'headers' | 'tables' | 'structures';
  description: string;
  badge?: string;
  defaultConfig: Partial<ContentBlock>;
  previewRenderer: () => React.ReactNode;
}

interface BlockInsertionModalProps {
  isOpen: boolean;
  targetPageId: string | null;
  targetPageNumber: number;
  onClose: () => void;
  onSelectBlock: (pageId: string, blockData: Partial<ContentBlock>) => void;
}

export const BlockInsertionModal: React.FC<BlockInsertionModalProps> = ({
  isOpen,
  targetPageId,
  targetPageNumber,
  onClose,
  onSelectBlock
}) => {
  const [activeCategory, setActiveCategory] = useState<'all' | 'headers' | 'tables' | 'structures'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen || !targetPageId) return null;

  const TEMPLATES: BlockTemplateOption[] = [
    // --- CAPAS & HEADERS ---
    {
      id: 'tpl-full-cover',
      type: 'full_page_cover',
      title: 'Capa Editorial A4 Completa (Full Page Hero)',
      category: 'headers',
      badge: 'Capa Inteira A4',
      description: 'Capa A4 de alto impacto com foto grande, badges metrológicos, selo RBC e rodapé integrado.',
      defaultConfig: {
        type: 'full_page_cover',
        title: 'PCON-Y18-LP / SÉRIE CALIBRADORES',
        subtitle: 'Calibrador Automático de Pressão de Alta Estabilidade para Laboratório e Campo',
        badgeText: 'CALIBRAÇÃO RBC · ISO/IEC 17025'
      },
      previewRenderer: () => (
        <div className="w-full h-32 bg-gradient-to-b from-slate-900 to-blue-950 rounded-lg p-2.5 text-white flex flex-col justify-between text-[9px] shadow-sm border border-slate-700">
          <div className="flex justify-between items-center border-b border-white/20 pb-1">
            <span className="font-extrabold font-mono text-[10px]">PRESYS</span>
            <span className="bg-brand-500/40 text-[7px] px-1 rounded">RBC / ISO 17025</span>
          </div>
          <div className="text-center my-auto">
            <p className="font-black text-[11px] text-white">PCON-Y18-LP</p>
            <p className="text-[7.5px] text-slate-300">Calibrador Automático de Pressão</p>
            <div className="w-16 h-8 bg-slate-800/80 rounded mx-auto my-1 border border-white/20 flex items-center justify-center text-[7px] text-slate-400">
              [ Foto A4 ]
            </div>
          </div>
          <div className="text-[6.5px] text-slate-400 text-center border-t border-white/10 pt-0.5">
            www.presys.com.br
          </div>
        </div>
      )
    },
    {
      id: 'tpl-hero-presys',
      type: 'hero_banner',
      title: 'Header Presys Industrial (Degradê Azul)',
      category: 'headers',
      badge: 'Clássico Presys',
      description: 'Header corporativo com selo metrológico superior, degradê azul marinho e foto lateral do produto.',
      defaultConfig: {
        type: 'hero_banner',
        title: 'Linha Industrial Presys PCON & Série T',
        subtitle: 'Calibradores de processos, transmissores inteligentes e padrões metrológicos de bancada.',
        badgeText: 'PRESYS — INSTRUMENTAÇÃO INDUSTRIAL DE PRECISÃO'
      },
      previewRenderer: () => (
        <div className="w-full h-24 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 rounded-lg p-2.5 text-white flex items-center justify-between text-[9px] shadow-sm border border-slate-700">
          <div className="space-y-1 max-w-[65%]">
            <span className="bg-brand-500/30 text-brand-200 text-[6.5px] font-mono px-1 rounded block w-fit">
              PRESYS INDUSTRIAL
            </span>
            <p className="font-extrabold text-[10px] leading-tight">Presys PCON-Y18</p>
            <p className="text-[7.5px] text-slate-300 line-clamp-2">Calibrador automático até 70 bar.</p>
          </div>
          <div className="w-14 h-14 bg-slate-800 rounded border border-white/20 flex items-center justify-center text-[7px] text-slate-400">
            [ Foto ]
          </div>
        </div>
      )
    },
    {
      id: 'tpl-hero-additel',
      type: 'additel_two_col_hero',
      title: 'Header Dual-Column Presys (Destaques Laterais)',
      category: 'headers',
      badge: 'Dual Column',
      description: 'Layout em duas colunas com fotografia do instrumento à esquerda e 7 bullet points de diferenciais.',
      defaultConfig: {
        type: 'additel_two_col_hero',
        title: 'Presys PCON-Y18 Series',
        subtitle: 'Calibrador Automático de Pressão & Padrão de Calibração',
        badgeText: 'PRESYS Metrology'
      },
      previewRenderer: () => (
        <div className="w-full h-24 bg-white rounded-lg p-2 text-slate-900 flex flex-col justify-between text-[9px] border border-blue-200 shadow-sm">
          <div className="border-b border-blue-500 pb-0.5 flex justify-between items-center">
            <span className="font-bold text-blue-950 text-[9px]">Presys PCON-Y18</span>
            <span className="text-blue-700 font-serif italic text-[7px]">Metrology</span>
          </div>
          <div className="flex gap-2 items-center flex-1 py-1">
            <div className="w-12 h-10 bg-slate-100 rounded border border-slate-200 flex items-center justify-center text-[6.5px] text-slate-500">
              [ Foto ]
            </div>
            <div className="space-y-0.5 text-[7px] text-slate-700 flex-1">
              <p>✓ Geração até 100 bar</p>
              <p>✓ Exatidão 0.01% FE</p>
              <p>✓ Protocolo HART 7</p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'tpl-hero-fluke',
      type: 'fluke_header',
      title: 'Header Presys Metrologia (Tarja Amarela)',
      category: 'headers',
      badge: 'Série T',
      description: 'Header com tarja amarela de calibração, imagem do bloco seco e painel de destaques técnicos.',
      defaultConfig: {
        type: 'fluke_header',
        title: 'Field Metrology Wells / Presys Série T',
        badgeText: 'PRESYS Calibration'
      },
      previewRenderer: () => (
        <div className="w-full h-24 bg-white rounded-lg p-2 text-slate-900 flex flex-col justify-between text-[9px] border border-amber-300 shadow-sm">
          <div className="border-b border-slate-900 pb-0.5 flex justify-between items-center">
            <span className="font-black text-[9px]">Field Metrology Wells</span>
            <span className="bg-[#FFC20E] text-black font-bold text-[7px] px-1 rounded">PRESYS Calibration</span>
          </div>
          <div className="flex gap-2 items-center flex-1 py-1">
            <div className="w-12 h-10 bg-slate-900 rounded flex items-center justify-center text-[6.5px] text-slate-300">
              [ Bloco ]
            </div>
            <div className="bg-[#FFF9E6] p-1 rounded border border-amber-200 flex-1 text-[7px]">
              <span className="font-bold block text-slate-800">Destaques:</span>
              <span>-25 °C a 660 °C em 15 min</span>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'tpl-bottom-header',
      type: 'bottom_header',
      title: 'Header Inferior / Rodapé de Destaque',
      category: 'headers',
      badge: 'Posição Base',
      description: 'Faixa corporativa com resumo metrológico, contatos e certificações para fixar na base da folha.',
      defaultConfig: {
        type: 'bottom_header',
        title: 'PRESYS INSTRUMENTOS & SISTEMAS LTDA',
        subtitle: 'Soluções completas para calibração de pressão, temperatura e sinais de processo.'
      },
      previewRenderer: () => (
        <div className="w-full h-16 bg-gradient-to-r from-slate-900 to-[#002244] rounded-lg p-2 text-white flex items-center justify-between text-[8px] border border-slate-700">
          <div>
            <p className="font-bold text-[9px]">PRESYS INSTRUMENTOS</p>
            <p className="text-[7px] text-slate-300">Calibração RBC & ISO 9001</p>
          </div>
          <div className="text-[6.5px] text-slate-400 text-right">
            <p>+55 (11) 3038-1300</p>
            <p>www.presys.com.br</p>
          </div>
        </div>
      )
    },

    // --- TABELAS TÉCNICAS ---
    {
      id: 'tpl-tbl-products',
      type: 'table',
      title: 'Tabela de Produtos Presys (Biblioteca Oficial)',
      category: 'tables',
      badge: 'Vinculada ao Banco',
      description: 'Tabela oficial com código, modelo, faixa, unidade e exatidão sincronizada com a biblioteca de produtos.',
      defaultConfig: {
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
      previewRenderer: () => (
        <div className="w-full h-24 bg-white rounded-lg p-1.5 border border-slate-300 text-[8px]">
          <div className="bg-[#003366] text-white p-1 rounded font-bold text-[8px] mb-1">
            ESPECIFICAÇÕES TÉCNICAS
          </div>
          <table className="w-full text-left border-collapse">
            <tr className="bg-slate-100 text-slate-700 font-bold border-b text-[7px]">
              <th className="p-0.5">CÓDIGO</th>
              <th className="p-0.5">MODELO</th>
              <th className="p-0.5">FAIXA</th>
              <th className="p-0.5">EXATIDÃO</th>
            </tr>
            <tr className="border-b text-[7px]">
              <td className="p-0.5 font-bold text-blue-800">PCON-Y18</td>
              <td className="p-0.5">PCON-Touch</td>
              <td className="p-0.5">-0.9 a 70 bar</td>
              <td className="p-0.5">±0.025% FE</td>
            </tr>
          </table>
        </div>
      )
    },
    {
      id: 'tpl-tbl-matrix',
      type: 'matrix_spec_table',
      title: 'Matriz Comparativa de Modelos & Faixas',
      category: 'tables',
      badge: 'Comparativo',
      description: 'Tabela matricial comparando modelos lado a lado com parâmetros de exatidão, estabilidade e bomba.',
      defaultConfig: {
        type: 'matrix_spec_table',
        title: 'MATRIZ COMPARATIVA DE ESPECIFICAÇÕES & FAIXAS OPERACIONAIS'
      },
      previewRenderer: () => (
        <div className="w-full h-24 bg-white rounded-lg p-1.5 border border-slate-300 text-[7.5px]">
          <span className="font-bold text-[#003366] text-[8px] block mb-1">MATRIZ COMPARATIVA</span>
          <table className="w-full border-collapse">
            <tr className="bg-slate-100 font-bold text-[6.5px]">
              <th className="p-0.5">Parâmetro</th>
              <th className="p-0.5 text-center">Y18-LP</th>
              <th className="p-0.5 text-center">Y18</th>
              <th className="p-0.5 text-center">Y18-HP</th>
            </tr>
            <tr className="border-b text-[6.5px]">
              <td className="p-0.5 font-semibold">Geração</td>
              <td className="p-0.5 text-center font-mono">2.5 bar</td>
              <td className="p-0.5 text-center font-mono">40 bar</td>
              <td className="p-0.5 text-center font-mono">70 bar</td>
            </tr>
            <tr className="text-[6.5px]">
              <td className="p-0.5 font-semibold">Exatidão</td>
              <td className="p-0.5 text-center font-mono">0.01%</td>
              <td className="p-0.5 text-center font-mono">0.025%</td>
              <td className="p-0.5 text-center font-mono">0.025%</td>
            </tr>
          </table>
        </div>
      )
    },
    {
      id: 'tpl-tbl-electrical',
      type: 'electrical_table',
      title: 'Tabela de Sinais Elétricos & Loop',
      category: 'tables',
      badge: 'Sinais & Loop',
      description: 'Especificações elétricas de medição e geração: loop 24V, HART, termopares, RTD e miliamperes.',
      defaultConfig: {
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
      previewRenderer: () => (
        <div className="w-full h-24 bg-white rounded-lg p-1.5 border border-slate-300 text-[8px]">
          <div className="bg-amber-50 text-amber-900 border border-amber-200 p-0.5 rounded font-bold text-[7.5px] mb-1">
            ⚡ SINAIS ELÉTRICOS & LOOP
          </div>
          <table className="w-full text-left text-[7px]">
            <tr className="bg-slate-50 font-bold border-b">
              <th className="p-0.5">Sinal</th>
              <th className="p-0.5">Alimentação</th>
              <th className="p-0.5">Isolação</th>
            </tr>
            <tr>
              <td className="p-0.5 font-mono">4-20 mA + HART</td>
              <td className="p-0.5">24 Vdc Loop</td>
              <td className="p-0.5">1500 Vrms</td>
            </tr>
          </table>
        </div>
      )
    },
    {
      id: 'tpl-tbl-accessories',
      type: 'accessories_table',
      title: 'Tabela de Acessórios & Opcionais',
      category: 'tables',
      badge: 'Acessórios',
      description: 'Lista estruturada de manifolds, mangueiras de alta pressão, adaptadores e maletas de transporte.',
      defaultConfig: {
        type: 'accessories_table',
        title: 'Tabela de Acessórios & Opcionais Presys',
        tableColumns: [
          { key: 'codigo', label: 'Código', visible: true, width: 140 },
          { key: 'descricao', label: 'Descrição do Componente', visible: true },
          { key: 'tipo', label: 'Fornecimento', visible: true, width: 120 }
        ],
        tableRows: [{ id: `ar-${Date.now()}`, localOverrides: { codigo: 'PRESYS-MNF-2V', descricao: 'Válvula Manifold de 2 Vias em Inox 316', tipo: 'Opcional' }, order: 0 }]
      },
      previewRenderer: () => (
        <div className="w-full h-24 bg-white rounded-lg p-1.5 border border-slate-300 text-[8px]">
          <div className="bg-emerald-50 text-emerald-900 border border-emerald-200 p-0.5 rounded font-bold text-[7.5px] mb-1">
            📦 ACESSÓRIOS & KITS
          </div>
          <table className="w-full text-left text-[7px]">
            <tr className="bg-slate-50 font-bold border-b">
              <th className="p-0.5">Código</th>
              <th className="p-0.5">Descrição</th>
              <th className="p-0.5">Tipo</th>
            </tr>
            <tr>
              <td className="p-0.5 font-bold">MNF-2V</td>
              <td className="p-0.5">Manifold 2 vias Inox</td>
              <td className="p-0.5 text-emerald-700">Opcional</td>
            </tr>
          </table>
        </div>
      )
    },
    {
      id: 'tpl-tbl-ordering',
      type: 'ordering_codes',
      title: 'Estrutura do Código de Encomenda (Part Number)',
      category: 'tables',
      badge: 'Part Number',
      description: 'Configurador visual de códigos de encomenda segmentados com descrições das opções técnicas.',
      defaultConfig: {
        type: 'ordering_codes',
        title: 'ESTRUTURA DO CÓDIGO DE ENCOMENDA PRESYS (PART NUMBER)'
      },
      previewRenderer: () => (
        <div className="w-full h-24 bg-white rounded-lg p-1.5 border border-slate-300 text-[8px]">
          <div className="bg-purple-50 text-purple-900 border border-purple-200 p-0.5 rounded font-bold text-[7.5px] mb-1">
            |||| CÓDIGO DE ENCOMENDA
          </div>
          <div className="flex gap-1 py-1">
            <div className="p-1 bg-slate-100 rounded border text-center flex-1 text-[6.5px]">
              <span className="font-bold block">PCON-Y18</span>
              <span className="text-slate-500">Modelo</span>
            </div>
            <div className="p-1 bg-slate-100 rounded border text-center flex-1 text-[6.5px]">
              <span className="font-bold block">70B</span>
              <span className="text-slate-500">Faixa 70 bar</span>
            </div>
            <div className="p-1 bg-slate-100 rounded border text-center flex-1 text-[6.5px]">
              <span className="font-bold block">HART</span>
              <span className="text-slate-500">Protocolo</span>
            </div>
          </div>
        </div>
      )
    },

    // --- ESTRUTURAS VISUAIS & DESTAQUES ---
    {
      id: 'tpl-str-multimode',
      type: 'multi_mode_calibrator',
      title: 'Sistema Multifunção (4 Modos de Calibração)',
      category: 'structures',
      badge: '4 Modos',
      description: 'Grid visual com 4 cards detalhados: Bloco Seco, Banho Líquido, Sensor de Superfície e Corpo Negro.',
      defaultConfig: {
        type: 'multi_mode_calibrator',
        title: 'SISTEMA MULTIFUNÇÃO — 4 MODOS DE CALIBRAÇÃO TÉRMICA EM 1 ÚNICO INSTRUMENTO',
        badgeText: 'Multifunctional Series'
      },
      previewRenderer: () => (
        <div className="w-full h-24 bg-white rounded-lg p-1.5 border border-slate-300 text-[7px] flex flex-col justify-between">
          <span className="font-bold text-[#003366] text-[7.5px]">SISTEMA MULTIFUNÇÃO (4 MODOS)</span>
          <div className="grid grid-cols-4 gap-1 py-0.5">
            <div className="p-1 bg-slate-50 rounded border text-center">
              <span className="block text-[8px]">🔥</span>
              <span className="font-bold block text-[6.5px]">Bloco Seco</span>
            </div>
            <div className="p-1 bg-slate-50 rounded border text-center">
              <span className="block text-[8px]">💧</span>
              <span className="font-bold block text-[6.5px]">Banho Líq.</span>
            </div>
            <div className="p-1 bg-slate-50 rounded border text-center">
              <span className="block text-[8px]">📈</span>
              <span className="font-bold block text-[6.5px]">Superfície</span>
            </div>
            <div className="p-1 bg-slate-50 rounded border text-center">
              <span className="block text-[8px]">🎯</span>
              <span className="font-bold block text-[6.5px]">Blackbody</span>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'tpl-str-inserts',
      type: 'inserts_visual',
      title: 'Insertos Circulares & Furações Padronizadas',
      category: 'structures',
      badge: 'Insertos Visuais',
      description: 'Círculos com furações técnicas de termopares e tabela de part numbers compatíveis por modelo.',
      defaultConfig: {
        type: 'inserts_visual',
        title: 'INSERTOS DE EQUALIZAÇÃO TÉRMICA & FURAÇÕES PADRONIZADAS PRESYS'
      },
      previewRenderer: () => (
        <div className="w-full h-24 bg-white rounded-lg p-1.5 border border-slate-300 text-[7px] flex flex-col justify-between">
          <span className="font-bold text-slate-800 text-[7.5px]">INSERTOS & FURAÇÕES</span>
          <div className="flex justify-around items-center py-1">
            <div className="w-7 h-7 rounded-full bg-slate-300 border border-slate-600 flex items-center justify-center font-bold text-[6px]">
              IN1P
            </div>
            <div className="w-7 h-7 rounded-full bg-slate-300 border border-slate-600 flex items-center justify-center font-bold text-[6px]">
              IN1A
            </div>
            <div className="w-7 h-7 rounded-full bg-slate-300 border border-slate-600 flex items-center justify-center font-bold text-[6px]">
              IN01
            </div>
            <div className="w-7 h-7 rounded-full bg-slate-300 border border-slate-600 flex items-center justify-center font-bold text-[6px]">
              INCL
            </div>
          </div>
          <span className="text-[6.5px] text-slate-500 font-mono text-center">Tabela de Part Numbers inclusa</span>
        </div>
      )
    },
    {
      id: 'tpl-str-software',
      type: 'software_connectivity',
      title: 'Software de Calibração & Conectividade 4.0',
      category: 'structures',
      badge: 'Indústria 4.0',
      description: 'Destaques para software ISOPLAN, protocolo HART/Modbus, porta USB/Ethernet e registro datalogger.',
      defaultConfig: {
        type: 'software_connectivity',
        title: 'SOFTWARE DE CALIBRAÇÃO & CONECTIVIDADE INDUSTRIAL'
      },
      previewRenderer: () => (
        <div className="w-full h-24 bg-white rounded-lg p-1.5 border border-slate-300 text-[7px] flex flex-col justify-between">
          <span className="font-bold text-[#003366] text-[7.5px]">SOFTWARE & CONECTIVIDADE</span>
          <div className="grid grid-cols-4 gap-1 py-0.5">
            <div className="p-1 bg-slate-50 rounded border text-center">
              <span className="font-bold block text-[6.5px]">ISOPLAN</span>
            </div>
            <div className="p-1 bg-slate-50 rounded border text-center">
              <span className="font-bold block text-[6.5px]">HART 7</span>
            </div>
            <div className="p-1 bg-slate-50 rounded border text-center">
              <span className="font-bold block text-[6.5px]">USB/LAN</span>
            </div>
            <div className="p-1 bg-slate-50 rounded border text-center">
              <span className="font-bold block text-[6.5px]">Datalogger</span>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'tpl-str-gallery',
      type: 'image_gallery',
      title: 'Galeria de Fotos em Bancada & Campo',
      category: 'structures',
      badge: 'Fotos em Campo',
      description: 'Grid com 3 fotografias de aplicação real com legendas técnicas e upload local de imagens.',
      defaultConfig: {
        type: 'image_gallery',
        title: 'APLICAÇÕES EM BANCADA DE CALIBRAÇÃO & CAMPO'
      },
      previewRenderer: () => (
        <div className="w-full h-24 bg-white rounded-lg p-1.5 border border-slate-300 text-[7px] flex flex-col justify-between">
          <span className="font-bold text-slate-800 text-[7.5px]">GALERIA DE APLICAÇÕES</span>
          <div className="grid grid-cols-3 gap-1 py-0.5">
            <div className="h-10 bg-slate-200 rounded flex items-center justify-center text-[6px] text-slate-500">
              Foto 1
            </div>
            <div className="h-10 bg-slate-200 rounded flex items-center justify-center text-[6px] text-slate-500">
              Foto 2
            </div>
            <div className="h-10 bg-slate-200 rounded flex items-center justify-center text-[6px] text-slate-500">
              Foto 3
            </div>
          </div>
          <span className="text-[6.5px] text-slate-400 italic text-center">Legendas técnicas editáveis</span>
        </div>
      )
    },
    {
      id: 'tpl-str-features',
      type: 'features_list',
      title: 'Lista de Recursos Técnicos com Checkmarks',
      category: 'structures',
      badge: 'Recursos',
      description: 'Lista de diferenciais metrológicos com ícones e checkmarks azuis corporativos.',
      defaultConfig: {
        type: 'features_list',
        title: 'Destaques e Recursos Técnicos do Calibrador'
      },
      previewRenderer: () => (
        <div className="w-full h-24 bg-white rounded-lg p-2 border border-slate-300 text-[7.5px] space-y-1">
          <span className="font-bold text-[#003366] text-[8px] block">RECURSOS TÉCNICOS</span>
          <p className="text-slate-700">✓ Bomba elétrica interna de velocidade variável</p>
          <p className="text-slate-700">✓ Duplo canal de medição de pressão</p>
          <p className="text-slate-700">✓ Controle metrológico em malha fechada</p>
        </div>
      )
    },
    {
      id: 'tpl-str-footer',
      type: 'contact_footer',
      title: 'Rodapé Corporativo & Certificações Presys',
      category: 'structures',
      badge: 'Contatos',
      description: 'Rodapé com telefones, website, e-mail de vendas e selo de laboratório acreditado RBC.',
      defaultConfig: {
        type: 'contact_footer'
      },
      previewRenderer: () => (
        <div className="w-full h-14 bg-slate-900 rounded-lg p-1.5 text-white flex items-center justify-between text-[7.5px] border border-slate-700">
          <div>
            <p className="font-bold text-[8px]">PRESYS INSTRUMENTOS</p>
            <p className="text-[6.5px] text-slate-400">vendas@presys.com.br · +55 (11) 3038-1300</p>
          </div>
          <span className="bg-white/10 text-[6.5px] px-1.5 py-0.5 rounded font-mono">ISO 17025</span>
        </div>
      )
    }
  ];

  const filtered = TEMPLATES.filter((tpl) => {
    const matchesCat = activeCategory === 'all' || tpl.category === activeCategory;
    const q = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !q ||
      tpl.title.toLowerCase().includes(q) ||
      tpl.description.toLowerCase().includes(q) ||
      tpl.badge?.toLowerCase().includes(q);

    return matchesCat && matchesSearch;
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 select-none">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 max-w-4xl w-full flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header da Modal */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <div className="flex items-center gap-2">
              <LayoutTemplate className="w-5 h-5 text-[#003366]" />
              <h2 className="text-base font-bold text-slate-900">
                Inserir Bloco / Estrutura na Folha {targetPageNumber}
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Escolha uma estrutura ou tabela técnica com preview visual para adicionar ao catálogo.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra de Filtros e Busca */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-white">
          {/* Abas de Categorias */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg w-full sm:w-auto">
            <button
              onClick={() => setActiveCategory('all')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                activeCategory === 'all'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todos ({TEMPLATES.length})
            </button>
            <button
              onClick={() => setActiveCategory('headers')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 ${
                activeCategory === 'headers'
                  ? 'bg-white text-[#003366] shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Capas & Headers</span>
            </button>
            <button
              onClick={() => setActiveCategory('tables')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 ${
                activeCategory === 'tables'
                  ? 'bg-white text-[#003366] shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>Tabelas Técnicas</span>
            </button>
            <button
              onClick={() => setActiveCategory('structures')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 ${
                activeCategory === 'structures'
                  ? 'bg-white text-[#003366] shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Estruturas & Destaques</span>
            </button>
          </div>

          {/* Busca Rápida */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filtrar por nome ou recurso..."
              className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-[#003366]"
            />
          </div>
        </div>

        {/* Grid de Cards com Previews Visuais Ricos */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((tpl) => (
              <div
                key={tpl.id}
                onClick={() => {
                  onSelectBlock(targetPageId, tpl.defaultConfig);
                  onClose();
                }}
                className="bg-white rounded-xl border border-slate-200 hover:border-[#003366] hover:shadow-lg transition-all p-3.5 flex flex-col justify-between group cursor-pointer"
              >
                <div>
                  {/* Preview Visual */}
                  <div className="mb-2.5 bg-slate-100 rounded-lg p-1.5 border border-slate-200 group-hover:border-blue-300 transition-colors flex items-center justify-center">
                    {tpl.previewRenderer()}
                  </div>

                  {/* Título e Badge */}
                  <div className="flex items-start justify-between gap-1.5 mb-1">
                    <h3 className="font-bold text-slate-900 text-xs group-hover:text-[#003366] transition-colors leading-tight">
                      {tpl.title}
                    </h3>
                    {tpl.badge && (
                      <span className="text-[9px] font-semibold text-[#003366] bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 shrink-0">
                        {tpl.badge}
                      </span>
                    )}
                  </div>

                  {/* Descrição */}
                  <p className="text-[10px] text-slate-500 leading-relaxed line-clamp-2">
                    {tpl.description}
                  </p>
                </div>

                {/* Botão de Inserção */}
                <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[9px] font-mono text-slate-400 uppercase">
                    {tpl.type.replace(/_/g, ' ')}
                  </span>
                  <button
                    type="button"
                    className="px-2.5 py-1 bg-[#003366] group-hover:bg-[#002244] text-white rounded text-[10px] font-bold shadow-2xs flex items-center gap-1 transition-colors"
                  >
                    <span>Inserir na Folha</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="py-16 text-center text-xs text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
              Nenhuma estrutura ou tabela corresponde à busca.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200 bg-white flex items-center justify-between text-xs">
          <span className="text-slate-500 text-[11px]">
            Dica: Você pode editar 100% dos textos, imagens e tabelas após inserir na folha.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-300 rounded-lg"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
