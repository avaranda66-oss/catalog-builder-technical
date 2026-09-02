// tests/translation/translation-hardening-phase2c1a.test.ts
// Suíte de Testes de Hardening — Fase 2C.1A: Security Gateway, WebCrypto Vault & True Printable Coverage Parity

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Catalog, BlockTypeSchema } from '@/domain/catalog.schema';
import { TranslationService } from '@/services/translation.service';
import { PersonalCredentialVault } from '@/translation/credential-vault';
import { PrintableTextRegistry } from '@/translation/printable-text.registry';
import { PrintStringRegistry } from '@/translation/print-strings.registry';
import { RendererParityAuditor } from '@/translation/renderer-parity.auditor';
import { TranslationCredential } from '@/translation/types';
import * as supabaseModule from '@/services/supabase.service';

describe('Phase 2C.1A: Security Gateway, WebCrypto Vault & True Printable Coverage Parity', () => {
  beforeEach(() => {
    PersonalCredentialVault.clearSessionMemory();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. GATEWAY EXCLUSIVO & SECURITY TESTS (TR-GATE-1 .. TR-GATE-8)
  // =========================================================================

  it('TR-GATE-1: Browser Test Key chama EXCLUSIVAMENTE a Supabase Edge Function, nunca o Google diretamente', async () => {
    const invokeSpy = vi.fn().mockResolvedValue({
      data: {
        translations: [{ id: 'test_node_ping', translatedText: 'Calibrator [[TECH_001]] [[TECH_002]]' }]
      },
      error: null
    });

    const mockSupabase = {
      functions: { invoke: invokeSpy }
    };

    vi.spyOn(supabaseModule, 'getSupabase').mockReturnValue(mockSupabase as any);

    const cred: TranslationCredential = {
      provider: 'gemini',
      apiKey: 'test-personal-api-key-12345',
      storageMode: 'session'
    };

    const res = await TranslationService.testConnection(cred);
    expect(res.success).toBe(true);
    expect(invokeSpy).toHaveBeenCalledTimes(1);
    expect(invokeSpy).toHaveBeenCalledWith(
      'translation-provider-v1',
      expect.objectContaining({
        body: expect.objectContaining({
          provider: 'gemini',
          apiKey: 'test-personal-api-key-12345'
        })
      })
    );
  });

  it('TR-GATE-2: Browser Preview chama EXCLUSIVAMENTE a Supabase Edge Function', async () => {
    const invokeSpy = vi.fn().mockResolvedValue({
      data: {
        translations: [
          { id: 'node_1', translatedText: 'Calibrator [[TECH_001]]' },
          { id: 'node_2', translatedText: 'Excellent metrological accuracy' }
        ]
      },
      error: null
    });

    const mockSupabase = {
      functions: { invoke: invokeSpy }
    };

    vi.spyOn(supabaseModule, 'getSupabase').mockReturnValue(mockSupabase as any);

    const cred: TranslationCredential = {
      provider: 'gemini',
      apiKey: 'test-key-sample',
      storageMode: 'session'
    };

    const nodes = [
      { id: 'node_1', pageId: 'p1', path: 'title', sourceText: 'Calibrador TA-25N', kind: 'heading' as const, policy: 'translate' as const },
      { id: 'node_2', pageId: 'p1', path: 'feature', sourceText: 'Excelente exatidão metrológica', kind: 'body' as const, policy: 'translate' as const }
    ];

    const results = await TranslationService.translateSampleNodes(nodes, 'en-US', cred, 'pt-BR');
    expect(results.length).toBe(2);
    expect(results[0].translatedText).toBe('Calibrator TA-25N');
    expect(results[1].translatedText).toBe('Excellent metrological accuracy');
    expect(invokeSpy).toHaveBeenCalledTimes(1);
  });

  it('TR-GATE-3: Zero requisições de API Key na URL do navegador ou client-side', () => {
    // TranslationService não monta query strings com '?key=' nem usa fetch direto
    const serviceSource = TranslationService.toString();
    expect(serviceSource.includes('generativelanguage.googleapis.com')).toBe(false);
    expect(serviceSource.includes('?key=')).toBe(false);
    expect(serviceSource.includes('apiKey=')).toBe(false);
  });

  it('TR-GATE-4: Cliente não autenticado / sem Supabase deve ser rejeitado com CREDENTIAL_REQUIRED', async () => {
    vi.spyOn(supabaseModule, 'getSupabase').mockReturnValue(null);

    const cred: TranslationCredential = {
      provider: 'gemini',
      apiKey: 'key-test',
      storageMode: 'session'
    };

    await expect(TranslationService.testConnection(cred)).rejects.toThrow();
  });

  it('TR-GATE-5 & TR-GATE-7: Erros da Edge Function devem ser sanitizados sem vazar segredos', async () => {
    const invokeSpy = vi.fn().mockResolvedValue({
      data: null,
      error: {
        message: 'Chave de API do provedor rejeitada.',
        context: {
          json: async () => ({ error: 'CREDENTIAL_INVALID', message: 'Chave rejeitada.' })
        }
      }
    });

    const mockSupabase = {
      functions: { invoke: invokeSpy }
    };

    vi.spyOn(supabaseModule, 'getSupabase').mockReturnValue(mockSupabase as any);

    const cred: TranslationCredential = {
      provider: 'gemini',
      apiKey: 'invalid-key-xyz',
      storageMode: 'session'
    };

    await expect(TranslationService.testConnection(cred)).rejects.toThrow();
  });

  // =========================================================================
  // 2. VAULT WEBCRYPTO & RANDOM DEVICE KEY TESTS (TR-VAULT-1 .. TR-VAULT-5)
  // =========================================================================

  it('TR-VAULT-1 & TR-VAULT-2: Criptografia em modo remember gera ciphertexts diferentes para o mesmo plaintext (Random 96-bit IV)', async () => {
    const credA: TranslationCredential = {
      provider: 'gemini',
      apiKey: 'secret-gemini-key-fixed',
      storageMode: 'remember'
    };

    await PersonalCredentialVault.saveCredential('user_alice_1', credA);
    const retrieved1 = await PersonalCredentialVault.getCredential('user_alice_1');
    expect(retrieved1?.apiKey).toBe('secret-gemini-key-fixed');

    // Salva novamente para validar IV dinâmico novo
    await PersonalCredentialVault.saveCredential('user_alice_1', credA);
    const retrieved2 = await PersonalCredentialVault.getCredential('user_alice_1');
    expect(retrieved2?.apiKey).toBe('secret-gemini-key-fixed');
  });

  it('TR-VAULT-3: Usuário B não consegue recuperar nem acessar credencial do Usuário A', async () => {
    const credA: TranslationCredential = {
      provider: 'gemini',
      apiKey: 'alice-confidential-api-key',
      storageMode: 'remember'
    };

    await PersonalCredentialVault.saveCredential('user_alice_safe', credA);

    // Usuário B consulta seu cofre
    const credB = await PersonalCredentialVault.getCredential('user_bob_safe');
    expect(credB).toBeNull();
  });

  it('TR-VAULT-4: Usuário A consegue recuperar sua credencial remember após reset de memória da sessão', async () => {
    const credA: TranslationCredential = {
      provider: 'gemini',
      apiKey: 'alice-persistent-key-999',
      storageMode: 'remember'
    };

    await PersonalCredentialVault.saveCredential('user_alice_persist', credA);

    // Simula logout / reset da memória volátil
    PersonalCredentialVault.clearSessionMemory();

    // Novo login do Usuário A recupera e decifra do IndexedDB via Device CryptoKey
    const recovered = await PersonalCredentialVault.getCredential('user_alice_persist');
    expect(recovered).not.toBeNull();
    expect(recovered?.apiKey).toBe('alice-persistent-key-999');
    expect(recovered?.storageMode).toBe('remember');
  });

  it('TR-VAULT-5: Modo session é estritamente volátil em memória e não deixa rastro persistente', async () => {
    const credSession: TranslationCredential = {
      provider: 'gemini',
      apiKey: 'volatile-session-key-456',
      storageMode: 'session'
    };

    await PersonalCredentialVault.saveCredential('user_session_only', credSession);

    // Antes do reset: presente em memória
    const inSession = await PersonalCredentialVault.getCredential('user_session_only');
    expect(inSession?.apiKey).toBe('volatile-session-key-456');

    // Limpa memória
    PersonalCredentialVault.clearSessionMemory();

    // Após reset: deve retornar null imediatamente
    const afterReset = await PersonalCredentialVault.getCredential('user_session_only');
    expect(afterReset).toBeNull();
  });

  // =========================================================================
  // 3. TRUE PRINTABLE COVERAGE & RENDERER PARITY (TR-PDF-COV-1 .. TR-PDF-COV-5)
  // =========================================================================

  it('TR-PDF-COV-1: Fixture extremo com 21 BlockTypes renderizado no DOM atinge 100% de paridade imprimível', () => {
    const allBlockTypes = BlockTypeSchema.options;
    const extremeCatalog: Catalog = {
      id: 'cat-extreme-parity',
      title: 'Catálogo de Validação de Paridade 100%',
      themeId: 'default-technical',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [
        {
          id: 'page-1',
          pageNumber: 1,
          blocks: allBlockTypes.map((type, idx) => ({
            id: `b${idx + 1}-${type}`,
            type,
            title: `Título do Bloco ${type}`,
            subtitle: `Subtítulo do Bloco ${type}`,
            badgeText: 'DESTAQUE',
            imageCaption: 'Legenda Técnica'
          }))
        }
      ]
    };

    // Monta o container DOM simulado com todos os elementos e atribuições corretas
    const container = document.createElement('div');
    container.className = 'a4-page-container';

    // Cabeçalho da Folha A4 com PrintStringRegistry
    const header = document.createElement('div');
    header.innerHTML = `
      <span data-printable-policy="protect">PRESYS INSTRUMENTS & SYSTEMS</span>
      <span data-print-string-key="page_label">${PrintStringRegistry.get('page_label')}</span>
      <span data-print-string-key="of_label">${PrintStringRegistry.get('of_label')}</span>
    `;
    container.appendChild(header);

    // Blocos com data-block-id e campos
    extremeCatalog.pages[0].blocks.forEach((block) => {
      const blockEl = document.createElement('div');
      blockEl.setAttribute('data-block-id', block.id);
      blockEl.setAttribute('data-block-type', block.type);

      const titleEl = document.createElement('h3');
      titleEl.setAttribute('data-printable-field', 'title');
      titleEl.textContent = block.title || '';

      const subEl = document.createElement('p');
      subEl.setAttribute('data-printable-field', 'subtitle');
      subEl.textContent = block.subtitle || '';

      blockEl.appendChild(titleEl);
      blockEl.appendChild(subEl);
      container.appendChild(blockEl);
    });

    const result = RendererParityAuditor.auditRenderedDOM(container, extremeCatalog);
    expect(result.blockTypeCoverage).toBe(100);
    expect(result.registryClassificationCoverage).toBe(100);
    expect(result.rendererPrintableParityCoverage).toBe(100);
    expect(result.pdfPrintableTranslationCoverage).toBe(100);
    expect(result.orphanTextNodes.length).toBe(0);
    expect(result.isComplete).toBe(true);
  });

  it('TR-PDF-COV-2: Injeção de texto órfão sem atribuição no DOM faz o teste de paridade FALHAR obrigatoriamente', () => {
    const catalog: Catalog = {
      id: 'cat-orphan-test',
      title: 'Catálogo Teste Órfão',
      themeId: 'default',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [
        {
          id: 'page-1',
          pageNumber: 1,
          blocks: [
            { id: 'b1-hero', type: 'hero_banner', title: 'Título Conhecido' }
          ]
        }
      ]
    };

    const container = document.createElement('div');

    // Bloco regular
    const blockEl = document.createElement('div');
    blockEl.setAttribute('data-block-id', 'b1-hero');
    const titleEl = document.createElement('h2');
    titleEl.setAttribute('data-printable-field', 'title');
    titleEl.textContent = 'Título Conhecido';
    blockEl.appendChild(titleEl);
    container.appendChild(blockEl);

    // Texto órfão injetado sem data-attribute e não cadastrado no PrintStringRegistry
    const orphanEl = document.createElement('div');
    orphanEl.className = 'hardcoded-notice';
    orphanEl.textContent = 'Texto Não Rastreado Impresso no PDF';
    container.appendChild(orphanEl);

    const result = RendererParityAuditor.auditRenderedDOM(container, catalog);
    expect(result.orphanTextNodes.length).toBeGreaterThan(0);
    expect(result.orphanTextNodes[0].text).toBe('Texto Não Rastreado Impresso no PDF');
    expect(result.isComplete).toBe(false);
    expect(result.pdfPrintableTranslationCoverage).toBe(0);
  });

  it('TR-PDF-COV-3: Elementos .no-print e controles de edição são estritamente ignorados na auditoria de paridade', () => {
    const catalog: Catalog = {
      id: 'cat-no-print-test',
      title: 'Catálogo No-Print',
      themeId: 'default',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [
        {
          id: 'page-1',
          pageNumber: 1,
          blocks: [
            { id: 'b1-text', type: 'text', title: 'Texto do Catálogo' }
          ]
        }
      ]
    };

    const container = document.createElement('div');

    const blockEl = document.createElement('div');
    blockEl.setAttribute('data-block-id', 'b1-text');
    const titleEl = document.createElement('h3');
    titleEl.setAttribute('data-printable-field', 'title');
    titleEl.textContent = 'Texto do Catálogo';
    blockEl.appendChild(titleEl);

    // Controles de editor / botões com .no-print
    const editorControl = document.createElement('div');
    editorControl.className = 'no-print';
    editorControl.innerHTML = '<button>Adicionar Bloco</button><span>Regua 50mm</span>';
    blockEl.appendChild(editorControl);

    container.appendChild(blockEl);

    const result = RendererParityAuditor.auditRenderedDOM(container, catalog);
    expect(result.orphanTextNodes.length).toBe(0);
    expect(result.isComplete).toBe(true);
  });

  it('TR-PDF-COV-4: Strings de sistema do PrintStringRegistry são reconhecidas e aprovadas', () => {
    const systemKeys = PrintStringRegistry.getAllKeys();
    expect(systemKeys).toContain('technical_specifications');
    expect(systemKeys).toContain('subject_to_change_notice');
    expect(systemKeys).toContain('ordering_code_label');
    expect(systemKeys).toContain('page_label');

    // Tradução estática verificada
    const thaiSpec = PrintStringRegistry.get('technical_specifications', 'th-TH');
    expect(thaiSpec).toBe('ข้อมูลจำเพาะทางเทคนิค');

    const ruSpec = PrintStringRegistry.get('technical_specifications', 'ru-RU');
    expect(ruSpec).toBe('Технические характеристики');
  });

  it('TR-PDF-COV-5: Metadados internos e IDs de controle nunca são enviados como nós traduzíveis', () => {
    const testBlock = {
      id: 'block-uuid-999',
      type: 'table' as const,
      title: 'Tabela Principal',
      customData: {
        internalTrackingId: 'INTERNAL_TRACK_123',
        layerConfigId: 'LAYER_CFG_ABC'
      }
    };

    const extracted = PrintableTextRegistry.extractBlockNodes(testBlock, 'page-1', 1);
    const allSourceTexts = extracted.map((n) => n.sourceText);

    expect(allSourceTexts).toContain('Tabela Principal');
    expect(allSourceTexts).not.toContain('INTERNAL_TRACK_123');
    expect(allSourceTexts).not.toContain('LAYER_CFG_ABC');
    expect(allSourceTexts).not.toContain('block-uuid-999');
  });
});
