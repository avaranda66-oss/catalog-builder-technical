'use client'

import { saveAll, syncFromCloud, type SaveResult } from '../../lib/supabase/api'
import { useEditorStore, type WorkspaceData } from './editor-store'

let inFlight: Promise<SaveResult> | null = null

export function workspaceSnapshot(): WorkspaceData {
  const s = useEditorStore.getState()
  return { catalog: s.catalog, products: s.products, fieldDefinitions: s.fieldDefinitions, pages: s.pages, designTokens: s.designTokens, contact: s.contact, presets: s.presets }
}

/** All save buttons and autosave share this queue. No response can acknowledge newer edits. */
export function saveWorkspace(): Promise<SaveResult> {
  if (inFlight) return inFlight
  inFlight = performSave().finally(() => {
    inFlight = null
    if (useEditorStore.getState().saveStatus === 'unsaved') queueMicrotask(() => { void saveWorkspace() })
  })
  return inFlight
}

async function performSave(): Promise<SaveResult> {
  const start = useEditorStore.getState()
  const revision = start.localRevision
  const data = workspaceSnapshot()
  if (!start.localMode && (!start.currentUser || start.currentUser.role === 'viewer')) {
    const error = { code: 'forbidden' as const, message: 'Entre com uma conta de edição para sincronizar.' }
    start.setSaveStatus('error'); start.setLastError(error.message)
    return { supabase: false, localStorage: false, status: 'error', error }
  }
  start.setSaveStatus('saving')
  try {
    const result = await saveAll(data, start.localMode ? null : start.currentUser, 'Revisão do documento')
    const current = useEditorStore.getState()
    if (current.catalog?.id !== data.catalog?.id) return result
    if (result.status === 'cloud' || result.status === 'local') {
      current.acknowledgeSave(revision, { cloud: result.supabase, catalog: result.catalog, products: result.products })
    } else {
      current.setSaveStatus(result.status === 'conflict' ? 'conflict' : 'error')
      current.setLastError(result.error?.message || 'Não foi possível salvar. Seus dados continuam neste editor.')
    }
    return result
  } catch (cause) {
    const error = { code: 'network' as const, message: cause instanceof Error ? cause.message : 'Falha ao salvar.' }
    start.setSaveStatus('error'); start.setLastError(error.message)
    return { supabase: false, localStorage: false, status: 'error', error }
  }
}

export async function pullWorkspace(options: { preserveLocalCopy?: boolean; catalogId?: string } = {}): Promise<boolean> {
  if (inFlight) await inFlight
  const start = useEditorStore.getState()
  if (!start.currentUser || start.localMode || !start.catalog) return false
  const dirty = start.localRevision !== start.syncedRevision
  if (dirty && !options.preserveLocalCopy) return false
  if (dirty) start.archiveCurrentDocument()
  const revision = start.localRevision
  const catalogId = options.catalogId ?? start.catalog.id
  try {
    const data = await syncFromCloud({ ...workspaceSnapshot(), catalog: start.catalog }, catalogId)
    const current = useEditorStore.getState()
    if (current.localRevision !== revision || current.catalog?.id !== start.catalog.id || current.currentUser?.id !== start.currentUser.id) return false
    if (data.source !== 'supabase') throw new Error('A nuvem não pôde ser consultada. Nenhum dado local foi substituído.')
    if (!options.preserveLocalCopy && !options.catalogId && data.catalog.version === current.catalog.version) return true
    current.hydrateWorkspace({ ...data, presets: data.presets ?? current.presets }, 'cloud')
    current.setAuditLogs(data.auditLogs ?? [])
    current.setLastUpdatedBy(data.lastUpdatedBy ?? null)
    return true
  } catch (error) {
    useEditorStore.getState().setLastError(error instanceof Error ? error.message : 'Falha de sincronização.')
    return false
  }
}
