// src/components/editor/inspector/components/InspectorDimensionInput.tsx
// Primitive canônica de Entrada de Dimensão com Unidade Física/Visual (CORE.E3).
// Construído sobre InspectorNumberInput com tipagem obrigatória de unidades suportadas pelo Catalog Studio.

import React from 'react';
import { InspectorNumberInput, InspectorNumberInputProps } from './InspectorNumberInput';

export type DimensionUnit = 'mm' | 'px' | '%' | 'pt';

export interface InspectorDimensionInputProps extends Omit<InspectorNumberInputProps, 'unit' | 'suffix'> {
  unit: DimensionUnit;
}

export const InspectorDimensionInput: React.FC<InspectorDimensionInputProps> = ({
  unit,
  step = 'any',
  ...props
}) => {
  return (
    <InspectorNumberInput
      unit={unit}
      step={step}
      {...props}
    />
  );
};
