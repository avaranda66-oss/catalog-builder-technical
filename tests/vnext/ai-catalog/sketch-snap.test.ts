import { describe, expect, it } from 'vitest';
import { PRESYS_ARCHETYPES } from '../../../src/vnext/library/presys-archetypes';
import { PRESYS_PCON_COVER } from '../../../src/vnext/library/presys-cover-pcon';
import { SKETCH_ARCHETYPES, validateSketchPlan, type SketchArchetypeId, type SketchPagePlan } from '../../../src/vnext/ai-catalog/sketch-plan';
import {
  SKETCH_SOURCE_OPTIONS, groupSketchRegions, sketchReadingOrder, sketchRegionColumn, sketchTemplate, snapSketchPlan,
  type SketchTemplateId,
} from '../../../src/vnext/ai-catalog/sketch-snap';

const region = (kind: string, bbox: readonly number[], text = '', instruction = '') => ({ kind, bbox, text, instruction });
function plan(archetype: SketchArchetypeId, regions: ReturnType<typeof region>[], questions: string[] = []): SketchPagePlan {
  const result = validateSketchPlan({ archetype, regions, questions });
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.plan;
}
/** Spike gabaritos are [x0,y0,x1,y1] in 0–1; the model answers natively in [ymin,xmin,ymax,xmax] 0–1000. */
const native = (x0: number, y0: number, x1: number, y1: number) => [y0, x0, y1, x1].map(value => Math.round(value * 1000));
const title = region('title', [10, 100, 90, 900], 'Título');
const image = region('image', [200, 50, 500, 450]);
const paragraph = region('paragraph', [200, 550, 400, 950]);
const table = region('table', [500, 50, 800, 950], '', 'do PDF');
const slotsOf = (id: SketchTemplateId) => sketchTemplate(id).slots;

