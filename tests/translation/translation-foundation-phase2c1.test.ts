import { describe, it, expect, beforeEach } from 'vitest';
import { BlockTypeSchema, Catalog, ContentBlock } from '@/domain/catalog.schema';
import { PrintableTextRegistry } from '@/translation/printable-text.registry';
import { CoverageAuditor } from '@/translation/coverage.auditor';
import { LanguageRegistry } from '@/translation/language.registry';
import { PersonalCredentialVault } from '@/translation/credential-vault';
import { TechnicalTokenProtector } from '@/translation/token-protector';
import { PrintStringRegistry } from '@/translation/print-strings.registry';
import { useTranslationStore } from '@/stores/useTranslationStore';
import { useCatalogStore } from '@/stores/useCatalogStore';

describe('Phase 2C.1: Global Translation Foundation, Printable Coverage & BYOK Vault', () => {
  beforeEach(() => {
    PersonalCredentialVault.clearSessionMemory();
    useTranslationStore.setState({
      credentialMeta: null,
      sampleResults: [],
      error: null
    });
  });

  // =========================================================================
  // 1. PRINTABLE TEXT & COVERAGE TESTS (TR-COV-1 .. TR-COV-4)
  // =========================================================================

  it('TR-COV-1: 100% dos 22 BlockTypes no BlockTypeSchema devem possuir extratores registrados', () => {
    const allBlockTypes = BlockTypeSchema.options;
    expect(PrintableTextRegistry.getRegisteredBlockTypes().length).toBe(22);

    expect(allBlockTypes.length).toBe(22);
    for (const blockType of allBlockTypes) {
      expect(
        PrintableTextRegistry.hasExtractor(blockType),
        `BlockType "${blockType}" não possui extrator de tradução registrado!`
      ).toBe(true);
    }
  });

  it('TR-COV-2: Fixture extremo contendo todos os 21 BlockTypes atinge 100% de cobertura (unclassified = 0)', () => {
    const extremeBlocks: ContentBlock[] = [
      { id: 'b_text', type: 'text', title: 'Título Bloco Texto', textContent: 'Conteúdo descritivo de calibração.' },
      { id: 'b_box', type: 'box', title: 'Caixa de Destaque', textContent: 'Alerta metrológico importante.' },
      { id: 'b_hero', type: 'hero_banner', title: 'Calibrador TA-25N', subtitle: 'Alta Exatidão', badgeText: 'Novo Lançamento' },
      { id: 'b_additel', type: 'additel_two_col_hero', title: 'Design Robusto', subtitle: 'Dois Canais', customData: { highlights: ['Display Touch', 'Conexão Rápida'] } },
      { id: 'b_fluke', type: 'fluke_header', title: 'Padrão Secundário', subtitle: 'Portátil', customData: { highlights: ['Bateria Recarregável'] } },
      { id: 'b_bottom_h', type: 'bottom_header', title: 'Rodapé Especial', subtitle: 'PRESYS Instrumentos' },
      {
        id: 'b_cover',
        type: 'full_page_cover',
        customData: {
          canvasLayers: [
            { id: 'l1', type: 'text', content: 'Catálogo Oficial 2026', zIndex: 1, x: 10, y: 10, visible: true, label: 'L1' },
            { id: 'l2', type: 'badge', content: 'Linha Metrológica', zIndex: 2, x: 10, y: 20, visible: true, label: 'L2' }
          ]
        }
      },
      {
        id: 'b_feat',
        type: 'features_list',
        title: 'Recursos Principais',
        features: [
          { id: 'f1', title: 'Estabilidade Térmica', description: 'Controle PID duplo de ±0.05 °C.' },
          { id: 'f2', title: 'Comunicação HART', description: 'Configuração direta de transmissores.' }
        ]
      },
      {
        id: 'b_soft',
        type: 'software_connectivity',
        title: 'Conectividade ISOPLAN',
        features: [{ id: 'sf1', title: 'Exportação Automática', description: 'Geração de certificados de calibração.' }]
      },
      {
        id: 'b_inserts',
        type: 'inserts_visual',
        title: 'Opções de Blocos de Inserção',
        customData: {
          inserts: [{ label: 'Bloco A (4 furos)', description: 'Furos de 1/4", 3/16", 1/8" e 6 mm.' }]
        }
      },
      {
        id: 'b_multi_mode',
        type: 'multi_mode_calibrator',
        title: 'Modos de Operação',
        customData: {
          modes: [{ title: 'Modo Bloco Seco', description: 'Faixa de -25 a 140 °C.' }]
        }
      },
      {
        id: 'b_table',
        type: 'table',
        title: 'Especificações Técnicas',
        tableColumns: [{ key: 'range', label: 'Faixa de Medição' }, { key: 'acc', label: 'Exatidão' }],
        tableRows: [
          { id: 'r1', customNotes: 'Valores para bloco seco padrão', localOverrides: { range: '-25 °C a +140 °C' } }
        ]
      },
      {
        id: 'b_specs',
        type: 'specs_table',
        title: 'Tabela Metrológica',
        tableColumns: [{ key: 'res', label: 'Resolução' }]
      },
      {
        id: 'b_elec',
        type: 'electrical_table',
        title: 'Entradas Elétricas',
        tableColumns: [{ key: 'input', label: 'Sinal de Entrada' }]
      },
      {
        id: 'b_acc_tab',
        type: 'accessories_table',
        title: 'Acessórios Inclusos',
        tableColumns: [{ key: 'item', label: 'Item Fornecido' }]
      },
      {
        id: 'b_cust_tab',
        type: 'custom_table',
        customData: {
          headers: ['Parâmetro', 'Condição'],
          rows: [['Estabilidade', '±0.02 °C após 15 min']]
        }
      },
      {
        id: 'b_mat_tab',
        type: 'matrix_spec_table',
        customData: {
          sections: [{ title: 'Incertezas Combinadas' }]
        }
      },
      {
        id: 'b_order',
        type: 'ordering_codes',
        title: 'Código para Encomenda',
        orderingSegments: [
          { id: 's1', code: 'TA-25N', name: 'Modelo Base', options: ['Alimentação 110 Vac', 'Alimentação 220 Vac'] }
        ]
      },
      { id: 'b_img', type: 'image', imageCaption: 'Vista frontal do calibrador com display touchscreen' },
      {
        id: 'b_gallery',
        type: 'image_gallery',
        title: 'Galeria de Aplicações',
        images: [{ url: 'https://example.com/foto1.jpg', caption: 'Uso em bancada de calibração' }]
      },
      {
        id: 'b_contact',
        type: 'contact_footer',
        title: 'Atendimento PRESYS',
        contactInfo: { companyName: 'PRESYS Instrumentos', address: 'São Paulo - SP, Brasil' }
      }
    ];

    const catalog: Catalog = {
      id: 'cat_extreme_test',
      title: 'Catálogo Mestre TA-25N',
      subtitle: 'Calibrador Portátil de Alta Precisão',
      themeId: 'default',
      pages: [
        { id: 'p1', pageNumber: 1, title: 'Capa e Apresentação', blocks: extremeBlocks.slice(0, 7) },
        { id: 'p2', pageNumber: 2, title: 'Especificações & Recursos', blocks: extremeBlocks.slice(7, 14) },
        { id: 'p3', pageNumber: 3, title: 'Dimensões & Pedido', blocks: extremeBlocks.slice(14) }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1
    };

    const audit = CoverageAuditor.auditCatalog(catalog);

    expect(audit.printableTextCount).toBeGreaterThan(25);
    expect(audit.translateCount).toBeGreaterThan(20);
    expect(audit.unclassifiedCount).toBe(0);
    expect(audit.isComplete).toBe(true);
  });

  it('TR-COV-3: Metadados técnicos e IDs não devem ser extraídos como texto traduzível', () => {
    const catalog: Catalog = {
      id: 'cat_metadata_test',
      title: 'Catálogo de Teste',
      themeId: 'default',
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          blocks: [
            {
              id: 'b1',
              type: 'table',
              assetId: 'asset-secret-123',
              imageUrl: 'https://storage.privado/foto.jpg',
              tableRows: [
                {
                  id: 'row-technical-uuid',
                  productRefId: 'prod-internal-uuid-999',
                  localOverrides: {
                    productId: 'prod-internal-uuid-999',
                    assetId: 'asset-secret-123'
                  }
                }
              ]
            }
          ]
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1
    };

    const audit = CoverageAuditor.auditCatalog(catalog);
    const allSourceTexts = audit.nodes.map((n) => n.sourceText);

    expect(allSourceTexts).not.toContain('asset-secret-123');
    expect(allSourceTexts).not.toContain('https://storage.privado/foto.jpg');
    expect(allSourceTexts).not.toContain('prod-internal-uuid-999');
    expect(allSourceTexts).not.toContain('row-technical-uuid');
  });

  it('TR-COV-4: Bloco não registrado bloqueia a cobertura (unclassified > 0 e isComplete = false)', () => {
    const catalogWithUnknownBlock: any = {
      id: 'cat_unknown_block',
      title: 'Catálogo Inválido',
      themeId: 'default',
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          blocks: [
            {
              id: 'b_future_card',
              type: 'future_unregistered_card_type',
              title: 'Card desconhecido'
            }
          ]
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1
    };

    const audit = CoverageAuditor.auditCatalog(catalogWithUnknownBlock);

    expect(audit.unclassifiedCount).toBeGreaterThan(0);
    expect(audit.isComplete).toBe(false);
  });

  // =========================================================================
  // 2. LANGUAGE REGISTRY & MULTISCRIPT (TR-LANG-1 .. TR-LANG-3)
  // =========================================================================

  it('TR-LANG-1: Códigos BCP-47 devem ser únicos e válidos no LanguageRegistry', () => {
    const languages = LanguageRegistry.getAllLanguages();
    const codes = languages.map((l) => l.code.toLowerCase());
    const uniqueCodes = new Set(codes);

    expect(languages.length).toBeGreaterThanOrEqual(30);
    expect(uniqueCodes.size).toBe(codes.length);
  });

  it('TR-LANG-2: Todos os idiomas devem possuir script, direção e fontProfile', () => {
    const languages = LanguageRegistry.getAllLanguages();

    for (const lang of languages) {
      expect(lang.code).toBeTruthy();
      expect(lang.nativeName).toBeTruthy();
      expect(lang.script).toBeTruthy();
      expect(['ltr', 'rtl']).toContain(lang.direction);
      expect(lang.fontProfile).toBeTruthy();
      expect(['ready', 'experimental']).toContain(lang.translationSupport);
      expect(['ready', 'experimental']).toContain(lang.layoutSupport);
    }
  });

  it('TR-LANG-3: Suporte multiscript registrado para Thai, Russo, CJK, Árabe, Hebraico e Hindi', () => {
    const thai = LanguageRegistry.getLanguageByCode('th-TH');
    const russian = LanguageRegistry.getLanguageByCode('ru-RU');
    const chinese = LanguageRegistry.getLanguageByCode('zh-CN');
    const japanese = LanguageRegistry.getLanguageByCode('ja-JP');
    const arabic = LanguageRegistry.getLanguageByCode('ar-SA');
    const hebrew = LanguageRegistry.getLanguageByCode('he-IL');
    const hindi = LanguageRegistry.getLanguageByCode('hi-IN');

    expect(thai).toBeDefined();
    expect(thai?.script).toBe('Thai');
    expect(thai?.fontProfile).toBe('sans-thai');

    expect(russian).toBeDefined();
    expect(russian?.script).toBe('Cyrillic');

    expect(chinese).toBeDefined();
    expect(chinese?.script).toBe('Han');

    expect(japanese).toBeDefined();
    expect(japanese?.script).toBe('Japanese');

    expect(arabic).toBeDefined();
    expect(arabic?.direction).toBe('rtl');
    expect(arabic?.layoutSupport).toBe('experimental');

    expect(hebrew).toBeDefined();
    expect(hebrew?.direction).toBe('rtl');

    expect(hindi).toBeDefined();
    expect(hindi?.script).toBe('Devanagari');
  });

  // =========================================================================
  // 3. PERSONAL BYOK VAULT & CREDENTIAL ISOLATION (TR-KEY-1 .. TR-KEY-6)
  // =========================================================================

  it('TR-KEY-1: Credencial do Usuário A é inacessível para o Usuário B (Isolamento estrito)', async () => {
    const userA = 'user_alpha_uuid';
    const userB = 'user_beta_uuid';

    // Usuário A salva sua chave pessoal em modo sessão
    await PersonalCredentialVault.saveCredential(userA, {
      provider: 'gemini',
      apiKey: 'secret_key_of_user_a',
      storageMode: 'session'
    });

    // Usuário A consegue ler sua chave
    const credA = await PersonalCredentialVault.getCredential(userA);
    expect(credA?.apiKey).toBe('secret_key_of_user_a');

    // Usuário B NÃO consegue acessar a chave de A
    const credB = await PersonalCredentialVault.getCredential(userB);
    expect(credB).toBeNull();
  });

  it('TR-KEY-2: Chave pessoal nunca é gravada em localStorage em texto puro', async () => {
    const user = 'user_test_ls';
    const testSecret = 'AIzaSySecretNeverInPlainLocalStorage';

    await PersonalCredentialVault.saveCredential(user, {
      provider: 'gemini',
      apiKey: testSecret,
      storageMode: 'session'
    });

    // Varre localStorage para garantir ausência do segredo
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key);
        expect(value).not.toContain(testSecret);
      }
    }
  });

  it('TR-KEY-3: Modo sessão limpa credenciais da memória ao efetuar clearSessionMemory()', async () => {
    const user = 'user_session_cleanup';

    await PersonalCredentialVault.saveCredential(user, {
      provider: 'gemini',
      apiKey: 'session_temp_key_123',
      storageMode: 'session'
    });

    expect(await PersonalCredentialVault.getCredential(user)).not.toBeNull();

    // Simula logout / reset de memória
    PersonalCredentialVault.clearSessionMemory();

    expect(await PersonalCredentialVault.getCredential(user)).toBeNull();
  });

  it('TR-KEY-5: Ação de remoção de credencial funciona imediatamente', async () => {
    const user = 'user_removal_test';

    await PersonalCredentialVault.saveCredential(user, {
      provider: 'gemini',
      apiKey: 'temp_to_be_deleted',
      storageMode: 'session'
    });

    await PersonalCredentialVault.removeCredential(user);

    expect(await PersonalCredentialVault.getCredential(user)).toBeNull();
    expect(await PersonalCredentialVault.getCredentialMetadata(user)).toBeNull();
  });

  it('TR-KEY-6: Estado do catálogo nunca armazena chaves de API nem metadados confidenciais', () => {
    const catalog = useCatalogStore.getState().currentCatalog;
    const json = JSON.stringify(catalog);

    expect(json).not.toContain('AIza');
    expect(json).not.toContain('apiKey');
    expect(json).not.toContain('geminiKey');
  });

  // =========================================================================
  // 4. TECHNICAL TOKEN PROTECTOR & GLOSSARY (TR-TECH-1 .. TR-TECH-2)
  // =========================================================================

  it('TR-TECH-1: Tokens técnicos metrológicos e de modelos são identificados e restaurados perfeitamente', () => {
    const originalText = 'Calibrador TA-25N com faixa de -25 °C a +140 °C, exatidão de ±0.1 °C e comunicação HART.';

    const { maskedText, tokenMap } = TechnicalTokenProtector.protectTokens(originalText);

    expect(maskedText).toContain('[[TECH_');
    expect(maskedText).not.toContain('TA-25N');
    expect(maskedText).not.toContain('HART');
    expect(tokenMap.size).toBeGreaterThanOrEqual(4);

    // Simula resposta traduzida pelo LLM preservando os marcadores individuais e traduzindo a preposição
    let fakeTranslatedMasked = maskedText
      .replace('Calibrador', 'Advanced calibrator')
      .replace('com faixa de', 'with range from')
      .replace('exatidão de', 'accuracy of')
      .replace('e comunicação', 'and communication');

    const restored = TechnicalTokenProtector.restoreTokens(fakeTranslatedMasked, tokenMap);

    expect(restored).toContain('TA-25N');
    expect(restored).toContain('-25 °C');
    expect(restored).toContain('+140 °C');
    expect(restored).toContain('±0.1 °C');
    expect(restored).toContain('HART');
  });

  it('TR-TECH-2: Resposta com placeholder corrompido ou ausente lança TRANSLATION_INVALID_RESPONSE', () => {
    const originalText = 'Termômetro TT-800 com exatidão de ±0.05 °C.';
    const { tokenMap } = TechnicalTokenProtector.protectTokens(originalText);

    // Simula resposta defeituosa do LLM que removeu um placeholder
    const corruptedResponse = 'Thermometer without placeholder and ±0.05 °C.';

    try {
      TechnicalTokenProtector.restoreTokens(corruptedResponse, tokenMap);
      expect.fail('Deveria ter lançado erro de placeholder ausente');
    } catch (err: any) {
      expect(err.code).toBe('TRANSLATION_INVALID_RESPONSE');
    }
  });

  // =========================================================================
  // 5. SYSTEM PRINT STRINGS & PREVIEW INTEGRITY (TR-PREVIEW-1)
  // =========================================================================

  it('TR-SYS-1: PrintStringRegistry retorna strings traduzidas com fallback inteligente', () => {
    expect(PrintStringRegistry.get('page_label', 'pt-BR')).toBe('Página');
    expect(PrintStringRegistry.get('page_label', 'en-US')).toBe('Page');
    expect(PrintStringRegistry.get('page_label', 'th-TH')).toBe('หน้า');
    expect(PrintStringRegistry.get('page_label', 'ru-RU')).toBe('Страница');
    expect(PrintStringRegistry.get('page_label', 'zh-CN')).toBe('页');
    expect(PrintStringRegistry.get('page_label', 'ar-SA')).toBe('صفحة');
  });

  it('TR-PREVIEW-1: Auditoria e execução de preview NÃO realizam mutação no catálogo atual nem incrementam versão', () => {
    const catalogBefore = useCatalogStore.getState().currentCatalog;
    const initialVersion = catalogBefore?.version;

    if (catalogBefore) {
      CoverageAuditor.auditCatalog(catalogBefore);
    }

    const catalogAfter = useCatalogStore.getState().currentCatalog;
    expect(catalogAfter?.version).toBe(initialVersion);
    expect(JSON.stringify(catalogAfter)).toBe(JSON.stringify(catalogBefore));
  });
});
