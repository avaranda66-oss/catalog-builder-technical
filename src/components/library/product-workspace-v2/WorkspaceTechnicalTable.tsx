import React from 'react';
import { BookOpen, Table as TableIcon } from 'lucide-react';
import { ProjectedTable, WorkspaceMode } from '../../../domain/product-workspace/types';
import { getDatasetCellKey } from '../../../domain/product-workbook/types';

export interface WorkspaceTechnicalTableProps {
  table: ProjectedTable;
  mode?: WorkspaceMode;
  onTraceSource?: (datumId: string) => void;
}

export const WorkspaceTechnicalTable: React.FC<WorkspaceTechnicalTableProps> = ({
  table,
  mode = 'simple',
  onTraceSource
}) => {
  return (
    <div className="space-y-3">
      {/* Table Header / Title */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="p-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            <TableIcon className="w-4 h-4" />
          </span>
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {table.title}
            </h4>
            {table.description && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {table.description}
              </p>
            )}
          </div>
        </div>
        {table.isFromDataset && (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900">
              Dataset Integrado
            </span>
            {mode === 'advanced' && (
              <span className="font-mono text-[10px] text-slate-400 select-all">
                {table.id}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Table Structure */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto shadow-sm bg-white dark:bg-slate-900">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800">
              {table.columns.map((col) => (
                <th
                  key={col.id}
                  style={{ width: col.width }}
                  className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px]"
                >
                  <div className="flex items-center gap-1">
                    <span>{col.label}</span>
                    {col.unit && (
                      <span className="text-slate-400 font-normal">({col.unit})</span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {table.rows.map((row) => (
              <tr
                key={row.id}
                className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
              >
                {table.columns.map((col) => {
                  const cellKey = getDatasetCellKey(row.id, col.id);
                  const cell = table.cells[cellKey];
                  const hasRef = Boolean(cell?.datumRefId);

                  return (
                    <td
                      key={col.id}
                      className="px-4 py-2.5 text-slate-800 dark:text-slate-200 font-medium"
                    >
                      <div className="flex items-center justify-between gap-1.5 group">
                        <span className={cell?.isEditorialOnly ? 'text-slate-500' : ''}>
                          {cell?.formattedValue || '—'}
                        </span>

                        {hasRef && onTraceSource && cell?.datumRefId && (
                          <button
                            type="button"
                            onClick={() => onTraceSource(cell.datumRefId!)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-blue-600 transition-opacity"
                            title="Ver documento"
                          >
                            <BookOpen className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