describe('Encaixe do rascunho nos modelos PRESYS existentes', () => {
  it('usa os mesmos nove identificadores e somente campos declarados na biblioteca', () => {
    expect(SKETCH_ARCHETYPES.map(item => item.presysId)).toEqual(PRESYS_ARCHETYPES.map(item => item.id));
    expect(sketchTemplate('C1')).toMatchObject({ templateId: PRESYS_PCON_COVER.templateId, label: 'Capa de produto — PCON' });
    const fixtures: Record<SketchArchetypeId, ReturnType<typeof region>[]> = {
      capa: [title, image, region('logo', [20, 20, 60, 80]), region('pill', [800, 100, 900, 900], 'TA-25N')],
      visao_geral: [title, image, paragraph],
      recursos: [title, image, paragraph, region('image', [600, 50, 800, 450]), region('paragraph', [600, 550, 800, 950])],
      especificacoes: [title, table],
      faixas_entradas: [title, table, region('table', [100, 50, 400, 950])],
      codigo_pedido: [region('title', [10, 50, 90, 950], 'Código de pedido'), table],
      fornecimento_acessorios: [region('title', [10, 50, 90, 950], 'Fornecimento e acessórios'), table],
      insertos: [region('title', [10, 50, 90, 950], 'Insertos'), image, region('image', [600, 50, 800, 450]), table],
      contracapa: [region('logo', [800, 50, 900, 400]), paragraph],
    };
    for (const archetype of SKETCH_ARCHETYPES) {
      const snapped = snapSketchPlan(plan(archetype.id, fixtures[archetype.id]));
      expect(snapped.archetypeId).toBe(archetype.presysId);
      expect(snapped.templateId).toBe(PRESYS_ARCHETYPES.find(item => item.id === archetype.presysId)!.templateId);
      expect(snapped.proposalMatches).toBe(true);
      expect(snapped.requiresConfirmation).toBe(true);
      for (const assignment of snapped.assignments) {
        expect(slotsOf(snapped.archetypeId)).toContainEqual(expect.objectContaining({ id: assignment.slotId, kind: assignment.kind }));
      }
      expect(snapped.alternatives).toHaveLength(2);
      expect(new Set([snapped.archetypeId, ...snapped.alternatives]).size).toBe(3);
    }
  });

  it('capa simples vai para a Capa P1, sem tratar o modelo manuscrito como dado conferido', () => {
    const source = plan('capa', [
      image, region('logo', [5, 5, 60, 180], 'PRESYS'), title, region('pill', [800, 100, 900, 900], 'TA-25N'),
      region('note', [950, 100, 990, 900], 'www.presys.com.br'),
    ]);
    const before = JSON.stringify(source);
    const snapped = snapSketchPlan(source);
    expect(snapped.archetypeId).toBe('P1');
    expect(snapped.assignments).toEqual(expect.arrayContaining([
      expect.objectContaining({ slotId: 'P1.hero', kind: 'image', regionIds: ['region-1'] }),
      expect.objectContaining({ slotId: 'P1.logo', kind: 'image', regionIds: ['region-2'] }),
      expect.objectContaining({ slotId: 'P1.family', kind: 'text', regionIds: ['region-3'] }),
      expect.objectContaining({ slotId: 'P1.model', kind: 'text', regionIds: ['region-4'] }),
      expect.objectContaining({ slotId: 'P1.url', kind: 'text', regionIds: ['region-5'] }),
    ]));
    expect(JSON.stringify(source)).toBe(before);
    expect(source.confirmations.map(item => [item.regionId, item.status])).toEqual([['region-4', 'confirmar']]);
    expect(JSON.stringify(snapped)).not.toContain('TA-25N');
    expect(snapped.questions).toEqual([]);
  });

  it('o rascunho de capa do spike (pílulas, chamada, barra de modelos) vai para a Capa de produto — PCON', () => {
    // D:/spike-rascunho/sketches/capa.json, converted to native boxes.
    const source = plan('capa', [
      region('logo', native(0.0645, 0.0399, 0.3387, 0.114), 'logo PRESYS'),
      region('image', native(0.0645, 0.1482, 0.9355, 0.5359), '', 'foto do PCON-Y17'),
      region('title', native(0.0565, 0.5502, 0.4915, 0.6172), 'PCON-Y17'),
      region('subtitle', native(0.0597, 0.6385, 0.573, 0.6861), 'Controlador de pressão'),
      // A photo turned by a few degrees: the pills are not on exactly the same y.
      region('pill', native(0.6129, 0.7185, 0.8548, 0.7641), 'pneumático'),
      region('pill', native(0.0645, 0.7135, 0.3065, 0.7591), '0 a 200 psi'),
      region('pill', native(0.3387, 0.7155, 0.5806, 0.7611), 'hidráulico'),
      region('callout', native(0.5944, 0.4504, 0.9339, 0.6018), 'saída pneumática'),
      region('band', native(0.0484, 0.7811, 0.9516, 0.9008), '', 'faixa azul'),
      region('bar', native(0.0645, 0.9236, 0.9355, 0.9749), 'Y17 · Y18-LP · Y18-BP'),
    ]);
    const snapped = snapSketchPlan(source);
    expect(snapped).toMatchObject({ archetypeId: 'C1', templateId: 'presys-capa-produto-pcon', proposedArchetypeId: 'P1',
      proposalMatches: true, decorativeRegionIds: ['region-9'], unassignedRegionIds: [] });
    expect(snapped.alternatives[0]).toBe('P1');
    const slot = (id: string) => snapped.assignments.find(item => item.slotId === id);
    expect(slot('C1.marca')?.regionIds).toEqual(['region-1']);
    expect(slot('C1.foto')?.regionIds).toEqual(['region-2']);
    expect(slot('C1.chamada-1')?.regionIds).toEqual(['region-8']);
    expect(slot('C1.titulo')?.regionIds).toEqual(['region-3']);
    expect(slot('C1.subtitulo')?.regionIds).toEqual(['region-4']);
    // Pills left to right, whatever their small vertical offsets.
    expect(['C1.pilula-a1', 'C1.pilula-a2', 'C1.pilula-b1'].map(id => slot(id)?.regionIds[0])).toEqual(['region-6', 'region-7', 'region-5']);
    expect(['C1.modelo-1', 'C1.modelo-2', 'C1.modelo-3'].map(id => [slot(id)?.regionIds, slot(id)?.textPart]))
      .toEqual([[['region-10'], 0], [['region-10'], 1], [['region-10'], 2]]);
    for (const assignment of snapped.assignments) {
      expect(PRESYS_PCON_COVER.slots).toContainEqual(expect.objectContaining({ id: assignment.slotId, kind: assignment.kind }));
    }
    // "foto do PCON-Y17", "PCON-Y17", "0 a 200 psi", "Y17 · Y18-LP · Y18-BP": every digit waits for a person.
    expect(source.confirmations.map(item => item.regionId)).toEqual(['region-2', 'region-3', 'region-6', 'region-10']);
    expect(source.confirmations.every(item => item.status === 'confirmar')).toBe(true);
    expect(snapped.questions).toEqual([]);
  });

  it('sugere tabela de comparação quando a proposta de capa não tem foto', () => {
    const snapped = snapSketchPlan(plan('capa', [title, table]));
    expect(snapped).toMatchObject({ proposedArchetypeId: 'P1', archetypeId: 'P4', proposalMatches: false, requiresConfirmation: true });
    expect(snapped.assignments).toContainEqual(expect.objectContaining({ slotId: 'P4.specs', regionIds: ['region-2'] }));
    expect(snapped.warnings.join(' ')).toContain('confirmação');
  });

  it('mantém uma proposta esparsa para revisão quando nenhuma estrutura é suficiente', () => {
    const snapped = snapSketchPlan(plan('capa', [title]));
    expect(snapped).toMatchObject({ archetypeId: 'P1', proposalMatches: false, requiresConfirmation: true });
    expect(snapped.missingSlotIds).toContain('P1.hero');
  });

  it('usa caixas somente para ordenar e reconhecer a coluna; não devolve geometria de página', () => {
    const source = plan('faixas_entradas', [
      title, region('table', [550, 550, 900, 950], '', 'gerais'), region('table', [100, 50, 450, 450], '', 'faixas'),
    ]);
    const snapped = snapSketchPlan(source);
    expect(snapped.assignments).toContainEqual(expect.objectContaining({ slotId: 'P5.ranges', regionIds: ['region-3'], column: 'left' }));
    expect(snapped.assignments).toContainEqual(expect.objectContaining({ slotId: 'P5.general', regionIds: ['region-2'], column: 'right' }));
    expect(snapped.assignments.map(item => item.readingOrder)).toEqual([0, 1, 2]);
    const visit = (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      expect(Object.keys(value)).not.toEqual(expect.arrayContaining(['bbox']));
      for (const [key, child] of Object.entries(value)) {
        expect(['x', 'y', 'width', 'height', 'frame', 'normalizedBox', 'mm', 'fills', 'text']).not.toContain(key);
        visit(child);
      }
    };
    visit({ ...snapped, questions: [] });
    expect(sketchRegionColumn(source.regions[0])).toBe('full');
  });
});

