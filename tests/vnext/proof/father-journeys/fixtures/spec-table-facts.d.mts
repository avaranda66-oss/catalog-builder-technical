// Types of spec-table-facts.mjs (J2-lite proof fixture), so the Vitest suites can share it.
export declare const TA: readonly string[];
export declare const FOLDER_FILE: string;
export declare const MANUAL_FILE: string;
export declare const FOLDER_SPEC_PAGE: number;
export declare const MANUAL_SPEC_PAGE: number;
export declare function folderPdfBytes(): Uint8Array;
export declare function manualPdfBytes(): Uint8Array;
export declare function folderSheet(): Record<string, unknown>;
export declare function manualSheet(): Record<string, unknown>;
export declare function controlledAnswers(): { readonly answers: Readonly<Record<string, Record<string, unknown>>> };
