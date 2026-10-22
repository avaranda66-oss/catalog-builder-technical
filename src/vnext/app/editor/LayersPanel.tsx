import React from 'react';
import { ChevronDown, ChevronRight, Eye, EyeOff, GripVertical, Lock, LockOpen } from 'lucide-react';
import type { CatalogDocument, EditorialObject, Page } from '../../domain/editorial-model';
import { layerName, layersTopFirst } from '../../editor/object-layers';
import './LayersPanel.css';

export type LayerSelectMode = 'replace' | 'toggle';

export interface LayersPanelProps {
  page: Page;
  document: Pick<CatalogDocument, 'assets'>;
  selectedIds: readonly string[];
  onSelect(objectId: string, mode: LayerSelectMode): void;
  onToggleHidden(object: EditorialObject): void;
  onToggleLocked(object: EditorialObject): void;
  /** Moves the object to `targetIndex` in stacking order (0 = at the very back). One undoable change. */
  onReorder(objectId: string, targetIndex: number): void;
  /** Double-click on a text inside a group: edit it where it is. */
  onEditGroupedText?(childId: string, groupId: string): void;
  /** The list is folded by default so the properties stay short; "Camadas" in the toolbar opens it. */
  open: boolean;
  onOpenChange(open: boolean): void;
}

/** Row `row` of a top-first list of `count` rows is stacking index `count - 1 - row` (0 = back). */
export function rowToStackIndex(row: number, count: number): number {
  return Math.max(0, Math.min(count - 1, count - 1 - row));
}

const selectModeFor = (event: React.MouseEvent | React.KeyboardEvent): LayerSelectMode =>
  event.shiftKey || event.ctrlKey || event.metaKey ? 'toggle' : 'replace';

/**
 * Onda 3.5 (S1): "Camadas" — every object of the current page, the one in front at the top. Click selects
 * (Shift/Ctrl adds), the eye hides (not printed), the padlock locks, dragging a row (or Alt+↑/↓) changes the order.
 * Keyboard: ↑/↓ move between rows, Enter/Espaço select, → / ← open or close a group.
 */
