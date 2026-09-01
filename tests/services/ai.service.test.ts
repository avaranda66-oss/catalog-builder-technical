import { describe, it, expect } from 'vitest';
import { AIService } from '../../src/services/ai.service';
import { INITIAL_PRODUCTS } from '../../src/data/initialProducts';
import { Catalog } from '../../src/domain/catalog.schema';

describe('AIService (Factual & Anti-Hallucination)', () => {
  it('deve responder estritamente com base nos produtos cadastrados na biblioteca', () => {
    const res = AIService.queryLibrary('PCON-200', INITIAL_PRODUCTS);
    expect(res.confidence).toBe('high');
    expect(res.answer).toContain('PCON-200');
    expect(res.answer).toContain('bar');
  });

  it('deve emitir aviso de não encontrado para termos ou especificações inexistentes', () => {
    const res = AIService.queryLibrary('SensorInexistenteXYZ', INITIAL_PRODUCTS);
    expect(res.confidence).toBe('none');
    expect(res.answer).toContain('Informação não encontrada na Biblioteca Oficial');
  });

  it('deve identificar conformidade e divergências no catálogo', () => {
    const mockCatalog: Catalog = {
      id: 'cat-1',
      title: 'Teste',
      subtitle: 'Subtítulo',
      themeId: 'default',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          pageType: 'technical',
          title: 'Página Técnica',
          blocks: [
            {
              id: 'b1',
              type: 'table',
              position: { x: 0, y: 0, width: 700, height: 200, zIndex: 1 },
              style: {},
              tableColumns: [{ key: 'range', label: 'Faixa', visible: true }],
              tableRows: [
                {
                  id: 'r1',
                  productRefId: 'prod-pcon-200',
                  localOverrides: { range: '0 a 99 bar' },
                  customNotes: '',
                  order: 0
                }
              ]
            }
          ]
        }
      ]
    };

    const report = AIService.checkCatalogCompliance(mockCatalog, INITIAL_PRODUCTS);
    expect(report.totalRowsChecked).toBe(1);
    expect(report.divergenceCount).toBe(1);
    expect(report.isFullyCompliant).toBe(false);
    expect(report.items[0].divergences[0].localValue).toBe('0 a 99 bar');
  });
});
