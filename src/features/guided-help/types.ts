// src/features/guided-help/types.ts
// Tipos fundamentais do Sistema de Aprendizado Contextual (Guided Help System).
// Totalmente desacoplado do domínio PIM para não criar uma segunda verdade de produto.

export type HelpConceptId =
  | 'library'
  | 'family'
  | 'product'
  | 'product-workspace'
  | 'workbook'
  | 'module'
  | 'technical-datum'
  | 'dataset'
  | 'technical-table'
  | 'evidence'
  | 'source-document'
  | 'inheritance'
  | 'override'
  | 'conflict'
  | 'semantic-key'
  | 'alias'
  | 'revision'
  | 'canonical-decision'
  | 'saved-view'
  | 'template'
  | 'binding';

export type HelpCategory =
  | 'hierarchy'      // Biblioteca, Família, Produto, Módulo
  | 'data'           // TechnicalDatum, Dataset, Tabela Técnica
  | 'evidence'       // Evidência, Documento Fonte, Conflito, Decisão Canônica
  | 'architecture'   // Chave Semântica, Herança, Override, Binding
  | 'editorial';     // Saved View, Template, Alias, Revisão

export interface HelpConcept {
  readonly id: HelpConceptId;
  readonly title: string;
  readonly category: HelpCategory;
  /** Explicação curta de 1 a 2 frases para micro-tooltips */
  readonly shortExplanation: string;
  /** Explicação didática em linguagem natural para não-especialistas */
  readonly simpleExplanation: string;
  /** Explicação técnica formal detalhando comportamento arquitetural (semanticKey, ownerKind, etc.) */
  readonly technicalExplanation: string;
  /** Por que esse conceito existe e qual valor ele gera */
  readonly whyItMatters: string;
  /** Exemplo prático e realista do mundo real */
  readonly example: string;
  /** Quando o usuário deve utilizar ou interagir com esse conceito */
  readonly whenToUse: string;
  /** Armadilhas comuns, avisos e boas práticas */
  readonly warnings?: string;
  /** Identificadores de conceitos correlatos para navegação cruzada */
  readonly relatedTerms: readonly HelpConceptId[];
  /** Nome da aba ou seção recomendada na interface */
  readonly learnMoreTarget?: string;
}

export type TaskTutorialId =
  | 'task-add-datum'
  | 'task-create-table'
  | 'task-trace-source'
  | 'task-resolve-conflict'
  | 'task-create-override'
  | 'task-organize-modules'
  | 'task-rename-display-label'
  | 'task-search-data';

export interface TaskTutorialStep {
  readonly stepNumber: number;
  readonly title: string;
  readonly instruction: string;
  readonly tip?: string;
}

export interface TaskTutorial {
  readonly id: TaskTutorialId;
  readonly title: string;
  readonly description: string;
  readonly estimatedMinutes: number;
  readonly relatedConceptIds: readonly HelpConceptId[];
  readonly steps: readonly TaskTutorialStep[];
}

export interface TourStep {
  readonly targetSelector: string;
  readonly title: string;
  readonly content: string;
  readonly conceptId?: HelpConceptId;
  readonly position?: 'top' | 'bottom' | 'left' | 'right';
}

export interface LearnModeState {
  readonly isLearnModeActive: boolean;
  readonly activeConceptId: HelpConceptId | null;
  readonly isGlossaryOpen: boolean;
  readonly activeContextSection: string | null;
  readonly activeTutorial: TaskTutorial | null;
  readonly tourCurrentStep: number | null;
  readonly hasCompletedTour: boolean;
}
