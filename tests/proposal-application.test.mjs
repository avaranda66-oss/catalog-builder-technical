import test from 'node:test'
import assert from 'node:assert/strict'
import { applyAcceptedChanges, readDomainPath } from '../lib/domain/proposal-application.ts'

test('aplica somente mudanças aceitas e mantém o alvo imutável', () => {
  const target = { data: { marketing: { title: 'Antigo', subtitle: 'Mantido' } } }
  const result = applyAcceptedChanges(target, [
    { path: 'data.marketing.title', fieldLabel: 'Título', oldValue: 'Antigo', newValue: 'Novo', accepted: true },
    { path: 'data.marketing.subtitle', fieldLabel: 'Subtítulo', oldValue: 'Mantido', newValue: 'Ignorado', accepted: false },
  ])

  assert.equal(readDomainPath(result.next, 'data.marketing.title'), 'Novo')
  assert.equal(readDomainPath(target, 'data.marketing.title'), 'Antigo')
  assert.equal(result.applied.length, 1)
  assert.equal(result.conflicts.length, 0)
})

test('não sobrescreve valor alterado depois da proposta', () => {
  const result = applyAcceptedChanges({ data: { specs: [{ value: 30 }] } }, [
    { path: 'data.specs[0].value', fieldLabel: 'Faixa', oldValue: 20, newValue: 40, accepted: true },
  ])

  assert.equal(result.applied.length, 0)
  assert.equal(result.conflicts.length, 1)
  assert.equal(result.conflicts[0].currentValue, 30)
  assert.equal(readDomainPath(result.next, 'data.specs[0].value'), 30)
})

test('bloqueia caminhos que poderiam alterar o protótipo', () => {
  assert.throws(
    () => applyAcceptedChanges({}, [{ path: '__proto__.polluted', fieldLabel: 'x', oldValue: undefined, newValue: true, accepted: true }]),
    /Caminho de alteração inválido/,
  )
})

test('cria objetos e arrays intermediários para um caminho novo', () => {
  const result = applyAcceptedChanges({}, [
    { path: 'data.electrical[0].signal', fieldLabel: 'Sinal', oldValue: undefined, newValue: 'mA', accepted: true },
  ])
  assert.equal(readDomainPath(result.next, 'data.electrical[0].signal'), 'mA')
})

