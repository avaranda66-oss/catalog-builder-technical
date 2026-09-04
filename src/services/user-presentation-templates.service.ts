// src/services/user-presentation-templates.service.ts
// Serviço de persistência local de Templates de Apresentação criados pelo usuário (Emenda 9).
// Desacoplado do domínio puro de Table Core.
// Zero dependência de Supabase.

import { TablePresentationTemplate, TablePresentationModel } from '../domain/table-core/table.types';
import { TablePresentationModelSchema } from '../domain/table-core/table.schema';

const STORAGE_KEY = 'cb_user_table_presentation_templates_v1';

export function getUserPresentationTemplates(): TablePresentationTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const validTemplates: TablePresentationTemplate[] = [];
    for (const item of parsed) {
      if (item && typeof item === 'object' && typeof item.id === 'string' && typeof item.name === 'string') {
        const check = TablePresentationModelSchema.safeParse(item.presentation);
        if (check.success) {
          validTemplates.push(item as TablePresentationTemplate);
        }
      }
    }
    return validTemplates;
  } catch {
    return [];
  }
}

export function saveUserPresentationTemplate(
  nameOrTemplate: string | TablePresentationTemplate,
  presentationArg?: TablePresentationModel,
  descriptionArg?: string
): TablePresentationTemplate {
  let name: string;
  let presentation: TablePresentationModel;
  let description: string | undefined;
  let id: string;

  if (typeof nameOrTemplate === 'object') {
    id = nameOrTemplate.id || `usr_tpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    name = nameOrTemplate.name;
    presentation = nameOrTemplate.presentation;
    description = nameOrTemplate.description;
  } else {
    id = `usr_tpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    name = nameOrTemplate;
    presentation = presentationArg!;
    description = descriptionArg;
  }

  const check = TablePresentationModelSchema.safeParse(presentation);
  if (!check.success) {
    throw new Error(`Apresentação inválida para template: ${check.error.errors.map((e) => e.message).join(', ')}`);
  }

  const templates = getUserPresentationTemplates();
  const newTemplate: TablePresentationTemplate = {
    id,
    name: name.trim() || 'Template Sem Nome',
    description: description?.trim(),
    presentation: structuredClone(presentation)
  };

  const updated = [newTemplate, ...templates.filter((t) => t.id !== newTemplate.id)];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // localStorage quota exceeded or unavailable
  }

  return newTemplate;
}

export function deleteUserPresentationTemplate(templateId: string): void {
  const templates = getUserPresentationTemplates();
  const filtered = templates.filter((t) => t.id !== templateId);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch {
    // localStorage unavailable
  }
}
