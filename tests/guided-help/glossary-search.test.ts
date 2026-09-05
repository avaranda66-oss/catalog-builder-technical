// tests/guided-help/glossary-search.test.ts
// Testes para busca, filtros e divisão de linguagem simples vs técnica no glossário.

import { describe, it, expect } from 'vitest';
import { HELP_CONCEPTS_REGISTRY, TASK_TUTORIALS_REGISTRY } from '../../src/features/guided-help/index';

describe('Glossário - Mecanismos de Busca e Filtragem', () => {
  const concepts = Object.values(HELP_CONCEPTS_REGISTRY);
  const tutorials = Object.values(TASK_TUTORIALS_REGISTRY);

  it('deve localizar conceitos por termos-chave comuns (ex: chave, herança, dataset, evidência)', () => {
    const searchTerms = ['chave', 'herança', 'dataset', 'evidência', 'conflito'];

    searchTerms.forEach((term) => {
      const matches = concepts.filter(
        (c) =>
          c.title.toLowerCase().includes(term) ||
          c.shortExplanation.toLowerCase().includes(term) ||
          c.simpleExplanation.toLowerCase().includes(term)
      );
      expect(matches.length, `Nenhum resultado para o termo '${term}'`).toBeGreaterThan(0);
    });
  });

  it('deve permitir filtragem por categoria (hierarchy, data, evidence, architecture, editorial)', () => {
    const categories = ['hierarchy', 'data', 'evidence', 'architecture', 'editorial'] as const;

    categories.forEach((cat) => {
      const items = concepts.filter((c) => c.category === cat);
      expect(items.length, `Categoria vazia: ${cat}`).toBeGreaterThan(0);
    });
  });

  it('garante separação semântica clara entre linguagem simples e explicação técnica', () => {
    const semKey = HELP_CONCEPTS_REGISTRY['semantic-key'];
    expect(semKey.simpleExplanation.toLowerCase()).toContain('computador');
    expect(semKey.technicalExplanation.toLowerCase()).toContain('namespace');

    const inher = HELP_CONCEPTS_REGISTRY['inheritance'];
    expect(inher.simpleExplanation.toLowerCase()).toContain('família');
    expect(inher.technicalExplanation.toLowerCase()).toContain('viewmodel');
  });

  it('deve encontrar tutoriais por termos de ação (adicionar, criar, rastrear)', () => {
    const actionTerms = ['adicionar', 'criar', 'rastrear'];

    actionTerms.forEach((term) => {
      const matches = tutorials.filter(
        (t) => t.title.toLowerCase().includes(term) || t.description.toLowerCase().includes(term)
      );
      expect(matches.length, `Nenhum tutorial encontrado para a ação '${term}'`).toBeGreaterThan(0);
    });
  });
});
