// src/domain/capabilities/capability.types.ts
// Tipos canônicos e estritos do sistema de capacidades de elementos.
// Proíbe expressamente any, caminhos arbitrários e autorização descontrolada de escrita.

import { BlockType } from '../catalog.schema';
import { CapabilityId } from './capability.ids';

export type CapabilityCategory =
  | 'content'
  | 'media'
  | 'layout'
  | 'appearance'
  | 'data'
  | 'layers';

export type CapabilityValueKind =
  | 'text'
  | 'number'
  | 'boolean'
  | 'color'
  | 'enum'
  | 'dimension'
  | 'asset'
  | 'collection'
  | 'structured';

export type CapabilityControlHint =
  | 'text'
  | 'textarea'
  | 'number'
  | 'dimension'
  | 'select'
  | 'segmented'
  | 'toggle'
  | 'color'
  | 'asset_picker'
  | 'range'
  | 'custom';

export type CapabilityUnit =
  | 'mm'
  | 'px'
  | 'percent'
  | 'pt'
  | 'token'
  | 'none';

export type DefaultSource =
  | 'none'
  | 'factory'
  | 'preset'
  | 'document'
  | 'derived';

export type ResetPolicy =
  | 'none'
  | 'to_factory'
  | 'to_preset';

export type TranslationPolicy =
  | 'translate'
  | 'protect'
  | 'none';

export type WritePolicy =
  | 'user_only'
  | 'read_only'
  | 'validated_command';

export type EngineFamily =
  | 'flow'
  | 'structural'
  | 'cover_legacy'
  | 'table_legacy'
  | 'specialized';

export type InspectorFamily =
  | 'simple_content'
  | 'media'
  | 'table'
  | 'structural'
  | 'hero'
  | 'composite';

export interface RendererSupport {
  readonly editor: boolean;
  readonly print: boolean;
}

export interface UniversalActions {
  readonly canDuplicate: boolean;
  readonly canDelete: boolean;
  readonly canReset: boolean;
  readonly canReorder: boolean;
}

export type DynamicBoundSource = 'page_content_width_mm';

export interface CapabilityNumericConstraint {
  readonly min?: number;
  readonly max?: number;
  readonly exclusiveMin?: number;
  readonly maxSource?: DynamicBoundSource;
  readonly step?: number;
}

export interface CapabilityOptionConstraint {
  readonly label: string;
  readonly value: string | number;
}

export interface CapabilityConstraints {
  readonly numeric?: CapabilityNumericConstraint;
  readonly options?: readonly CapabilityOptionConstraint[];
}

export interface PropertyCapability {
  readonly id: CapabilityId;
  readonly label: string;
  readonly category: CapabilityCategory;
  readonly valueKind: CapabilityValueKind;
  readonly controlHint: CapabilityControlHint;
  readonly unit: CapabilityUnit;
  readonly defaultSource: DefaultSource;
  readonly resetPolicy: ResetPolicy;
  readonly rendererSupport: RendererSupport;
  readonly translationPolicy: TranslationPolicy;
  readonly writePolicy: WritePolicy;
  readonly constraints?: CapabilityConstraints;
}

export interface ElementCapabilityDefinition {
  readonly blockType: BlockType;
  readonly displayName: string;
  readonly engineFamily: EngineFamily;
  readonly inspectorFamily: InspectorFamily;
  readonly capabilities: readonly PropertyCapability[];
  readonly universalActions: UniversalActions;
}
