import React from 'react';
import { CircleDot, Plus, Trash2 } from 'lucide-react';
import { ContentBlock } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';

interface InsertsVisualBlockProps {
  block: ContentBlock;
  pageId: string;
  isSelected: boolean;
}

export interface InsertCircleItem {
  code: string;
  title: string;
  holes: string[];
}

export interface InsertTableRow {
  code: string;
  holesDesc: string;
  models: Record<string, string>;
}

export const DEFAULT_INSERTS_CIRCLES: InsertCircleItem[] = [
  { code: 'IN1P', title: 'Misto', holes: ['3', '6', '1/4', '8'] },
  { code: 'IN1A', title: 'Imperial', holes: ['1/8', '3/16', '1/4', '3/8'] },
  { code: 'IN1E', title: 'Multi-Sensor', holes: ['4', '6', '1/4', '8', '10'] },
  { code: 'IN01', title: 'Grande', holes: ['3/4'] },
  { code: 'IN02', title: 'Diâmetro', holes: ['1/2'] },
  { code: 'IN03', title: 'Quádruplo', holes: ['6', '1/4', '1/4', '1/4'] },
  { code: 'IN04', title: 'Triplo', holes: ['6', '6', '6', '1/4'] },
  { code: 'INCL', title: 'Esferas', holes: ['Copo'] }
];

export const DEFAULT_INSERTS_COLUMNS = ['TA-25N / 35N / 50N', 'TA-350P / 650P', 'TA-1200P'];

export const DEFAULT_INSERTS_ROWS: InsertTableRow[] = [
  {
    code: 'IN1P',
    holesDesc: '1 × 3mm, 1 × 6mm, 1 × 1/4", 1 × 8mm',
    models: {
      'TA-25N / 35N / 50N': '06.04.0121-00',
      'TA-350P / 650P': '06.04.0128-00',
      'TA-1200P': '06.04.0156-00'
    }
  },
  {
    code: 'IN1A',
    holesDesc: '1 × 1/8", 1 × 3/16", 2 × 1/4", 1 × 3/8"',
    models: {
      'TA-25N / 35N / 50N': '06.04.0122-00',
      'TA-350P / 650P': '06.04.0129-00',
      'TA-1200P': '06.04.0157-00'
    }
  },
  {
    code: 'IN01',
    holesDesc: '1 × 3/4" (Furo Centralizado)',
    models: {
      'TA-25N / 35N / 50N': '06.04.0011-00',
      'TA-350P / 650P': '06.04.0101-00',
      'TA-1200P': '06.04.0031-00'
    }
  },
  {
    code: 'INCL',
    holesDesc: 'Inserto Tipo Copo com microesferas de aço',
    models: {
      'TA-25N / 35N / 50N': '06.04.0086-00',
      'TA-350P / 650P': '06.04.0099-00',
      'TA-1200P': '—'
    }
  }
];

