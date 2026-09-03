// src/components/editor/inspector/components/InspectorGroup.tsx
// Agrupador visual legado — encapsula InspectorSection com defaultOpen=true para retrocompatibilidade (CORE.E3).

import React from 'react';
import { InspectorSection } from './InspectorSection';

export interface InspectorGroupProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  description?: string;
  badge?: string | number;
}

/**
 * @deprecated Use `InspectorSection` canônico com suporte a disclosure e acessibilidade (CORE.E3).
 * Mantido como adapter para componentes legados ainda não migrados.
 */
export const InspectorGroup: React.FC<InspectorGroupProps> = ({
  title,
  icon,
  children,
  description,
  badge
}) => {
  return (
    <InspectorSection
      title={title}
      icon={icon}
      description={description}
      badge={badge}
      defaultOpen={true}
    >
      {children}
    </InspectorSection>
  );
};
