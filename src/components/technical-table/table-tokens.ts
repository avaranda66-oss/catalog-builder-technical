export type TableVisualFamily = 'monochrome' | 'precision_blue' | 'family_header';

export type TechnicalMarkerType =
  | 'filled_square' // ■ Included / Selected
  | 'empty_square' // □ Not selected / Optional
  | 'filled_circle' // ● Supported / Standard
  | 'empty_circle' // ○ Optional
  | 'asterisk' // * Note 1
  | 'double_asterisk' // ** Note 2
  | 'dash'; // — Not applicable

export interface MarkerLegendItem {
  type: TechnicalMarkerType;
  label: string;
  customSymbol?: string;
}

export interface TableStyleTokens {
  family: TableVisualFamily;
  borderOuter: string; // 0.75pt thickness
  borderHeader: string; // 0.75pt thickness
  borderGroup: string; // 0.50pt thickness
  borderInner: string; // 0.25pt thickness
  headerBg: string;
  headerTextColor: string;
  headerFontWeight: string;
  zebraBg: string;
  accentColor: string;
}

export const TABLE_VISUAL_FAMILIES: Record<TableVisualFamily, TableStyleTokens> = {
  // 1. Isotech / Fluke Style: Black, technical gray, and pure white
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

  // 2. Additel Style: Precision grid and metrology blue
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

  // 3. Presys Style: Family bar and technical lines
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
  filled_square: 'Included in standard configuration',
  empty_square: 'Optional / available upon request',
  filled_circle: 'Natively supported function',
  empty_circle: 'Optional feature on demand',
  asterisk: 'Refer to technical footnote (*)',
  double_asterisk: 'Available only under special calibration (**)',
  dash: 'Not applicable for this model'
};
