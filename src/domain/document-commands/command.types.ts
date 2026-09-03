// src/domain/document-commands/command.types.ts
// Protocolo Canônico de Comandos Documentais Tipados.
// Proíbe expressamente patches arbitrários { path: string, value: any }.

export type CommandOrigin =
  | 'user'
  | 'inspector'
  | 'tool_rail'
  | 'keyboard'
  | 'ai'
  | 'system'
  | 'migration';

export interface BaseDocumentCommand {
  commandId?: string;
  origin?: CommandOrigin;
  timestamp?: string;
}

export type CommandResult<T> =
  | {
      success: true;
      data: T;
      summary: string;
      warnings?: string[];
    }
  | {
      success: false;
      error: string;
      errorCode: string;
    };
