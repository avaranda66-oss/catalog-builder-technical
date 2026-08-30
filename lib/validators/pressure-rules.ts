import { RangeValue, MeasurementValue, AccuracyValue } from '../types/database'

export interface ValidationError {
  field: string
  message: string
  severity: 'error' | 'warning'
}

export function validatePressureRange(range?: RangeValue | string): ValidationError[] {
  const errors: ValidationError[] = []
  if (!range) return errors

  if (typeof range === 'object' && range !== null) {
    if (typeof range.min === 'number' && typeof range.max === 'number') {
      if (range.min >= range.max) {
        errors.push({
          field: 'control_range',
          message: `Faixa inválida: o valor mínimo (${range.min}) deve ser estritamente menor que o máximo (${range.max}).`,
          severity: 'error',
        })
      }
    }
    if (!range.unit) {
      errors.push({
        field: 'control_range',
        message: 'Unidade de pressão obrigatória para a faixa de controle.',
        severity: 'error',
      })
    }
  }
  return errors
}

export function validatePressureStability(
  stability?: MeasurementValue | string,
  accuracy?: AccuracyValue | string
): ValidationError[] {
  const errors: ValidationError[] = []
  if (!stability) return errors

  if (typeof stability === 'object' && stability !== null) {
    if (stability.value <= 0) {
      errors.push({
        field: 'control_stability',
        message: 'Estabilidade de controle deve ser um número positivo.',
        severity: 'error',
      })
    }

    if (
      typeof accuracy === 'object' &&
      accuracy !== null &&
      stability.unit === accuracy.unit &&
      stability.value > accuracy.value
    ) {
      errors.push({
        field: 'control_stability',
        message: `Atenção: a estabilidade (${stability.value} ${stability.unit}) é maior que a exatidão declarada (${accuracy.value} ${accuracy.unit}).`,
        severity: 'warning',
      })
    }
  }

  return errors
}
