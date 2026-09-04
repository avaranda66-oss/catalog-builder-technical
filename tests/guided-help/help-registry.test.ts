// tests/guided-help/help-registry.test.ts
// Testes unitários para validação de completude e integridade do Help Registry.

import { describe, it, expect } from 'vitest';
import {
  HELP_CONCEPTS_REGISTRY,
  TASK_TUTORIALS_REGISTRY,
  LIBRARY_V2_TOUR_STEPS,
  HelpConceptId
} from '../../src/features/guided-help/index';

describe('GuidedHelpRegistry - Integridade e Completude', () => {
  const REQUIRED_CONCEPTS: readonly HelpConceptId[] = [
    'library',
    'family',
    'product',
    'product-workspace',
    'workbook',
    'module',
    'technical-datum',
    'dataset',
    'technical-table',
    'evidence',
    'source-document',
    'inheritance',
    'override',
    'conflict',
    'semantic-key',
    'alias',
    'revision',
    'canonical-decision',
    'saved-view',
    'template',
    'binding'
  ];

  it('deve conter todos os 21 conceitos obrigatórios da especificação', () => {
    REQUIRED_CONCEPTS.forEach((conceptId) => {
      const concept = HELP_CONCEPTS_REGISTRY[conceptId];
      expect(concept, `Conceito '${conceptId}' não encontrado no registro`).toBeDefined();
      expect(concept.id).toBe(conceptId);
    });
  });

  it('cada conceito deve possuir todos os campos educativos preenchidos com qualidade', () => {
    Object.values(HELP_CONCEPTS_REGISTRY).forEach((concept) => {
      expect(concept.title.length, `Título vazio em ${concept.id}`).toBeGreaterThan(3);
      expect(concept.shortExplanation.length, `shortExplanation muito curta em ${concept.id}`).toBeGreaterThan(15);
      expect(concept.simpleExplanation.length, `simpleExplanation muito curta em ${concept.id}`).toBeGreaterThan(30);
      expect(concept.technicalExplanation.length, `technicalExplanation muito curta em ${concept.id}`).toBeGreaterThan(30);
      expect(concept.whyItMatters.length, `whyItMatters muito curta em ${concept.id}`).toBeGreaterThan(15);
      expect(concept.example.length, `example muito curto em ${concept.id}`).toBeGreaterThan(15);
      expect(concept.whenToUse.length, `whenToUse muito curto em ${concept.id}`).toBeGreaterThan(10);
      expect(Array.isArray(concept.relatedTerms), `relatedTerms deve ser array em ${concept.id}`).toBe(true);
    });
  });

  it('todas as referências cruzadas em relatedTerms devem apontar para conceitos válidos', () => {
    Object.values(HELP_CONCEPTS_REGISTRY).forEach((concept) => {
      concept.relatedTerms.forEach((relatedId) => {
        expect(
          HELP_CONCEPTS_REGISTRY[relatedId],
          `Referência quebrada: '${concept.id}' aponta para '${relatedId}' que não existe`
        ).toBeDefined();
      });
    });
  });

  it('deve conter os 8 tutoriais de tarefas práticas com passos válidos', () => {
    const tutorialKeys = Object.keys(TASK_TUTORIALS_REGISTRY);
    expect(tutorialKeys.length).toBeGreaterThanOrEqual(8);

    Object.values(TASK_TUTORIALS_REGISTRY).forEach((tut) => {
      expect(tut.title.length).toBeGreaterThan(5);
      expect(tut.description.length).toBeGreaterThan(10);
      expect(tut.estimatedMinutes).toBeGreaterThan(0);
      expect(tut.steps.length).toBeGreaterThanOrEqual(2);

      tut.steps.forEach((step, idx) => {
        expect(step.stepNumber).toBe(idx + 1);
        expect(step.title.length).toBeGreaterThan(3);
        expect(step.instruction.length).toBeGreaterThan(10);
      });
    });
  });

  it('todos os passos do tour guiado devem ser coerentes e conter referências válidas', () => {
    expect(LIBRARY_V2_TOUR_STEPS.length).toBe(7);

    LIBRARY_V2_TOUR_STEPS.forEach((step) => {
      expect(step.targetSelector.length).toBeGreaterThan(3);
      expect(step.title.length).toBeGreaterThan(3);
      expect(step.content.length).toBeGreaterThan(15);
      if (step.conceptId) {
        expect(HELP_CONCEPTS_REGISTRY[step.conceptId]).toBeDefined();
      }
    });
  });
});
