// src/domain/table-binding/default-fields.ts
// Definição canônica compartilhada dos campos rápidos padrão da biblioteca para tabelas técnicas.
// Módulo neutro puro: zero dependências de React, PropertiesPanel ou SpecsTableInspector.

export interface TableDefaultFieldOption {
  key: string;
  label: string;
}

export const AVAILABLE_DEFAULT_FIELDS: readonly TableDefaultFieldOption[] = [
  { key: 'code', label: 'Código' },
  { key: 'model', label: 'Modelo' },
  { key: 'family', label: 'Família' },
  { key: 'range', label: 'Faixa de Medição' },
  { key: 'unit', label: 'Unidade' },
  { key: 'accuracy', label: 'Precisão / Exatidão' },
  { key: 'output', label: 'Sinal Saída' },
  { key: 'powerSupply', label: 'Alimentação' },
  { key: 'processConnection', label: 'Conexão Processo' }
];
