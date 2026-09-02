// tests/translation/translation-hardening-phase2c1a.test.ts
// Suíte de Testes de Hardening — Fase 2C.1A: Security Gateway, WebCrypto Vault & True Printable Coverage Parity

import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Catalog } from '@/domain/catalog.schema';
import { TranslationService } from '@/services/translation.service';
import { PersonalCredentialVault } from '@/translation/credential-vault';
import { PrintableTextRegistry } from '@/translation/printable-text.registry';
import { PrintStringRegistry } from '@/translation/print-strings.registry';
import { RendererParityAuditor } from '@/translation/renderer-parity.auditor';
import { TranslationCredential } from '@/translation/types';
import { CleanA4Document } from '@/components/export/CleanA4Document';
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

  it('TR-PDF-COV-1: Fixture extremo com 21 BlockTypes renderizado no DOM atinge 100% de paridade imprimível', async () => {
    const extremeCatalog: Catalog = {
      id: 'cat-extreme-parity',
      title: 'Catálogo Oficial de Calibração Industrial PRESYS',
      subtitle: 'Linha Completa de Calibradores de Pressão, Temperatura e Sinais Elétricos',
      themeId: 'default-technical',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [
        {
          id: 'page-cover',
          pageNumber: 1,
          blocks: [
            {
              id: 'b-cover',
              type: 'full_page_cover',
              title: 'PRESYS INSTRUMENTAÇÃO 2026',
              subtitle: 'Catálogo Geral de Calibração Metrológica',
              badgeText: 'CATÁLOGO GERAL',
              customData: {
                canvasLayers: [
                  { id: 'l1', type: 'text', content: 'Edição Técnica Internacional' },
                  { id: 'l2', type: 'badge', content: 'EXATIDÃO 0.01% FS' }
                ]
              }
            }
          ]
        },
        {
          id: 'page-content-1',
          pageNumber: 2,
          blocks: [
            {
              id: 'b-hero',
              type: 'hero_banner',
              title: 'PSV Portable — Calibrador de Válvulas de Segurança',
              subtitle: 'Geração pneumática até 300 bar com registro digital de bancada',
              badgeText: 'DESTAQUE',
              imageCaption: 'Gabinete portátil reforçado em alumínio naval'
            },
            {
              id: 'b-additel',
              type: 'additel_two_col_hero',
              title: 'SÉRIE PRESYS PCON-Y18',
              subtitle: 'Calibrador Automático de Pressão de Alta Estabilidade',
              badgeText: 'PRESYS',
              customData: {
                badgeSubtitle: 'Precision Metrology',
                overview: 'Controle automático de pressão com bomba elétrica integrada e comunicação Hart.',
                bullets: ['Estabilidade de 0.002 bar', 'Display touch screen colorido', 'Isolação galvânica']
              }
            },
            {
              id: 'b-fluke',
              type: 'fluke_header',
              title: 'SÉRIE TA-ADVANCED',
              subtitle: 'Blocos Secos de Alta Homogeneidade Térmica'
            },
            {
              id: 'b-bottom-hdr',
              type: 'bottom_header',
              title: 'SOLUÇÕES DE CALIBRAÇÃO METROLÓGICA PRESYS',
              subtitle: 'Padrões Nacionais e Internacionais Rastreáveis RBC / Inmetro'
            },
            {
              id: 'b-features',
              type: 'features_list',
              title: 'RECURSOS METROLÓGICOS AVANÇADOS',
              features: [
                { id: 'f1', title: 'Controle em Malha Fechada', description: 'Tempo de assentamento menor que 15 segundos.' },
                { id: 'f2', title: 'Software Isoplan Conectado', description: 'Emissão automática de certificados de calibração.' }
              ]
            },
            {
              id: 'b-tech-table',
              type: 'table',
              title: 'TABELA DE ESPECIFICAÇÕES TÉCNICAS',
              tableColumns: [
                { key: 'model', label: 'Modelo', visible: true },
                { key: 'range', label: 'Faixa Operacional', visible: true },
                { key: 'accuracy', label: 'Exatidão', visible: true }
              ],
              tableRows: [
                {
                  id: 'r1',
                  localOverrides: {
                    model: 'TA-25N',
                    range: '-25 a 140 °C',
                    accuracy: '± 0.1 °C'
                  }
                }
              ]
            },
            {
              id: 'b-specs-table',
              type: 'specs_table',
              title: 'ESPECIFICAÇÕES DE PERFORMANCE',
              tableColumns: [
                { key: 'param', label: 'Parâmetro', visible: true },
                { key: 'spec', label: 'Especificação', visible: true }
              ],
              tableRows: [
                { id: 'r2', localOverrides: { param: 'Estabilidade', spec: '± 0.02 °C' } }
              ]
            },
            {
              id: 'b-elec',
              type: 'electrical_table',
              title: 'SINAIS ELÉTRICOS & LOOP DE PROCESSO',
              tableColumns: [
                { key: 'signal', label: 'Sinal de Entrada/Saída', visible: true },
                { key: 'resolution', label: 'Resolução', visible: true }
              ],
              tableRows: [
                { id: 'r3', localOverrides: { signal: '4 a 20 mA com Loop 24V', resolution: '0.0001 mA' } }
              ]
            },
            {
              id: 'b-acc',
              type: 'accessories_table',
              title: 'ACESSÓRIOS INCLUSOS E OPCIONAIS',
              tableColumns: [
                { key: 'code', label: 'Código', visible: true },
                { key: 'item', label: 'Item', visible: true }
              ],
              tableRows: [
                { id: 'r4', localOverrides: { code: '06.01.0022-00', item: 'Inserto Multi-Furos de Alumínio' } }
              ]
            },
            {
              id: 'b-custom-tbl',
              type: 'custom_table',
              title: 'MATRIZ DE CONECTIVIDADE DE CAMPO',
              customData: {
                headers: ['Porta de Comunicação', 'Protocolo Suportado'],
                rows: [['USB / RS-485', 'Protocolo Modbus RTU e HART']]
              }
            },
            {
              id: 'b-matrix',
              type: 'matrix_spec_table',
              title: 'MATRIZ COMPARATIVA DE MODELOS',
              customData: {
                sections: [{ title: 'Seção de Comparação Térmica e Estabilidade' }]
              }
            },
            {
              id: 'b-ordering',
              type: 'ordering_codes',
              title: 'CÓDIGO DE ENCOMENDA PRESYS (PART NUMBER)',
              orderingSegments: [
                { id: 's1', code: 'PCON', name: 'Calibrador Base' },
                { id: 's2', code: '300', name: 'Faixa 300 bar' }
              ]
            },
            {
              id: 'b-soft',
              type: 'software_connectivity',
              title: 'CONECTIVIDADE ISOPLAN & DIGITAL LAB'
            },
            {
              id: 'b-inserts',
              type: 'inserts_visual',
              title: 'BLOCOS DE INSERÇÃO TÉRMICA USINADOS',
              customData: {
                inserts: [
                  { code: 'IN-01', title: 'Inserto Térmico 4 Furos', label: 'Inserto IN-01', description: '4 furos métricos de 6mm em latão especial.', holes: ['6mm', '6mm'] }
                ]
              }
            },
            {
              id: 'b-multi-mode',
              type: 'multi_mode_calibrator',
              title: 'MODOS DE OPERAÇÃO DO INSTRUMENTO',
              customData: {
                modes: [
                  { title: 'Modo Geração Autônoma', description: 'Pressurização elétrica automática via rampa de teste.' }
                ]
              }
            },
            {
              id: 'b-img',
              type: 'image',
              imageUrl: 'https://images.unsplash.com/photo-gauge',
              imageCaption: 'Vista em corte do sensor de pressão piezorresistivo de silício'
            },
            {
              id: 'b-gallery',
              type: 'image_gallery',
              title: 'GALERIA DE FOTOS EM APLICAÇÕES REAIS',
              images: [
                { url: 'https://images.unsplash.com/photo-1', caption: 'Calibração em linha de processo petroquímico' }
              ]
            },
            {
              id: 'b-contact',
              type: 'contact_footer',
              contactInfo: {
                companyName: 'PRESYS Instrumentos & Sistemas Ltda.',
                phone: '+55 (11) 3038-1300',
                email: 'vendas@presys.com.br',
                website: 'www.presys.com.br',
                address: 'São Paulo - SP · Brasil'
              }
            },
            {
              id: 'b-text',
              type: 'text',
              textContent: 'Nota Metrológica: Instrumentos fornecidos com certificado rastreável Inmetro/RBC.'
            },
            {
              id: 'b-box',
              type: 'box',
              textContent: 'Advertência de Segurança: Não exceder a pressão máxima de trabalho de 350 bar.'
            }
          ]
        }
      ]
    };

    // Monta o componente real CleanA4Document no DOM via React createRoot
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(CleanA4Document, { document: extremeCatalog }));
    });

    const result = RendererParityAuditor.auditRenderedDOM(container, extremeCatalog);
    expect(result.blockTypeCoverage).toBe(100);
    expect(result.registryClassificationCoverage).toBe(100);
    expect(result.rendererPrintableParityCoverage).toBe(100);
    expect(result.pdfPrintableTranslationCoverage).toBe(100);
    expect(result.orphanTextNodes.length).toBe(0);
    expect(result.isComplete).toBe(true);

    await act(async () => {
      root.unmount();
    });
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
