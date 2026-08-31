import { RangeValue, MeasurementValue, AccuracyValue } from '../types/database'
import { PRESSURE_UNITS } from '../units/pressure'

export interface ValidationError {
  field: string
  message: string
  severity: 'error' | 'warning'
}

export function validatePressureRange(range?: RangeValue | string): ValidationError[] {
  const errors: ValidationError[] = []
  if (!range) return errors
  if (typeof range === 'string') {
    return [{ field: 'control_range', message: 'Faixa em texto livre: a coerência numérica exige revisão e estruturação de mínimo, máximo e unidade.', severity: 'warning' }]
  }

  if (typeof range === 'object' && range !== null) {
    if (typeof range.min === 'number' && typeof range.max === 'number' && Number.isFinite(range.min) && Number.isFinite(range.max)) {
      if (range.min >= range.max) {
        errors.push({
          field: 'control_range',
          message: `Faixa inválida: o valor mínimo (${range.min}) deve ser estritamente menor que o máximo (${range.max}).`,
          severity: 'error',
        })
      }
    } else {
      errors.push({ field: 'control_range', message: 'Mínimo e máximo devem ser números finitos.', severity: 'error' })
    }
    if (!range.unit || !(PRESSURE_UNITS as readonly string[]).includes(range.unit)) {
      errors.push({
        field: 'control_range',
        message: 'Informe uma unidade de pressão válida para a faixa de controle.',
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
  if (typeof stability === 'string') return [{ field: 'control_stability', message: 'Estabilidade em texto livre exige revisão técnica; nenhuma conformidade foi inferida.', severity: 'warning' }]

  if (typeof stability === 'object' && stability !== null) {
    if (!Number.isFinite(stability.value) || stability.value <= 0 || !stability.unit) {
      errors.push({
        field: 'control_stability',
        message: 'Estabilidade deve ter valor finito positivo e unidade informada.',
        severity: 'error',
      })
    }

    if (
      typeof accuracy === 'object' &&
      accuracy !== null &&
      stability.unit === accuracy.unit &&
      Number.isFinite(accuracy.value) && accuracy.value > 0 &&
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
