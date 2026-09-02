// src/translation/translation-applier.registry.ts
// Aplicador Determinístico de Traduções (Inverso dos Extratores) para os 21 BlockTypes
// Zero eval(), zero mutação cega de JSON, zero dependência de reflection dinâmica.
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

    // Sistema: Atualiza localizedSystemStrings no documento
    if (localizedSystemStrings && Object.keys(localizedSystemStrings).length > 0) {
      clone.localizedSystemStrings = {
        ...(clone.localizedSystemStrings || {}),
        ...localizedSystemStrings
      };
    }

    let appliedCount = 0;
    const appliedNodeIds = new Set<string>();

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

      if (page.title && transMap.has(`p${pageNumber}_page_title`)) {
        page.title = transMap.get(`p${pageNumber}_page_title`)!;
        appliedCount++;
        appliedNodeIds.add(`p${pageNumber}_page_title`);
      }

      page.blocks.forEach((block: ContentBlock) => {
        const blockId = block.id;

        // Campos Universais do ContentBlock
        if (block.badgeText && transMap.has(`p${pageNumber}_b${blockId}_badgeText`)) {
          block.badgeText = transMap.get(`p${pageNumber}_b${blockId}_badgeText`)!;
          appliedCount++;
          appliedNodeIds.add(`p${pageNumber}_b${blockId}_badgeText`);
        }

        if (block.title && transMap.has(`p${pageNumber}_b${blockId}_title`)) {
          block.title = transMap.get(`p${pageNumber}_b${blockId}_title`)!;
          appliedCount++;
          appliedNodeIds.add(`p${pageNumber}_b${blockId}_title`);
        }

        if (block.subtitle && transMap.has(`p${pageNumber}_b${blockId}_subtitle`)) {
          block.subtitle = transMap.get(`p${pageNumber}_b${blockId}_subtitle`)!;
          appliedCount++;
          appliedNodeIds.add(`p${pageNumber}_b${blockId}_subtitle`);
        }

        if (block.textContent && transMap.has(`p${pageNumber}_b${blockId}_textContent`)) {
          block.textContent = transMap.get(`p${pageNumber}_b${blockId}_textContent`)!;
          appliedCount++;
          appliedNodeIds.add(`p${pageNumber}_b${blockId}_textContent`);
        }

        if (block.imageCaption && transMap.has(`p${pageNumber}_b${blockId}_imageCaption`)) {
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

            if (feat.title && transMap.has(titleKey)) {
              feat.title = transMap.get(titleKey)!;
              appliedCount++;
              appliedNodeIds.add(titleKey);
            }
            if (feat.description && transMap.has(descKey)) {
              feat.description = transMap.get(descKey)!;
              appliedCount++;
              appliedNodeIds.add(descKey);
            }
          });
        }

        // Table Columns & Rows (technical table, custom table, specs_table, electrical_table, accessories_table)
        if (block.tableColumns && Array.isArray(block.tableColumns)) {
          block.tableColumns.forEach((col, cIdx) => {
            const colKey = `p${pageNumber}_b${blockId}_col_${col.key || cIdx}_label`;
            if (col.label && transMap.has(colKey)) {
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

            if (row.customNotes && transMap.has(notesKey)) {
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

        // Ordering Codes Segments
        if (block.orderingSegments && Array.isArray(block.orderingSegments)) {
          block.orderingSegments.forEach((seg, sIdx) => {
            const segKey = `p${pageNumber}_b${blockId}_seg_${seg.code || sIdx}_name`;
            if (seg.name && transMap.has(segKey)) {
              seg.name = transMap.get(segKey)!;
              appliedCount++;
              appliedNodeIds.add(segKey);
            }
          });
        }

        // Contact Footer
        if (block.contactInfo) {
          if (block.contactInfo.companyName && transMap.has(`p${pageNumber}_b${blockId}_contact_company`)) {
            block.contactInfo.companyName = transMap.get(`p${pageNumber}_b${blockId}_contact_company`)!;
            appliedCount++;
            appliedNodeIds.add(`p${pageNumber}_b${blockId}_contact_company`);
          }
          if (block.contactInfo.address && transMap.has(`p${pageNumber}_b${blockId}_contact_address`)) {
            block.contactInfo.address = transMap.get(`p${pageNumber}_b${blockId}_contact_address`)!;
            appliedCount++;
            appliedNodeIds.add(`p${pageNumber}_b${blockId}_contact_address`);
          }
        }

        // Image Gallery
        if (block.images && Array.isArray(block.images)) {
          block.images.forEach((img, iIdx) => {
            const capKey = `p${pageNumber}_b${blockId}_gallery_${iIdx}_caption`;
            if (img.caption && transMap.has(capKey)) {
              img.caption = transMap.get(capKey)!;
              appliedCount++;
              appliedNodeIds.add(capKey);
            }
          });
        }

        // Custom Data Handlers por BlockType
        if (block.customData && typeof block.customData === 'object') {
          const custom = block.customData;

          // Full Page Cover: Canvas Layers
          if (block.type === 'full_page_cover' && Array.isArray(custom.canvasLayers)) {
            custom.canvasLayers.forEach((layer: any, lIdx: number) => {
              const layerKey = `p${pageNumber}_b${blockId}_layer_${layer.id || lIdx}`;
              if (layer.content && transMap.has(layerKey)) {
                layer.content = transMap.get(layerKey)!;
                appliedCount++;
                appliedNodeIds.add(layerKey);
              }
            });
          }

          // Description genérica em customData (fluke_header, etc.)
          if (custom.description && transMap.has(`p${pageNumber}_b${blockId}_description`)) {
            custom.description = transMap.get(`p${pageNumber}_b${blockId}_description`)!;
            appliedCount++;
            appliedNodeIds.add(`p${pageNumber}_b${blockId}_description`);
          }

          // Custom Table: headers e rows em customData
          if (block.type === 'custom_table') {
            if (Array.isArray(custom.headers)) {
              custom.headers.forEach((_h: string, hIdx: number) => {
                const hKey = `p${pageNumber}_b${blockId}_col_${hIdx}_label`;
                if (transMap.has(hKey)) {
                  custom.headers[hIdx] = transMap.get(hKey)!;
                  appliedCount++;
                  appliedNodeIds.add(hKey);
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

          // Matrix Spec Table
          if (block.type === 'matrix_spec_table') {
            if (Array.isArray(custom.rows)) {
              custom.rows.forEach((row: any, rIdx: number) => {
                const paramKey = `p${pageNumber}_b${blockId}_row_${rIdx}_param`;
                if (row.param && transMap.has(paramKey)) {
                  row.param = transMap.get(paramKey)!;
                  appliedCount++;
                  appliedNodeIds.add(paramKey);
                }
              });
            }
            if (Array.isArray(custom.sections)) {
              custom.sections.forEach((sec: any, sIdx: number) => {
                const secKey = `p${pageNumber}_b${blockId}_sec_${sIdx}_title`;
                if (sec.title && transMap.has(secKey)) {
                  sec.title = transMap.get(secKey)!;
                  appliedCount++;
                  appliedNodeIds.add(secKey);
                }
              });
            }
          }

          // Inserts Visual
          if (block.type === 'inserts_visual') {
            if (Array.isArray(custom.inserts)) {
              custom.inserts.forEach((ins: any, iIdx: number) => {
                const titleKey = `p${pageNumber}_b${blockId}_insert_${iIdx}_title`;
                const labelKey = `p${pageNumber}_b${blockId}_insert_${iIdx}_label`;
                const descKey = `p${pageNumber}_b${blockId}_insert_${iIdx}_desc`;

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
            if (Array.isArray(custom.tableRows)) {
              custom.tableRows.forEach((row: any, rIdx: number) => {
                const holesKey = `p${pageNumber}_b${blockId}_table_r${rIdx}_desc`;
                if (transMap.has(holesKey)) {
                  row.holesDesc = transMap.get(holesKey)!;
                  appliedCount++;
                  appliedNodeIds.add(holesKey);
                }
              });
            }
          }

          // Multi-Mode Calibrator
          if (block.type === 'multi_mode_calibrator' && Array.isArray(custom.modes)) {
            custom.modes.forEach((mode: any, mIdx: number) => {
              const titleKey = `p${pageNumber}_b${blockId}_mode_${mIdx}_title`;
              const descKey = `p${pageNumber}_b${blockId}_mode_${mIdx}_desc`;

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

          // Additel Two Col / Software Connectivity
          if (Array.isArray(custom.features)) {
            custom.features.forEach((feat: any, fIdx: number) => {
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
