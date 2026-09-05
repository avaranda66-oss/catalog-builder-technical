// src/components/library/product-workspace/CellEditorModal.tsx
// Editor de Célula Tipado por TechnicalValue (PIM.PRODUCTION.CORE1.1 - Item 7).
// Garante que todo valor preenchido seja um TechnicalDatum com id próprio referenciado pela célula.
// NUNCA salva string diretamente na DatasetCell.

import React, { useState, useEffect } from 'react';
import { Edit3, Check, Trash2, X, AlertCircle } from 'lucide-react';
import {
  TechnicalDataset,
  DatasetColumn,
  DatasetRow,
  TechnicalDatum,
  TechnicalValue,
  DatumStatus,
  UnitCode,
  QuantityQualifier
} from '../../../domain/product-workbook';

interface CellEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataset: TechnicalDataset;
  row: DatasetRow;
  column: DatasetColumn;
  currentDatum?: TechnicalDatum | null;
  onSaveCell: (value: TechnicalValue, datumLabel?: string, status?: DatumStatus) => void;
  onClearCell: () => void;
}

export const CellEditorModal: React.FC<CellEditorModalProps> = ({
  isOpen,
  onClose,
  dataset,
  row,
  column,
  currentDatum,
  onSaveCell,
  onClearCell
}) => {
  const [numericVal, setNumericVal] = useState<string>('');
  const [quantityAmount, setQuantityAmount] = useState<string>('');
  const [quantityQualifier, setQuantityQualifier] = useState<QuantityQualifier | ''>('');
  const [textVal, setTextVal] = useState<string>('');
  const [rangeLower, setRangeLower] = useState<string>('');
  const [rangeUpper, setRangeUpper] = useState<string>('');
  const [rangeLowerInclusive, setRangeLowerInclusive] = useState<boolean | undefined>(undefined);
  const [rangeUpperInclusive, setRangeUpperInclusive] = useState<boolean | undefined>(undefined);
  const [booleanVal, setBooleanVal] = useState<boolean>(true);
  const [customUnit, setCustomUnit] = useState<string>(column.unit || '');
  const [datumLabel, setDatumLabel] = useState<string>('');
  const [datumStatus, setDatumStatus] = useState<DatumStatus>('draft');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setErrorMsg(null);
    setCustomUnit(column.unit || '');
    setDatumLabel(currentDatum?.label || `${row.label || row.semanticKey || 'Linha'} — ${column.label}`);
    setDatumStatus(currentDatum?.status || 'draft');

    if (currentDatum) {
      const v = currentDatum.value;
      if (v.type === 'number') {
        setNumericVal(String(v.value));
      } else if (v.type === 'quantity') {
        setQuantityAmount(String(v.amount));
        setCustomUnit(v.unit);
        setQuantityQualifier(v.qualifier || '');
      } else if (v.type === 'text') {
        setTextVal(v.value);
      } else if (v.type === 'range') {
        setRangeLower(v.lower !== undefined ? String(v.lower) : '');
        setRangeUpper(v.upper !== undefined ? String(v.upper) : '');
        setRangeLowerInclusive(v.lowerInclusive);
        setRangeUpperInclusive(v.upperInclusive);
        if (v.unit) setCustomUnit(v.unit);
      } else if (v.type === 'boolean') {
        setBooleanVal(v.value);
      }
    } else {
      setNumericVal('');
      setQuantityAmount('');
      setQuantityQualifier('');
      setTextVal('');
      setRangeLower('');
      setRangeUpper('');
      setRangeLowerInclusive(undefined);
      setRangeUpperInclusive(undefined);
      setBooleanVal(true);
    }
  }, [isOpen, currentDatum, row, column]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    let finalValue: TechnicalValue;
    const unitToUse = (customUnit.trim() || column.unit) as UnitCode | undefined;
    const supportedEditorTypes = ['number', 'quantity', 'text', 'range', 'boolean'];

    if (currentDatum && !supportedEditorTypes.includes(currentDatum.value.type)) {
      onSaveCell(currentDatum.value, datumLabel.trim() || undefined, datumStatus);
      onClose();
      return;
    }

    if (currentDatum && currentDatum.value.type !== column.valueType) {
      setErrorMsg(`O tipo existente “${currentDatum.value.type}” não é compatível com a coluna “${column.valueType}”.`);
      return;
    }

    switch (column.valueType) {
      case 'number': {
        const num = parseFloat(numericVal.replace(',', '.'));
        if (isNaN(num)) {
          setErrorMsg('Informe um valor numérico válido.');
          return;
        }
        finalValue = {
          type: 'number',
          value: num
        };
        break;
      }
      case 'quantity': {
        const amount = parseFloat(quantityAmount.replace(',', '.'));
        const unit = customUnit.trim();
        if (Number.isNaN(amount)) {
          setErrorMsg('Informe uma quantidade numérica válida.');
          return;
        }
        if (!unit) {
          setErrorMsg('Informe a unidade da quantidade.');
          return;
        }
        finalValue = {
          type: 'quantity',
          amount,
          unit: unit as UnitCode,
          ...(quantityQualifier ? { qualifier: quantityQualifier } : {})
        };
        break;
      }
      case 'text': {
        if (!textVal.trim()) {
          setErrorMsg('O texto da célula não pode ser vazio.');
          return;
        }
        finalValue = {
          type: 'text',
          value: textVal.trim()
        };
        break;
      }
      case 'range': {
        const lowerNum = rangeLower.trim() ? parseFloat(rangeLower.replace(',', '.')) : undefined;
        const upperNum = rangeUpper.trim() ? parseFloat(rangeUpper.replace(',', '.')) : undefined;
        if (lowerNum === undefined && upperNum === undefined) {
          setErrorMsg('Informe ao menos o limite inferior ou superior da faixa.');
          return;
        }
        if (lowerNum !== undefined && isNaN(lowerNum)) {
          setErrorMsg('Limite inferior numérico inválido.');
          return;
        }
        if (upperNum !== undefined && isNaN(upperNum)) {
          setErrorMsg('Limite superior numérico inválido.');
          return;
        }
        if (lowerNum !== undefined && upperNum !== undefined && lowerNum > upperNum) {
          setErrorMsg('O limite inferior não pode ser maior que o superior.');
          return;
        }
        finalValue = {
          type: 'range',
          lower: lowerNum,
          upper: upperNum,
          unit: (unitToUse || column.unit || '°C') as UnitCode,
          ...(rangeLowerInclusive !== undefined ? { lowerInclusive: rangeLowerInclusive } : {}),
          ...(rangeUpperInclusive !== undefined ? { upperInclusive: rangeUpperInclusive } : {})
        };
        break;
      }
      case 'boolean': {
        finalValue = {
          type: 'boolean',
          value: booleanVal
        };
        break;
      }
      default: {
        if (!currentDatum) {
          setErrorMsg(`O tipo técnico “${column.valueType}” ainda não possui editor.`);
          return;
        }
        finalValue = currentDatum.value;
      }
    }

    onSaveCell(finalValue, datumLabel.trim() || undefined, datumStatus);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-100">
        <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-[#003366]" />
            <h3 className="text-xs font-bold text-slate-800">
              Editar Célula Técnica
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3.5 text-xs">
          {/* Metadados da Célula */}
          <div className="bg-slate-50 p-2.5 rounded border border-slate-200 space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Tabela:</span>
              <span className="font-bold text-slate-800">{dataset.label}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Linha:</span>
              <span className="font-bold text-slate-800">{row.label || row.semanticKey}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Coluna:</span>
              <span className="font-bold text-slate-800">{column.label}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Tipo Esperado:</span>
              <span className="font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-bold">
                {column.valueType}{column.unit ? ` (${column.unit})` : ''}
              </span>
            </div>
          </div>

          {errorMsg && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded text-rose-800 text-[11px] flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Campo de Entrada Tipado */}
          {column.valueType === 'number' && (
            <div className="space-y-1">
              <label className="block font-bold text-slate-700">Valor Numérico</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={numericVal}
                  onChange={(e) => setNumericVal(e.target.value)}
                  placeholder="Ex: 0.05 ou -10.5"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-xs focus:border-[#003366] focus:outline-none"
                  autoFocus
                />
                <input
                  type="text"
                  value={customUnit}
                  onChange={(e) => setCustomUnit(e.target.value)}
                  placeholder="Unidade"
                  className="w-24 px-2 py-1.5 border border-slate-300 rounded font-mono text-xs focus:border-[#003366] focus:outline-none bg-slate-50"
                  title="Unidade da medição"
                />
              </div>
            </div>
          )}

          {column.valueType === 'quantity' && (
            <div className="space-y-1">
              <label className="block font-bold text-slate-700">Quantidade Tipada</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={quantityAmount}
                  onChange={(e) => setQuantityAmount(e.target.value)}
                  placeholder="Ex: 10 ou 10,5"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-xs focus:border-[#003366] focus:outline-none"
                  autoFocus
                />
                <input
                  type="text"
                  value={customUnit}
                  onChange={(e) => setCustomUnit(e.target.value)}
                  placeholder="Unidade"
                  className="w-24 px-2 py-1.5 border border-slate-300 rounded font-mono text-xs focus:border-[#003366] focus:outline-none"
                  aria-label="Unidade da quantidade"
                />
              </div>
              <select
                value={quantityQualifier}
                onChange={(e) => setQuantityQualifier(e.target.value as QuantityQualifier | '')}
                className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white focus:border-[#003366] focus:outline-none"
                aria-label="Qualificador da quantidade"
              >
                <option value="">Sem qualificador</option>
                <option value="exact">Exato</option>
                <option value="approx">Aproximado</option>
                <option value="min">Mínimo</option>
                <option value="max">Máximo</option>
                <option value="nominal">Nominal</option>
                <option value="typical">Típico</option>
              </select>
            </div>
          )}

          {column.valueType === 'text' && (
            <div className="space-y-1">
              <label className="block font-bold text-slate-700">Valor em Texto</label>
              <textarea
                rows={2}
                value={textVal}
                onChange={(e) => setTextVal(e.target.value)}
                placeholder="Ex: ± 0.05 °C conforme calibração"
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs focus:border-[#003366] focus:outline-none"
                autoFocus
              />
            </div>
          )}

          {column.valueType === 'range' && (
            <div className="space-y-1">
              <label className="block font-bold text-slate-700">Faixa de Valores (Range)</label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-slate-500">Mínimo (Lower):</span>
                  <input
                    type="text"
                    value={rangeLower}
                    onChange={(e) => setRangeLower(e.target.value)}
                    placeholder="Ex: -25"
                    className="w-full px-2 py-1.5 border border-slate-300 rounded font-mono text-xs focus:border-[#003366] focus:outline-none"
                    autoFocus
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500">Máximo (Upper):</span>
                  <input
                    type="text"
                    value={rangeUpper}
                    onChange={(e) => setRangeUpper(e.target.value)}
                    placeholder="Ex: 155"
                    className="w-full px-2 py-1.5 border border-slate-300 rounded font-mono text-xs focus:border-[#003366] focus:outline-none"
                  />
                </div>
              </div>
              <div className="mt-1">
                <span className="text-[10px] text-slate-500">Unidade:</span>
                <input
                  type="text"
                  value={customUnit}
                  onChange={(e) => setCustomUnit(e.target.value)}
                  placeholder="Ex: °C"
                  className="w-full px-2 py-1.5 border border-slate-300 rounded font-mono text-xs bg-slate-50"
                />
              </div>
            </div>
          )}

          {column.valueType === 'boolean' && (
            <div className="space-y-1">
              <label className="block font-bold text-slate-700">Estado Booleano</label>
              <div className="flex gap-4 p-2 bg-slate-50 rounded border border-slate-200">
                <label className="flex items-center gap-2 cursor-pointer font-medium">
                  <input
                    type="radio"
                    name="boolVal"
                    checked={booleanVal === true}
                    onChange={() => setBooleanVal(true)}
                  />
                  <span>Sim / Ativo (True)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-medium">
                  <input
                    type="radio"
                    name="boolVal"
                    checked={booleanVal === false}
                    onChange={() => setBooleanVal(false)}
                  />
                  <span>Não / Inativo (False)</span>
                </label>
              </div>
            </div>
          )}

          {currentDatum && (currentDatum.value.type !== column.valueType || !['number', 'quantity', 'text', 'range', 'boolean'].includes(currentDatum.value.type)) && (
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded text-amber-900 text-[11px]">
              <strong>Valor técnico somente leitura.</strong> O tipo “{currentDatum.value.type}” ainda não possui editor neste modal; ao salvar, ele será preservado sem conversão.
            </div>
          )}

          {/* Rótulo e Status do Dado Técnico */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200">
            <div className="col-span-2">
              <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                Rótulo do Dado (TechnicalDatum)
              </label>
              <input
                type="text"
                value={datumLabel}
                onChange={(e) => setDatumLabel(e.target.value)}
                placeholder="Rótulo canônico"
                className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                Status
              </label>
              <select
                value={datumStatus}
                onChange={(e) => setDatumStatus(e.target.value as DatumStatus)}
                className="w-full px-2 py-1 border border-slate-300 rounded text-xs bg-white"
              >
                <option value="draft">Rascunho</option>
                <option value="verified">Verificado</option>
              </select>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between border-t border-slate-200">
            {currentDatum ? (
              <button
                type="button"
                onClick={() => {
                  onClearCell();
                  onClose();
                }}
                className="px-2.5 py-1.5 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Limpar Célula</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded text-xs font-medium cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 bg-[#003366] hover:bg-[#002244] text-white rounded text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Salvar Célula</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
