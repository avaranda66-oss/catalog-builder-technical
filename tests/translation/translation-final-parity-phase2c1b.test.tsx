// tests/translation/translation-final-parity-phase2c1b.test.tsx
// Suíte de Testes Rigorosa — Fase 2C.1B: Non-Extractable WebCrypto Vault & Real Production Renderer Parity

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Catalog } from '@/domain/catalog.schema';
import { PersonalCredentialVault } from '@/translation/credential-vault';
import { RendererParityAuditor } from '@/translation/renderer-parity.auditor';
import { TranslationCredential } from '@/translation/types';
import { CleanA4Document } from '@/components/export/CleanA4Document';

describe('Phase 2C.1B: Non-Extractable WebCrypto Vault & Real Production Renderer Parity', () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    PersonalCredentialVault.clearSessionMemory();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. VAULT CRYPTO HARDENING (TR-VAULT-6 .. TR-VAULT-10)
  // =========================================================================

  it('TR-VAULT-6: CryptoKey é estritamente non-extractable (extractable === false)', async () => {
    const cred: TranslationCredential = {
      provider: 'gemini',
      apiKey: 'test-secure-api-key-987654',
      storageMode: 'remember'
    };

    await PersonalCredentialVault.saveCredential('user_strict_vault', cred);

    const { deviceKeyRecord } = await PersonalCredentialVault.inspectRawDeviceRecord('user_strict_vault');
    expect(deviceKeyRecord).toBeDefined();
    expect(deviceKeyRecord.cryptoKey).toBeDefined();

    // Valida que a chave é uma CryptoKey WebCrypto e que extractable é FALSE
    const cryptoKey = deviceKeyRecord.cryptoKey;
    expect(cryptoKey.extractable).toBe(false);
    expect(cryptoKey.type).toBe('secret');
    expect(cryptoKey.algorithm.name).toBe('AES-GCM');
  });

  it('TR-VAULT-7: ZERO material exportável no registro (jwk === undefined, sem k, keyMaterial, rawKey)', async () => {
    const cred: TranslationCredential = {
      provider: 'gemini',
      apiKey: 'test-zero-jwk-api-key',
      storageMode: 'remember'
    };

    await PersonalCredentialVault.saveCredential('user_zero_jwk', cred);

    const { deviceKeyRecord, credentialRecord } = await PersonalCredentialVault.inspectRawDeviceRecord('user_zero_jwk');

    // Validação estrita: Nenhum campo de chave exportável presente
    expect(deviceKeyRecord.jwk).toBeUndefined();
    expect(deviceKeyRecord.k).toBeUndefined();
    expect(deviceKeyRecord.rawKey).toBeUndefined();
    expect(deviceKeyRecord.keyMaterial).toBeUndefined();

    // No registro da credencial, apenas ciphertext e IV
    expect(credentialRecord.cipherText).toBeDefined();
    expect(credentialRecord.iv).toBeDefined();
    expect(credentialRecord.cipherText).not.toContain('test-zero-jwk-api-key');
  });

  it('TR-VAULT-8: ZERO chamadas a crypto.subtle.exportKey durante save e get de credenciais remember', async () => {
    const exportKeySpy = vi.spyOn(crypto.subtle, 'exportKey');

    const cred: TranslationCredential = {
      provider: 'gemini',
      apiKey: 'test-no-export-api-key',
      storageMode: 'remember'
    };

    await PersonalCredentialVault.saveCredential('user_no_export', cred);
    expect(exportKeySpy).toHaveBeenCalledTimes(0);

    PersonalCredentialVault.clearSessionMemory();

    const recovered = await PersonalCredentialVault.getCredential('user_no_export');
    expect(recovered?.apiKey).toBe('test-no-export-api-key');
    expect(exportKeySpy).toHaveBeenCalledTimes(0);
  });

  it('TR-VAULT-9: User A salva remember, limpa memória e recupera chave com sucesso', async () => {
    const cred: TranslationCredential = {
      provider: 'gemini',
      apiKey: 'user-a-persistent-key',
      storageMode: 'remember'
    };

    await PersonalCredentialVault.saveCredential('user_a_persist', cred);
    PersonalCredentialVault.clearSessionMemory();

    const recovered = await PersonalCredentialVault.getCredential('user_a_persist');
    expect(recovered).not.toBeNull();
    expect(recovered?.apiKey).toBe('user-a-persistent-key');
  });

  it('TR-VAULT-10: User B não consegue recuperar nem acessar credencial do User A', async () => {
    const cred: TranslationCredential = {
      provider: 'gemini',
      apiKey: 'user-a-private-key-456',
      storageMode: 'remember'
    };

    await PersonalCredentialVault.saveCredential('user_a_isolated', cred);
    PersonalCredentialVault.clearSessionMemory();

    const recoveredByB = await PersonalCredentialVault.getCredential('user_b_isolated');
    expect(recoveredByB).toBeNull();
  });

  // =========================================================================
  // 2. REAL PRODUCTION PRINT RENDERER PARITY (TR-PDF-REAL-1 .. TR-PDF-REAL-6)
  // =========================================================================

  it('TR-PDF-REAL-1: Renderiza o componente REAL CleanA4Document com os 21 BlockTypes e comprova 100% de paridade (0 órfãos)', async () => {
    // Fixture realista e rico contendo todos os 21 blocos da taxonomia
    const real21BlockCatalog: Catalog = {
      id: 'cat-real-21-blocks',
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

    // Monta o componente REAL de produção que gera o Clean PDF
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(CleanA4Document, { document: real21BlockCatalog }));
    });

    // Executa a auditoria no DOM gerado pelo componente de produção
    const result = RendererParityAuditor.auditRenderedDOM(container, real21BlockCatalog);

    if (result.orphanTextNodes.length > 0) {
      console.log('ORPHAN TEXT NODES:', JSON.stringify(result.orphanTextNodes, null, 2));
    }
    if (result.missingExpectedNodes.length > 0) {
      console.log('MISSING EXPECTED NODES:', JSON.stringify(result.missingExpectedNodes, null, 2));
    }
    if (result.sourceMismatchNodes.length > 0) {
      console.log('SOURCE MISMATCH NODES:', JSON.stringify(result.sourceMismatchNodes, null, 2));
    }

    expect(result.blockTypeCoverage).toBe(100);
    expect(result.registryClassificationCoverage).toBe(100);
    expect(result.rendererPrintableParityCoverage).toBe(100);
    expect(result.pdfPrintableTranslationCoverage).toBe(100);
    expect(result.orphanTextNodes.length).toBe(0);
    expect(result.missingExpectedNodes.length).toBe(0);
    expect(result.sourceMismatchNodes.length).toBe(0);
    expect(result.isComplete).toBe(true);

    await act(async () => root.unmount());
  });

  // =========================================================================
  // 3. NEGATIVE TESTS ESTREITOS (TR-PDF-REAL-2 .. TR-PDF-REAL-8 & TR-VAULT-11)
  // =========================================================================

  it('TR-PDF-REAL-2: Injeção de texto órfão sem ID faz o auditor FALHAR e registrar nó órfão', async () => {
    const catalog: Catalog = {
      id: 'cat-test-neg-2',
      title: 'Catálogo Teste',
      themeId: 'default',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [{ id: 'p1', pageNumber: 1, blocks: [{ id: 'b1', type: 'text', textContent: 'Texto Conhecido' }] }]
    };

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(CleanA4Document, { document: catalog }));
    });

    // Injeta elemento intruso órfão no DOM renderizado
    const orphanDiv = document.createElement('div');
    orphanDiv.textContent = 'Texto Hardcoded Não Classificado';
    container.querySelector('.clean-export-page')?.appendChild(orphanDiv);

    const result = RendererParityAuditor.auditRenderedDOM(container, catalog);
    expect(result.isComplete).toBe(false);
    expect(result.orphanTextNodes.length).toBeGreaterThan(0);
    expect(result.orphanTextNodes.some((o) => o.text.includes('Texto Hardcoded Não Classificado'))).toBe(true);

    await act(async () => root.unmount());
  });

  it('TR-PDF-REAL-3: data-print-string-key="invented_fake_key" é REJEITADO pelo auditor', async () => {
    const catalog: Catalog = {
      id: 'cat-test-neg-3',
      title: 'Catálogo Teste Chave Falsa',
      themeId: 'default',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [{ id: 'p1', pageNumber: 1, blocks: [{ id: 'b1', type: 'text', textContent: 'Texto Válido' }] }]
    };

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(CleanA4Document, { document: catalog }));
    });

    // Injeta atributo de sistema falso
    const fakeKeySpan = document.createElement('span');
    fakeKeySpan.setAttribute('data-print-string-key', 'invented_fake_key');
    fakeKeySpan.textContent = 'Texto com Chave Inexistente';
    container.querySelector('.clean-export-page')?.appendChild(fakeKeySpan);

    const result = RendererParityAuditor.auditRenderedDOM(container, catalog);
    expect(result.isComplete).toBe(false);
    expect(result.orphanTextNodes.length).toBeGreaterThan(0);

    await act(async () => root.unmount());
  });

  it('TR-PDF-REAL-4: data-printable-node-id="p1_fake_non_existent" é REJEITADO pelo auditor', async () => {
    const catalog: Catalog = {
      id: 'cat-test-neg-4',
      title: 'Catálogo Teste ID Fake',
      themeId: 'default',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [{ id: 'p1', pageNumber: 1, blocks: [{ id: 'b1', type: 'text', textContent: 'Texto Válido' }] }]
    };

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(CleanA4Document, { document: catalog }));
    });

    const fakeIdSpan = document.createElement('span');
    fakeIdSpan.setAttribute('data-printable-node-id', 'p1_fake_non_existent');
    fakeIdSpan.textContent = 'Texto com ID Não Registrado';
    container.querySelector('.clean-export-page')?.appendChild(fakeIdSpan);

    const result = RendererParityAuditor.auditRenderedDOM(container, catalog);
    expect(result.isComplete).toBe(false);
    expect(result.orphanTextNodes.length).toBeGreaterThan(0);

    await act(async () => root.unmount());
  });

  it('TR-PDF-REAL-5: data-printable-field="inventedFakeField" em bloco é REJEITADO pelo auditor', async () => {
    const catalog: Catalog = {
      id: 'cat-test-neg-5',
      title: 'Catálogo Teste Campo Falso',
      themeId: 'default',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [{ id: 'p1', pageNumber: 1, blocks: [{ id: 'b1', type: 'text', textContent: 'Texto Válido' }] }]
    };

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(CleanA4Document, { document: catalog }));
    });

    const blockWrapper = container.querySelector('[data-block-id="b1"]');
    const fakeFieldSpan = document.createElement('span');
    fakeFieldSpan.setAttribute('data-printable-field', 'inventedFakeField');
    fakeFieldSpan.textContent = 'Texto com Campo Fake';
    blockWrapper?.appendChild(fakeFieldSpan);

    const result = RendererParityAuditor.auditRenderedDOM(container, catalog);
    expect(result.isComplete).toBe(false);
    expect(result.orphanTextNodes.length).toBeGreaterThan(0);

    await act(async () => root.unmount());
  });

  it('TR-PDF-REAL-6: Elementos com .no-print e .editor-only são estritamente ignorados na auditoria', async () => {
    const catalog: Catalog = {
      id: 'cat-test-neg-6',
      title: 'Catálogo Teste No-Print',
      themeId: 'default',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [{ id: 'p1', pageNumber: 1, blocks: [{ id: 'b1', type: 'text', textContent: 'Texto Válido' }] }]
    };

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(CleanA4Document, { document: catalog }));
    });

    const noPrintDiv = document.createElement('div');
    noPrintDiv.className = 'no-print';
    noPrintDiv.innerHTML = '<button>Adicionar Bloco</button><span>Controle de Editor 100mm</span>';
    container.querySelector('.clean-export-page')?.appendChild(noPrintDiv);

    const result = RendererParityAuditor.auditRenderedDOM(container, catalog);
    expect(result.isComplete).toBe(true);
    expect(result.orphanTextNodes.length).toBe(0);

    await act(async () => root.unmount());
  });

  it('TR-PDF-REAL-7: Nó obrigatório ausente do DOM falha a auditoria bidirecional (Registry -> DOM)', async () => {
    const catalog: Catalog = {
      id: 'cat-test-missing-node',
      title: 'Catálogo Teste Nó Ausente',
      themeId: 'default',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          blocks: [
            { id: 'b1', type: 'text', title: 'Título Obrigatório', textContent: 'Texto de Conteúdo' }
          ]
        }
      ]
    };

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(CleanA4Document, { document: catalog }));
    });

    // Remove deliberadamente o elemento de título do DOM
    const titleEl = container.querySelector('[data-printable-field="title"]');
    if (titleEl) {
      titleEl.remove();
    }

    const result = RendererParityAuditor.auditRenderedDOM(container, catalog);
    expect(result.isComplete).toBe(false);
    expect(result.missingExpectedNodes.length).toBeGreaterThan(0);
    expect(result.missingExpectedNodes.some((m) => m.id.includes('b1_title'))).toBe(true);

    await act(async () => root.unmount());
  });

  it('TR-PDF-REAL-8: Elemento com ID correto mas texto DOM divergente é detectado como sourceMismatch', async () => {
    const catalog: Catalog = {
      id: 'cat-test-mismatch',
      title: 'Catálogo Teste Mismatch',
      themeId: 'default',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          blocks: [
            { id: 'b1', type: 'text', textContent: 'Texto Oficial do Catálogo' }
          ]
        }
      ]
    };

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(CleanA4Document, { document: catalog }));
    });

    // Altera o texto renderizado para algo divergente do schema
    const textEl = container.querySelector('[data-printable-field="textContent"]');
    if (textEl) {
      textEl.textContent = 'Texto Divergente Não Sincronizado';
    }

    const result = RendererParityAuditor.auditRenderedDOM(container, catalog);
    expect(result.isComplete).toBe(false);
    expect(result.sourceMismatchNodes.length).toBeGreaterThan(0);
    expect(result.sourceMismatchNodes[0].expectedText).toBe('Texto Oficial do Catálogo');
    expect(result.sourceMismatchNodes[0].actualText).toBe('Texto Divergente Não Sincronizado');

    await act(async () => root.unmount());
  });

  it('TR-VAULT-11: Inicialização do Vault invoca deleção proativa da base de dados legada v4', async () => {
    const fakeDeleteDb = vi.fn();
    const fakeOpen = vi.fn().mockImplementation(() => {
      const req: any = {};
      queueMicrotask(() => {
        if (req.onsuccess) {
          req.result = {
            objectStoreNames: { contains: () => true }
          };
          req.onsuccess();
        }
      });
      return req;
    });

    const originalIndexedDB = (globalThis as any).indexedDB;
    (globalThis as any).indexedDB = {
      deleteDatabase: fakeDeleteDb,
      open: fakeOpen
    };

    try {
      await (PersonalCredentialVault as any).openDB();
      expect(fakeDeleteDb).toHaveBeenCalledWith('presys_catalog_vault_v4');
    } finally {
      (globalThis as any).indexedDB = originalIndexedDB;
    }
  });
});
