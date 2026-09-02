// src/translation/translation-applier.registry.ts
// Registro Central de Aplicação Não-Destrutiva de Traduções sobre a Estrutura do Catálogo
// Cobre os 21 BlockTypes, Headers de Página, Metadados Globais, Overrides Locais e Materialização de Fallbacks.

import { Catalog, CatalogPage, ContentBlock, FeatureItem, TableColumnConfig, CatalogTableRow, OrderingSegment } from '@/domain/catalog.schema';
import { TranslationApplierResult } from './types';
import { PrintStringRegistry } from './print-strings.registry';

export class TranslationApplierRegistry {
  /**
   * Helper unificado de aplicação que aceita Array de nós ou Map de traduções.
   */
  static apply(
    sourceCatalog: Catalog,
    translations: Array<{ id: string; text: string }> | Map<string, string>,
    targetLocale: string,
    localizedSystemStrings?: Record<string, string>
  ): TranslationApplierResult {
    const map =
      translations instanceof Map
        ? translations
        : new Map<string, string>(translations.map((t) => [t.id, t.text]));
    return this.applyTranslations(sourceCatalog, map, targetLocale, localizedSystemStrings);
  }

  /**
   * Aplica um mapa completo de traduções (NodeId -> Texto Traduzido) sobre um clone do catálogo.
   * Garante idempotência e imutabilidade do catálogo de origem.
   */
  static applyTranslations(
    sourceCatalog: Catalog,
    transMap: Map<string, string>,
    targetLocale: string,
    localizedSystemStrings?: Record<string, string>
  ): TranslationApplierResult {
    const clone: Catalog = JSON.parse(JSON.stringify(sourceCatalog));
    let appliedCount = 0;
    const appliedNodeIds = new Set<string>();

    clone.locale = targetLocale;
    clone.sourceLocale = sourceCatalog.sourceLocale || 'pt-BR';

    // 1. Strings de Sistema Localizadas (Fase 2C.2)
    if (localizedSystemStrings) {
      clone.localizedSystemStrings = { ...localizedSystemStrings };
    } else {
      clone.localizedSystemStrings = PrintStringRegistry.getAll(targetLocale);
    }

    // Aplica nós de strings de sistema fornecidos no transMap (sys_<key>)
    for (const [key, val] of transMap.entries()) {
      if (key.startsWith('sys_')) {
        const cleanKey = key.replace(/^sys_/, '');
        clone.localizedSystemStrings[cleanKey] = val;
        appliedCount++;
        appliedNodeIds.add(key);
      }
    }

    // Metadados Globais do Documento
    if (transMap.has('doc_catalog_title')) {
      clone.title = transMap.get('doc_catalog_title')!;
      appliedCount++;
      appliedNodeIds.add('doc_catalog_title');
    }

    if (transMap.has('doc_catalog_subtitle')) {
      clone.subtitle = transMap.get('doc_catalog_subtitle')!;
      appliedCount++;
      appliedNodeIds.add('doc_catalog_subtitle');
    }

    // 2. Itera Páginas e Blocos
    if (Array.isArray(clone.pages)) {
      clone.pages.forEach((page: CatalogPage, pageIdx: number) => {
        if (!page || typeof page !== 'object') return;
        const pageNumber = page.pageNumber || pageIdx + 1;

        if (transMap.has(`p${pageNumber}_page_title`)) {
          page.title = transMap.get(`p${pageNumber}_page_title`)!;
          appliedCount++;
          appliedNodeIds.add(`p${pageNumber}_page_title`);
        }

        if (Array.isArray(page.blocks)) {
          page.blocks.forEach((block: ContentBlock) => {
            if (!block || typeof block !== 'object') return;
            const blockId = block.id;

            // Campos Universais do ContentBlock
            if (transMap.has(`p${pageNumber}_b${blockId}_badgeText`)) {
              block.badgeText = transMap.get(`p${pageNumber}_b${blockId}_badgeText`)!;
              appliedCount++;
              appliedNodeIds.add(`p${pageNumber}_b${blockId}_badgeText`);
            }

            if (transMap.has(`p${pageNumber}_b${blockId}_title`)) {
              block.title = transMap.get(`p${pageNumber}_b${blockId}_title`)!;
              appliedCount++;
              appliedNodeIds.add(`p${pageNumber}_b${blockId}_title`);
            }

            if (transMap.has(`p${pageNumber}_b${blockId}_subtitle`)) {
              block.subtitle = transMap.get(`p${pageNumber}_b${blockId}_subtitle`)!;
              appliedCount++;
              appliedNodeIds.add(`p${pageNumber}_b${blockId}_subtitle`);
            }

            if (transMap.has(`p${pageNumber}_b${blockId}_textContent`)) {
              block.textContent = transMap.get(`p${pageNumber}_b${blockId}_textContent`)!;
              appliedCount++;
              appliedNodeIds.add(`p${pageNumber}_b${blockId}_textContent`);
            }

            if (transMap.has(`p${pageNumber}_b${blockId}_imageCaption`)) {
              block.imageCaption = transMap.get(`p${pageNumber}_b${blockId}_imageCaption`)!;
              appliedCount++;
              appliedNodeIds.add(`p${pageNumber}_b${blockId}_imageCaption`);
            }

            // Features List / Items
            if (Array.isArray(block.features)) {
              block.features.forEach((feat: FeatureItem, fIdx: number) => {
                if (!feat || typeof feat !== 'object') return;
                const featId = feat.id || String(fIdx);
                const titleKey = `p${pageNumber}_b${blockId}_feat_${featId}_title`;
                const descKey = `p${pageNumber}_b${blockId}_feat_${featId}_desc`;

                if (transMap.has(titleKey)) {
                  feat.title = transMap.get(titleKey)!;
                  appliedCount++;
                  appliedNodeIds.add(titleKey);
                }
                if (transMap.has(descKey)) {
                  feat.description = transMap.get(descKey)!;
                  appliedCount++;
                  appliedNodeIds.add(descKey);
                }
              });
            }

            // Table Columns & Rows (technical table, specs_table, electrical_table, accessories_table)
            if (Array.isArray(block.tableColumns)) {
              block.tableColumns.forEach((col: TableColumnConfig, cIdx: number) => {
                if (!col || typeof col !== 'object') return;
                const colKey = `p${pageNumber}_b${blockId}_col_${col.key || cIdx}_label`;
                if (transMap.has(colKey)) {
                  col.label = transMap.get(colKey)!;
                  appliedCount++;
                  appliedNodeIds.add(colKey);
                }
              });
            }

            if (Array.isArray(block.tableRows)) {
              block.tableRows.forEach((row: CatalogTableRow, rIdx: number) => {
                if (!row || typeof row !== 'object') return;
                const rowId = row.id || String(rIdx);
                const notesKey = `p${pageNumber}_b${blockId}_row_${rowId}_notes`;

                if (transMap.has(notesKey)) {
                  row.customNotes = transMap.get(notesKey)!;
                  appliedCount++;
                  appliedNodeIds.add(notesKey);
                }

                if (row.localOverrides && typeof row.localOverrides === 'object' && !Array.isArray(row.localOverrides)) {
                  Object.keys(row.localOverrides).forEach((colKey) => {
                    const overrideKey = `p${pageNumber}_b${blockId}_row_${rowId}_ov_${colKey}`;
                    if (transMap.has(overrideKey)) {
                      row.localOverrides![colKey] = transMap.get(overrideKey)!;
                      appliedCount++;
                      appliedNodeIds.add(overrideKey);
                    }
                  });
                }
              });
            }

            // Ordering Codes Segments & Options
            if (Array.isArray(block.orderingSegments)) {
              block.orderingSegments.forEach((seg: OrderingSegment, sIdx: number) => {
                if (!seg || typeof seg !== 'object') return;
                const segId = seg.id || String(sIdx);
                const codeKey = `p${pageNumber}_b${blockId}_seg_${segId}_code`;
                const segKey = `p${pageNumber}_b${blockId}_seg_${segId}_name`;

                if (transMap.has(codeKey)) {
                  seg.code = transMap.get(codeKey)!;
                  appliedCount++;
                  appliedNodeIds.add(codeKey);
                }

                if (transMap.has(segKey)) {
                  seg.name = transMap.get(segKey)!;
                  appliedCount++;
                  appliedNodeIds.add(segKey);
                }

                if (Array.isArray(seg.options)) {
                  seg.options.forEach((_opt: string, optIdx: number) => {
                    const optKey = `p${pageNumber}_b${blockId}_seg_${segId}_opt_${optIdx}`;
                    if (transMap.has(optKey)) {
                      seg.options![optIdx] = transMap.get(optKey)!;
                      appliedCount++;
                      appliedNodeIds.add(optKey);
                    }
                  });
                }
              });
            }

            // Contact Footer (com materialização de contactInfo se necessário)
            if (block.type === 'contact_footer') {
              if (!block.contactInfo || typeof block.contactInfo !== 'object') {
                block.contactInfo = {
                  companyName: 'PRESYS INSTRUMENTOS DE CONTROLE',
                  address: 'São Paulo - SP · Brasil',
                  phone: '+55 (11) 3038-1300',
                  email: 'vendas@presys.com.br',
                  website: 'www.presys.com.br'
                };
              }
              if (transMap.has(`p${pageNumber}_b${blockId}_contact_company`)) {
                block.contactInfo.companyName = transMap.get(`p${pageNumber}_b${blockId}_contact_company`)!;
                appliedCount++;
                appliedNodeIds.add(`p${pageNumber}_b${blockId}_contact_company`);
              }
              if (transMap.has(`p${pageNumber}_b${blockId}_contact_address`)) {
                block.contactInfo.address = transMap.get(`p${pageNumber}_b${blockId}_contact_address`)!;
                appliedCount++;
                appliedNodeIds.add(`p${pageNumber}_b${blockId}_contact_address`);
              }
              if (transMap.has(`p${pageNumber}_b${blockId}_contact_phone`)) {
                block.contactInfo.phone = transMap.get(`p${pageNumber}_b${blockId}_contact_phone`)!;
                appliedCount++;
                appliedNodeIds.add(`p${pageNumber}_b${blockId}_contact_phone`);
              }
              if (transMap.has(`p${pageNumber}_b${blockId}_contact_email`)) {
                block.contactInfo.email = transMap.get(`p${pageNumber}_b${blockId}_contact_email`)!;
                appliedCount++;
                appliedNodeIds.add(`p${pageNumber}_b${blockId}_contact_email`);
              }
              if (transMap.has(`p${pageNumber}_b${blockId}_contact_website`)) {
                block.contactInfo.website = transMap.get(`p${pageNumber}_b${blockId}_contact_website`)!;
                appliedCount++;
                appliedNodeIds.add(`p${pageNumber}_b${blockId}_contact_website`);
              }
            }

            // Image Gallery (suporta tanto _img_${iIdx}_caption quanto _gallery_${iIdx}_caption)
            if (Array.isArray(block.images)) {
              block.images.forEach((img: any, iIdx: number) => {
                if (!img || typeof img !== 'object') return;
                const imgCapKey = `p${pageNumber}_b${blockId}_img_${iIdx}_caption`;
                const galleryCapKey = `p${pageNumber}_b${blockId}_gallery_${iIdx}_caption`;

                if (transMap.has(imgCapKey)) {
                  img.caption = transMap.get(imgCapKey)!;
                  appliedCount++;
                  appliedNodeIds.add(imgCapKey);
                } else if (transMap.has(galleryCapKey)) {
                  img.caption = transMap.get(galleryCapKey)!;
                  appliedCount++;
                  appliedNodeIds.add(galleryCapKey);
                }
              });
            }

            // =====================================================================
            // Custom Data Handlers por BlockType (com Materialização de Fallbacks)
            // =====================================================================

            // 1. Full Page Cover: Canvas Layers
            if (block.type === 'full_page_cover') {
              if (!block.customData || typeof block.customData !== 'object') block.customData = {};
              if (Array.isArray(block.customData.canvasLayers)) {
                block.customData.canvasLayers.forEach((layer: any, lIdx: number) => {
                  if (!layer || typeof layer !== 'object') return;
                  const layerKey = `p${pageNumber}_b${blockId}_layer_${layer.id || lIdx}`;
                  if (transMap.has(layerKey)) {
                    layer.content = transMap.get(layerKey)!;
                    appliedCount++;
                    appliedNodeIds.add(layerKey);
                  }
                });
              }
            }

            // 2. Fluke Header (materializa description e highlights se não existirem)
            if (block.type === 'fluke_header') {
              if (!block.customData || typeof block.customData !== 'object') block.customData = {};
              const custom = block.customData;

              const descKey = `p${pageNumber}_b${blockId}_description`;
              if (transMap.has(descKey)) {
                custom.description = transMap.get(descKey)!;
                appliedCount++;
                appliedNodeIds.add(descKey);
              }

              const badgeSecKey = `p${pageNumber}_b${blockId}_badgeSecondary`;
              if (transMap.has(badgeSecKey)) {
                custom.badgeSecondary = transMap.get(badgeSecKey)!;
                appliedCount++;
                appliedNodeIds.add(badgeSecKey);
              }

              const defaultHighlights = [
                'Leve, portátil e de resposta térmica ultrarrápida',
                'Resfria até -25 °C e aquece até 660 °C em poucos minutos',
                'Dois canais de medição para PRT, RTD, termopar e 4-20 mA',
                'Exatidão metrológica com estabilidade térmica de ±0.01 °C',
                'Rotinas automáticas de calibração com emissão de relatórios',
                'Homogeneidade radial e axial certificada conforme normas internacionais'
              ];
              if (!Array.isArray(custom.highlights)) {
                custom.highlights = [...defaultHighlights];
              }
              custom.highlights.forEach((_: string, hIdx: number) => {
                const hlKey = `p${pageNumber}_b${blockId}_hl_${hIdx}`;
                if (transMap.has(hlKey)) {
                  custom.highlights[hIdx] = transMap.get(hlKey)!;
                  appliedCount++;
                  appliedNodeIds.add(hlKey);
                }
              });
            }

            // 3. Additel Two Col / Additel Two Col Hero
            if ((block.type as string) === 'additel_two_col' || block.type === 'additel_two_col_hero') {
              if (!block.customData || typeof block.customData !== 'object') block.customData = {};
              const custom = block.customData;

              const overviewKey = `p${pageNumber}_b${blockId}_overview`;
              if (transMap.has(overviewKey)) {
                custom.overview = transMap.get(overviewKey)!;
                appliedCount++;
                appliedNodeIds.add(overviewKey);
              }

              const badgeSubtitleKey = `p${pageNumber}_b${blockId}_badgeSubtitle`;
              if (transMap.has(badgeSubtitleKey)) {
                custom.badgeSubtitle = transMap.get(badgeSubtitleKey)!;
                appliedCount++;
                appliedNodeIds.add(badgeSubtitleKey);
              }

              const defaultBullets = [
                'Geração de pressão de vácuo a 70 bar com bomba interna',
                'Estabilidade de controle melhor que 0.005% do fundo de escala',
                'Duplo canal de medição de pressão com sensores intercambiáveis'
              ];
              if (!Array.isArray(custom.bulletList) && !Array.isArray(custom.bullets)) {
                custom.bulletList = [...defaultBullets];
              }
              const bulletsArr = Array.isArray(custom.bulletList)
                ? custom.bulletList
                : Array.isArray(custom.bullets)
                ? custom.bullets
                : defaultBullets;

              bulletsArr.forEach((_: string, bIdx: number) => {
                const bulletKey = `p${pageNumber}_b${blockId}_bullet_${bIdx}`;
                if (transMap.has(bulletKey)) {
                  bulletsArr[bIdx] = transMap.get(bulletKey)!;
                  appliedCount++;
                  appliedNodeIds.add(bulletKey);
                }
              });
            }

            // 4. Bottom Header
            if (block.type === 'bottom_header') {
              if (!block.customData || typeof block.customData !== 'object') block.customData = {};
              const custom = block.customData;
              if (transMap.has(`p${pageNumber}_b${blockId}_phone`)) {
                custom.phone = transMap.get(`p${pageNumber}_b${blockId}_phone`)!;
                appliedCount++;
                appliedNodeIds.add(`p${pageNumber}_b${blockId}_phone`);
              }
              if (transMap.has(`p${pageNumber}_b${blockId}_email`)) {
                custom.email = transMap.get(`p${pageNumber}_b${blockId}_email`)!;
                appliedCount++;
                appliedNodeIds.add(`p${pageNumber}_b${blockId}_email`);
              }
              if (transMap.has(`p${pageNumber}_b${blockId}_website`)) {
                custom.website = transMap.get(`p${pageNumber}_b${blockId}_website`)!;
                appliedCount++;
                appliedNodeIds.add(`p${pageNumber}_b${blockId}_website`);
              }
            }

            // 5. Software Connectivity
            if (block.type === 'software_connectivity') {
              if (!block.customData || typeof block.customData !== 'object') block.customData = {};
              const custom = block.customData;

              const defaultItems = [
                { badge: 'Software', title: 'Software ISOPLAN®', desc: 'Integração direta para emissão automatizada de certificados de calibração RBC e relatórios de conformidade.' },
                { badge: 'Protocolos', title: 'Comunicação HART® & Modbus', desc: 'Configuração de transmissores inteligentes com leitura de PV, loop de corrente e ajuste de zero/span.' },
                { badge: 'Hardware', title: 'Conexão USB & Ethernet', desc: 'Exportação de dados em tempo real para SCADA, CLP ou pendrive em formato CSV e PDF criptografado.' },
                { badge: 'Memória', title: 'Datalogger Interno', desc: 'Memória para mais de 100.000 pontos com gravação de tendências e rastreabilidade total.' }
              ];

              if (!Array.isArray(custom.items)) {
                custom.items = JSON.parse(JSON.stringify(defaultItems));
              }

              custom.items.forEach((item: any, iIdx: number) => {
                if (!item || typeof item !== 'object') return;
                const badgeKey = `p${pageNumber}_b${blockId}_item_${iIdx}_badge`;
                const titleKey = `p${pageNumber}_b${blockId}_item_${iIdx}_title`;
                const descKey = `p${pageNumber}_b${blockId}_item_${iIdx}_desc`;

                if (transMap.has(badgeKey)) {
                  item.badge = transMap.get(badgeKey)!;
                  appliedCount++;
                  appliedNodeIds.add(badgeKey);
                }
                if (transMap.has(titleKey)) {
                  item.title = transMap.get(titleKey)!;
                  appliedCount++;
                  appliedNodeIds.add(titleKey);
                }
                if (transMap.has(descKey)) {
                  item.desc = transMap.get(descKey)!;
                  appliedCount++;
                  appliedNodeIds.add(descKey);
                }
              });
            }

            // 6. Multi-Mode Calibrator
            if (block.type === 'multi_mode_calibrator') {
              if (!block.customData || typeof block.customData !== 'object') block.customData = {};
              const custom = block.customData;

              const defaultModes = [
                { badge: '01', title: 'Dry Block', desc: 'Calibração rápida em bloco seco para termopares e termorresistências.' },
                { badge: '02', title: 'Banho de Óleo Agitado', desc: 'Uniformidade térmica máxima com fluído térmico recirculado.' },
                { badge: '03', title: 'Corpo Negro Infravermelho', desc: 'Emissividade e alvo calibrado para termômetros IR e pirômetros ópticos.' },
                { badge: '04', title: 'Calibração de Superfície', desc: 'Bloco de contato planar para sensores de superfície.' }
              ];

              if (!Array.isArray(custom.modes)) {
                custom.modes = JSON.parse(JSON.stringify(defaultModes));
              }

              custom.modes.forEach((mode: any, mIdx: number) => {
                if (!mode || typeof mode !== 'object') return;
                const badgeKey = `p${pageNumber}_b${blockId}_mode_${mIdx}_badge`;
                const titleKey = `p${pageNumber}_b${blockId}_mode_${mIdx}_title`;
                const descKey = `p${pageNumber}_b${blockId}_mode_${mIdx}_desc`;

                if (transMap.has(badgeKey)) {
                  mode.badge = transMap.get(badgeKey)!;
                  appliedCount++;
                  appliedNodeIds.add(badgeKey);
                }
                if (transMap.has(titleKey)) {
                  mode.title = transMap.get(titleKey)!;
                  appliedCount++;
                  appliedNodeIds.add(titleKey);
                }
                if (transMap.has(descKey)) {
                  if (mode.desc !== undefined) mode.desc = transMap.get(descKey)!;
                  if (mode.description !== undefined) mode.description = transMap.get(descKey)!;
                  appliedCount++;
                  appliedNodeIds.add(descKey);
                }
              });
            }

            // 7. Inserts Visual
            if (block.type === 'inserts_visual') {
              if (!block.customData || typeof block.customData !== 'object') block.customData = {};
              const custom = block.customData;

              if (transMap.has(`p${pageNumber}_b${blockId}_diameter`)) {
                custom.diameter = transMap.get(`p${pageNumber}_b${blockId}_diameter`)!;
                appliedCount++;
                appliedNodeIds.add(`p${pageNumber}_b${blockId}_diameter`);
              }

              if (Array.isArray(custom.inserts)) {
                custom.inserts.forEach((ins: any, iIdx: number) => {
                  if (!ins || typeof ins !== 'object') return;
                  const codeKey = `p${pageNumber}_b${blockId}_insert_${iIdx}_code`;
                  const titleKey = `p${pageNumber}_b${blockId}_insert_${iIdx}_title`;
                  const labelKey = `p${pageNumber}_b${blockId}_insert_${iIdx}_label`;
                  const descKey = `p${pageNumber}_b${blockId}_insert_${iIdx}_desc`;

                  if (transMap.has(codeKey)) {
                    ins.code = transMap.get(codeKey)!;
                    appliedCount++;
                    appliedNodeIds.add(codeKey);
                  }
                  if (transMap.has(titleKey)) {
                    ins.title = transMap.get(titleKey)!;
                    appliedCount++;
                    appliedNodeIds.add(titleKey);
                  }
                  if (transMap.has(labelKey)) {
                    ins.label = transMap.get(labelKey)!;
                    appliedCount++;
                    appliedNodeIds.add(labelKey);
                  }
                  if (transMap.has(descKey)) {
                    ins.description = transMap.get(descKey)!;
                    appliedCount++;
                    appliedNodeIds.add(descKey);
                  }
                });
              }

              const defaultTableCols = ['TA-25N / 35N / 50N', 'TA-350P / 650P', 'TA-1200P'];
              if (!Array.isArray(custom.tableColumns)) {
                custom.tableColumns = [...defaultTableCols];
              }

              custom.tableColumns.forEach((_col: string, cIdx: number) => {
                const colKey = `p${pageNumber}_b${blockId}_table_col_${cIdx}`;
                if (transMap.has(colKey)) {
                  custom.tableColumns[cIdx] = transMap.get(colKey)!;
                  appliedCount++;
                  appliedNodeIds.add(colKey);
                }
              });

              const defaultTableRows = [
                { code: 'IN1P', holesDesc: '1 × 3mm, 1 × 6mm, 1 × 1/4", 1 × 8mm', models: { 'TA-25N / 35N / 50N': '06.04.0121-00', 'TA-350P / 650P': '06.04.0128-00', 'TA-1200P': '06.04.0156-00' } },
                { code: 'IN1A', holesDesc: '1 × 1/8", 1 × 3/16", 2 × 1/4", 1 × 3/8"', models: { 'TA-25N / 35N / 50N': '06.04.0122-00', 'TA-350P / 650P': '06.04.0129-00', 'TA-1200P': '06.04.0157-00' } },
                { code: 'IN01', holesDesc: '1 × 3/4" (Centered Hole)', models: { 'TA-25N / 35N / 50N': '06.04.0011-00', 'TA-350P / 650P': '06.04.0101-00', 'TA-1200P': '06.04.0031-00' } },
                { code: 'INCL', holesDesc: 'Cup Type Insert with steel micro-spheres', models: { 'TA-25N / 35N / 50N': '06.04.0086-00', 'TA-350P / 650P': '06.04.0099-00', 'TA-1200P': '—' } }
              ];
              if (!Array.isArray(custom.tableRows)) {
                custom.tableRows = JSON.parse(JSON.stringify(defaultTableRows));
              }

              custom.tableRows.forEach((row: any, rIdx: number) => {
                if (!row || typeof row !== 'object') return;
                const codeKey = `p${pageNumber}_b${blockId}_table_r${rIdx}_code`;
                const holesKey = `p${pageNumber}_b${blockId}_table_r${rIdx}_desc`;

                if (transMap.has(codeKey)) {
                  row.code = transMap.get(codeKey)!;
                  appliedCount++;
                  appliedNodeIds.add(codeKey);
                }
                if (transMap.has(holesKey)) {
                  row.holesDesc = transMap.get(holesKey)!;
                  appliedCount++;
                  appliedNodeIds.add(holesKey);
                }

                if (row.models && typeof row.models === 'object' && !Array.isArray(row.models)) {
                  Object.entries(row.models).forEach(([col, _val]: [string, any], cIdx: number) => {
                    const modelIdxKey = `p${pageNumber}_b${blockId}_table_r${rIdx}_c${cIdx}`;
                    const modelColKey = `p${pageNumber}_b${blockId}_table_r${rIdx}_model_${col}`;
                    if (transMap.has(modelIdxKey)) {
                      row.models[col] = transMap.get(modelIdxKey)!;
                      appliedCount++;
                      appliedNodeIds.add(modelIdxKey);
                    } else if (transMap.has(modelColKey)) {
                      row.models[col] = transMap.get(modelColKey)!;
                      appliedCount++;
                      appliedNodeIds.add(modelColKey);
                    }
                  });
                }
              });
            }

            // 8. Custom Table (com materialização de headers e rows)
            if (block.type === 'custom_table') {
              if (!block.customData || typeof block.customData !== 'object') block.customData = {};
              const custom = block.customData;

              if (!Array.isArray(custom.headers) && !Array.isArray(block.tableColumns)) {
                custom.headers = ['Item / Parâmetro', 'Descrição / Especificação'];
              }
              if (!Array.isArray(custom.rows) && !Array.isArray(block.tableRows)) {
                custom.rows = [
                  ['Temperatura de Operação', '-40 a +85 °C'],
                  ['Grau de Proteção', 'IP67 / NEMA 4X'],
                  ['Tempo de Resposta', '< 100 ms']
                ];
              }

              if (Array.isArray(custom.headers)) {
                custom.headers.forEach((_h: string, hIdx: number) => {
                  const hKey = `p${pageNumber}_b${blockId}_col_col${hIdx + 1}_label`;
                  const hKeyFallback = `p${pageNumber}_b${blockId}_col_${hIdx}_label`;

                  if (transMap.has(hKey)) {
                    custom.headers[hIdx] = transMap.get(hKey)!;
                    appliedCount++;
                    appliedNodeIds.add(hKey);
                  } else if (transMap.has(hKeyFallback)) {
                    custom.headers[hIdx] = transMap.get(hKeyFallback)!;
                    appliedCount++;
                    appliedNodeIds.add(hKeyFallback);
                  }
                });
              }

              if (Array.isArray(custom.rows)) {
                custom.rows.forEach((row: any[], rIdx: number) => {
                  if (Array.isArray(row)) {
                    row.forEach((_cell: any, cIdx: number) => {
                      const cellKey = `p${pageNumber}_b${blockId}_row_crow-${rIdx + 1}_ov_col${cIdx + 1}`;
                      if (transMap.has(cellKey)) {
                        custom.rows[rIdx][cIdx] = transMap.get(cellKey)!;
                        appliedCount++;
                        appliedNodeIds.add(cellKey);
                      }
                    });
                  }
                });
              }
            }

            // 9. Matrix Spec Table
            if (block.type === 'matrix_spec_table') {
              if (!block.customData || typeof block.customData !== 'object') block.customData = {};
              const custom = block.customData;

              const defaultCols = ['Parâmetro / Modelo', 'PCON-Y18-LP', 'PCON-Y18', 'PCON-Y18-HP'];
              if (!Array.isArray(custom.columns)) {
                custom.columns = [...defaultCols];
              }
              custom.columns.forEach((_col: string, idx: number) => {
                const colKey = `p${pageNumber}_b${blockId}_col_${idx}`;
                if (transMap.has(colKey)) {
                  custom.columns[idx] = transMap.get(colKey)!;
                  appliedCount++;
                  appliedNodeIds.add(colKey);
                }
              });

              const defaultRows = [
                { param: 'Faixa de Geração Pneumática', values: ['-0.9 a 2.5 bar', '-0.9 a 40 bar', '0 a 70 bar'] },
                { param: 'Exatidão Padrão (% FE)', values: ['±0.025% FE', '±0.025% FE', '±0.025% FE'] },
                { param: 'Estabilidade de Controle', values: ['< 0.003% FE', '< 0.003% FE', '< 0.005% FE'] },
                { param: 'Bomba Elétrica Integrada', values: ['■', '■', '■'] },
                { param: 'Alimentação de Loop 24Vdc Isolada', values: ['■', '■', '■'] },
                { param: 'Comunicação HART / Modbus', values: ['■', '■', '□'] }
              ];

              if (!Array.isArray(custom.rows)) {
                custom.rows = JSON.parse(JSON.stringify(defaultRows));
              }

              custom.rows.forEach((row: any, rIdx: number) => {
                if (!row || typeof row !== 'object') return;
                const paramKey = `p${pageNumber}_b${blockId}_row_${rIdx}_param`;
                if (transMap.has(paramKey)) {
                  row.param = transMap.get(paramKey)!;
                  appliedCount++;
                  appliedNodeIds.add(paramKey);
                }

                if (Array.isArray(row.values)) {
                  row.values.forEach((_val: string, vIdx: number) => {
                    const valKey = `p${pageNumber}_b${blockId}_row_${rIdx}_val_${vIdx}`;
                    if (transMap.has(valKey)) {
                      row.values[vIdx] = transMap.get(valKey)!;
                      appliedCount++;
                      appliedNodeIds.add(valKey);
                    }
                  });
                }
              });

              if (Array.isArray(custom.sections)) {
                custom.sections.forEach((sec: any, sIdx: number) => {
                  if (!sec || typeof sec !== 'object') return;
                  const secKey = `p${pageNumber}_b${blockId}_sec_${sIdx}_title`;
                  if (transMap.has(secKey)) {
                    sec.title = transMap.get(secKey)!;
                    appliedCount++;
                    appliedNodeIds.add(secKey);
                  }
                });
              }
            }

            // 10. Grupos Superiores de Colunas (columnGroups)
            const rawColGroups = (block as any).columnGroups || block.customData?.columnGroups;
            if (Array.isArray(rawColGroups)) {
              rawColGroups.forEach((grp: any, gIdx: number) => {
                const grpKey = `p${pageNumber}_b${blockId}_colgroup_${grp.id || gIdx}_title`;
                if (transMap.has(grpKey)) {
                  grp.title = transMap.get(grpKey)!;
                  appliedCount++;
                  appliedNodeIds.add(grpKey);
                }
              });
            }

            // 11. Legenda Customizada e Metadados Editoriais em customData
            if (block.customData && typeof block.customData === 'object') {
              const custom = block.customData;
              const legTitleKey = `p${pageNumber}_b${blockId}_legend_title`;
              if (transMap.has(legTitleKey)) {
                if (custom.legendConfig && typeof custom.legendConfig === 'object') {
                  custom.legendConfig.title = transMap.get(legTitleKey)!;
                } else {
                  custom.legendTitle = transMap.get(legTitleKey)!;
                }
                appliedCount++;
                appliedNodeIds.add(legTitleKey);
              }

              if (custom.legendConfig && Array.isArray(custom.legendConfig.items)) {
                custom.legendConfig.items.forEach((item: any, iIdx: number) => {
                  const itemKey = `p${pageNumber}_b${blockId}_legend_item_${item.type || iIdx}`;
                  if (transMap.has(itemKey)) {
                    item.label = transMap.get(itemKey)!;
                    appliedCount++;
                    appliedNodeIds.add(itemKey);
                  }
                });
              }

              if (custom.legendLabels && typeof custom.legendLabels === 'object') {
                Object.keys(custom.legendLabels).forEach((mType) => {
                  const lblKey = `p${pageNumber}_b${blockId}_legend_label_${mType}`;
                  if (transMap.has(lblKey)) {
                    custom.legendLabels[mType] = transMap.get(lblKey)!;
                    appliedCount++;
                    appliedNodeIds.add(lblKey);
                  }
                });
              }

              const capKey = `p${pageNumber}_b${blockId}_caption`;
              if (transMap.has(capKey)) {
                custom.caption = transMap.get(capKey)!;
                appliedCount++;
                appliedNodeIds.add(capKey);
              }

              const footKey = `p${pageNumber}_b${blockId}_footnote`;
              if (transMap.has(footKey)) {
                custom.footnote = transMap.get(footKey)!;
                appliedCount++;
                appliedNodeIds.add(footKey);
              }
            }

            // 12. Generic Description em customData (outros blocos)
            if (block.type !== 'fluke_header' && block.customData && typeof block.customData === 'object') {
              if (transMap.has(`p${pageNumber}_b${blockId}_description`)) {
                block.customData.description = transMap.get(`p${pageNumber}_b${blockId}_description`)!;
                appliedCount++;
                appliedNodeIds.add(`p${pageNumber}_b${blockId}_description`);
              }
            }

            // 13. Seção Estrutural (Fase 3A.1 Canvas Domain Foundation — Identidades Estáveis por child.id)
            if (block.type === 'structural_section') {
              // Título da Seção (ContentBlock.title)
              const secTitleKey = `b${blockId}_sec_title`;
              const secTitleFallback = `p${pageNumber}_b${blockId}_sec_title`;
              if (transMap.has(secTitleKey)) {
                block.title = transMap.get(secTitleKey)!;
                appliedCount++;
                appliedNodeIds.add(secTitleKey);
              } else if (transMap.has(secTitleFallback)) {
                block.title = transMap.get(secTitleFallback)!;
                appliedCount++;
                appliedNodeIds.add(secTitleFallback);
              }

              // Subtítulo da Seção (ContentBlock.subtitle)
              const secSubKey = `b${blockId}_sec_subtitle`;
              const secSubFallback = `p${pageNumber}_b${blockId}_sec_subtitle`;
              if (transMap.has(secSubKey)) {
                block.subtitle = transMap.get(secSubKey)!;
                appliedCount++;
                appliedNodeIds.add(secSubKey);
              } else if (transMap.has(secSubFallback)) {
                block.subtitle = transMap.get(secSubFallback)!;
                appliedCount++;
                appliedNodeIds.add(secSubFallback);
              }

              // Badge da Seção (ContentBlock.badgeText)
              const secBadgeKey = `b${blockId}_sec_badge`;
              const secBadgeFallback = `p${pageNumber}_b${blockId}_sec_badge`;
              if (transMap.has(secBadgeKey)) {
                block.badgeText = transMap.get(secBadgeKey)!;
                appliedCount++;
                appliedNodeIds.add(secBadgeKey);
              } else if (transMap.has(secBadgeFallback)) {
                block.badgeText = transMap.get(secBadgeFallback)!;
                appliedCount++;
                appliedNodeIds.add(secBadgeFallback);
              }

              // Cards Filhos por child.id (Invariante perante reordenação)
              if (block.structuralData && Array.isArray(block.structuralData.children)) {
                block.structuralData.children.forEach((child) => {
                  if (!child || typeof child !== 'object' || !child.id) return;

                  // Título do Card
                  const cardTitleKey = `b${blockId}_card_${child.id}_title`;
                  const cardTitleFallback = `p${pageNumber}_b${blockId}_card_${child.id}_title`;
                  if (transMap.has(cardTitleKey)) {
                    child.title = transMap.get(cardTitleKey)!;
                    appliedCount++;
                    appliedNodeIds.add(cardTitleKey);
                  } else if (transMap.has(cardTitleFallback)) {
                    child.title = transMap.get(cardTitleFallback)!;
                    appliedCount++;
                    appliedNodeIds.add(cardTitleFallback);
                  }

                  // Corpo / Descrição do Card
                  const cardBodyKey = `b${blockId}_card_${child.id}_body`;
                  const cardBodyFallback = `p${pageNumber}_b${blockId}_card_${child.id}_body`;
                  if (transMap.has(cardBodyKey)) {
                    child.body = transMap.get(cardBodyKey)!;
                    appliedCount++;
                    appliedNodeIds.add(cardBodyKey);
                  } else if (transMap.has(cardBodyFallback)) {
                    child.body = transMap.get(cardBodyFallback)!;
                    appliedCount++;
                    appliedNodeIds.add(cardBodyFallback);
                  }

                  // Badge do Card
                  const cardBadgeKey = `b${blockId}_card_${child.id}_badge`;
                  const cardBadgeFallback = `p${pageNumber}_b${blockId}_card_${child.id}_badge`;
                  if (transMap.has(cardBadgeKey)) {
                    child.badge = transMap.get(cardBadgeKey)!;
                    appliedCount++;
                    appliedNodeIds.add(cardBadgeKey);
                  } else if (transMap.has(cardBadgeFallback)) {
                    child.badge = transMap.get(cardBadgeFallback)!;
                    appliedCount++;
                    appliedNodeIds.add(cardBadgeFallback);
                  }
                });
              }
            }
          });
        }
      });
    }

    // Identifica nós que estavam no mapa de tradução mas não foram aplicados
    const unappliedNodeIds: string[] = [];
    for (const [key] of transMap.entries()) {
      if (!appliedNodeIds.has(key)) {
        unappliedNodeIds.push(key);
      }
    }

    return {
      translatedCatalog: clone,
      appliedCount,
      unappliedCount: unappliedNodeIds.length,
      unappliedNodeIds
    };
  }
}
