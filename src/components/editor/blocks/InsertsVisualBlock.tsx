import React, { useState } from 'react';
import { CircleDot, Plus, Trash2, X } from 'lucide-react';
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
  { code: 'IN1P', title: 'Mixed', holes: ['3', '6', '1/4', '8'] },
  { code: 'IN1A', title: 'Imperial', holes: ['1/8', '3/16', '1/4', '3/8'] },
  { code: 'IN1E', title: 'Multi-Sensor', holes: ['4', '6', '1/4', '8', '10'] },
  { code: 'IN01', title: 'Large', holes: ['3/4'] },
  { code: 'IN02', title: 'Diameter', holes: ['1/2'] },
  { code: 'IN03', title: 'Quad', holes: ['6', '1/4', '1/4', '1/4'] },
  { code: 'IN04', title: 'Multi-Hole', holes: ['6', '6', '6', '6', '6', '1/4'] },
  { code: 'INCL', title: 'Spheres', holes: ['Cup'] }
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
    holesDesc: '1 × 3/4" (Centered Hole)',
    models: {
      'TA-25N / 35N / 50N': '06.04.0011-00',
      'TA-350P / 650P': '06.04.0101-00',
      'TA-1200P': '06.04.0031-00'
    }
  },
  {
    code: 'INCL',
    holesDesc: 'Cup Type Insert with steel micro-spheres',
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
  const externalDiameter = customData.externalDiameter || 'Outer Diameter: Ø 32mm / Ø 35mm';

  // Hole selection state: "insIdx-holeIdx"
  const [activeHoleKey, setActiveHoleKey] = useState<string | null>(null);
  const [editingHoleVal, setEditingHoleVal] = useState<string>('');

  const handleTitleBlur = (e: React.FocusEvent<HTMLHeadingElement>) => {
    updateBlock(pageId, block.id, { title: e.currentTarget.innerText.trim() });
  };

  const handleDiameterBlur = (e: React.FocusEvent<HTMLSpanElement>) => {
    updateBlock(pageId, block.id, {
      customData: { ...customData, externalDiameter: e.currentTarget.innerText.trim() }
    });
  };

  const handleSelectHole = (insIdx: number, holeIdx: number, val: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveHoleKey(`${insIdx}-${holeIdx}`);
    setEditingHoleVal(val);
  };

  const handleSaveHoleValue = (insIdx: number, holeIdx: number) => {
    const updated = [...inserts];
    const updatedHoles = [...updated[insIdx].holes];
    updatedHoles[holeIdx] = editingHoleVal.trim() || '6';
    updated[insIdx] = { ...updated[insIdx], holes: updatedHoles };

    updateBlock(pageId, block.id, {
      customData: { ...customData, inserts: updated }
    });
    setActiveHoleKey(null);
  };

  const handleDeleteHole = (insIdx: number, holeIdx: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const updated = [...inserts];
    const updatedHoles = updated[insIdx].holes.filter((_, i) => i !== holeIdx);
    if (updatedHoles.length === 0) {
      updatedHoles.push('6');
    }
    updated[insIdx] = { ...updated[insIdx], holes: updatedHoles };
    setActiveHoleKey(null);

    updateBlock(pageId, block.id, {
      customData: { ...customData, inserts: updated }
    });
  };

  const handleAddHoleToInsert = (insIdx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = [...inserts];
    updated[insIdx] = {
      ...updated[insIdx],
      holes: [...updated[insIdx].holes, '6']
    };
    updateBlock(pageId, block.id, {
      customData: { ...customData, inserts: updated }
    });
  };

  const handleAddInsertCircle = () => {
    const newNum = inserts.length + 1;
    const newInsert: InsertCircleItem = {
      code: `IN0${newNum}`,
      title: `Insert ${newNum}`,
      holes: ['6', '1/4', '8']
    };
    updateBlock(pageId, block.id, {
      customData: { ...customData, inserts: [...inserts, newInsert] }
    });
  };

  const handleRemoveInsertCircle = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (inserts.length <= 1) return;
    const updated = inserts.filter((_, i) => i !== index);
    updateBlock(pageId, block.id, {
      customData: { ...customData, inserts: updated }
    });
  };

  const handleInsertCircleBlur = (index: number, field: keyof InsertCircleItem, val: string) => {
    const updated = [...inserts];
    updated[index] = { ...updated[index], [field]: val.trim() };
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
      holesDesc: 'Millimetric / imperial hole configuration',
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
          title="Click to edit title"
        >
          <CircleDot className="w-3.5 h-3.5 text-[#003366] shrink-0" />
          <span>{block.title || 'THERMAL EQUALIZATION INSERTS & STANDARD DRILLINGS'}</span>
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
            className="flex items-center gap-0.5 px-2 py-0.5 text-[9px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-none no-print transition-colors"
            data-editor-action="true"
          >
            <Plus className="w-3 h-3" />
            <span>+ Insert</span>
          </button>
        </div>
      </div>

      {/* Grid Visual de Insertos Metálicos */}
      <div
        className="grid gap-2 pt-0.5 mb-2.5"
        style={{
          gridTemplateColumns: `repeat(${Math.min(inserts.length, 8)}, minmax(0, 1fr))`
        }}
      >
        {inserts.map((ins, insIdx) => {
          const numHoles = ins.holes.length;

          // Dimensões do cilindro e furos calibrados para nunca vazar
          const cylinderDiameter = 64; // px
          let holeDiameter = 18; // px

          if (numHoles === 1) {
            holeDiameter = 28;
          } else if (numHoles === 2) {
            holeDiameter = 20;
          } else if (numHoles <= 4) {
            holeDiameter = 18;
          } else if (numHoles <= 6) {
            holeDiameter = 16;
          } else {
            holeDiameter = 14;
          }

          return (
            <div
              key={insIdx}
              className="flex flex-col items-center p-1.5 rounded-none bg-slate-50 border border-slate-200 hover:border-slate-400 transition-all text-center group relative shadow-2xs"
            >
              {/* Botão de Excluir o Inserto Inteiro (Visível no Hover) */}
              {inserts.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => handleRemoveInsertCircle(insIdx, e)}
                  className="absolute top-1 right-1 p-0.5 text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity no-print"
                  data-editor-action="true"
                  title="Delete this insert"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}

              {/* Cilindro Metálico de Alta Precisão (Sem botões sobrepostos) */}
              <div
                style={{ width: `${cylinderDiameter}px`, height: `${cylinderDiameter}px` }}
                className="rounded-full border-2 border-slate-700 bg-gradient-to-tr from-slate-300 via-slate-100 to-slate-200 flex items-center justify-center p-1 shadow-inner relative mb-1.5 select-none"
              >
                <div className="w-full h-full relative flex items-center justify-center">
                  {ins.holes.map((holeValue, holeIdx) => {
                    const holeKey = `${insIdx}-${holeIdx}`;
                    const isSelected = activeHoleKey === holeKey;

                    // Cálculo da posição polar para conter os furos dentro do raio seguro
                    const safeRadius = (cylinderDiameter / 2) - (holeDiameter / 2) - 4;
                    let x = 0;
                    let y = 0;

                    if (numHoles === 1) {
                      x = 0;
                      y = 0;
                    } else if (numHoles === 2) {
                      x = holeIdx === 0 ? -safeRadius * 0.75 : safeRadius * 0.75;
                      y = 0;
                    } else {
                      const angle = (2 * Math.PI * holeIdx) / numHoles - Math.PI / 2;
                      x = Math.cos(angle) * safeRadius;
                      y = Math.sin(angle) * safeRadius;
                    }

                    return (
                      <div
                        key={holeIdx}
                        style={{
                          width: `${holeDiameter}px`,
                          height: `${holeDiameter}px`,
                          transform: `translate(${x}px, ${y}px)`
                        }}
                        onClick={(e) => handleSelectHole(insIdx, holeIdx, holeValue, e)}
                        onDoubleClick={(e) => handleDeleteHole(insIdx, holeIdx, e)}
                        className={`absolute rounded-full flex items-center justify-center transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-300 ring-2 ring-amber-500 text-slate-950 font-black z-30 scale-110 shadow-md'
                            : 'bg-slate-950 hover:bg-amber-200 text-white hover:text-slate-950 border border-slate-600'
                        }`}
                        title="Click to edit number | Double click or click X to remove hole"
                      >
                        {isSelected ? (
                          <input
                            type="text"
                            autoFocus
                            value={editingHoleVal}
                            onChange={(e) => setEditingHoleVal(e.target.value)}
                            onBlur={() => handleSaveHoleValue(insIdx, holeIdx)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveHoleValue(insIdx, holeIdx);
                              if (e.key === 'Escape') setActiveHoleKey(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full text-center bg-transparent font-mono font-black text-[9px] outline-none text-slate-950 px-0"
                          />
                        ) : (
                          <span className="text-[10px] font-mono font-bold leading-none select-none">
                            {holeValue}
                          </span>
                        )}

                        {/* Botão Vermelho de Excluir Furo com X Claro */}
                        {isSelected && (
                          <button
                            type="button"
                            onClick={(e) => handleDeleteHole(insIdx, holeIdx, e)}
                            className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center text-[9px] font-bold shadow-sm no-print z-40"
                            data-editor-action="true"
                            title="Remove this hole"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Botão de Adicionar Furo (Abaixo do cilindro, sem sobrepor nada) */}
              <button
                type="button"
                onClick={(e) => handleAddHoleToInsert(insIdx, e)}
                className="mb-1 px-1.5 py-0.5 bg-slate-200 hover:bg-[#003366] hover:text-white text-slate-700 rounded-none text-[8px] font-bold flex items-center gap-0.5 no-print transition-colors"
                data-editor-action="true"
                title="Add new hole to this insert"
              >
                <Plus className="w-2.5 h-2.5" />
                <span>+ Furo</span>
              </button>

              {/* Código & Título do Inserto */}
              <p
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => handleInsertCircleBlur(insIdx, 'code', e.currentTarget.innerText)}
                className="font-bold text-slate-900 text-xs font-mono outline-none focus:bg-amber-100 px-0.5 rounded-none"
              >
                {ins.code}
              </p>
              <p
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => handleInsertCircleBlur(insIdx, 'title', e.currentTarget.innerText)}
                className="text-[10px] text-slate-500 outline-none focus:bg-amber-100 px-0.5 rounded-none"
              >
                {ins.title}
              </p>
            </div>
          );
        })}
      </div>

      {/* Tabela Técnica de Códigos */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-slate-700 text-xs">
          <thead>
            <tr className="bg-slate-100 border-b-2 border-slate-900 text-slate-950 font-bold uppercase tracking-wider text-[10px]">
              <th className="p-1.5 border-r border-slate-400 text-left w-16">CODE</th>
              <th className="p-1.5 border-r border-slate-400 text-left">BLOCK DRILLING CONFIGURATION</th>
              {tableColumns.map((col, cIdx) => (
                <th key={cIdx} className="p-1.5 border-r border-slate-400 text-center font-mono">
                  {col}
                </th>
              ))}
              <th className="p-1.5 text-center w-8 no-print">#</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {tableRows.map((row, rIdx) => (
              <tr key={rIdx} className="hover:bg-slate-50/80 font-mono text-[10px]">
                <td
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => handleTableCellBlur(rIdx, 'code', e.currentTarget.innerText)}
                  className="p-1.5 border-r border-slate-200 font-bold text-slate-900 outline-none focus:bg-amber-100"
                >
                  {row.code}
                </td>
                <td
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => handleTableCellBlur(rIdx, 'holesDesc', e.currentTarget.innerText)}
                  className="p-1.5 border-r border-slate-200 text-slate-700 outline-none focus:bg-amber-100 font-sans"
                >
                  {row.holesDesc}
                </td>
                {tableColumns.map((col, cIdx) => (
                  <td
                    key={cIdx}
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => handleTableCellBlur(rIdx, col, e.currentTarget.innerText)}
                    className="p-1.5 border-r border-slate-200 text-center text-slate-800 outline-none focus:bg-amber-100"
                  >
                    {row.models[col] || '—'}
                  </td>
                ))}
                <td className="p-1.5 text-center no-print">
                  {tableRows.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveTableRow(rIdx);
                      }}
                      className="text-slate-400 hover:text-red-600 p-0.5"
                      data-editor-action="true"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Rodapé da Tabela */}
      <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500 font-mono pt-1">
        <span>{tableRows.length} insert model(s) registered</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleAddTableRow();
          }}
          className="flex items-center gap-1 font-bold text-white bg-[#003366] hover:bg-[#002244] px-2 py-0.5 rounded-none no-print transition-colors"
          data-editor-action="true"
        >
          <Plus className="w-3 h-3" />
          <span>+ Add Row</span>
        </button>
      </div>
    </div>
  );
};
