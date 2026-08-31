import type { ChangeProposal } from './contracts'

const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor'])

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function equalJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function pathSegments(path: string): string[] {
  const segments = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)
  if (segments.length === 0 || segments.some((segment) => FORBIDDEN_SEGMENTS.has(segment))) {
    throw new Error(`Caminho de alteração inválido: ${path}`)
  }
  return segments
}

function readAtPath(root: unknown, path: string): unknown {
  const segments = pathSegments(path)
  let current: unknown = root
  for (const segment of segments) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

function writeAtPath(root: unknown, path: string, value: unknown): void {
  const segments = pathSegments(path)
  if (root === null || typeof root !== 'object') throw new Error('Alvo da alteração precisa ser um objeto')

  let current = root as Record<string, unknown> | unknown[]
  segments.forEach((segment, index) => {
    const isLast = index === segments.length - 1
    if (isLast) {
      if (Array.isArray(current) && /^\d+$/.test(segment)) current[Number(segment)] = value
      else (current as Record<string, unknown>)[segment] = value
      return
    }

    const nextSegment = segments[index + 1]
    const currentValue = Array.isArray(current) && /^\d+$/.test(segment)
      ? current[Number(segment)]
      : (current as Record<string, unknown>)[segment]
    if (currentValue === null || typeof currentValue !== 'object') {
      const nextValue = /^\d+$/.test(nextSegment) ? [] : {}
      if (Array.isArray(current) && /^\d+$/.test(segment)) current[Number(segment)] = nextValue
      else (current as Record<string, unknown>)[segment] = nextValue
    }
    current = Array.isArray(current) && /^\d+$/.test(segment)
      ? current[Number(segment)] as Record<string, unknown> | unknown[]
      : (current as Record<string, unknown>)[segment] as Record<string, unknown> | unknown[]
  })
}

export interface ProposalApplicationResult<T> {
  next: T
  applied: ChangeProposal[]
  conflicts: Array<ChangeProposal & { currentValue: unknown }>
}

/**
 * Aplica apenas mudanças aceitas pelo usuário. Uma divergência entre o valor
 * original da proposta e o valor atual vira conflito e não é sobrescrita.
 */
export function applyAcceptedChanges<T>(target: T, changes: ChangeProposal[]): ProposalApplicationResult<T> {
  const next = clone(target)
  const applied: ChangeProposal[] = []
  const conflicts: Array<ChangeProposal & { currentValue: unknown }> = []

  for (const change of changes) {
    if (!change.accepted) continue
    const currentValue = readAtPath(next, change.path)
    if (!equalJson(currentValue, change.oldValue)) {
      conflicts.push({ ...change, currentValue })
      continue
    }
    writeAtPath(next, change.path, clone(change.newValue))
    applied.push(change)
  }

  return { next, applied, conflicts }
}

export function readDomainPath(root: unknown, path: string): unknown {
  return readAtPath(root, path)
}