describe('Perguntas: só disposição real e a fonte de cada tabela', () => {
  it('especificações do spike: a nota sob a tabela é da tabela e a fonte sugerida é o PDF escrito no rascunho', () => {
    // D:/spike-rascunho/sketches/especificacoes.json ("do PDF" came in the table's instruction in 16 of 16 calls).
    const source = plan('especificacoes', [
      region('title', native(0.0565, 0.0399, 0.7226, 0.0972), 'Especificações técnicas'),
      region('table', native(0.0645, 0.1539, 0.9355, 0.6556), 'característica | TA-25N | TA-35N | TA-50N', 'do PDF'),
      region('note', native(0.0581, 0.6853, 0.9419, 0.7412), 'notas embaixo'),
    ], ['Quais são as características da tabela?', 'Quais são os valores de cada modelo?', 'A tabela continua em outra página?']);
    const snapped = snapSketchPlan(source);
    expect(snapped.archetypeId).toBe('P4');
    expect(snapped.assignments).toContainEqual(expect.objectContaining({ slotId: 'P4.specs', regionIds: ['region-2', 'region-3'] }));
    expect(snapped.missingSlotIds).toContain('P4.footer');
    expect(snapped.questions).toEqual([
      { id: 'layout-3', kind: 'layout', text: 'A tabela continua em outra página?', questionIndex: 2 },
      { id: 'fonte-P4.specs', kind: 'table-source', text: 'De onde vêm os dados da “Tabela de comparação”?', slotId: 'P4.specs',
        regionIds: ['region-2', 'region-3'], suggested: 'pdf', options: SKETCH_SOURCE_OPTIONS },
    ]);
    // The header digits ("TA-25N") stay to confirm; the table is never filled from the sketch.
    expect(source.confirmations.map(item => [item.regionId, item.source])).toEqual([['region-2', 'text']]);
  });

  it('uma nota solta "do PDF" vira a fonte da tabela mais próxima, não um campo pendente', () => {
    const source = plan('faixas_entradas', [title,
      region('table', [100, 50, 400, 950], 'Faixas'), region('note', [410, 50, 440, 400], 'do PDF'),
      region('table', [500, 50, 800, 950], 'Gerais'), region('callout', [810, 50, 840, 400], 'da planilha'),
    ]);
    const snapped = snapSketchPlan(source);
    expect(snapped.sourceNoteRegionIds).toEqual(['region-3', 'region-5']);
    expect(snapped.unassignedRegionIds).toEqual([]);
    expect(snapped.questions.map(item => item.kind === 'table-source' ? [item.slotId, item.suggested] : [])).toEqual([
      ['P5.ranges', 'pdf'], ['P5.general', 'planilha']]);
  });

  it('sem indicação no rascunho, pergunta a fonte sem sugerir nada', () => {
    const snapped = snapSketchPlan(plan('especificacoes', [title, region('table', [500, 50, 800, 950])]));
    expect(snapped.questions).toEqual([expect.objectContaining({ kind: 'table-source', slotId: 'P4.specs', suggested: null })]);
  });
});

