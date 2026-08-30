// Unit conversion table to Pascal (SI Base)
export const PRESSURE_TO_PA: Record<string, number> = {
  Pa: 1,
  kPa: 1000,
  hPa: 100,
  mbar: 100,
  bar: 100000,
  MPa: 1000000,
  psi: 6894.75729,
  kgf_cm2: 98066.5,
  mmHg: 133.322,
  inHg: 3386.39,
  inH2O: 249.0889,
  mmH2O: 9.80665,
}

export const PRESSURE_UNITS = [
  'bar',
  'psi',
  'mbar',
  'kPa',
  'MPa',
  'Pa',
  'kgf/cm²',
  'inHg',
  'mmHg',
  'mmH2O',
  'inH2O',
] as const

export type PressureUnit = typeof PRESSURE_UNITS[number]

export function convertPressure(value: number, fromUnit: string, toUnit: string): number {
  const fromFactor = PRESSURE_TO_PA[fromUnit] || 1
  const toFactor = PRESSURE_TO_PA[toUnit] || 1
  return (value * fromFactor) / toFactor
}

export function formatPressure(value: number, unit: string, precision: number = 4): string {
  const formatted = Number(value.toFixed(precision)).toString()
  return `${formatted} ${unit}`
}

export function formatRange(min: number, max: number, unit: string): string {
  if (min === 0) {
    return `0 a ${max} ${unit}`
  }
  return `${min} a ${max} ${unit}`
}