export const InsertsVisualBlock: React.FC<InsertsVisualBlockProps> = ({
  block,
  pageId,
  isSelected
}) => {
  const { updateBlock, setSelectedBlockId } = useCatalogStore();

  const customData = block.customData || {};
  const inserts: InsertCircleItem[] = customData.inserts || DEFAULT_INSERTS_CIRCLES;
  const tableColumns: string[] = customData.tableColumns || DEFAULT_INSERTS_COLUMNS;
  const tableRows: InsertTableRow[] = customData.tableRows || DEFAULT_INSERTS_ROWS;
  const externalDiameter = customData.externalDiameter || 'Diâmetro Externo: Ø 32mm / Ø 35mm';

  const handleTitleBlur = (e: React.FocusEvent<HTMLHeadingElement>) => {
    updateBlock(pageId, block.id, { title: e.currentTarget.innerText.trim() });
  };

  const handleDiameterBlur = (e: React.FocusEvent<HTMLSpanElement>) => {
    updateBlock(pageId, block.id, {
      customData: { ...customData, externalDiameter: e.currentTarget.innerText.trim() }
    });
  };

  const handleInsertCircleBlur = (index: number, field: keyof InsertCircleItem, val: string) => {
    const updated = [...inserts];
    if (field === 'holes') {
      updated[index] = { ...updated[index], holes: val.split(',').map((h) => h.trim()) };
    } else {
      updated[index] = { ...updated[index], [field]: val.trim() };
    }
    updateBlock(pageId, block.id, {
      customData: { ...customData, inserts: updated }
    });
  };

  const handleAddInsertCircle = () => {
    const newNum = inserts.length + 1;
    const newInsert: InsertCircleItem = {
      code: `IN0${newNum}`,
      title: `Inserto ${newNum}`,
      holes: ['6', '1/4', '8']
    };
    updateBlock(pageId, block.id, {
      customData: { ...customData, inserts: [...inserts, newInsert] }
    });
  };

  const handleRemoveInsertCircle = (index: number) => {
    if (inserts.length <= 1) return;
    const updated = inserts.filter((_, i) => i !== index);
    updateBlock(pageId, block.id, {
      customData: { ...customData, inserts: updated }
    });
  };

  const handleTableCellBlur = (rowIdx: number, field: string, val: string) => {
    const updated = [...tableRows];
    if (field === 'code' || field === 'holesDesc') {
      updated[rowIdx] = { ...updated[rowIdx], [field]: val.trim() };
    } else {
      updated[rowIdx] = {
        ...updated[rowIdx],
        models: { ...updated[rowIdx].models, [field]: val.trim() }
      };
    }
    updateBlock(pageId, block.id, {
      customData: { ...customData, tableRows: updated }
    });
  };

  const handleAddTableRow = () => {
    const newRow: InsertTableRow = {
      code: `IN${tableRows.length + 1}`,
      holesDesc: 'Descrição dos furos milimétricos / imperiais',
      models: tableColumns.reduce((acc, col) => ({ ...acc, [col]: '06.04.0000-00' }), {})
    };
    updateBlock(pageId, block.id, {
      customData: { ...customData, tableRows: [...tableRows, newRow] }
    });
  };

  const handleRemoveTableRow = (idx: number) => {
    if (tableRows.length <= 1) return;
    const updated = tableRows.filter((_, i) => i !== idx);
    updateBlock(pageId, block.id, {
      customData: { ...customData, tableRows: updated }
    });
  };

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        setSelectedBlockId(block.id);
      }}
      className={`relative p-3 bg-white rounded-none border border-slate-300 transition-all ${
        isSelected ? 'ring-2 ring-blue-600' : 'hover:border-slate-400'
      }`}
    >
      {/* Header Técnico */}
      <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 mb-2 gap-2">
        <h3
          contentEditable
          suppressContentEditableWarning
          onBlur={handleTitleBlur}
          className="text-xs font-bold text-slate-900 uppercase tracking-wider outline-none focus:bg-slate-100 rounded-none px-1 flex items-center gap-1.5 flex-1 cursor-text"
          title="Clique para editar o título"
        >
          <CircleDot className="w-3.5 h-3.5 text-[#003366] shrink-0" />
          <span>{block.title || 'INSERTOS DE EQUALIZAÇÃO TÉRMICA & FURAÇÕES PADRONIZADAS PRESYS'}</span>
        </h3>

        <div className="flex items-center gap-2 shrink-0">
          <span
            contentEditable
            suppressContentEditableWarning
            onBlur={handleDiameterBlur}
            className="text-[9px] text-slate-600 font-mono outline-none focus:bg-amber-100 px-1 rounded-none cursor-text select-none"
          >
            {externalDiameter}
          </span>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleAddInsertCircle();
            }}
            className="flex items-center gap-0.5 px-2 py-0.5 text-[9px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-none no-print"
            data-editor-action="true"
          >
            <Plus className="w-3 h-3" />
            <span>+ Inserto</span>
          </button>
        </div>
      </div>

      {/* Grid Visual de Insertos Circulares (Cantos Retos) */}
      <div
        className="grid gap-1.5 pt-0.5 mb-2.5"
        style={{
          gridTemplateColumns: `repeat(${Math.min(inserts.length, 8)}, minmax(0, 1fr))`
        }}
      >
        {inserts.map((ins, idx) => (
          <div
            key={idx}
            className="flex flex-col items-center p-1.5 rounded-none bg-slate-50 border border-slate-200 hover:border-slate-400 transition-all text-center group relative"
          >
            {inserts.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveInsertCircle(idx);
                }}
                className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-red-600 no-print"
                data-editor-action="true"
                title="Excluir"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            )}

            {/* Desenho Técnico do Inserto Circular Metálico */}
            <div className="w-11 h-11 rounded-full border-2 border-slate-800 bg-gradient-to-tr from-slate-300 via-slate-100 to-slate-200 flex items-center justify-center p-0.5 shadow-2xs relative mb-1">
              <div className="flex flex-wrap items-center justify-center gap-0.5 max-w-[34px]">
                {ins.holes.map((h, hIdx) => (
                  <div
                    key={hIdx}
                    className="w-3.5 h-3.5 rounded-full bg-slate-900 border border-slate-600 flex items-center justify-center text-[7px] text-white font-mono font-bold select-none leading-none"
                    title={`Furo de ${h}`}
                  >
                    {h}
                  </div>
                ))}
              </div>
            </div>

            {/* Código e Título */}
            <span
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => handleInsertCircleBlur(idx, 'code', e.currentTarget.innerText)}
              className="text-[10px] font-black text-slate-900 font-mono outline-none focus:bg-amber-100 rounded-none px-0.5"
            >
              {ins.code}
            </span>
            <span
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => handleInsertCircleBlur(idx, 'title', e.currentTarget.innerText)}
              className="text-[8px] text-slate-600 font-sans outline-none focus:bg-amber-50 rounded-none px-0.5 truncate max-w-full"
            >
              {ins.title}
            </span>
          </div>
        ))}
      </div>

      {/* Tabela de Códigos de Encomenda dos Insertos (Cantos Retos, 0.25pt) */}
      <div className="overflow-x-auto border border-slate-700 bg-white rounded-none">
        <table className="w-full text-left border-collapse text-[10px] font-sans">
          <thead>
            <tr className="bg-slate-100 border-b-2 border-slate-900 text-slate-950 font-bold uppercase tracking-wider text-[9px]">
              <th className="py-1.5 px-2 border-r border-slate-300 w-16">CÓDIGO</th>
              <th className="py-1.5 px-2 border-r border-slate-300">FURAÇÃO DO BLOCO</th>
              {tableColumns.map((col, idx) => (
                <th key={idx} className="py-1.5 px-2 border-r border-slate-300 text-center last:border-r-0">
                  {col}
                </th>
              ))}
              <th className="py-1.5 px-1 text-center w-7 text-slate-400 no-print" data-editor-action="true">#</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {tableRows.map((row, rIdx) => (
              <tr key={rIdx} className={`hover:bg-slate-100/50 ${rIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}`}>
                <td className="py-1 px-2 border-r border-slate-200 font-mono font-bold text-slate-900">
                  <span
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => handleTableCellBlur(rIdx, 'code', e.currentTarget.innerText)}
                    className="outline-none focus:bg-amber-100 px-0.5"
                  >
                    {row.code}
                  </span>
                </td>
                <td className="py-1 px-2 border-r border-slate-200 text-slate-700">
                  <span
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => handleTableCellBlur(rIdx, 'holesDesc', e.currentTarget.innerText)}
                    className="outline-none focus:bg-amber-100 px-0.5"
                  >
                    {row.holesDesc}
                  </span>
                </td>
                {tableColumns.map((col, cIdx) => (
                  <td key={cIdx} className="py-1 px-2 border-r border-slate-200 text-center font-mono text-[9px] text-slate-800 last:border-r-0">
                    <span
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) => handleTableCellBlur(rIdx, col, e.currentTarget.innerText)}
                      className="outline-none focus:bg-amber-100 px-0.5"
                    >
                      {row.models[col] || '—'}
                    </span>
                  </td>
                ))}
                <td className="py-1 px-1 text-center w-7 align-middle no-print" data-editor-action="true">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveTableRow(rIdx);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 p-0.5 no-print"
                    data-editor-action="true"
                    title="Remover linha"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Rodapé de Ações do Editor */}
      <div className="mt-1.5 flex items-center justify-end no-print" data-editor-action="true">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleAddTableRow();
          }}
          className="flex items-center gap-1 text-[9px] font-bold text-white bg-[#003366] hover:bg-[#002244] px-2 py-0.5 rounded-none transition-colors"
        >
          <Plus className="w-2.5 h-2.5" />
          <span>+ Linha na Tabela de Insertos</span>
        </button>
      </div>
    </div>
  );
};
