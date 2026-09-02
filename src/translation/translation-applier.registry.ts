// src/translation/translation-applier.registry.ts
// Aplicador Determinístico de Traduções (Inverso Completo dos 21 Extractors)
// Suporta materialização de fallbacks em blocos sem customData prévio e resolução estrita.
// Garante o invariante de Round-Trip: extract(source) -> translate -> apply(clone) -> extract(translatedClone)

import { Catalog, ContentBlock, CatalogPage } from '@/domain/catalog.schema';

export interface TranslationApplierResult {
  translatedCatalog: Catalog;
  appliedCount: number;
  unappliedCount: number;
  unappliedNodeIds: string[];
}

export class TranslationApplierRegistry {
  /**
   * Aplica um mapa de traduções ({ [nodeId: string]: string }) em um clone profundo do catálogo original.
   * O catálogo original NUNCA é modificado.
   */
  static applyTranslations(
    sourceCatalog: Catalog,
    translations: Map<string, string> | Record<string, string>,
    targetLocale: string,
    localizedSystemStrings?: Record<string, string>
  ): TranslationApplierResult {
    // Clone profundo estrutural seguro
    const clone: Catalog = JSON.parse(JSON.stringify(sourceCatalog));
    clone.locale = targetLocale;

    // Converte para Map caso seja Record
    const transMap =
      translations instanceof Map
        ? translations
        : new Map<string, string>(Object.entries(translations));

    // Inicializa localizedSystemStrings
    if (!clone.localizedSystemStrings) {
      clone.localizedSystemStrings = {};
    }

    if (localizedSystemStrings && Object.keys(localizedSystemStrings).length > 0) {
      clone.localizedSystemStrings = {
        ...clone.localizedSystemStrings,
        ...localizedSystemStrings
      };
    }

    let appliedCount = 0;
    const appliedNodeIds = new Set<string>();

    // 0. Resolução de System Strings (sys_*) presentes no transMap
    for (const [key, value] of transMap.entries()) {
      if (key.startsWith('sys_')) {
        const sysKey = key.replace(/^sys_/, '');
        clone.localizedSystemStrings[sysKey] = value;
        appliedCount++;
        appliedNodeIds.add(key);
      }
    }

    // 1. Título e Subtítulo Globais do Documento
    if (transMap.has('doc_catalog_title')) {
      clone.title = transMap.get('doc_catalog_title')!;
      appliedCount++;
      appliedNodeIds.add('doc_catalog_title');
    } else if (transMap.has('p_global_title')) {
      clone.title = transMap.get('p_global_title')!;
      appliedCount++;
      appliedNodeIds.add('p_global_title');
    }

    if (transMap.has('doc_catalog_subtitle')) {
      clone.subtitle = transMap.get('doc_catalog_subtitle')!;
      appliedCount++;
      appliedNodeIds.add('doc_catalog_subtitle');
    } else if (transMap.has('p_global_subtitle')) {
      clone.subtitle = transMap.get('p_global_subtitle')!;
      appliedCount++;
      appliedNodeIds.add('p_global_subtitle');
    }

    // 2. Itera Páginas e Blocos
    clone.pages.forEach((page: CatalogPage, pageIdx: number) => {
      const pageNumber = page.pageNumber || pageIdx + 1;

      if (transMap.has(`p${pageNumber}_page_title`)) {
        page.title = transMap.get(`p${pageNumber}_page_title`)!;
        appliedCount++;
        appliedNodeIds.add(`p${pageNumber}_page_title`);
      }

      page.blocks.forEach((block: ContentBlock) => {
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
        if (block.features && Array.isArray(block.features)) {
          block.features.forEach((feat, fIdx) => {
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
        if (block.tableColumns && Array.isArray(block.tableColumns)) {
          block.tableColumns.forEach((col, cIdx) => {
            const colKey = `p${pageNumber}_b${blockId}_col_${col.key || cIdx}_label`;
            if (transMap.has(colKey)) {
              col.label = transMap.get(colKey)!;
              appliedCount++;
              appliedNodeIds.add(colKey);
            }
          });
        }

        if (block.tableRows && Array.isArray(block.tableRows)) {
          block.tableRows.forEach((row, rIdx) => {
            const rowId = row.id || String(rIdx);
            const notesKey = `p${pageNumber}_b${blockId}_row_${rowId}_notes`;

            if (transMap.has(notesKey)) {
              row.customNotes = transMap.get(notesKey)!;
              appliedCount++;
              appliedNodeIds.add(notesKey);
            }

            if (row.localOverrides && typeof row.localOverrides === 'object') {
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
        if (block.orderingSegments && Array.isArray(block.orderingSegments)) {
          block.orderingSegments.forEach((seg, sIdx) => {
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

            if (seg.options && Array.isArray(seg.options)) {
              seg.options.forEach((_, optIdx) => {
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
          if (!block.contactInfo) {
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
        if (block.images && Array.isArray(block.images)) {
          block.images.forEach((img, iIdx) => {
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
          if (!block.customData) block.customData = {};
          if (Array.isArray(block.customData.canvasLayers)) {
            block.customData.canvasLayers.forEach((layer: any, lIdx: number) => {
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
          if (!block.customData) block.customData = {};
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
          if (!custom.highlights) {
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
          if (!block.customData) block.customData = {};
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
          if (!custom.bulletList && !custom.bullets) {
            custom.bulletList = [...defaultBullets];
          }
          const bulletsArr = custom.bulletList || custom.bullets;
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
          if (!block.customData) block.customData = {};
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
          if (!block.customData) block.customData = {};
          const custom = block.customData;

          const defaultItems = [
            { badge: 'Software', title: 'Software ISOPLAN®', desc: 'Integração direta para emissão automatizada de certificados de calibração RBC e relatórios de conformidade.' },
            { badge: 'Protocolos', title: 'Comunicação HART® & Modbus', desc: 'Configuração de transmissores inteligentes com leitura de PV, loop de corrente e ajuste de zero/span.' },
            { badge: 'Hardware', title: 'Conexão USB & Ethernet', desc: 'Exportação de dados em tempo real para SCADA, CLP ou pendrive em formato CSV e PDF criptografado.' },
            { badge: 'Memória', title: 'Datalogger Interno', desc: 'Memória para mais de 100.000 pontos com gravação de tendências e rastreabilidade total.' }
          ];

          if (!custom.items || !Array.isArray(custom.items)) {
            custom.items = JSON.parse(JSON.stringify(defaultItems));
          }

          custom.items.forEach((item: any, iIdx: number) => {
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
          if (!block.customData) block.customData = {};
          const custom = block.customData;

          const defaultModes = [
            { badge: '01', title: 'Dry Block', desc: 'Calibração rápida em bloco seco para termopares e termorresistências.' },
            { badge: '02', title: 'Banho de Óleo Agitado', desc: 'Uniformidade térmica máxima com fluído térmico recirculado.' },
            { badge: '03', title: 'Corpo Negro Infravermelho', desc: 'Emissividade e alvo calibrado para termômetros IR e pirômetros ópticos.' },
            { badge: '04', title: 'Calibração de Superfície', desc: 'Bloco de contato planar para sensores de superfície.' }
          ];

          if (!custom.modes || !Array.isArray(custom.modes)) {
            custom.modes = JSON.parse(JSON.stringify(defaultModes));
          }

          custom.modes.forEach((mode: any, mIdx: number) => {
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
          if (!block.customData) block.customData = {};
          const custom = block.customData;

          if (transMap.has(`p${pageNumber}_b${blockId}_diameter`)) {
            custom.diameter = transMap.get(`p${pageNumber}_b${blockId}_diameter`)!;
            appliedCount++;
            appliedNodeIds.add(`p${pageNumber}_b${blockId}_diameter`);
          }

          if (Array.isArray(custom.inserts)) {
            custom.inserts.forEach((ins: any, iIdx: number) => {
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
          if (!custom.tableColumns) {
            custom.tableColumns = [...defaultTableCols];
          }

          if (Array.isArray(custom.tableColumns)) {
            custom.tableColumns.forEach((_col: string, cIdx: number) => {
              const colKey = `p${pageNumber}_b${blockId}_table_col_${cIdx}`;
              if (transMap.has(colKey)) {
                custom.tableColumns[cIdx] = transMap.get(colKey)!;
                appliedCount++;
                appliedNodeIds.add(colKey);
              }
            });
          }

          const defaultTableRows = [
            { code: 'IN1P', holesDesc: '1 × 3mm, 1 × 6mm, 1 × 1/4", 1 × 8mm', models: { 'TA-25N / 35N / 50N': '06.04.0121-00', 'TA-350P / 650P': '06.04.0128-00', 'TA-1200P': '06.04.0156-00' } },
            { code: 'IN1A', holesDesc: '1 × 1/8", 1 × 3/16", 2 × 1/4", 1 × 3/8"', models: { 'TA-25N / 35N / 50N': '06.04.0122-00', 'TA-350P / 650P': '06.04.0129-00', 'TA-1200P': '06.04.0157-00' } },
            { code: 'IN01', holesDesc: '1 × 3/4" (Centered Hole)', models: { 'TA-25N / 35N / 50N': '06.04.0011-00', 'TA-350P / 650P': '06.04.0101-00', 'TA-1200P': '06.04.0031-00' } },
            { code: 'INCL', holesDesc: 'Cup Type Insert with steel micro-spheres', models: { 'TA-25N / 35N / 50N': '06.04.0086-00', 'TA-350P / 650P': '06.04.0099-00', 'TA-1200P': '—' } }
          ];
          if (!custom.tableRows) {
            custom.tableRows = JSON.parse(JSON.stringify(defaultTableRows));
          }

          if (Array.isArray(custom.tableRows)) {
            custom.tableRows.forEach((row: any, rIdx: number) => {
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

              if (row.models && typeof row.models === 'object') {
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
        }

        // 8. Custom Table (com materialização de headers e rows)
        if (block.type === 'custom_table') {
          if (!block.customData) block.customData = {};
          const custom = block.customData;

          if (!custom.headers && !block.tableColumns) {
            custom.headers = ['Item / Parâmetro', 'Descrição / Especificação'];
          }
          if (!custom.rows && !block.tableRows) {
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
          if (!block.customData) block.customData = {};
          const custom = block.customData;

          const defaultCols = ['Parâmetro / Modelo', 'PCON-Y18-LP', 'PCON-Y18', 'PCON-Y18-HP'];
          if (!custom.columns) {
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

          if (!custom.rows || !Array.isArray(custom.rows)) {
            custom.rows = JSON.parse(JSON.stringify(defaultRows));
          }

          custom.rows.forEach((row: any, rIdx: number) => {
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
              const secKey = `p${pageNumber}_b${blockId}_sec_${sIdx}_title`;
              if (transMap.has(secKey)) {
                sec.title = transMap.get(secKey)!;
                appliedCount++;
                appliedNodeIds.add(secKey);
              }
            });
          }
        }

        // 10. Generic Description em customData (outros blocos)
        if (block.type !== 'fluke_header' && block.customData && typeof block.customData === 'object') {
          if (transMap.has(`p${pageNumber}_b${blockId}_description`)) {
            block.customData.description = transMap.get(`p${pageNumber}_b${blockId}_description`)!;
            appliedCount++;
            appliedNodeIds.add(`p${pageNumber}_b${blockId}_description`);
          }
        }
      });
    });

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
