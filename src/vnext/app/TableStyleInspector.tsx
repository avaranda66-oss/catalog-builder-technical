import type { CellStylePatch } from '../application';
import type { DocumentStyle, TableModel } from '../domain/editorial-model';
import {
  declaredFontOptions,
  inheritedLabel,
  linkedPaddingPatch,
  paddingQuickPatch,
  paletteOptions,
  projectLocalStyleField,
  projectResolvedStyleField,
  type BorderQuickPreset,
  type TableStyleScope,
} from '../editor/table-style-authoring';
import { TableColorField } from './editor/TableColorField';
import { TableDecimalField } from './editor/TableDecimalField';

const sides = ['top', 'right', 'bottom', 'left'] as const;
const sideLabels = { top: 'Superior', right: 'Direita', bottom: 'Inferior', left: 'Esquerda' } as const;

type ScalarField = 'fontFamily' | 'fontSizePt' | 'lineHeight' | 'fontWeight' | 'color' | 'background' | 'textAlign' | 'verticalAlign';

function scopeLabel(scope: TableStyleScope): string {
  if (scope.kind === 'table') return 'Tabela';
  if (scope.kind === 'role') return scope.role === 'header' ? 'Cabeçalho' : scope.role === 'body' ? 'Corpo' : 'Seção';
  if (scope.kind === 'rows') return scope.rowIds.length === 1 ? 'Linha' : `${scope.rowIds.length} linhas`;
  if (scope.kind === 'columns') return scope.columnIds.length === 1 ? 'Coluna' : `${scope.columnIds.length} colunas`;
  return scope.cellIds.length === 1 ? 'Célula' : `${scope.cellIds.length} células`;
}

function ownershipText(
  documentStyle: DocumentStyle,
  table: TableModel,
  scope: TableStyleScope,
  field: ScalarField
): string {
  const projection = projectResolvedStyleField(documentStyle, table, scope, field);
  if (projection.ownership === 'mixed') return 'Vários valores';
  if (projection.ownership === 'local') return 'Ajustado aqui';
  return inheritedLabel(scope);
}

const numberOrMixed = (value: unknown): number | 'mixed' | undefined =>
  value === 'mixed' ? 'mixed' : typeof value === 'number' ? value : undefined;

