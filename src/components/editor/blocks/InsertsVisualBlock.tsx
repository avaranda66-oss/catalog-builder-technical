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
  models: Record<string, string>; // ex: { 'TA-25N / 35N / 50N': '06.04.0121-00', ... }
}

export const DEFAULT_INSERTS_CIRCLES: InsertCircleItem[] = [
  { code: 'IN1P', title: 'Misto...', holes: ['3', '6', '1/4', '8'] },
  { code: 'IN1A', title: 'Imperial...', holes: ['1/8', '3/16', '1/4', '3/8'] },
  { code: 'IN1E', title: 'Multi-Sens...', holes: ['4', '6', '1/4', '8', '10'] },
  { code: 'IN01', title: 'Grande...', holes: ['3/4'] },
  { code: 'IN02', title: 'Diâmetro...', holes: ['1/2'] },
  { code: 'IN03', title: 'Quadruplo...', holes: ['6', '1/4', '1/4', '1/4'] },
  { code: 'IN04', title: 'Triplo...', holes: ['6', '6', '6', '1/4'] },
  { code: 'INCL', title: 'Esferas de...', holes: ['Copo 28'] }
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

  // Atualizar Círculo de Inserto
  const handleUpdateInsert = (idx: number, field: keyof InsertCircleItem, value: any) => {
    const updated = [...inserts];
    updated[idx] = { ...updated[idx], [field]: value };
    updateBlock(pageId, block.id, {
      customData: { ...customData, inserts: updated }
    });
  };

  const handleAddInsertCircle = () => {
    const nextCode = `IN0${inserts.length + 1}`;
    const newInsert: InsertCircleItem = {
      code: nextCode,
      title: 'Personalizado',
      holes: ['6', '1/4']
    };
    updateBlock(pageId, block.id, {
      customData: { ...customData, inserts: [...inserts, newInsert] }
    });
  };

  const handleRemoveInsertCircle = (idx: number) => {
    if (inserts.length <= 1) return;
    const updated = inserts.filter((_, i) => i !== idx);
    updateBlock(pageId, block.id, {
      customData: { ...customData, inserts: updated }
    });
  };

  // Atualizar Tabela de Modelos
  const handleUpdateCell = (rowIdx: number, field: 'code' | 'holesDesc' | string, val: string) => {
    const updated = [...tableRows];
    if (field === 'code' || field === 'holesDesc') {
      updated[rowIdx] = { ...updated[rowIdx], [field]: val };
    } else {
      updated[rowIdx] = {
        ...updated[rowIdx],
        models: { ...(updated[rowIdx].models || {}), [field]: val }
      };
    }
    updateBlock(pageId, block.id, {
      customData: { ...customData, tableRows: updated }
    });
  };

  const handleAddTableRow = () => {
    const newRow: InsertTableRow = {
      code: `IN0${tableRows.length + 1}`,
      holesDesc: 'Furação configurável',
      models: Object.fromEntries(tableColumns.map((col) => [col, '06.04.0000-00']))
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

  const handleAddTableColumn = () => {
    const colName = prompt('Nome da nova coluna de modelo (ex: TA-1200P / Novo Modelo):');
    if (!colName || !colName.trim()) return;
    const cleanName = colName.trim();
    const updatedCols = [...tableColumns, cleanName];
    const updatedRows = tableRows.map((row) => ({
      ...row,
      models: { ...row.models, [cleanName]: '—' }
    }));
    updateBlock(pageId, block.id, {
      customData: { ...customData, tableColumns: updatedCols, tableRows: updatedRows }
    });
  };

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        setSelectedBlockId(block.id);
      }}
      className={`relative p-5 rounded-2xl bg-white border border-slate-200 shadow-md transition-all ${
        isSelected ? 'ring-3 ring-brand-500 shadow-xl' : 'hover:border-slate-300'
      }`}
    >
      {/* Header do Bloco */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-200 mb-3 gap-2">
        <h3
          contentEditable
          suppressContentEditableWarning
          onBlur={handleTitleBlur}
          className="text-xs font-bold text-slate-900 uppercase tracking-wider outline-none focus:bg-amber-100 rounded px-1 flex items-center gap-2 flex-1"
          title="Clique para editar o título"
        >
          <CircleDot className="w-4 h-4 text-brand-600 shrink-0" />
          <span>{block.title || 'INSERTOS DE EQUALIZAÇÃO TÉRMICA & FURAÇÕES PADRONIZADAS PRESYS'}</span>
        </h3>

        <div className="flex items-center gap-2 shrink-0">
          <span
            contentEditable
            suppressContentEditableWarning
            onBlur={handleDiameterBlur}
            className="text-[10px] text-slate-500 font-mono outline-none focus:bg-amber-100 px-1 rounded cursor-text"
            title="Clique para editar a especificação de diâmetro"
          >
            {externalDiameter}
          </span>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleAddInsertCircle();
            }}
            className="flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded"
            title="Adicionar novo inserto visual"
          >
            <Plus className="w-3 h-3" />
            <span>+ Inserto</span>
          </button>
        </div>
      </div>

      {/* Grid Visual de Insertos Circulares com Furações */}
      <div
        className="grid gap-2 pt-1 mb-4"
        style={{
          gridTemplateColumns: `repeat(${Math.min(inserts.length, 8)}, minmax(0, 1fr))`
        }}
      >
        {inserts.map((ins, idx) => (
          <div
            key={idx}
            className="flex flex-col items-center p-2 rounded-xl bg-slate-50 border border-slate-200 hover:border-brand-400 hover:bg-brand-50/20 transition-all text-center group relative"
          >
            {inserts.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveInsertCircle(idx);
                }}
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-red-600 rounded transition-opacity"
                title="Excluir inserto"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}

            {/* Círculo Gráfico do Inserto */}
            <div className="w-13 h-13 rounded-full bg-gradient-to-b from-slate-200 to-slate-400 border-2 border-slate-600 shadow-md flex flex-wrap items-center justify-center p-1 gap-0.5 relative">
              {ins.holes.map((h, hIdx) => (
                <span
                  key={hIdx}
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => {
                    const newHoles = [...ins.holes];
                    newHoles[hIdx] = e.currentTarget.innerText.trim();
                    handleUpdateInsert(idx, 'holes', newHoles);
                  }}
                  className="w-3.5 h-3.5 rounded-full bg-slate-900 text-white font-mono text-[6.5px] font-bold flex items-center justify-center border border-slate-600 shadow-inner outline-none focus:bg-amber-500"
                  title="Clique para editar este furo"
                >
                  {h}
                </span>
              ))}
            </div>

            {/* Código do Inserto Editável */}
            <span
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => handleUpdateInsert(idx, 'code', e.currentTarget.innerText.trim())}
              className="font-mono font-bold text-[10px] text-slate-900 mt-1 block outline-none focus:bg-amber-100 px-0.5 rounded"
              title="Clique para editar o código"
            >
              {ins.code}
            </span>

            {/* Descrição do Inserto Editável */}
            <span
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => handleUpdateInsert(idx, 'title', e.currentTarget.innerText.trim())}
              className="text-[8.5px] text-slate-500 line-clamp-1 outline-none focus:bg-amber-50 px-0.5 rounded"
              title="Clique para editar a descrição do inserto"
            >
              {ins.title}
            </span>
          </div>
        ))}
      </div>

      {/* Tabela de Referência Cruzada de Códigos de Ordem */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left border-collapse text-[10px] font-sans">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700 uppercase">
              <th className="py-1.5 px-2.5 border-r border-slate-200 w-16">Código</th>
              <th className="py-1.5 px-2.5 border-r border-slate-200">Furação do Bloco</th>
              {tableColumns.map((col, cIdx) => (
                <th key={cIdx} className="py-1.5 px-2.5 border-r border-slate-200 text-center font-mono">
                  {col}
                </th>
              ))}
              <th className="py-1.5 px-1 text-center w-8">
                <button
                  type="button"
                  onClick={handleAddTableColumn}
                  className="text-brand-600 hover:text-brand-800 p-0.5 font-bold"
                  title="Adicionar coluna de modelo na tabela"
                >
                  +Col
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono text-[10px]">
            {tableRows.map((row, rIdx) => (
              <tr key={rIdx} className={rIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                {/* Código */}
                <td className="py-1 px-2.5 border-r border-slate-200 font-bold text-brand-700">
                  <span
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => handleUpdateCell(rIdx, 'code', e.currentTarget.innerText.trim())}
                    className="outline-none focus:bg-amber-100 px-0.5 rounded"
                  >
                    {row.code}
                  </span>
                </td>

                {/* Descrição dos Furos */}
                <td className="py-1 px-2.5 border-r border-slate-200 font-sans">
                  <span
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => handleUpdateCell(rIdx, 'holesDesc', e.currentTarget.innerText.trim())}
                    className="outline-none focus:bg-amber-100 px-0.5 rounded block"
                  >
                    {row.holesDesc}
                  </span>
                </td>

                {/* Colunas de Modelos e Part Numbers */}
                {tableColumns.map((col, cIdx) => (
                  <td key={cIdx} className="py-1 px-2.5 border-r border-slate-200 text-center text-slate-600">
                    <span
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) => handleUpdateCell(rIdx, col, e.currentTarget.innerText.trim())}
                      className="outline-none focus:bg-amber-50 px-0.5 rounded"
                    >
                      {row.models?.[col] || '—'}
                    </span>
                  </td>
                ))}

                {/* Excluir Linha */}
                <td className="py-1 px-1 text-center">
                  <button
                    type="button"
                    onClick={() => handleRemoveTableRow(rIdx)}
                    className="p-0.5 text-slate-300 hover:text-red-600 rounded"
                    title="Excluir linha da tabela"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={handleAddTableRow}
          className="flex items-center gap-1 text-[10px] font-semibold text-brand-700 hover:text-brand-900 bg-brand-50 hover:bg-brand-100 border border-brand-200 px-2 py-0.5 rounded"
        >
          <Plus className="w-3 h-3" />
          <span>+ Linha na Tabela de Insertos</span>
        </button>
      </div>
    </div>
  );
};
