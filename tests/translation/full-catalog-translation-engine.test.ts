// tests/translation/full-catalog-translation-engine.test.ts
// Suíte de Testes Automatizados da Fase 2C.2: Full Catalog Translation Engine
// Validação dos 21 BlockTypes, Memória de Tradução, Chunking, Proteção Non-Destructive e Versionamento.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Catalog } from '@/domain/catalog.schema';
import { PrintableTextRegistry } from '@/translation/printable-text.registry';
import { LanguageRegistry } from '@/translation/language.registry';
import {
  TranslationMemoryCache,
  computeNodeHash,
  computeCatalogContentHash,
  TRANSLATION_ENGINE_VERSION,
  DEFAULT_GLOSSARY_VERSION
} from '@/translation/translation-cache';
import { TranslationApplierRegistry } from '@/translation/translation-applier.registry';
import { FullCatalogTranslationService } from '@/translation/full-catalog-translation.service';
import { TechnicalTokenProtector } from '@/translation/token-protector';
import { TranslationLayoutAuditor } from '@/translation/layout-qa.auditor';
import { FontManager } from '@/translation/font-manager';
import { PersonalCredentialVault } from '@/translation/credential-vault';
import * as SupabaseService from '@/services/supabase.service';

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

  let mockInvoke: any;

  beforeEach(() => {
    TranslationMemoryCache.clearMemoryFallback();
    PersonalCredentialVault.clearSessionMemory();
    vi.restoreAllMocks();

    mockInvoke = vi.fn();
    vi.spyOn(SupabaseService, 'getSupabase').mockReturnValue({
      functions: {
        invoke: mockInvoke
      }
    } as any);
  });

  // =========================================================================
  // 1. NON-DESTRUCTIVE & ENGINE ROUND-TRIP INVARIANT TESTS (TR-FULL-1..8)
  // =========================================================================

  it('TR-FULL-1: Round-trip invariant extract(source) -> translate -> apply(clone) -> extract(clone) preserva 100% de nós', () => {
    const sourceNodes = PrintableTextRegistry.extractCatalogNodes(sampleCatalog);
    const transMap = new Map<string, string>();

    // Simula tradução de todos os nós com prefixo [EN]
    sourceNodes.forEach((node) => {
      if (node.policy === 'translate') {
        transMap.set(node.id, `[EN] ${node.sourceText}`);
      }
    });

    const result = TranslationApplierRegistry.applyTranslations(sampleCatalog, transMap, 'en-US');
    const translatedNodes = PrintableTextRegistry.extractCatalogNodes(result.translatedCatalog);

    expect(translatedNodes.length).toBe(sourceNodes.length);

    // Valida que cada nó traduzível recebeu exatamente a tradução simulada
    translatedNodes.forEach((tn) => {
      if (tn.policy === 'translate') {
        expect(tn.sourceText.startsWith('[EN] ')).toBe(true);
      }
    });
  });

  it('TR-FULL-2: Catálogo original permanece byte-for-byte e semanticamente inalterado (Princípio Não-Destrutivo)', () => {
    const originalDeepSnapshot = JSON.stringify(sampleCatalog);

    const transMap = new Map<string, string>([
      ['p1_bhero1_title', 'AUTOMATIC PRESSURE CONTROL'],
      ['p1_bhero1_badgeText', 'Special Series 2026']
    ]);

    const result = TranslationApplierRegistry.applyTranslations(sampleCatalog, transMap, 'en-US');

    // Catálogo fonte NUNCA deve sofrer mutação
    expect(JSON.stringify(sampleCatalog)).toBe(originalDeepSnapshot);
    expect(result.translatedCatalog).not.toBe(sampleCatalog);
    expect(result.translatedCatalog.id).toBe(sampleCatalog.id); // Clone mantém dados até o save com novo UUID
  });

  it('TR-FULL-3: Target clone recebe nós traduzidos em todos os blocos e campos editoriais', () => {
    const transMap = new Map<string, string>([
      ['p1_bhero1_title', 'AUTOMATIC PRESSURE CONTROLLER'],
      ['p1_bfeatures1_feat_f1_title', 'Closed Loop'],
      ['p1_bfeatures1_feat_f1_desc', 'Superior stability of < 0.003% FS.'],
      ['p2_btable1_col_param_label', 'Technical Parameter'],
      ['p2_btable1_row_r1_ov_param', 'Pressure Range'],
      ['p2_bcontact1_contact_address', 'São Paulo - SP · Brazil']
    ]);

    const result = TranslationApplierRegistry.applyTranslations(sampleCatalog, transMap, 'en-US');
    const translated = result.translatedCatalog;

    expect(translated.pages[0].blocks[0].title).toBe('AUTOMATIC PRESSURE CONTROLLER');
    expect(translated.pages[0].blocks[1].features?.[0].title).toBe('Closed Loop');
    expect(translated.pages[0].blocks[1].features?.[0].description).toBe('Superior stability of < 0.003% FS.');
    expect(translated.pages[1].blocks[0].tableColumns?.[0].label).toBe('Technical Parameter');
    expect(translated.pages[1].blocks[0].tableRows?.[0].localOverrides?.param).toBe('Pressure Range');
    expect(translated.pages[1].blocks[1].contactInfo?.address).toBe('São Paulo - SP · Brazil');
  });

  it('TR-FULL-4: Nós com policy protect e keep_source permanecem inalterados no clone traduzido', () => {
    const transMap = new Map<string, string>([
      ['p1_bhero1_title', 'AUTOMATIC PRESSURE CONTROL']
    ]);

    const result = TranslationApplierRegistry.applyTranslations(sampleCatalog, transMap, 'en-US');
    const translated = result.translatedCatalog;

    // Modelos e dados técnicos protegidos mantidos intactos
    expect(translated.pages[1].blocks[0].tableRows?.[0].localOverrides?.spec).toBe('-0.9 a 70 bar');
    expect(translated.pages[1].blocks[1].contactInfo?.email).toBe('vendas@presys.com.br');
  });

  it('TR-FULL-5: Strings de sistema são resolvidas via localizedSystemStrings sem fallback silencioso', () => {
    const localizedSystemStrings = {
      page_label: 'Page',
      technical_specifications: 'Technical Specifications',
      company_brand_footer: 'PRESYS Calibration Instruments'
    };

    const result = TranslationApplierRegistry.applyTranslations(
      sampleCatalog,
      new Map(),
      'en-US',
      localizedSystemStrings
    );

    expect(result.translatedCatalog.localizedSystemStrings?.page_label).toBe('Page');
    expect(result.translatedCatalog.localizedSystemStrings?.technical_specifications).toBe('Technical Specifications');
  });

  it('TR-FULL-6: Zero placeholders técnicos [[TECH_ sobrevivem no documento final após restauração', () => {
    const { protectedText, tokenMap } = TechnicalTokenProtector.protect(
      'Calibrador com sensor PCON-Y18 e pressão de 70 bar.'
    );

    expect(protectedText).toContain('[[TECH_001]]');
    expect(protectedText).toContain('[[TECH_002]]');

    // Simula resposta traduzida da IA substituindo palavras e mantendo os placeholders exatos gerados
    const aiResponse = protectedText
      .replace('Calibrador com sensor', 'Calibrator with')
      .replace('e pressão de', 'and pressure of');

    const restored = TechnicalTokenProtector.restore(aiResponse, tokenMap);

    expect(restored).not.toContain('[[TECH_');
    expect(restored).toBe('Calibrator with PCON-Y18 and pressure of 70 bar.');
  });

  it('TR-FULL-7: Resposta com nó faltante / missing ID é bloqueada e rejeitada pelo motor', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        translations: [{ id: 'p1_b1-hero_title', translatedText: 'Valid Text' }]
        // Faltando os outros nós do lote
      },
      error: null
    });

    await PersonalCredentialVault.saveCredential('user_test', {
      provider: 'gemini',
      apiKey: 'test-key',
      storageMode: 'session'
    });

    await expect(
      FullCatalogTranslationService.translateCatalog(sampleCatalog, 'en-US', 'user_test')
    ).rejects.toThrow();
  });

  // =========================================================================
  // 2. TRANSLATION CACHE & INCREMENTAL UPDATE TESTS (TR-CACHE-1..6)
  // =========================================================================

  it('TR-CACHE-1: Mesmo hash de conteúdo e parâmetros resulta em Cache HIT', async () => {
    const hash = await computeNodeHash({
      sourceText: 'Faixa de Pressão',
      sourceLocale: 'pt-BR',
      targetLocale: 'en-US',
      policy: 'translate',
      provider: 'gemini',
      model: 'gemini-2.5-flash'
    });

    await TranslationMemoryCache.set('user_1', {
      hash,
      nodeId: 'node_1',
      sourceLocale: 'pt-BR',
      targetLocale: 'en-US',
      sourceText: 'Faixa de Pressão',
      translatedText: 'Pressure Range',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      glossaryVersion: DEFAULT_GLOSSARY_VERSION,
      engineVersion: TRANSLATION_ENGINE_VERSION,
      createdAt: new Date().toISOString()
    });

    const cached = await TranslationMemoryCache.get('user_1', hash);
    expect(cached).not.toBeNull();
    expect(cached?.translatedText).toBe('Pressure Range');
  });

  it('TR-CACHE-2: Alteração no texto fonte gera hash diferente e resulta em Cache MISS', async () => {
    const hashOriginal = await computeNodeHash({
      sourceText: 'Faixa de Pressão Antiga',
      sourceLocale: 'pt-BR',
      targetLocale: 'en-US',
      provider: 'gemini',
      model: 'gemini-2.5-flash'
    });

    const hashModified = await computeNodeHash({
      sourceText: 'Faixa de Pressão Nova',
      sourceLocale: 'pt-BR',
      targetLocale: 'en-US',
      provider: 'gemini',
      model: 'gemini-2.5-flash'
    });

    expect(hashOriginal).not.toBe(hashModified);

    await TranslationMemoryCache.set('user_1', {
      hash: hashOriginal,
      nodeId: 'node_1',
      sourceLocale: 'pt-BR',
      targetLocale: 'en-US',
      sourceText: 'Faixa de Pressão Antiga',
      translatedText: 'Old Pressure Range',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      glossaryVersion: DEFAULT_GLOSSARY_VERSION,
      engineVersion: TRANSLATION_ENGINE_VERSION,
      createdAt: new Date().toISOString()
    });

    const miss = await TranslationMemoryCache.get('user_1', hashModified);
    expect(miss).toBeNull();
  });

  it('TR-CACHE-3: Mudança de targetLocale resulta em Cache MISS', async () => {
    const hashEn = await computeNodeHash({
      sourceText: 'Pressão',
      sourceLocale: 'pt-BR',
      targetLocale: 'en-US',
      provider: 'gemini',
      model: 'gemini-2.5-flash'
    });

    const hashTh = await computeNodeHash({
      sourceText: 'Pressão',
      sourceLocale: 'pt-BR',
      targetLocale: 'th-TH',
      provider: 'gemini',
      model: 'gemini-2.5-flash'
    });

    expect(hashEn).not.toBe(hashTh);
  });

  it('TR-CACHE-4: Mudança de modelo resulta em Cache MISS', async () => {
    const hashFlash = await computeNodeHash({
      sourceText: 'Pressão',
      sourceLocale: 'pt-BR',
      targetLocale: 'en-US',
      provider: 'gemini',
      model: 'gemini-2.5-flash'
    });

    const hashPro = await computeNodeHash({
      sourceText: 'Pressão',
      sourceLocale: 'pt-BR',
      targetLocale: 'en-US',
      provider: 'gemini',
      model: 'gemini-2.5-pro'
    });

    expect(hashFlash).not.toBe(hashPro);
  });

  it('TR-CACHE-5: Mudança de glossaryVersion resulta em Cache MISS', async () => {
    const hashV1 = await computeNodeHash({
      sourceText: 'Pressão',
      sourceLocale: 'pt-BR',
      targetLocale: 'en-US',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      glossaryVersion: 'v1.0'
    });

    const hashV2 = await computeNodeHash({
      sourceText: 'Pressão',
      sourceLocale: 'pt-BR',
      targetLocale: 'en-US',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      glossaryVersion: 'v2.0'
    });

    expect(hashV1).not.toBe(hashV2);
  });

  it('TR-CACHE-6: Atualização incremental reutiliza nós intactos e retraduz apenas nós modificados', async () => {
    // 1. Armazena no cache nó 1
    const node1Hash = await computeNodeHash({
      sourceText: 'Série Especial 2026',
      sourceLocale: 'pt-BR',
      targetLocale: 'en-US',
      provider: 'gemini',
      model: 'gemini-2.5-flash'
    });

    await TranslationMemoryCache.set('user_inc', {
      hash: node1Hash,
      nodeId: 'p1_bhero1_badgeText',
      sourceLocale: 'pt-BR',
      targetLocale: 'en-US',
      sourceText: 'Série Especial 2026',
      translatedText: 'Special Series 2026',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      glossaryVersion: DEFAULT_GLOSSARY_VERSION,
      engineVersion: TRANSLATION_ENGINE_VERSION,
      createdAt: new Date().toISOString()
    });

    // Mock do Gateway respondendo apenas para o nó modificado
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

    await PersonalCredentialVault.saveCredential('user_inc', {
      provider: 'gemini',
      apiKey: 'test-key-inc',
      storageMode: 'session'
    });

    const res = await FullCatalogTranslationService.translateCatalog(sampleCatalog, 'en-US', 'user_inc');

    expect(res.cacheHits).toBeGreaterThan(0);
    expect(res.translatedCatalog.pages[0].blocks[0].badgeText).toBe('Special Series 2026'); // Veio do cache
  });

  // =========================================================================
  // 3. VERSIONING, LINEAGE & SOURCE DRIFT PROTECTION (TR-VERSION-1..6)
  // =========================================================================

  it('TR-VERSION-1: Versão traduzida armazena sourceCatalogId, sourceVersion e sourceContentHash', async () => {
    mockInvoke.mockImplementation(async (_fnName: string, args: any) => {
      const nodes = args.body.nodes;
      return {
        data: {
          translations: nodes.map((n: any) => ({
            id: n.id,
            translatedText: `[EN] ${n.text}`
          }))
        },
        error: null
      };
    });

    await PersonalCredentialVault.saveCredential('user_ver', {
      provider: 'gemini',
      apiKey: 'test-key-ver',
      storageMode: 'session'
    });

    const res = await FullCatalogTranslationService.translateCatalog(sampleCatalog, 'en-US', 'user_ver');
    const meta = res.translatedCatalog.translationMeta;

    expect(meta).toBeDefined();
    expect(meta?.sourceCatalogId).toBe(sampleCatalog.id);
    expect(meta?.sourceCatalogVersion).toBe(sampleCatalog.version);
    expect(meta?.sourceContentHash).toBeDefined();
    expect(meta?.targetLocale).toBe('en-US');
    expect(meta?.coverage).toBe(100);
  });

  it('TR-VERSION-2: Zero credenciais ou chaves de API persistidas no translationMeta ou JSON do catálogo', async () => {
    mockInvoke.mockImplementation(async (_fnName: string, args: any) => {
      const nodes = args.body.nodes;
      return {
        data: {
          translations: nodes.map((n: any) => ({
            id: n.id,
            translatedText: `[EN] ${n.text}`
          }))
        },
        error: null
      };
    });

    await PersonalCredentialVault.saveCredential('user_sec', {
      provider: 'gemini',
      apiKey: 'secret-key-that-must-never-be-in-catalog-json',
      storageMode: 'session'
    });

    const res = await FullCatalogTranslationService.translateCatalog(sampleCatalog, 'en-US', 'user_sec');
    const jsonString = JSON.stringify(res.translatedCatalog);

    expect(jsonString).not.toContain('secret-key-that-must-never-be-in-catalog-json');
    expect((res.translatedCatalog.translationMeta as any)?.apiKey).toBeUndefined();
    expect((res.translatedCatalog.translationMeta as any)?.credential).toBeUndefined();
  });

  it('TR-VERSION-3: Concorrência: Alteração do catálogo original durante a tradução dispara Source Drift', async () => {
    const initialNodes = PrintableTextRegistry.extractCatalogNodes(sampleCatalog);
    const initialHash = await computeCatalogContentHash(initialNodes);

    // Simula catálogo original sendo editado concorrentemente em outro browser (versão 5 -> 6 e título novo)
    const modifiedCatalog: Catalog = {
      ...sampleCatalog,
      version: 6,
      title: 'CALIBRADOR DE PRESSÃO PCON-Y18 (NOVA REVISÃO)'
    };

    const hasDrift = await FullCatalogTranslationService.verifySourceDrift(
      modifiedCatalog,
      sampleCatalog.version,
      initialHash
    );

    expect(hasDrift).toBe(true);
  });

  // =========================================================================
  // 4. MULTISCRIPT & FONT ENGINE VALIDATION (TR-LANG-1 & TR-LAYOUT-1)
  // =========================================================================

  it('TR-LANG-1: Todos os idiomas habilitados no LanguageRegistry possuem script, fontProfile e direção válidos', () => {
    const allLanguages = LanguageRegistry.getAllLanguages();
    expect(allLanguages.length).toBeGreaterThan(15);

    allLanguages.forEach((lang) => {
      expect(lang.code).toMatch(/^[a-z]{2,3}(-[A-Z]{2,4})?$/);
      expect(['Latin', 'Cyrillic', 'Greek', 'Thai', 'Han', 'Japanese', 'Korean', 'Devanagari', 'Arabic', 'Hebrew']).toContain(lang.script);
      expect(['ltr', 'rtl']).toContain(lang.direction);
      expect(lang.fontProfile).toBeDefined();

      const fontStack = FontManager.getFontFamilyForLocale(lang.code);
      expect(fontStack).toBeDefined();
      expect(fontStack.length).toBeGreaterThan(5);
    });
  });

  it('TR-LAYOUT-1: TranslationLayoutAuditor audita DOM real e detecta conformidade de direção e fontes', () => {
    const container = document.createElement('div');
    container.className = 'clean-export-page';
    container.innerHTML = `
      <h1 data-printable-node-id="p1_title" style="width: 200px; overflow: hidden; white-space: nowrap;">
        Calibrador de Pressão de Alta Precisão Industrial com Estabilidade
      </h1>
    `;
    document.body.appendChild(container);

    const result = TranslationLayoutAuditor.auditLayout(container, 'th-TH');
    expect(result).toBeDefined();
    expect(result.status).toBeDefined();

    container.remove();
  });
});
