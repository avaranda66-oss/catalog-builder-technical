// tests/guided-help/learn-mode.test.ts
// Testes para o estado do Modo Aprender e navegação de tours.

import { describe, it, expect } from 'vitest';
import { HELP_CONCEPTS_REGISTRY, TASK_TUTORIALS_REGISTRY, LIBRARY_V2_TOUR_STEPS } from '../../src/features/guided-help/index';

describe('Learn Mode State e Tour Structure', () => {
  it('garante que todos os 7 passos do tour possuem títulos e descrições não vazias', () => {
    expect(LIBRARY_V2_TOUR_STEPS.length).toBe(7);
    LIBRARY_V2_TOUR_STEPS.forEach((step, index) => {
      expect(step.title).toContain(String(index + 1));
      expect(step.content.length).toBeGreaterThan(20);
      expect(step.targetSelector).toContain('data-tour');
    });
  });

  it('valida que cada tutorial possui tempo estimado e pelo menos 2 passos', () => {
    Object.values(TASK_TUTORIALS_REGISTRY).forEach((tutorial) => {
      expect(tutorial.estimatedMinutes).toBeGreaterThanOrEqual(1);
      expect(tutorial.steps.length).toBeGreaterThanOrEqual(2);
      tutorial.steps.forEach((s) => {
        expect(s.instruction.length).toBeGreaterThan(15);
      });
    });
  });

  it('verifica que todos os conceitos possuem categoria válida', () => {
    const validCategories = ['hierarchy', 'data', 'evidence', 'architecture', 'editorial'];
    Object.values(HELP_CONCEPTS_REGISTRY).forEach((concept) => {
      expect(validCategories).toContain(concept.category);
    });
  });
});