export function LayersPanel({ page, document, selectedIds, onSelect, onToggleHidden, onToggleLocked, onReorder, onEditGroupedText, open: panelOpen, onOpenChange }: LayersPanelProps) {
  const layers = layersTopFirst(page);
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(() => new Set());
  const [focusId, setFocusId] = React.useState<string | undefined>(undefined);
  const [drag, setDrag] = React.useState<{ objectId: string; pointerId: number; startY: number; overRow: number; active: boolean } | null>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const selected = new Set(selectedIds);
  const activeId = focusId && layers.some((object) => object.id === focusId) ? focusId : (layers.find((object) => selected.has(object.id)) ?? layers[0])?.id;

  const focusRow = (objectId: string) => {
    setFocusId(objectId);
    queueMicrotask(() => listRef.current?.querySelector<HTMLElement>(`[data-layer-id="${objectId}"]`)?.focus());
  };
  const toggleExpanded = (objectId: string, open?: boolean) => setExpanded((current) => {
    const next = new Set(current);
    if (open ?? !next.has(objectId)) next.add(objectId); else next.delete(objectId);
    return next;
  });

  const onRowKeyDown = (event: React.KeyboardEvent<HTMLElement>, object: EditorialObject, row: number) => {
    if (event.target !== event.currentTarget) return;
    const key = event.key;
    if ((key === 'ArrowUp' || key === 'ArrowDown') && event.altKey) {
      event.preventDefault();
      const target = key === 'ArrowUp' ? row - 1 : row + 1;
      if (target < 0 || target >= layers.length) return;
      onReorder(object.id, rowToStackIndex(target, layers.length));
      focusRow(object.id);
      return;
    }
    if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'Home' || key === 'End') {
      event.preventDefault();
      const next = key === 'Home' ? 0 : key === 'End' ? layers.length - 1 : Math.max(0, Math.min(layers.length - 1, row + (key === 'ArrowUp' ? -1 : 1)));
      focusRow(layers[next].id);
      return;
    }
    if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      onSelect(object.id, selectModeFor(event));
      return;
    }
    if (object.type === 'group' && (key === 'ArrowRight' || key === 'ArrowLeft')) {
      event.preventDefault();
      toggleExpanded(object.id, key === 'ArrowRight');
    }
  };

  const rowAtY = (clientY: number): number => {
    const rows = [...(listRef.current?.querySelectorAll<HTMLElement>(':scope > [data-layer-id]') ?? [])];
    for (let index = 0; index < rows.length; index += 1) {
      const rect = rows[index].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return index;
    }
    return Math.max(0, rows.length - 1);
  };

  const onGripPointerDown = (event: React.PointerEvent<HTMLElement>, object: EditorialObject, row: number) => {
    if (event.button !== 0 || object.locked) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ objectId: object.id, pointerId: event.pointerId, startY: event.clientY, overRow: row, active: false });
  };
  const onGripPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const active = drag.active || Math.abs(event.clientY - drag.startY) > 4;
    setDrag({ ...drag, active, overRow: active ? rowAtY(event.clientY) : drag.overRow });
  };
  const onGripPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const from = layers.findIndex((object) => object.id === drag.objectId);
    setDrag(null);
    if (drag.active && from >= 0 && drag.overRow !== from) onReorder(drag.objectId, rowToStackIndex(drag.overRow, layers.length));
  };

  return (
    <section className="vnext-layers" data-layers-panel="" aria-labelledby="vnext-layers-title">
      <h3 id="vnext-layers-title">
        <button type="button" className="vnext-layers-toggle" data-layers-toggle="" aria-expanded={panelOpen} aria-controls="vnext-layers-body"
          onClick={() => onOpenChange(!panelOpen)}>
          {panelOpen ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
          Camadas desta página <span className="vnext-layers-count">({layers.length})</span>
        </button>
      </h3>
      {panelOpen && <div id="vnext-layers-body">
      <p className="vnext-layers-help">O primeiro da lista fica na frente. Arraste pela alça ⋮ para mudar a ordem. O olho esconde (não sai no PDF).</p>
      {layers.length === 0 ? <p className="vnext-layers-empty">Esta página ainda não tem objetos.</p> : (
        <ul ref={listRef} className="vnext-layers-list" role="tree" aria-label="Camadas da página" aria-multiselectable="true">
          {layers.map((object, row) => {
            const name = layerName(object, document);
            const isSelected = selected.has(object.id);
            const isGroup = object.type === 'group';
            const open = isGroup && expanded.has(object.id);
            const dropHere = drag?.active && drag.overRow === row && drag.objectId !== object.id;
            return (
              <li
                key={object.id}
                role="treeitem"
                aria-level={1}
                aria-selected={isSelected}
                aria-expanded={isGroup ? open : undefined}
                aria-label={`${name}${object.hidden ? ', escondido' : ''}${object.locked ? ', travado' : ''}`}
                tabIndex={activeId === object.id ? 0 : -1}
                data-layer-id={object.id}
                className={'vnext-layer-row' + (isSelected ? ' is-selected' : '') + (object.hidden ? ' is-hidden' : '')
                  + (drag?.objectId === object.id && drag.active ? ' is-dragging' : '') + (dropHere ? ' is-drop-target' : '')}
                onFocus={(event) => { if (event.target === event.currentTarget) setFocusId(object.id); }}
                onKeyDown={(event) => onRowKeyDown(event, object, row)}
                onClick={(event) => { if ((event.target as HTMLElement).closest('button')) return; onSelect(object.id, selectModeFor(event)); }}
              >
                <div className="vnext-layer-line">
                  <span className={'vnext-layer-grip' + (object.locked ? ' is-disabled' : '')} data-layer-grip="" aria-hidden="true"
                    title={object.locked ? 'Destrave para mudar a ordem' : 'Arraste para mudar a ordem'}
                    onPointerDown={(event) => onGripPointerDown(event, object, row)} onPointerMove={onGripPointerMove}
                    onPointerUp={onGripPointerUp} onPointerCancel={() => setDrag(null)}>
                    <GripVertical size={14} />
                  </span>
                  {isGroup ? (
                    <button type="button" className="vnext-layer-expand" tabIndex={-1} data-layer-action="expand"
                      aria-label={open ? 'Fechar grupo' : 'Abrir grupo'} onClick={() => toggleExpanded(object.id)}>
                      {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
                    </button>
                  ) : <span className="vnext-layer-expand-spacer" aria-hidden="true" />}
                  <span className="vnext-layer-name" title={name}>{name}</span>
                  <button type="button" className="vnext-layer-toggle" data-layer-action="toggle-hidden"
                    aria-pressed={Boolean(object.hidden)} aria-label={object.hidden ? `Mostrar ${name}` : `Esconder ${name}`}
                    title={object.hidden ? 'Escondido: não aparece nem sai no PDF. Clique para mostrar.' : 'Esconder (não sai no PDF)'}
                    onClick={() => onToggleHidden(object)}>
                    {object.hidden ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
                  </button>
                  <button type="button" className="vnext-layer-toggle" data-layer-action="toggle-locked"
                    aria-pressed={Boolean(object.locked)} aria-label={object.locked ? `Destravar ${name}` : `Travar ${name}`}
                    title={object.locked ? 'Travado: não sai do lugar e os cliques passam para o que está embaixo. Clique para destravar.' : 'Travar no lugar'}
                    onClick={() => onToggleLocked(object)}>
                    {object.locked ? <Lock size={15} aria-hidden="true" /> : <LockOpen size={15} aria-hidden="true" />}
                  </button>
                </div>
                {isGroup && open && (
                  <ul role="group" className="vnext-layers-children">
                    {[...object.objects].reverse().map((child) => {
                      const childName = layerName(child, document);
                      return (
                        <li key={child.id} role="treeitem" aria-level={2} aria-selected={isSelected} tabIndex={-1}
                          data-layer-child-id={child.id} className="vnext-layer-child"
                          title={child.type === 'text' ? 'Dois cliques para editar este texto' : undefined}
                          onClick={(event) => { event.stopPropagation(); onSelect(object.id, selectModeFor(event)); }}
                          onDoubleClick={(event) => {
                            event.stopPropagation();
                            if (child.type === 'text') onEditGroupedText?.(child.id, object.id);
                          }}>
                          {childName}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
      </div>}
    </section>
  );
}
