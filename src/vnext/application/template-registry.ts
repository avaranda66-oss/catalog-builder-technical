import { z } from 'zod';
import { EditorialObjectSchema, PageSchema } from '../domain/editorial-model';
import type { ObjectInstantiationSeed } from './document';

const templateId = z.string().min(1);
const cleanText = z.string().min(1).refine(
  (value) => ![...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127),
  'Control character'
);
const PageSafeAreaSchema = PageSchema.shape.safeArea.unwrap();

const PageTemplateDefinitionEnvelopeSchema = z.object({
  id: templateId,
  label: cleanText,
  description: cleanText.optional(),
  safeArea: PageSafeAreaSchema.optional(),
  objects: z.array(z.unknown()),
}).strict();

export interface PageTemplateDefinition {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly safeArea?: {
    readonly topMm: number;
    readonly rightMm: number;
    readonly bottomMm: number;
    readonly leftMm: number;
  };
  readonly objects: readonly ObjectInstantiationSeed[];
}

export interface PageTemplateRegistry {
  get(id: string): PageTemplateDefinition | undefined;
  list(): readonly PageTemplateDefinition[];
}

export interface PageTemplateDefinitionIssue {
  readonly path: string;
  readonly message: string;
}

export class PageTemplateDefinitionError extends Error {
  constructor(public readonly issues: readonly PageTemplateDefinitionIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join('; '));
    this.name = 'PageTemplateDefinitionError';
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function parseObjectSeed(input: unknown, index: number): ObjectInstantiationSeed {
  const path = `objects.${index}`;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new PageTemplateDefinitionError([{ path, message: 'Expected canonical object seed' }]);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'id')) {
    throw new PageTemplateDefinitionError([{ path: `${path}.id`, message: 'Root object ID is not allowed in a template seed' }]);
  }

  const parsed = EditorialObjectSchema.safeParse({ ...(input as Record<string, unknown>), id: `template-seed:${index}` });
  if (!parsed.success) {
    throw new PageTemplateDefinitionError(parsed.error.issues.map((issue) => ({
      path: [path, ...issue.path].join('.'),
      message: issue.message,
    })));
  }

  const { id: _id, ...seed } = parsed.data;
  return seed as ObjectInstantiationSeed;
}

export function parsePageTemplateDefinition(input: unknown): PageTemplateDefinition {
  const envelope = PageTemplateDefinitionEnvelopeSchema.safeParse(input);
  if (!envelope.success) {
    throw new PageTemplateDefinitionError(envelope.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })));
  }

  const definition: PageTemplateDefinition = {
    id: envelope.data.id,
    label: envelope.data.label,
    ...(envelope.data.description === undefined ? {} : { description: envelope.data.description }),
    ...(envelope.data.safeArea === undefined ? {} : { safeArea: { ...envelope.data.safeArea } }),
    objects: envelope.data.objects.map(parseObjectSeed),
  };
  return deepFreeze(definition);
}

export function createStaticPageTemplateRegistry(
  definitions: readonly PageTemplateDefinition[]
): PageTemplateRegistry {
  const parsed = definitions.map((definition) => parsePageTemplateDefinition(definition));
  const byId = new Map<string, PageTemplateDefinition>();
  for (const definition of parsed) {
    if (byId.has(definition.id)) {
      throw new PageTemplateDefinitionError([{ path: 'id', message: `Duplicate template ID: ${definition.id}` }]);
    }
    byId.set(definition.id, definition);
  }
  const ordered = Object.freeze([...parsed]);
  return Object.freeze({
    get: (id: string) => byId.get(id),
    list: () => ordered,
  });
}
