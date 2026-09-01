export type TableVisualFamily = 'monochrome' | 'precision_blue' | 'family_header';

export type TechnicalMarkerType =
  | 'filled_square' // ■ Incluído / Selecionado
  | 'empty_square' // □ Não selecionado
  | 'filled_circle' // ● Suportado / Padrão
  | 'empty_circle' // ○ Opcional
  | 'asterisk' // * Nota 1
  | 'double_asterisk' // ** Nota 2
  | 'dash'; // — Não aplicável

export interface MarkerLegendItem {
  type: TechnicalMarkerType;
  label: string;
  customSymbol?: string;
}

export interface TableStyleTokens {
  family: TableVisualFamily;
  borderOuter: string; // Espessura 0.75pt
  borderHeader: string; // Espessura 0.75pt
  borderGroup: string; // Espessura 0.50pt
  borderInner: string; // Espessura 0.25pt
  headerBg: string;
  headerTextColor: string;
  headerFontWeight: string;
  zebraBg: string;
  accentColor: string;
}

export const TABLE_VISUAL_FAMILIES: Record<TableVisualFamily, TableStyleTokens> = {
  // 1. Estilo Isotech / Fluke: Preto, cinza técnico e branco puro
  monochrome: {
    family: 'monochrome',
    borderOuter: 'border border-slate-700',
    borderHeader: 'border-b-2 border-slate-900',
    borderGroup: 'border-r border-slate-400',
    borderInner: 'border-b border-r border-slate-200',
    headerBg: 'bg-slate-100',
    headerTextColor: 'text-slate-950',
    headerFontWeight: 'font-bold uppercase tracking-wider',
    zebraBg: 'bg-slate-50/60',
    accentColor: '#1e293b'
  },

  // 2. Estilo Additel: Grade fina de precisão e azul metrológico
  precision_blue: {
    family: 'precision_blue',
    borderOuter: 'border border-[#003366]',
    borderHeader: 'border-b border-[#003366] bg-[#003366] text-white',
    borderGroup: 'border-r border-blue-200',
    borderInner: 'border-b border-r border-slate-200',
    headerBg: 'bg-[#003366]',
    headerTextColor: 'text-white',
    headerFontWeight: 'font-extrabold uppercase tracking-wide',
    zebraBg: 'bg-blue-50/30',
    accentColor: '#003366'
  },

  // 3. Estilo Presys: Barra de família de instrumentos e linhas técnicas
  family_header: {
    family: 'family_header',
    borderOuter: 'border border-slate-400',
    borderHeader: 'border-b border-slate-300 bg-slate-200/80',
    borderGroup: 'border-r border-slate-300',
    borderInner: 'border-b border-r border-slate-200',
    headerBg: 'bg-slate-200/80',
    headerTextColor: 'text-slate-900',
    headerFontWeight: 'font-bold uppercase tracking-wider',
    zebraBg: 'bg-slate-50/50',
    accentColor: '#003366'
  }
};

export const DEFAULT_MARKER_LEGENDS: Record<TechnicalMarkerType, string> = {
  filled_square: 'Item incluído na configuração padrão',
  empty_square: 'Item não selecionado / disponível como opcional',
  filled_circle: 'Função suportada nativamente',
  empty_circle: 'Recurso opcional sob encomenda',
  asterisk: 'Consulte nota técnica de rodapé (*)',
  double_asterisk: 'Disponível apenas sob calibração especial (**)',
  dash: 'Não aplicável para este modelo'
};