describe('Linhas de acessórios', () => {
  it('agrupa acessórios decompostos sem perder a foto ou inventar campos de foto em cada linha', () => {
    const source = plan('fornecimento_acessorios', [title,
      region('image', [180, 50, 300, 250]), region('subtitle', [180, 300, 220, 950], 'Código 1'), region('paragraph', [240, 300, 290, 950]),
      region('image', [400, 50, 520, 250]), region('subtitle', [400, 300, 440, 950], 'Código 2'), region('paragraph', [460, 300, 510, 950]),
      region('image', [620, 50, 740, 250]), region('subtitle', [620, 300, 660, 950], 'Código 3'), region('paragraph', [680, 300, 730, 950]),
    ]);
    const groups = groupSketchRegions(source).filter(group => group.kind === 'accessory-item');
    expect(groups.map(group => group.regionIds)).toEqual([
      ['region-2', 'region-3', 'region-4'], ['region-5', 'region-6', 'region-7'], ['region-8', 'region-9', 'region-10'],
    ]);
    const snapped = snapSketchPlan(source);
    expect(snapped.proposalMatches).toBe(true);
    expect(snapped.assignments).toContainEqual(expect.objectContaining({
      slotId: 'P7.accessories', kind: 'table', regionIds: ['region-3', 'region-4', 'region-6', 'region-7', 'region-9', 'region-10'],
    }));
    expect(snapped.assignments.some(item => item.slotId === 'P7.kit-photo')).toBe(false);
    expect(snapped.unassignedRegionIds).toEqual(['region-2', 'region-5', 'region-8']);
    expect(snapped.warnings.join(' ')).toContain('foto do kit');
    const represented = [...snapped.assignments.flatMap(item => item.regionIds), ...snapped.unassignedRegionIds];
    expect(represented.sort()).toEqual(source.regions.map(item => item.id).sort());
  });

  it('o rascunho de acessórios do spike (foto + lista por linha) vai para Fornecimento e acessórios', () => {
    const rows = [0.171, 0.3592, 0.5473, 0.7355].flatMap(y => [
      region('image', native(0.0645, y, 0.2419, y + 0.1255)), region('list', native(0.2702, y - 0.002, 0.9395, y + 0.1266), 'código'),
    ]);
    const source = plan('fornecimento_acessorios', [region('title', native(0.0565, 0.0399, 0.3931, 0.0929), 'Acessórios'), ...rows,
      region('callout', [100, 300, 140, 700], 'fotos pequenas à esquerda')], ['Quais são os códigos e descrições dos acessórios?',
      'A lista se limita a 4 itens ou há mais?']);
    const snapped = snapSketchPlan(source);
    expect(snapped.archetypeId).toBe('P7');
    expect(snapped.assignments.find(item => item.slotId === 'P7.accessories')?.regionIds).toEqual(['region-3', 'region-5', 'region-7', 'region-9']);
    expect(snapped.questions.map(item => item.text)).toEqual(['A lista se limita a 4 itens ou há mais?',
      'De onde vêm os dados da “Tabela de acessórios”?']);
    // The four small photos and the layout note stay visible as pending: the P7 model has only the kit photo.
    expect([...snapped.unassignedRegionIds].sort()).toEqual(['region-10', 'region-2', 'region-4', 'region-6', 'region-8'].sort());
  });

  it('aceita a lista agrupada do Gemini e mantém instruções de fonte no plano original', () => {
    const source = plan('fornecimento_acessorios', [
      region('title', [10, 50, 90, 950], 'Acessórios'), region('list', [100, 50, 400, 950], '', 'do PDF'),
      region('list', [450, 50, 800, 950], '', 'fotos pequenas à esquerda'),
    ]);
    const snapped = snapSketchPlan(source);
    expect(snapped.assignments).toContainEqual(expect.objectContaining({ slotId: 'P7.accessories', regionIds: ['region-2', 'region-3'] }));
    expect(source.regions[1].instruction).toBe('do PDF');
    expect(snapped.groups.filter(item => item.kind === 'accessory-item')).toHaveLength(2);
    expect(snapped.questions).toEqual([expect.objectContaining({ slotId: 'P7.accessories', suggested: 'pdf' })]);
  });

  it('não usa caixas ou desenhos sem campo correspondente como posições livres', () => {
    const source = plan('especificacoes', [title, table,
      region('band', [100, 50, 200, 950], 'Faixa azul'), region('image', [250, 50, 450, 450]),
    ]);
    const snapped = snapSketchPlan(source);
    expect(snapped.unassignedRegionIds).toEqual(['region-3', 'region-4']);
    expect(snapped.warnings.join(' ')).toContain('não cabem');
  });

  it('não associa um rótulo a duas linhas próximas quando a foto tem pequena rotação', () => {
    const source = plan('fornecimento_acessorios', [
      region('image', [100, 50, 200, 250]), region('image', [220, 50, 320, 250]),
      region('subtitle', [190, 300, 230, 950], 'Código'),
    ]);
    const groups = groupSketchRegions(source);
    expect(groups.flatMap(group => group.regionIds).filter(id => id === 'region-3')).toHaveLength(1);
    expect(new Set(groups.flatMap(group => group.regionIds)).size).toBe(source.regions.length);
  });

  it('a ordem de leitura é por linhas, da esquerda para a direita, e não depende da ordem da resposta', () => {
    const source = plan('capa', [region('pill', [705, 600, 745, 850]), region('pill', [700, 50, 740, 300]), region('title', [50, 50, 120, 900])]);
    expect(sketchReadingOrder(source.regions).map(item => item.id)).toEqual(['region-3', 'region-2', 'region-1']);
    expect(sketchReadingOrder([...source.regions].reverse()).map(item => item.id)).toEqual(['region-3', 'region-2', 'region-1']);
  });
  it('fits the fields again to the page type the person picks, keeping the same three choices', () => {
    const title = region('title', [40, 60, 90, 700], 'Especificações técnicas');
    const table = region('table', [150, 60, 650, 940], 'característica TA-25N', 'do PDF');
    const source = plan('especificacoes', [title, table]);
    const suggested = snapSketchPlan(source);
    expect(suggested.suggestedArchetypeId).toBe(suggested.archetypeId);
    const other = suggested.alternatives[0];
    const picked = snapSketchPlan(source, { template: other });
    expect(picked.archetypeId).toBe(other);
    expect(picked.suggestedArchetypeId).toBe(suggested.archetypeId);
    expect(new Set([picked.archetypeId, ...picked.alternatives])).toEqual(new Set([suggested.archetypeId, ...suggested.alternatives]));
    expect(picked.assignments.every(item => item.slotId.startsWith(`${other}.`))).toBe(true);
  });
});