export function TableStyleInspector({
  table,
  documentStyle,
  scope,
  roleScope,
  disabled,
  disabledReasonId,
  disabledReason,
  advancedOpen,
  paddingLinked,
  onRoleScopeChange,
  onAdvancedOpenChange,
  onPaddingLinkedChange,
  onPatch,
  onBorderPreset,
  onAnnotationGap,
  wrapPolicy,
  onWrapPolicy,
}: {
  table: TableModel;
  documentStyle: DocumentStyle;
  scope: TableStyleScope;
  roleScope: 'header' | 'body' | 'section' | null;
  disabled: boolean;
  disabledReasonId?: string;
  disabledReason?: string;
  advancedOpen: boolean;
  paddingLinked: boolean;
  onRoleScopeChange(role: 'header' | 'body' | 'section' | null): void;
  onAdvancedOpenChange(open: boolean): void;
  onPaddingLinkedChange(linked: boolean): void;
  onPatch(patch: CellStylePatch): void;
  onBorderPreset(preset: BorderQuickPreset): void;
  onAnnotationGap(value: number): void;
  /** Line breaks of the selected cells (shown only for a cell selection). */
  wrapPolicy?: 'wrap' | 'nowrap' | 'mixed';
  onWrapPolicy?(value: 'wrap' | 'nowrap' | null): void;
}) {
  const fonts = declaredFontOptions(documentStyle);
  const palette = paletteOptions(documentStyle);
  const localPadding = projectLocalStyleField(table, scope, 'paddingMm').local;
  const localBorders = projectLocalStyleField(table, scope, 'borders').local;
  const borderCellOnly = scope.kind !== 'cells';
  const describedBy = disabled && disabledReason ? disabledReasonId : undefined;

  const scalar = (field: ScalarField) => {
    const projection = projectResolvedStyleField(documentStyle, table, scope, field);
    return {
      effective: projection.effective,
      ownership: projection.ownership,
      ownershipLabel: ownershipText(documentStyle, table, scope, field),
      local: projection.local,
    };
  };

  const font = scalar('fontFamily');
  const size = scalar('fontSizePt');
  const weight = scalar('fontWeight');
  const color = scalar('color');
  const background = scalar('background');
  const horizontal = scalar('textAlign');
  const vertical = scalar('verticalAlign');
  const lineHeight = scalar('lineHeight');
  const effectiveFamily = typeof font.effective === 'string' && font.effective !== 'mixed' ? font.effective : undefined;
  const weightOptions = fonts.find((option) => option.family === effectiveFamily)?.weights ?? [400, 700];

  // FR-10 (2D): the number fields accept "1,5" and show their own message when a value is refused.
  const commitPadding = (side: typeof sides[number], value: number | null) => {
    if (value === null) {
      onPatch({ paddingMm: { [side]: null } });
      return;
    }
    onPatch(paddingLinked ? linkedPaddingPatch(value) : { paddingMm: { [side]: value } });
  };

  const commitBorderPattern = (side: typeof sides[number], pattern: 'none' | 'solid') => {
    if (pattern === 'none') {
      onPatch({ borders: { [side]: { pattern: 'none' } } });
      return;
    }
    const current = localBorders !== 'mixed' ? localBorders?.[side] : undefined;
    onPatch({
      borders: {
        [side]: current?.pattern === 'solid'
          ? current
          : { pattern: 'solid', thicknessPt: .5, color: palette[0] ?? '#172033' },
      },
    });
  };

  const commitBorderNumber = (side: typeof sides[number], value: number) => {
    const current = localBorders !== 'mixed' ? localBorders?.[side] : undefined;
    onPatch({
      borders: {
        [side]: {
          pattern: 'solid',
          thicknessPt: value,
          color: current?.pattern === 'solid' ? current.color : (palette[0] ?? '#172033'),
        },
      },
    });
  };

  const commitBorderColor = (side: typeof sides[number], value: string) => {
    const current = localBorders !== 'mixed' ? localBorders?.[side] : undefined;
    onPatch({
      borders: {
        [side]: {
          pattern: 'solid',
          thicknessPt: current?.pattern === 'solid' ? current.thicknessPt : .5,
          color: value,
        },
      },
    });
  };

  return (
    <section className="vnext-table-style-inspector" data-table-style-inspector="">
      <div className="vnext-style-heading">
        <div>
          <h3>Texto, cores e bordas</h3>
          <p data-style-scope="">{scopeLabel(scope)}</p>
        </div>
      </div>

      {disabled && disabledReasonId && disabledReason && (
        <p id={disabledReasonId} className="vnext-style-disabled-reason">
          {disabledReason}
        </p>
      )}

      <label className="vnext-style-role-mode">
        <span>Aplicar o estilo em</span>
        <select
          data-style-role-scope=""
          value={roleScope ?? ''}
          disabled={disabled}
          aria-describedby={describedBy}
          onChange={(event) => onRoleScopeChange(event.target.value === '' ? null : event.target.value as 'header' | 'body' | 'section')}
        >
          <option value="">Seleção atual</option>
          <option value="header">Cabeçalho</option>
          <option value="body">Corpo</option>
          <option value="section">Seção</option>
        </select>
      </label>

      <div className="vnext-style-primary">
        <label>
          <span>Fonte <small>{font.ownershipLabel}</small></span>
          <select
            data-style-property="fontFamily"
            value={font.effective === 'mixed' ? 'mixed' : String(font.effective ?? '')}
            disabled={disabled}
            aria-describedby={describedBy}
            onChange={(event) => {
              const family = event.target.value;
              if (!family || family === 'mixed') return;
              const option = fonts.find((entry) => entry.family === family);
              const currentWeight = typeof weight.effective === 'number' ? weight.effective : 400;
              onPatch({
                fontFamily: family,
                ...(!option?.weights.includes(currentWeight as 400 | 700) ? { fontWeight: option?.weights[0] ?? 400 } : {}),
              });
            }}
          >
            {font.effective === 'mixed' && <option value="mixed" disabled>Vários valores</option>}
            {fonts.map((option) => <option key={option.family} value={option.family}>{option.family}</option>)}
          </select>
          {font.ownership === 'local' && <button type="button" data-style-reset="fontFamily" disabled={disabled} onClick={() => onPatch({ fontFamily: null })}>Herdar</button>}
        </label>

        <label>
          <span>Tamanho <small>{size.ownershipLabel}</small></span>
          <TableDecimalField
            name="Tamanho"
            unit="pt"
            example="9"
            allowEmpty
            className="vnext-style-number"
            value={numberOrMixed(size.effective)}
            disabled={disabled}
            describedBy={describedBy}
            inputProps={{ 'data-style-property': 'fontSizePt' }}
            onCommit={(value) => onPatch({ fontSizePt: value })}
          />
          {size.ownership === 'local' && <button type="button" data-style-reset="fontSizePt" disabled={disabled} onClick={() => onPatch({ fontSizePt: null })}>Herdar</button>}
        </label>

        <label>
          <span>Peso <small>{weight.ownershipLabel}</small></span>
          <select
            data-style-property="fontWeight"
            value={weight.effective === 'mixed' ? 'mixed' : String(weight.effective ?? 400)}
            disabled={disabled}
            aria-describedby={describedBy}
            onChange={(event) => onPatch({ fontWeight: Number(event.target.value) as 400 | 700 })}
          >
            {weight.effective === 'mixed' && <option value="mixed" disabled>Vários valores</option>}
            {weightOptions.map((value) => <option key={value} value={value}>{value === 700 ? 'Negrito' : 'Normal'}</option>)}
          </select>
          {weight.ownership === 'local' && <button type="button" data-style-reset="fontWeight" disabled={disabled} onClick={() => onPatch({ fontWeight: null })}>Herdar</button>}
        </label>

        <label>
          <span>Alinhamento horizontal <small>{horizontal.ownershipLabel}</small></span>
          <select
            data-style-property="textAlign"
            value={horizontal.effective === 'mixed' ? 'mixed' : String(horizontal.effective ?? 'left')}
            disabled={disabled}
            aria-describedby={describedBy}
            onChange={(event) => onPatch({ textAlign: event.target.value as 'left' | 'center' | 'right' })}
          >
            {horizontal.effective === 'mixed' && <option value="mixed" disabled>Vários valores</option>}
            <option value="left">Esquerda</option>
            <option value="center">Centro</option>
            <option value="right">Direita</option>
          </select>
          {horizontal.ownership === 'local' && <button type="button" data-style-reset="textAlign" disabled={disabled} onClick={() => onPatch({ textAlign: null })}>Herdar</button>}
        </label>

        <label>
          <span>Alinhamento vertical <small>{vertical.ownershipLabel}</small></span>
          <select
            data-style-property="verticalAlign"
            value={vertical.effective === 'mixed' ? 'mixed' : String(vertical.effective ?? 'top')}
            disabled={disabled}
            aria-describedby={describedBy}
            onChange={(event) => onPatch({ verticalAlign: event.target.value as 'top' | 'middle' | 'bottom' })}
          >
            {vertical.effective === 'mixed' && <option value="mixed" disabled>Vários valores</option>}
            <option value="top">Superior</option>
            <option value="middle">Meio</option>
            <option value="bottom">Inferior</option>
          </select>
          {vertical.ownership === 'local' && <button type="button" data-style-reset="verticalAlign" disabled={disabled} onClick={() => onPatch({ verticalAlign: null })}>Herdar</button>}
        </label>

        <div className="vnext-style-color-field">
          <span>Cor do texto <small>{color.ownershipLabel}</small></span>
          <TableColorField
            swatchLabel="Cor do texto"
            pickerLabel="Outra cor do texto"
            value={color.effective === 'mixed' ? 'mixed' : typeof color.effective === 'string' ? color.effective : undefined}
            palette={palette}
            disabled={disabled}
            describedBy={describedBy}
            pickerProps={{ 'data-style-property': 'color' }}
            onPick={(value) => onPatch({ color: value })}
          />
          {color.ownership === 'local' && <button type="button" data-style-reset="color" disabled={disabled} onClick={() => onPatch({ color: null })}>Herdar</button>}
        </div>

        <div className="vnext-style-color-field">
          <span>Fundo <small>{background.ownershipLabel}</small></span>
          <TableColorField
            swatchLabel="Cor de fundo"
            pickerLabel="Outra cor de fundo"
            value={background.effective === 'mixed' ? 'mixed' : typeof background.effective === 'string' ? background.effective : undefined}
            palette={palette}
            disabled={disabled}
            describedBy={describedBy}
            pickerProps={{ 'data-style-property': 'background' }}
            onPick={(value) => onPatch({ background: value })}
          />
          {background.ownership === 'local' && <button type="button" data-style-reset="background" disabled={disabled} onClick={() => onPatch({ background: null })}>Herdar</button>}
        </div>

        {scope.kind === 'cells' && onWrapPolicy && (
          <label>
            <span>Quebra do texto</span>
            <select
              data-cell-property="wrapPolicy"
              value={wrapPolicy === 'mixed' ? 'mixed' : wrapPolicy ?? ''}
              disabled={disabled}
              aria-describedby={describedBy}
              onChange={(event) => {
                if (event.target.value === 'mixed') return;
                onWrapPolicy(event.target.value === '' ? null : event.target.value as 'wrap' | 'nowrap');
              }}
            >
              {wrapPolicy === 'mixed' && <option value="mixed" disabled>Vários valores</option>}
              <option value="">Automática</option>
              <option value="wrap">Quebrar em várias linhas</option>
              <option value="nowrap">Manter numa linha só</option>
            </select>
          </label>
        )}
      </div>

      <div className="vnext-style-quick-section">
        <strong>Espaçamento interno</strong>
        <div className="vnext-style-quick-actions">
          {(['compact', 'normal', 'spacious'] as const).map((preset) => (
            <button
              type="button"
              key={preset}
              data-style-padding-preset={preset}
              disabled={disabled}
              onClick={() => onPatch(paddingQuickPatch(preset))}
            >
              {preset === 'compact' ? 'Compacto' : preset === 'normal' ? 'Normal' : 'Amplo'}
            </button>
          ))}
        </div>
      </div>

      <div className="vnext-style-quick-section">
        <strong>Bordas</strong>
        <div className="vnext-style-quick-actions">
          {([
            ['none', 'Sem bordas'],
            ['all', 'Todas'],
            ['outer', 'Externas'],
            ['inner', 'Internas'],
            ['horizontal', 'Somente horizontais'],
            ['vertical', 'Somente verticais'],
            ['header-separator', 'Separador de cabeçalho'],
          ] as const).map(([preset, label]) => (
            <button
              type="button"
              key={preset}
              data-style-border-preset={preset}
              disabled={disabled || ((preset === 'outer' || preset === 'inner') && borderCellOnly)}
              title={(preset === 'outer' || preset === 'inner') && borderCellOnly ? 'Selecione células na tabela para usar esta borda.' : undefined}
              onClick={() => onBorderPreset(preset)}
            >
              {label}
            </button>
          ))}
        </div>
        {borderCellOnly && <small>Externas e Internas funcionam quando você seleciona células na tabela.</small>}
      </div>

      <button
        type="button"
        className="vnext-inspector-action"
        data-editor-action="toggle-table-style-advanced"
        aria-expanded={advancedOpen}
        disabled={disabled}
        aria-describedby={describedBy}
        onClick={() => onAdvancedOpenChange(!advancedOpen)}
      >
        {advancedOpen ? 'Ocultar ajustes por lado' : 'Ajustes por lado e altura da linha'}
      </button>

      {advancedOpen && (
        <div className="vnext-style-advanced" data-style-advanced="">
          <label>
            <span>Altura da linha do texto <small>{lineHeight.ownershipLabel}</small></span>
            <TableDecimalField
              name="Altura da linha do texto"
              example="1,2"
              allowEmpty
              value={numberOrMixed(lineHeight.effective)}
              disabled={disabled}
              inputProps={{ 'data-style-property': 'lineHeight' }}
              onCommit={(value) => onPatch({ lineHeight: value })}
            />
            {lineHeight.ownership === 'local' && <button type="button" data-style-reset="lineHeight" disabled={disabled} onClick={() => onPatch({ lineHeight: null })}>Herdar</button>}
          </label>

          <div className="vnext-style-subheading">
            <strong>Espaço interno por lado (mm)</strong>
            <button
              type="button"
              data-style-padding-link=""
              aria-pressed={paddingLinked}
              disabled={disabled}
              onClick={() => onPaddingLinkedChange(!paddingLinked)}
            >
              {paddingLinked ? 'Lados vinculados' : 'Lados independentes'}
            </button>
          </div>
          <div className="vnext-style-side-grid">
            {sides.map((side) => {
              const value = localPadding === 'mixed' ? 'mixed' : localPadding?.[side];
              return (
                <label key={side}>
                  <span>{sideLabels[side]}</span>
                  <TableDecimalField
                    name="Espaço interno"
                    unit="mm"
                    range="zeroOrMore"
                    example="1,5"
                    allowEmpty
                    value={numberOrMixed(value)}
                    placeholder="Herdado"
                    disabled={disabled}
                    inputProps={{ 'data-style-padding-side': side }}
                    onCommit={(next) => commitPadding(side, next)}
                  />
                  <button type="button" data-style-padding-reset={side} disabled={disabled || value === undefined} onClick={() => onPatch({ paddingMm: { [side]: null } })}>Herdar</button>
                </label>
              );
            })}
          </div>
          <button
            type="button"
            data-style-padding-reset-all=""
            disabled={disabled || localPadding === undefined}
            onClick={() => onPatch({ paddingMm: null })}
          >
            Redefinir todo o espaço interno
          </button>

          <div className="vnext-style-border-advanced">
            <strong>Bordas por lado</strong>
            {sides.map((side) => {
              const border = localBorders === 'mixed' ? 'mixed' : localBorders?.[side];
              return (
                <fieldset key={side} data-style-border-side={side}>
                  <legend>{sideLabels[side]}</legend>
                  <label>
                    <span>Tipo</span>
                    <select
                      value={border === 'mixed' ? 'mixed' : border?.pattern ?? ''}
                      disabled={disabled}
                      onChange={(event) => {
                        if (event.target.value === '') onPatch({ borders: { [side]: null } });
                        else if (event.target.value !== 'mixed') commitBorderPattern(side, event.target.value as 'none' | 'solid');
                      }}
                    >
                      {border === 'mixed' && <option value="mixed" disabled>Vários valores</option>}
                      <option value="">Herdado</option>
                      <option value="none">Nenhuma</option>
                      <option value="solid">Sólida</option>
                    </select>
                  </label>
                  {border !== 'mixed' && border?.pattern === 'solid' && (
                    <>
                      <label>
                        <span>Espessura (pt)</span>
                        <TableDecimalField
                          name="Espessura da borda"
                          unit="pt"
                          example="0,5"
                          value={border.thicknessPt}
                          disabled={disabled}
                          onCommit={(next) => { if (next !== null) commitBorderNumber(side, next); }}
                        />
                      </label>
                      <TableColorField
                        swatchLabel="Cor da borda"
                        pickerLabel="Cor da borda"
                        value={border.color}
                        palette={palette}
                        showSwatches={false}
                        disabled={disabled}
                        onPick={(next) => commitBorderColor(side, next)}
                      />
                    </>
                  )}
                </fieldset>
              );
            })}
          </div>

          {scope.kind === 'table' && (
            <label>
              <span>Espaço entre a tabela e as notas</span>
              <TableDecimalField
                name="Espaço entre a tabela e as notas"
                unit="mm"
                range="zeroOrMore"
                example="1,5"
                className="vnext-style-number"
                value={table.style.annotationGapMm}
                disabled={disabled}
                inputProps={{ 'data-style-property': 'annotationGapMm' }}
                onCommit={(value) => { if (value !== null) onAnnotationGap(value); }}
              />
            </label>
          )}
        </div>
      )}
    </section>
  );
}
