import { BlockType } from '@/domain/catalog.schema';

export type PrintableTextKind =
  | 'heading'
  | 'body'
  | 'badge'
  | 'table_header'
  | 'table_cell'
  | 'caption'
  | 'legend'
  | 'footnote'
  | 'contact'
  | 'ordering_description'
  | 'system';

export type TranslationPolicy = 'translate' | 'protect' | 'system' | 'keep_source';

export interface PrintableTextNode {
  /** Identificador estável e determinístico do nó de texto (ex: p1_b_hero_title) */
  id: string;
  pageId: string;
  blockId?: string;
  /** Caminho semântico no documento (ex: title, features[0].description, tableRows[0].customNotes) */
  path: string;
  sourceText: string;
  kind: PrintableTextKind;
  policy: TranslationPolicy;
  /** Expectativa de renderização visual no DOM de produção: 'required' (padrão) ou 'optional' (condicional/oculto) */
  renderExpectation?: 'required' | 'optional';
  /** Chave DOM explícita de correspondência (opcional, defaults to id) */
  domKey?: string;
  source?: {
    blockType?: BlockType | 'catalog' | 'page' | 'system';
    field?: string;
  };
}

export type ScriptType =
  | 'Latin'
  | 'Cyrillic'
  | 'Greek'
  | 'Thai'
  | 'Han'
  | 'Japanese'
  | 'Korean'
  | 'Devanagari'
  | 'Arabic'
  | 'Hebrew';

export type TextDirection = 'ltr' | 'rtl';

export interface LanguageDefinition {
  /** Código BCP-47 (ex: pt-BR, en-US, th-TH, ru-RU, zh-CN, ar-SA) */
  code: string;
  nativeName: string;
  englishName: string;
  region?: string;
  script: ScriptType;
  direction: TextDirection;
  fontProfile: string;
  enabled: boolean;
  translationSupport: 'ready' | 'experimental';
  layoutSupport: 'ready' | 'experimental';
}

export type TranslationProviderId = 'gemini';

export type CredentialStorageMode = 'session' | 'remember';

export interface TranslationCredential {
  provider: TranslationProviderId;
  apiKey: string;
  storageMode: CredentialStorageMode;
  model?: string;
  validatedAt?: string;
}

export interface StoredCredentialMetadata {
  provider: TranslationProviderId;
  storageMode: CredentialStorageMode;
  model: string;
  isValid: boolean;
  validatedAt?: string;
  lastTestedLocale?: string;
}

export interface TranslationRequestNode {
  id: string;
  text: string;
}

export interface TranslationResponseNode {
  id: string;
  translatedText: string;
}

export interface TranslationResponse {
  translations: TranslationResponseNode[];
}

export interface CoverageAuditResult {
  printableTextCount: number;
  translateCount: number;
  protectedCount: number;
  systemCount: number;
  unclassifiedCount: number;
  nodes: PrintableTextNode[];
  isComplete: boolean;
}

export type TranslationErrorCode =
  | 'CREDENTIAL_REQUIRED'
  | 'CREDENTIAL_INVALID'
  | 'PROVIDER_QUOTA'
  | 'PROVIDER_RATE_LIMIT'
  | 'PROVIDER_UNAVAILABLE'
  | 'TRANSLATION_INVALID_RESPONSE'
  | 'COVERAGE_INCOMPLETE'
  | 'UNKNOWN_ERROR';

export class TranslationError extends Error {
  code: TranslationErrorCode;
  details?: any;

  constructor(code: TranslationErrorCode, message: string, details?: any) {
    super(message);
    this.name = 'TranslationError';
    this.code = code;
    this.details = details;
  }
}
