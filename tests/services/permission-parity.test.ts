// tests/services/permission-parity.test.ts
// Testes de Paridade de Autorização e Capabilities Server-Authoritative (Hotfix P0)

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DocumentLifecycleService, getDocumentCapabilities } from '@/services/document-lifecycle.service';
import { SupabaseService } from '@/services/supabase.service';

describe('Permission Parity & Server Authoritative Capabilities', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('PERM-PARITY-1: Admin no servidor possui todas as capacidades de catálogo e template', async () => {
    vi.spyOn(SupabaseService, 'getServerTeamRole').mockResolvedValue({
      success: true,
      role: 'admin'
    });

    const res = await DocumentLifecycleService.getServerCapabilities();
    expect(res.success).toBe(true);
    expect(res.role).toBe('admin');
    expect(res.capabilities.canCreateCatalog).toBe(true);
    expect(res.capabilities.canCreateTemplate).toBe(true);
    expect(res.capabilities.canTranslateCatalog).toBe(true);
    expect(res.capabilities.canTranslateTemplate).toBe(true);
  });

  it('PERM-PARITY-2: Se team_role() retornar null no servidor, bloqueia todas as ações críticas', async () => {
    vi.spyOn(SupabaseService, 'getServerTeamRole').mockResolvedValue({
      success: false,
      role: null,
      error: 'Sem permissão'
    });

    const res = await DocumentLifecycleService.getServerCapabilities();
    expect(res.success).toBe(false);
    expect(res.role).toBeNull();
    expect(res.capabilities.canCreateCatalog).toBe(false);
    expect(res.capabilities.canCreateTemplate).toBe(false);
    expect(res.capabilities.canTranslateCatalog).toBe(false);
    expect(res.capabilities.canTranslateTemplate).toBe(false);
  });

  it('PERM-PARITY-3: Editor no servidor possui capacidades de catálogo e template', async () => {
    vi.spyOn(SupabaseService, 'getServerTeamRole').mockResolvedValue({
      success: true,
      role: 'editor'
    });

    const res = await DocumentLifecycleService.getServerCapabilities();
    expect(res.success).toBe(true);
    expect(res.role).toBe('editor');
    expect(res.capabilities.canTranslateCatalog).toBe(true);
    expect(res.capabilities.canTranslateTemplate).toBe(true);
  });

  it('PERM-PARITY-4: Viewer no servidor não possui capacidade de criar ou traduzir documentos', async () => {
    vi.spyOn(SupabaseService, 'getServerTeamRole').mockResolvedValue({
      success: true,
      role: 'viewer'
    });

    const res = await DocumentLifecycleService.getServerCapabilities();
    expect(res.success).toBe(true);
    expect(res.role).toBe('viewer');
    expect(res.capabilities.canCreateCatalog).toBe(false);
    expect(res.capabilities.canCreateTemplate).toBe(false);
    expect(res.capabilities.canTranslateCatalog).toBe(false);
    expect(res.capabilities.canTranslateTemplate).toBe(false);
  });

  it('PERM-PARITY-5: getDocumentCapabilities deriva capacidades estritas conforme a matriz corporativa', () => {
    const adminCaps = getDocumentCapabilities('admin');
    expect(adminCaps.canCreateCatalog).toBe(true);
    expect(adminCaps.canCreateTemplate).toBe(true);
    expect(adminCaps.canTranslateCatalog).toBe(true);
    expect(adminCaps.canTranslateTemplate).toBe(true);

    const viewerCaps = getDocumentCapabilities('viewer');
    expect(viewerCaps.canCreateCatalog).toBe(false);
    expect(viewerCaps.canCreateTemplate).toBe(false);
    expect(viewerCaps.canTranslateCatalog).toBe(false);
    expect(viewerCaps.canTranslateTemplate).toBe(false);

    const nullCaps = getDocumentCapabilities(null);
    expect(nullCaps.canTranslateTemplate).toBe(false);
  });
});
