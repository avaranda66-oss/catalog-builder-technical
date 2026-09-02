import React, { createContext, useContext, useMemo, useCallback } from 'react';
import { PrintStringRegistry } from './print-strings.registry';

export interface PrintLocalizationContextValue {
  locale: string;
  localizedSystemStrings?: Record<string, string>;
  resolveSystemString: (key: string, fallback?: string) => string;
}

const PrintLocalizationContext = createContext<PrintLocalizationContextValue>({
  locale: 'pt-BR',
  localizedSystemStrings: {},
  resolveSystemString: (key: string, fallback?: string) => fallback || key
});

export interface PrintLocalizationProviderProps {
  locale?: string;
  localizedSystemStrings?: Record<string, string>;
  children: React.ReactNode;
}

export const PrintLocalizationProvider: React.FC<PrintLocalizationProviderProps> = ({
  locale = 'pt-BR',
  localizedSystemStrings = {},
  children
}) => {
  const resolveSystemString = useCallback(
    (key: string, fallback?: string): string => {
      if (!key) return fallback || '';

      // Prioridade 1: localizedSystemStrings persistido no catálogo
      if (localizedSystemStrings && localizedSystemStrings[key] && localizedSystemStrings[key].trim()) {
        return localizedSystemStrings[key].trim();
      }

      // Prioridade 2: PrintStringRegistry estático/overrides homologados para o locale
      if (PrintStringRegistry.has(key)) {
        const str = PrintStringRegistry.get(key, locale);
        if (str && str !== key) {
          return str;
        }
      }

      // Prioridade 3: Fallback defensivo
      return fallback !== undefined ? fallback : key;
    },
    [locale, localizedSystemStrings]
  );

  const value = useMemo(
    () => ({
      locale,
      localizedSystemStrings,
      resolveSystemString
    }),
    [locale, localizedSystemStrings, resolveSystemString]
  );

  return (
    <PrintLocalizationContext.Provider value={value}>
      {children}
    </PrintLocalizationContext.Provider>
  );
};

export const usePrintLocalization = (): PrintLocalizationContextValue => {
  return useContext(PrintLocalizationContext);
};

export const usePrintString = (key: string, fallback?: string): string => {
  const { resolveSystemString } = usePrintLocalization();
  return resolveSystemString(key, fallback);
};
