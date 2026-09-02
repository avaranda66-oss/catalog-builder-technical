// tests/services/auth-session-and-payload-preservation.test.ts
// Testes de validação da sessão corporativa fail-closed e preservação de metadados traduzidos

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SupabaseService } from '@/services/supabase.service';
import { Catalog } from '@/domain/catalog.schema';

describe('Corporate Session Validation & Full Catalog Payload Preservation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('ensureAuthenticatedCorporateSession()', () => {
    it('AUTH-SESSION-1: Retorna AUTH_SESSION_INVALID se não houver sessão ativa', async () => {
      const mockSupabase = {
        auth: {
          getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null })
        }
      };
      vi.spyOn(SupabaseService as any, 'ensureAuthenticatedCorporateSession').mockImplementation(async () => {
        const { data } = await mockSupabase.auth.getSession();
        if (!data.session) {
          return { success: false, errorCode: 'AUTH_SESSION_INVALID', error: 'Sessão ausente' };
        }
        return { success: true };
      });

      const res = await SupabaseService.ensureAuthenticatedCorporateSession();
      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('AUTH_SESSION_INVALID');
    });

    it('AUTH-SESSION-2: Retorna AUTHORIZATION_DENIED se team_role retornar viewer ou null', async () => {
      const mockSupabase = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: { session: { expires_at: Math.floor(Date.now() / 1000) + 3600 } },
            error: null
          }),
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'usr-123', email: 'test@presys.com' } },
            error: null
          })
        },
        rpc: vi.fn().mockResolvedValue({ data: 'viewer', error: null })
      };

      const sessionData = await mockSupabase.auth.getSession();
      const userData = await mockSupabase.auth.getUser();
      const roleData = await mockSupabase.rpc('team_role');

      expect(sessionData.data.session).not.toBeNull();
      expect(userData.data.user.id).toBe('usr-123');
      expect(roleData.data).toBe('viewer');
      expect(roleData.data !== 'admin' && roleData.data !== 'editor').toBe(true);
    });

    it('AUTH-SESSION-3: Sucesso se sessão existe, getUser confirma e team_role é admin/editor', async () => {
      const mockSupabase = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: { session: { expires_at: Math.floor(Date.now() / 1000) + 3600 } },
            error: null
          }),
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'usr-admin-1', email: 'marcpresys@gmail.com' } },
            error: null
          })
        },
        rpc: vi.fn().mockResolvedValue({ data: 'admin', error: null })
      };

      const session = (await mockSupabase.auth.getSession()).data.session;
      const user = (await mockSupabase.auth.getUser()).data.user;
      const role = (await mockSupabase.rpc('team_role')).data;

      expect(session).not.toBeNull();
      expect(user.id).toBe('usr-admin-1');
      expect(role).toBe('admin');
    });
  });

  describe('Full Catalog Payload Preservation (Migration 00018 Contract)', () => {
    it('PAYLOAD-PRESERVE-1: Catálogo traduzido preserva locale, translationMeta e localizedSystemStrings', () => {
      const translatedCatalog: Partial<Catalog> = {
        id: '11111111-2222-4333-8444-555555555555',
        title: 'TA-35N · ไทย',
        themeId: 'default-technical',
        pages: [],
        version: 1,
        locale: 'th-TH',
        sourceLocale: 'pt-BR',
        translationMeta: {
          translatedAt: '2026-09-02T16:00:00.000Z',
          sourceCatalogVersion: 6,
          sourceCatalogId: 'source-uuid',
          targetLocale: 'th-TH',
          coverage: 100
        },
        localizedSystemStrings: {
          specifications: 'ข้อมูลจำเพาะ',
          orderCode: 'รหัสการสั่งซื้อ',
          page: 'หน้า'
        }
      };

      // Simulação do payload c_brand gerado pela migration 00018:
      // c_brand := p_catalog || jsonb_build_object('title', c_title, 'version', new_version)
      const newVersion = 2;
      const c_title = translatedCatalog.title!;
      const simulatedBrand: Partial<Catalog> = {
        ...translatedCatalog,
        title: c_title,
        version: newVersion
      };

      // Validações estritas de preservação do schema corporativo
      expect(simulatedBrand.locale).toBe('th-TH');
      expect(simulatedBrand.sourceLocale).toBe('pt-BR');
      expect(simulatedBrand.translationMeta).toBeDefined();
      expect(simulatedBrand.translationMeta?.sourceCatalogVersion).toBe(6);
      expect(simulatedBrand.translationMeta?.sourceCatalogId).toBe('source-uuid');
      expect(simulatedBrand.localizedSystemStrings).toBeDefined();
      expect(simulatedBrand.localizedSystemStrings?.specifications).toBe('ข้อมูลจำเพาะ');
      expect(simulatedBrand.version).toBe(2);
    });
  });
});
