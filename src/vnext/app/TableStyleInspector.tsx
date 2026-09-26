import type { CellStylePatch, TablePresetId } from '../application';
import type { DocumentStyle, TableModel } from '../domain/editorial-model';
import {
  TABLE_PRESETS,
} from '../application';
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

const sides = ['top', 'right', 'bottom', 'left'] as const;
const sideLabels = { top: 'Superior', right: 'Direita', bottom: 'Inferior', left: 'Esquerda' } as const;

type ScalarField = 'fontFamily' | 'fontSizePt' | 'lineHeight' | 'fontWeight' | 'color' | 'background' | 'textAlign' | 'verticalAlign';

function displayValue(value: unknown): string {
  if (value === 'mixed') return 'Misto';
  if (value === undefined) return '';
  return String(value);
}

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
  if (projection.ownership === 'mixed') return 'Misto';
  if (projection.ownership === 'local') return 'Local';
  return inheritedLabel(scope);
}

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
  onPreset,
  onAnnotationGap,
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
  onPreset(presetId: TablePresetId): void;
  onAnnotationGap(value: number): void;
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

  const commitNumber = (field: 'fontSizePt' | 'lineHeight', raw: string) => {
    if (raw.trim() === '') {
      onPatch({ [field]: null });
      return;
    }
    const value = Number(raw.replace(',', '.'));
    if (Number.isFinite(value) && value > 0) onPatch({ [field]: value });
  };

  const commitHex = (field: 'color' | 'background', raw: string) => {
    if (raw.trim() === '') {
      onPatch({ [field]: null });
      return;
    }
    const value = raw.trim().toUpperCase();
    if (/^#[0-9A-F]{6}$/.test(value)) onPatch({ [field]: value });
  };

  const commitPadding = (side: typeof sides[number], raw: string) => {
    if (raw.trim() === '') {
      onPatch({ paddingMm: { [side]: null } });
      return;
    }
    const value = Number(raw.replace(',', '.'));
    if (!Number.isFinite(value) || value < 0) return;
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

  const commitBorderNumber = (side: typeof sides[number], raw: string) => {
    const value = Number(raw.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) return;
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

  const commitBorderColor = (side: typeof sides[number], raw: string) => {
    const value = raw.trim().toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(value)) return;
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
          <h3>Apresentação da tabela</h3>
          <p data-style-scope="">{scopeLabel(scope)}</p>
        </div>
      </div>

      {disabled && disabledReasonId && disabledReason && (
        <p id={disabledReasonId} className="vnext-style-disabled-reason">
          {disabledReason}
        </p>
      )}

      <label className="vnext-style-role-mode">
        <span>Estilo do tipo de linha</span>
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
            {font.effective === 'mixed' && <option value="mixed" disabled>Misto</option>}
            {fonts.map((option) => <option key={option.family} value={option.family}>{option.family}</option>)}
          </select>
          {font.ownership === 'local' && <button type="button" data-style-reset="fontFamily" disabled={disabled} onClick={() => onPatch({ fontFamily: null })}>Herdar</button>}
        </label>

        <label>
          <span>Tamanho <small>{size.ownershipLabel}</small></span>
          <div className="vnext-style-number">
            <input
              key={scopeLabel(scope) + ':size:' + displayValue(size.local)}
              data-style-property="fontSizePt"
              type="text"
              inputMode="decimal"
              defaultValue={size.effective === 'mixed' ? '' : displayValue(size.effective)}
              placeholder={size.effective === 'mixed' ? 'Misto' : undefined}
              disabled={disabled}
              aria-describedby={describedBy}
              onBlur={(event) => commitNumber('fontSizePt', event.currentTarget.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
            />
            <span>pt</span>
          </div>
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
            {weight.effective === 'mixed' && <option value="mixed" disabled>Misto</option>}
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
            {horizontal.effective === 'mixed' && <option value="mixed" disabled>Misto</option>}
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
            {vertical.effective === 'mixed' && <option value="mixed" disabled>Misto</option>}
            <option value="top">Superior</option>
            <option value="middle">Meio</option>
            <option value="bottom">Inferior</option>
          </select>
          {vertical.ownership === 'local' && <button type="button" data-style-reset="verticalAlign" disabled={disabled} onClick={() => onPatch({ verticalAlign: null })}>Herdar</button>}
        </label>

        <div className="vnext-style-color-field">
          <span>Cor do texto <small>{color.ownershipLabel}</small></span>
          <div className="vnext-style-palette" data-style-palette="color">
            {palette.map((value) => (
              <button
                type="button"
                key={value}
                aria-label={`Cor do texto ${value}`}
                title={value}
                disabled={disabled}
                style={{ background: value }}
                onClick={() => onPatch({ color: value })}
              />
            ))}
          </div>
          <input
            key={scopeLabel(scope) + ':color:' + displayValue(color.local)}
            data-style-property="color"
            aria-label="Cor do texto HEX"
            defaultValue={color.effective === 'mixed' ? '' : displayValue(color.effective)}
            placeholder={color.effective === 'mixed' ? 'Misto' : '#RRGGBB'}
            disabled={disabled}
            aria-describedby={describedBy}
            onBlur={(event) => commitHex('color', event.currentTarget.value)}
          />
          {color.ownership === 'local' && <button type="button" data-style-reset="color" disabled={disabled} onClick={() => onPatch({ color: null })}>Herdar</button>}
        </div>

        <div className="vnext-style-color-field">
          <span>Fundo <small>{background.ownershipLabel}</small></span>
          <div className="vnext-style-palette" data-style-palette="background">
            {palette.map((value) => (
              <button
                type="button"
                key={value}
                aria-label={`Cor de fundo ${value}`}
                title={value}
                disabled={disabled}
                style={{ background: value }}
                onClick={() => onPatch({ background: value })}
              />
            ))}
          </div>
          <input
            key={scopeLabel(scope) + ':background:' + displayValue(background.local)}
            data-style-property="background"
            aria-label="Cor de fundo HEX"
            defaultValue={background.effective === 'mixed' ? '' : displayValue(background.effective)}
            placeholder={background.effective === 'mixed' ? 'Misto' : '#RRGGBB'}
            disabled={disabled}
            aria-describedby={describedBy}
            onBlur={(event) => commitHex('background', event.currentTarget.value)}
          />
          {background.ownership === 'local' && <button type="button" data-style-reset="background" disabled={disabled} onClick={() => onPatch({ background: null })}>Herdar</button>}
        </div>
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
              title={(preset === 'outer' || preset === 'inner') && borderCellOnly ? 'Selecione células para aplicar esta topologia de borda.' : undefined}
              onClick={() => onBorderPreset(preset)}
            >
              {label}
            </button>
          ))}
        </div>
        {borderCellOnly && <small>Externas e Internas ficam disponíveis em seleção de células, onde a topologia é explícita.</small>}
      </div>

      <div className="vnext-style-presets">
        <strong>Estilos prontos</strong>
        <div className="vnext-style-preset-grid">
          {TABLE_PRESETS.map((preset) => (
            <button
              type="button"
              key={preset.id}
              data-table-preset={preset.id}
              disabled={disabled}
              onClick={() => onPreset(preset.id)}
            >
              <strong>{preset.label}</strong>
              <span>{preset.description}</span>
            </button>
          ))}
        </div>
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
        {advancedOpen ? 'Ocultar avançado' : 'Avançado'}
      </button>

      {advancedOpen && (
        <div className="vnext-style-advanced" data-style-advanced="">
          <label>
            <span>Altura da linha <small>{lineHeight.ownershipLabel}</small></span>
            <input
              key={scopeLabel(scope) + ':lineHeight:' + displayValue(lineHeight.local)}
              data-style-property="lineHeight"
              type="text"
              inputMode="decimal"
              defaultValue={lineHeight.effective === 'mixed' ? '' : displayValue(lineHeight.effective)}
              placeholder={lineHeight.effective === 'mixed' ? 'Misto' : undefined}
              disabled={disabled}
              onBlur={(event) => commitNumber('lineHeight', event.currentTarget.value)}
            />
            {lineHeight.ownership === 'local' && <button type="button" data-style-reset="lineHeight" disabled={disabled} onClick={() => onPatch({ lineHeight: null })}>Herdar</button>}
          </label>

          <div className="vnext-style-subheading">
            <strong>Padding por lado</strong>
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
                  <input
                    key={scopeLabel(scope) + ':padding:' + side + ':' + displayValue(value)}
                    data-style-padding-side={side}
                    type="text"
                    inputMode="decimal"
                    defaultValue={value === 'mixed' || value === undefined ? '' : String(value)}
                    placeholder={value === 'mixed' ? 'Misto' : 'Herdado'}
                    disabled={disabled}
                    onBlur={(event) => commitPadding(side, event.currentTarget.value)}
                  />
                  <button type="button" data-style-padding-reset={side} disabled={disabled || value === undefined} onClick={() => onPatch({ paddingMm: { [side]: null } })}>Herdar</button>
                </label>
              );
            })}
          </div>

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
                      {border === 'mixed' && <option value="mixed" disabled>Misto</option>}
                      <option value="">Herdado</option>
                      <option value="none">Nenhuma</option>
                      <option value="solid">Sólida</option>
                    </select>
                  </label>
                  {border !== 'mixed' && border?.pattern === 'solid' && (
                    <>
                      <label>
                        <span>Espessura pt</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          defaultValue={String(border.thicknessPt)}
                          disabled={disabled}
                          onBlur={(event) => commitBorderNumber(side, event.currentTarget.value)}
                        />
                      </label>
                      <label>
                        <span>Cor</span>
                        <input
                          type="text"
                          defaultValue={border.color}
                          disabled={disabled}
                          onBlur={(event) => commitBorderColor(side, event.currentTarget.value)}
                        />
                      </label>
                    </>
                  )}
                </fieldset>
              );
            })}
          </div>

          {scope.kind === 'table' && (
            <label>
              <span>Espaçamento das notas/legenda</span>
              <div className="vnext-style-number">
                <input
                  data-style-property="annotationGapMm"
                  type="text"
                  inputMode="decimal"
                  defaultValue={String(table.style.annotationGapMm)}
                  disabled={disabled}
                  onBlur={(event) => {
                    const value = Number(event.currentTarget.value.replace(',', '.'));
                    if (Number.isFinite(value) && value >= 0) onAnnotationGap(value);
                  }}
                />
                <span>mm</span>
              </div>
            </label>
          )}
        </div>
      )}
    </section>
  );
}
