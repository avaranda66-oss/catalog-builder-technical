import React from 'react';
import type { TablePresetId } from '../../application/contracts';
import {
  materializeTablePreset,
  TABLE_PRESETS,
  TABLE_TEXT_SIZES,
  tablePresetAccents,
  type TablePresetDefinition,
} from '../../application/table-preset-registry';
import type { DocumentStyle, TableModel } from '../../domain/editorial-model';
import { projectTableLook, type TableLook, type TableLookRequest } from '../../editor/table-look-authoring';
import './TablePanel.css';

export interface TableLookSectionProps {
  readonly table: TableModel;
  readonly documentStyle: DocumentStyle;
  readonly disabled: boolean;
  readonly disabledReason?: string;
  /** Applies one click of this section; the editor runs it as one undo step. */
  readonly onRequest: (request: TableLookRequest, successMessage: string) => void;
}

/** Message of a finished click (the editor shows it with the success tone and "Para voltar, use Desfazer."). */
export function tableLookMessage(request: TableLookRequest): string {
  switch (request.kind) {
    case 'preset':
      return `Estilo "${TABLE_PRESETS.find((preset) => preset.id === request.presetId)?.label ?? ''}" aplicado. Para voltar, use Desfazer.`;
    case 'header':
      return request.on ? 'A primeira linha virou o cabeçalho.' : 'A tabela ficou sem cabeçalho.';
    case 'banded':
      return request.on ? 'Linhas alternadas ativadas.' : 'Linhas alternadas desativadas.';
    case 'firstColumn':
      return request.on ? 'Primeira coluna destacada.' : 'A primeira coluna ficou sem destaque.';
    case 'size': {
      const size = TABLE_TEXT_SIZES.find((entry) => entry.id === request.size);
      return `Texto da tabela no tamanho ${size?.short ?? ''}.`;
    }
  }
}

/** A small drawing of the preset: header band, alternating rows and the highlighted first column. */
function PresetThumbnail({ preset, table, documentStyle }: { preset: TablePresetDefinition; table: TableModel; documentStyle: DocumentStyle }) {
  const style = materializeTablePreset(table, documentStyle, preset.id).style;
  const accents = tablePresetAccents(documentStyle, preset.id);
  const headerFill = style.rowRoles.header?.background ?? '#003366';
  const bodyFill = style.rowRoles.body?.background ?? '#FFFFFF';
  const line = style.base.borders?.bottom?.pattern === 'solid' ? style.base.borders.bottom.color : '#BDC9D6';
  const grid = style.base.borders?.left?.pattern === 'solid';
  const showHeader = preset.defaults.header === true;
  const rows = 4;
  const widths = [22, 19, 19];
  return (
    <svg className="vnext-table-look-thumb" viewBox="0 0 60 36" width="60" height="36" aria-hidden="true" focusable="false">
      <rect x="0" y="0" width="60" height="36" fill="#FFFFFF" />
      {Array.from({ length: rows }, (_, row) => {
        const header = showHeader && row === 0;
        const bodyIndex = showHeader ? row - 1 : row;
        const rowFill = header ? headerFill : preset.defaults.banded && bodyIndex % 2 === 1 ? accents.band : bodyFill;
        let x = 0;
        return widths.map((width, column) => {
          const fill = !header && column === 0 && preset.defaults.firstColumn ? accents.label.background : rowFill;
          const cell = <rect key={`${row}-${column}`} x={x} y={row * 9} width={width} height={9} fill={fill} />;
          x += width;
          return cell;
        });
      })}
      {Array.from({ length: rows - 1 }, (_, index) => (
        <line key={`h${index}`} x1="0" x2="60" y1={(index + 1) * 9} y2={(index + 1) * 9} stroke={line} strokeWidth="0.6" />
      ))}
      {grid && [22, 41].map((x) => <line key={`v${x}`} x1={x} x2={x} y1="0" y2="36" stroke={line} strokeWidth="0.6" />)}
      <rect x="0.3" y="0.3" width="59.4" height="35.4" fill="none" stroke="#BDC9D6" strokeWidth="0.6" />
    </svg>
  );
}

/**
 * FR-33 "Estilo": the four task presets (with a drawing of each), three switches and the P/M/G text size.
 * What is "on" is read from the table itself, so Desfazer and other changes are always reflected.
 */
export function TableLookSection({ table, documentStyle, disabled, disabledReason, onRequest }: TableLookSectionProps) {
  const look: TableLook = React.useMemo(() => projectTableLook(table, documentStyle), [table, documentStyle]);
  const [reasonId] = React.useState(() => `vnext-table-look-reason-${table.id}`);
  const describedBy = disabled && disabledReason ? reasonId : undefined;
  const bodyRowCount = table.rows.filter((row) => row.role === 'body').length;
  const request = (next: TableLookRequest) => onRequest(next, tableLookMessage(next));
  const choose = (presetId: TablePresetId) => request({ kind: 'preset', presetId });
  return (
    <section className="vnext-table-look" data-table-look="" aria-labelledby={`${reasonId}-title`}>
      <h3 id={`${reasonId}-title`}>Estilo</h3>
      <div className="vnext-table-look-gallery" role="group" aria-label="Estilos prontos">
        {TABLE_PRESETS.map((preset) => (
          <button
            type="button"
            key={preset.id}
            data-table-preset={preset.id}
            aria-pressed={look.presetId === preset.id}
            disabled={disabled}
            aria-describedby={describedBy}
            onClick={() => choose(preset.id)}
          >
            <PresetThumbnail preset={preset} table={table} documentStyle={documentStyle} />
            <span className="vnext-table-look-name">{preset.label}</span>
            <span className="vnext-table-look-description">{preset.description}</span>
          </button>
        ))}
      </div>
      <fieldset className="vnext-table-look-switches" disabled={disabled}>
        <legend>Partes da tabela</legend>
        <label>
          <input
            type="checkbox"
            data-table-look-switch="header"
            checked={look.header}
            disabled={table.rows.length < 2}
            aria-describedby={describedBy}
            onChange={(event) => request({ kind: 'header', on: event.target.checked })}
          />
          <span>Cabeçalho</span>
        </label>
        <label>
          <input
            type="checkbox"
            data-table-look-switch="banded"
            checked={look.banded}
            disabled={bodyRowCount < 2}
            aria-describedby={describedBy}
            onChange={(event) => request({ kind: 'banded', on: event.target.checked })}
          />
          <span>Linhas alternadas</span>
        </label>
        <label>
          <input
            type="checkbox"
            data-table-look-switch="first-column"
            checked={look.firstColumn}
            disabled={table.columns.length < 2 || bodyRowCount < 1}
            aria-describedby={describedBy}
            onChange={(event) => request({ kind: 'firstColumn', on: event.target.checked })}
          />
          <span>Primeira coluna destacada</span>
        </label>
      </fieldset>
      <div className="vnext-table-look-sizes" role="group" aria-label="Tamanho do texto">
        <span aria-hidden="true">Tamanho do texto</span>
        {TABLE_TEXT_SIZES.map((size) => (
          <button
            type="button"
            key={size.id}
            data-table-text-size={size.id}
            aria-label={size.name}
            title={size.name}
            aria-pressed={look.size === size.id}
            disabled={disabled}
            aria-describedby={describedBy}
            onClick={() => request({ kind: 'size', size: size.id })}
          >
            {size.short}
          </button>
        ))}
      </div>
      {describedBy && <p id={reasonId} className="vnext-disclosure-help">{disabledReason}</p>}
    </section>
  );
}
