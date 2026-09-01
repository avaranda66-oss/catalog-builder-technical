import { describe, it, expect } from 'vitest';
import { AIService } from '../../src/services/ai.service';
import { INITIAL_PRODUCTS } from '../../src/data/initialProducts';
import { Catalog } from '../../src/domain/catalog.schema';

describe('AIService (Factualidade, Anti-Alucinação e Segurança de Segredos)', () => {
  it('deve responder estritamente com base nos produtos cadastrados na biblioteca', () => {
    const res = AIService.queryLibrary('TA-25N', INITIAL_PRODUCTS);
    expect(res.confidence).toBe('high');
    expect(res.answer).toContain('TA-25N');
    expect(res.answer).toContain('°C');
  });

  it('deve emitir aviso de não encontrado para termos ou especificações inexistentes sem inventar dados', () => {
    const res = AIService.queryLibrary('SensorInexistenteXYZ', INITIAL_PRODUCTS);
    expect(res.confidence).toBe('none');
    expect(res.answer).toContain('Informação não localizada na Biblioteca Oficial');
  });

  it('deve identificar conformidade e divergências no catálogo de forma determinística', () => {
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
          title: 'Technical Page',
          blocks: [
            {
              id: 'b1',
              type: 'table',
              position: { x: 0, y: 0, width: 700, height: 200, zIndex: 1 },
              style: {},
              tableColumns: [{ key: 'range', label: 'Range', visible: true }],
              tableRows: [
                {
                  id: 'r1',
                  productRefId: 'prod-presys-ta-25n',
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
  });

  it('deve responder com aviso estruturado seguro ao solicitar tradução sem backend', async () => {
    const mockCatalog: Catalog = {
      id: 'cat-1',
      title: 'Catálogo Demo',
      version: 1,
      themeId: 'default',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pages: []
    };

    const res = await AIService.translateCatalog(mockCatalog, 'English');
    expect(res.success).toBe(false);
    expect(res.error).toContain('Supabase Edge Function');
  });
});
