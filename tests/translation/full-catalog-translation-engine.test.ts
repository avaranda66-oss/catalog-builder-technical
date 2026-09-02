// tests/translation/full-catalog-translation-engine.test.ts
// Suíte de Testes Rigorosa da Fase 2C.2: Full Catalog Translation Engine
// Validação dos 21 BlockTypes, Memória de Tradução, Chunking, Proteção Non-Destructive, Layout QA e Cloud Save.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Catalog } from '@/domain/catalog.schema';
import { PrintableTextRegistry } from '@/translation/printable-text.registry';
import { LanguageRegistry } from '@/translation/language.registry';
import {
  TranslationMemoryCache,
  computeCatalogContentHash
} from '@/translation/translation-cache';
import { TranslationApplierRegistry } from '@/translation/translation-applier.registry';
import { FullCatalogTranslationService } from '@/translation/full-catalog-translation.service';
import { TranslationLayoutAuditor } from '@/translation/layout-qa.auditor';
import { FontManager } from '@/translation/font-manager';
import { PersonalCredentialVault } from '@/translation/credential-vault';
import { useCatalogStore } from '@/stores/useCatalogStore';
import * as SupabaseServiceModule from '@/services/supabase.service';

describe('Phase 2C.2: Full Catalog Translation Engine & Non-Destructive Versioning', () => {
  const sampleCatalog: Catalog = {
    id: 'cat-orig-001',
    title: 'CALIBRADOR DE PRESSÃO PCON-Y18',
    subtitle: 'Tecnologia Industrial de Alta Precisão',
    themeId: 'default-technical',
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
    version: 5,
    sourceLocale: 'pt-BR',
    locale: 'pt-BR',
    pages: [
      {
        id: 'p1',
        pageNumber: 1,
        title: 'Página de Apresentação',
        blocks: [
          {
            id: 'hero1',
            type: 'hero_banner',
            badgeText: 'Série Especial 2026',
            title: 'CONTROLE AUTOMÁTICO DE PRESSÃO',
            subtitle: 'Geração pneumática até 70 bar com bomba interna integrada.'
          },
          {
            id: 'features1',
            type: 'features_list',
            title: 'RECURSOS PRINCIPAIS',
            features: [
              { id: 'f1', title: 'Malha Fechada', description: 'Estabilidade superior a < 0.003% FE.' },
              { id: 'f2', title: 'Interface Touchscreen', description: 'Display gráfico colorido de 7 polegadas.' }
            ]
          }
        ]
      },
      {
        id: 'p2',
        pageNumber: 2,
        title: 'Especificações Técnicas',
        blocks: [
          {
            id: 'table1',
            type: 'table',
            title: 'TABELA DE ESPECIFICAÇÕES METROLÓGICAS',
            tableColumns: [
              { key: 'param', label: 'Parâmetro Técnico', visible: true },
              { key: 'spec', label: 'Especificação Nominal', visible: true }
            ],
            tableRows: [
              {
                id: 'r1',
                localOverrides: { param: 'Faixa de Pressão', spec: '-0.9 a 70 bar' },
                customNotes: 'Rastreável RBC / Inmetro'
              }
            ]
          },
          {
            id: 'contact1',
            type: 'contact_footer',
            contactInfo: {
              companyName: 'PRESYS Instrumentos e Sistemas Ltda.',
              address: 'São Paulo - SP · Brasil',
              phone: '+55 (11) 3038-1300',
              email: 'vendas@presys.com.br'
            }
          }
        ]
      }
    ]
  };

  const real21BlockCatalog: Catalog = {
    id: 'cat-real-21-blocks',
    title: 'Catálogo Oficial de Calibração Industrial PRESYS',
    subtitle: 'Linha Completa de Calibradores de Pressão, Temperatura e Sinais Elétricos',
    themeId: 'default-technical',
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
    version: 1,
    pages: [
      {
        id: 'page-1',
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
          },
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
            badgeText: 'PRESYS'
            // Sem customData prévio para testar materialização de fallbacks
          },
          {
            id: 'b-fluke',
            type: 'fluke_header',
            title: 'SÉRIE TA-ADVANCED',
            subtitle: 'Blocos Secos de Alta Homogeneidade Térmica'
            // Sem customData prévio para testar materialização de fallbacks
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
            title: 'MATRIZ DE CONECTIVIDADE DE CAMPO'
            // Sem headers/rows prévios para testar materialização
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
              { id: 's1', code: 'PCON', name: 'Calibrador Base', options: ['PCON Standard', 'PCON Advanced'] },
              { id: 's2', code: '300', name: 'Faixa 300 bar', options: ['0-100 bar', '0-300 bar'] }
            ]
          },
          {
            id: 'b-soft',
            type: 'software_connectivity',
            title: 'CONECTIVIDADE ISOPLAN & DIGITAL LAB'
            // Sem customData.items prévios para testar materialização
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
            title: 'MODOS DE OPERAÇÃO DO INSTRUMENTO'
            // Sem customData.modes prévios para testar materialização
          },
          {
            id: 'b-gallery',
            type: 'image_gallery',
            title: 'GALERIA DE APLICAÇÕES INDUSTRIAIS',
            images: [
              { url: 'https://presys.com.br/img1.png', caption: 'Calibração em bancada de testes Petrobras' }
            ]
          },
          {
            id: 'b-text',
            type: 'text',
            title: 'INFORMAÇÕES ADICIONAIS DE SUPORTE TÉCNICO',
            textContent: 'Atendimento técnico qualificado em todo o território nacional.'
          },
          {
            id: 'b-box',
            type: 'box',
            title: 'AVISO IMPORTANTE DE SEGURANÇA OPERACIONAL',
            textContent: 'Consulte o manual de instruções antes de energizar o equipamento.'
          },
          {
            id: 'b-image',
            type: 'image',
            title: 'DIAGRAMA ESQUEMÁTICO DE LIGAÇÃO',
            imageCaption: 'Esquema de ligação do transmissor de 2 fios com fonte interna de 24 Vdc'
          },
          {
            id: 'b-contact',
            type: 'contact_footer',
            title: 'INFORMAÇÕES DE CONTATO E ASSISTÊNCIA TÉCNICA'
            // Sem contactInfo prévio para testar materialização
          }
        ]
      }
    ]
  };

  let mockInvoke: any;

  beforeEach(() => {
    TranslationMemoryCache.clearMemoryFallback();
    PersonalCredentialVault.clearSessionMemory();
    vi.restoreAllMocks();

    mockInvoke = vi.fn();
    vi.spyOn(SupabaseServiceModule, 'getSupabase').mockReturnValue({
      functions: {
        invoke: mockInvoke
      },
      rpc: vi.fn().mockResolvedValue({ data: { version: 1, updated_at: new Date().toISOString() }, error: null }),
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'cat-orig-001',
                name: 'CALIBRADOR DE PRESSÃO PCON-Y18',
                version: 5,
                created_at: '2026-09-01T10:00:00Z',
                updated_at: '2026-09-01T10:00:00Z',
                brand: sampleCatalog
              },
              error: null
            })
          })
        })
      })
    } as any);
  });

  // =========================================================================
  // 1. FULL CATALOG ROUND-TRIP TRANSLATION (TR-FULL-1..10)
  // =========================================================================

  it('TR-FULL-1: Round-trip invariant preserva 100% dos nós traduzíveis', async () => {
    const nodes = PrintableTextRegistry.extractCatalogNodes(sampleCatalog);
    const transMap = new Map<string, string>();

    nodes.forEach((n) => {
      transMap.set(n.id, `[EN] ${n.sourceText}`);
    });

    const applierRes = TranslationApplierRegistry.applyTranslations(sampleCatalog, transMap, 'en-US');
    expect(applierRes.unappliedCount).toBe(0);

    const reExtracted = PrintableTextRegistry.extractCatalogNodes(applierRes.translatedCatalog);
    expect(reExtracted.length).toBe(nodes.length);
  });

  it('TR-FULL-2: Catálogo original permanece byte-for-byte inalterado (Princípio Não-Destrutivo)', async () => {
    const originalSnapshot = JSON.stringify(sampleCatalog);

    mockInvoke.mockImplementation(async (_fnName: string, args: any) => {
      const nodes = args.body.nodes;
      return {
        data: {
          translations: nodes.map((n: any) => ({
            id: n.id,
            translatedText: `[TRANSLATED] ${n.text}`
          }))
        },
        error: null
      };
    });

    await PersonalCredentialVault.saveCredential('user_test', {
      provider: 'gemini',
      apiKey: 'test-api-key',
      storageMode: 'session'
    });

    await FullCatalogTranslationService.translateCatalog(sampleCatalog, 'en-US', 'user_test');

    const afterSnapshot = JSON.stringify(sampleCatalog);
    expect(afterSnapshot).toBe(originalSnapshot);
  });

  it('TR-FULL-8: Rejeita resposta com IDs duplicados (TRANSLATION_INVALID_RESPONSE)', async () => {
    mockInvoke.mockImplementation(async (_fnName: string, args: any) => {
      const nodes = args.body.nodes;
      // Retorna a contagem exata, mas com IDs duplicados
      return {
        data: {
          translations: nodes.map(() => ({
            id: 'doc_catalog_title', // TODOS COM O MESMO ID
            translatedText: 'Duplicate Title'
          }))
        },
        error: null
      };
    });

    await PersonalCredentialVault.saveCredential('user_dup', {
      provider: 'gemini',
      apiKey: 'test-key',
      storageMode: 'session'
    });

    await expect(
      FullCatalogTranslationService.translateCatalog(sampleCatalog, 'en-US', 'user_dup')
    ).rejects.toThrow('IDs duplicados detectados');
  });

  it('TR-FULL-9: Rejeita resposta com ID desconhecido ou extra (TRANSLATION_INVALID_RESPONSE)', async () => {
    mockInvoke.mockImplementation(async (_fnName: string, args: any) => {
      const nodes = args.body.nodes;
      return {
        data: {
          translations: [
            ...nodes.slice(1).map((n: any) => ({ id: n.id, translatedText: `[EN] ${n.text}` })),
            { id: 'unknown_hallucinated_node_id', translatedText: 'Hallucination' }
          ]
        },
        error: null
      };
    });

    await PersonalCredentialVault.saveCredential('user_unk', {
      provider: 'gemini',
      apiKey: 'test-key',
      storageMode: 'session'
    });

    await expect(
      FullCatalogTranslationService.translateCatalog(sampleCatalog, 'en-US', 'user_unk')
    ).rejects.toThrow('ID desconhecido ou extra');
  });

  it('TR-FULL-10: Rejeita resposta com contagem divergente (TRANSLATION_INVALID_RESPONSE)', async () => {
    mockInvoke.mockImplementation(async () => ({
      data: {
        translations: [{ id: 'doc_catalog_title', translatedText: 'Only One' }]
      },
      error: null
    }));

    await PersonalCredentialVault.saveCredential('user_cnt', {
      provider: 'gemini',
      apiKey: 'test-key',
      storageMode: 'session'
    });

    await expect(
      FullCatalogTranslationService.translateCatalog(sampleCatalog, 'en-US', 'user_cnt')
    ).rejects.toThrow('Contagem de nós divergente');
  });

  // =========================================================================
  // 2. 21 BLOCKTYPES COMPLETE CONTRACT & FALLBACK MATERIALIZATION
  // =========================================================================

  it('TR-21-BLOCKS-CONTRACT: 21 BlockTypes recebem traduções e materializam fallbacks com 0 nós unapplied', async () => {
    const nodes = PrintableTextRegistry.extractCatalogNodes(real21BlockCatalog);
    expect(nodes.length).toBeGreaterThanOrEqual(21);

    const transMap = new Map<string, string>();
    nodes.forEach((n) => {
      transMap.set(n.id, `[EN-TEST] ${n.sourceText}`);
    });

    const result = TranslationApplierRegistry.applyTranslations(real21BlockCatalog, transMap, 'en-US');

    expect(result.unappliedCount).toBe(0);
    expect(result.unappliedNodeIds).toHaveLength(0);

    const target = result.translatedCatalog;

    // 1. Full Page Cover (Canvas Layers)
    expect(target.pages[0].blocks[0].customData?.canvasLayers?.[0]?.content).toBe('[EN-TEST] Edição Técnica Internacional');

    // 2. Additel Two Col Hero (Fallback Materialization de bulletList e overview)
    const additelBlock = target.pages[0].blocks[2];
    expect(additelBlock.customData?.overview).toContain('[EN-TEST]');
    expect(additelBlock.customData?.bulletList?.[0] || additelBlock.customData?.bullets?.[0]).toContain('[EN-TEST]');

    // 3. Fluke Header (Fallback Materialization de highlights)
    const flukeBlock = target.pages[0].blocks[3];
    expect(flukeBlock.customData?.description).toContain('[EN-TEST]');
    expect(flukeBlock.customData?.highlights?.[0]).toContain('[EN-TEST]');

    // 4. Ordering Codes (Segments e Options aplicados)
    const orderingBlock = target.pages[0].blocks[12];
    expect(orderingBlock.orderingSegments?.[0]?.name).toContain('[EN-TEST]');
    expect(orderingBlock.orderingSegments?.[0]?.options?.[0]).toContain('[EN-TEST]');

    // 5. Software Connectivity (Fallback Materialization de items)
    const softwareBlock = target.pages[0].blocks[13];
    expect(softwareBlock.customData?.items?.[0]?.title).toContain('[EN-TEST]');

    // 6. Multi Mode Calibrator (Fallback Materialization de modes)
    const multiModeBlock = target.pages[0].blocks[15];
    expect(multiModeBlock.customData?.modes?.[0]?.title).toContain('[EN-TEST]');

    // 7. Image Gallery (Caption aplicada)
    const galleryBlock = target.pages[0].blocks[16];
    expect(galleryBlock.images?.[0]?.caption).toContain('[EN-TEST]');

    // 8. Contact Footer (Fallback Materialization de contactInfo)
    const contactBlock = target.pages[0].blocks[20];
    expect(contactBlock.contactInfo?.companyName).toContain('[EN-TEST]');
  });

  // =========================================================================
  // 3. SYSTEM STRINGS CACHE REGRESSION (TR-SYS-CACHE-REGRESSION)
  // =========================================================================

  it('TR-SYS-CACHE-REGRESSION: Run 1 e Run 2 (100% cache hit) produzem localizedSystemStrings idênticos', async () => {
    mockInvoke.mockImplementation(async (_fnName: string, args: any) => {
      const nodes = args.body.nodes;
      return {
        data: {
          translations: nodes.map((n: any) => ({
            id: n.id,
            translatedText: `[IT-TEST] ${n.text}`
          }))
        },
        error: null
      };
    });

    await PersonalCredentialVault.saveCredential('user_sys_cache', {
      provider: 'gemini',
      apiKey: 'test-key-cache',
      storageMode: 'session'
    });

    // Run 1: Tradução via Gateway
    const run1 = await FullCatalogTranslationService.translateCatalog(sampleCatalog, 'it-IT', 'user_sys_cache');
    expect(run1.cacheHits).toBe(0);
    expect(run1.translatedCatalog.localizedSystemStrings).toBeDefined();
    const run1Strings = run1.translatedCatalog.localizedSystemStrings!;

    // Run 2: Tradução 100% via Cache Local
    const run2 = await FullCatalogTranslationService.translateCatalog(sampleCatalog, 'it-IT', 'user_sys_cache');
    expect(run2.cacheHits).toBe(run2.totalNodes);
    expect(run2.translatedCatalog.localizedSystemStrings).toBeDefined();
    const run2Strings = run2.translatedCatalog.localizedSystemStrings!;

    // Validação de Identidade Estrita entre Run 1 e Run 2
    expect(run2Strings).toEqual(run1Strings);
    expect(run2Strings['technical_specifications']).toBe('[IT-TEST] Especificações Técnicas');
  });

  // =========================================================================
  // 4. CLOUD PERSISTENCE & SOURCE DRIFT INTEGRATION (TR-DRIFT & TR-SAVE)
  // =========================================================================

  it('TR-SOURCE-DRIFT-CREATE: Bloqueia criação de versão traduzida quando o catálogo fonte sofreu mutação remota', async () => {
    // 1. Tradução gerada sobre source version = 5
    const translatedMock: Catalog = {
      ...sampleCatalog,
      id: 'cat-trans-preview',
      title: 'PRESSURE CALIBRATOR PCON-Y18',
      locale: 'en-US',
      translationMeta: {
        sourceCatalogId: 'cat-orig-001',
        sourceCatalogVersion: 5,
        sourceContentHash: 'original-hash-123',
        sourceLocale: 'pt-BR',
        targetLocale: 'en-US',
        coverage: 100,
        layoutQaStatus: 'passed'
      }
    };

    // 2. Mock do Supabase retornando versão remota avançada (version = 6)
    vi.spyOn(SupabaseServiceModule.SupabaseService, 'getCatalog').mockResolvedValue({
      success: true,
      data: {
        ...sampleCatalog,
        version: 6 // MUTAÇÃO REMOTA CONCORRENTE
      }
    });

    const result = await useCatalogStore.getState().createTranslatedCatalogVersion(translatedMock);

    expect(result.success).toBe(false);
    expect(result.error).toContain('SOURCE_CHANGED_DURING_TRANSLATION');
  });

  it('TR-CLOUD-SAVE-PERSISTENCE: Cria novo catálogo na nuvem com novo UUID, preserva title traduzido e atualiza editorContext', async () => {
    const translatedMock: Catalog = {
      ...sampleCatalog,
      id: 'preview-uuid-temp',
      title: 'PRESSURE CALIBRATOR PCON-Y18',
      locale: 'en-US',
      translationMeta: {
        sourceCatalogId: 'cat-orig-001',
        sourceCatalogVersion: 5,
        sourceContentHash: await computeCatalogContentHash(sampleCatalog),
        sourceLocale: 'pt-BR',
        targetLocale: 'en-US',
        coverage: 100,
        layoutQaStatus: 'passed'
      }
    };

    vi.spyOn(SupabaseServiceModule.SupabaseService, 'getCatalog').mockResolvedValue({
      success: true,
      data: sampleCatalog
    });

    const saveSpy = vi.spyOn(SupabaseServiceModule.SupabaseService, 'saveCatalog').mockResolvedValue({
      success: true,
      data: { version: 1, updated_at: new Date().toISOString() }
    });

    const result = await useCatalogStore.getState().createTranslatedCatalogVersion(translatedMock);

    expect(result.success).toBe(true);
    expect(result.catalogId).toBeDefined();
    expect(result.catalogId).not.toBe(sampleCatalog.id);

    // Valida que o título traduzido em inglês foi preservado (sem reintrodução de português)
    const activeCatalog = useCatalogStore.getState().currentCatalog;
    expect(activeCatalog?.title).toBe('PRESSURE CALIBRATOR PCON-Y18');
    expect(activeCatalog?.locale).toBe('en-US');

    // Valida que o editorContext foi apontado para o novo ID
    const ctx = useCatalogStore.getState().editorContext;
    expect(ctx.kind === 'catalog' ? ctx.catalogId : '').toBe(result.catalogId);

    // Valida chamada a saveCatalog RPC no Supabase
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  // =========================================================================
  // 5. RTL & LAYOUT QA (TR-RTL & TR-LAYOUT)
  // =========================================================================

  it('TR-RTL-BIDI-WARNING: Detecta grandeza técnica sem isolamento bidi em documento RTL e emite RTL_WARNING', () => {
    const container = document.createElement('div');
    container.className = 'clean-export-root';
    container.setAttribute('dir', 'rtl');

    const unIsolatedEl = document.createElement('span');
    unIsolatedEl.setAttribute('data-printable-node-id', 'p1_b1_range');
    unIsolatedEl.textContent = '-25 a 140 °C'; // Grandeza metrológica
    container.appendChild(unIsolatedEl);

    const result = TranslationLayoutAuditor.auditLayout(container, 'ar-SA');
    expect(result.issues.some((i) => i.type === 'RTL_WARNING')).toBe(true);
  });

  it('TR-LANG-1: Todos os idiomas habilitados no LanguageRegistry possuem script, fontProfile e direção válidos', () => {
    const enabledLangs = LanguageRegistry.getAllLanguages().filter((l) => l.enabled);
    expect(enabledLangs.length).toBeGreaterThanOrEqual(10);

    enabledLangs.forEach((lang) => {
      const family = FontManager.getFontFamilyForLocale(lang.code);
      const dir = FontManager.getDirectionForLocale(lang.code);

      expect(family).toBeDefined();
      expect(typeof family).toBe('string');
      expect(['ltr', 'rtl']).toContain(dir);
      expect(lang.script).toBeDefined();
    });
  });
});
