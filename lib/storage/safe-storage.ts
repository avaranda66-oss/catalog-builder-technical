export interface StringStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

function isQuotaExceeded(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const candidate = error as { name?: unknown; code?: unknown; message?: unknown }
    if (candidate.name === 'QuotaExceededError' || candidate.code === 22 || candidate.code === 1014) return true
    if (typeof candidate.message === 'string' && /quota|exceed/i.test(candidate.message)) return true
  }
  return error instanceof Error && /quota|exceed/i.test(error.message)
}

/**
 * Remove optional duplicated caches from a persisted Zustand/API payload.
 * The active document remains intact, so a full browser reload can recover it.
 */
export function compactPersistedValue(value: string): string | null {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const root = parsed as Record<string, unknown>
    const state = root.state && typeof root.state === 'object' && !Array.isArray(root.state)
      ? root.state as Record<string, unknown>
      : root
    let changed = false
    if (Array.isArray(state.localDocuments) && state.localDocuments.length > 0) {
      state.localDocuments = []
      changed = true
    }
    if (Array.isArray(state.libraryProducts) && state.libraryProducts.length > 0) {
      state.libraryProducts = []
      changed = true
    }
    return changed ? JSON.stringify(parsed) : null
  } catch {
    return null
  }
}

/** Try the complete value first, then retry once without optional caches. */
export function setItemWithQuotaRecovery(storage: StringStorage, key: string, value: string): boolean {
  try {
    storage.setItem(key, value)
    return true
  } catch (error) {
    if (!isQuotaExceeded(error)) throw error
    const compacted = compactPersistedValue(value)
    if (!compacted) return false
    try {
      storage.setItem(key, compacted)
      return true
    } catch {
      return false
    }
  }
}

/** Storage adapter used by Zustand so a full browser quota never breaks edits. */
export function createQuotaTolerantStorage(storage: StringStorage): StringStorage {
  return {
    getItem: (key) => {
      try { return storage.getItem(key) } catch { return null }
    },
    setItem: (key, value) => {
      // Persist remains in memory when both attempts fail; the explicit save
      // path reports the actionable backup message to the user.
      setItemWithQuotaRecovery(storage, key, value)
    },
    removeItem: (key) => {
      try { storage.removeItem(key) } catch { /* already unavailable */ }
    },
  }
}
