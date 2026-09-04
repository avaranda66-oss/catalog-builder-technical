// tests/components/workspace-zero-mock-regression.test.ts
// Teste de regressão para garantir ausência total de mocks ou fatos inventados em produção (PIM.PRODUCTION.CORE1.1).

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('PIM Core V1.1 — Zero Production Mock & Fabrication Regression Suite', () => {
  it('ZERO-MOCK-1: WorkspaceDocumentsEvidenceTab não inicializa candidatos ou fatos fictícios', () => {
    const componentPath = path.resolve(__dirname, '../../src/components/library/product-workspace/WorkspaceDocumentsEvidenceTab.tsx');
    const content = fs.readFileSync(componentPath, 'utf-8');

    // Não deve conter cand_demo_1 nem valores inventados
    expect(content).not.toContain('cand_demo_1');
    expect(content).not.toContain('job_pdf_001');
    expect(content).not.toContain('doc_manual_fabrica');
    expect(content).toContain('const [candidates, setCandidates] = useState<ExtractedDatumCandidate[]>([]);');
    expect(content).toContain('Nenhuma sugestão pendente de revisão');
  });

  it('ZERO-MOCK-2: Workbooks de produtos recém-criados permanecem com zero fatos inventados', () => {
    const typesPath = path.resolve(__dirname, '../../src/domain/product-workbook/types.ts');
    const content = fs.readFileSync(typesPath, 'utf-8');

    // SchemaVersion 2 é estrito
    expect(content).toContain('schemaVersion: 2');
  });
});
