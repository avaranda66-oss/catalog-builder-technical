// src/components/editor/inspector/components/InspectorGroup.tsx
// Agrupador visual sóbrio e industrial para o Contextual Inspector PRESYS

import React from 'react';

interface InspectorGroupProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  description?: string;
}

export const InspectorGroup: React.FC<InspectorGroupProps> = ({
  title,
  icon,
  children,
  description
}) => {
  return (
    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
      <div className="flex items-center justify-between pb-1 border-b border-slate-200/60">
        <div className="flex items-center gap-1.5">
          {icon && <span className="text-[#003366]">{icon}</span>}
          <span className="font-bold text-slate-800 text-[11px] uppercase tracking-wider font-mono">
            {title}
          </span>
        </div>
        {description && (
          <span className="text-[9px] text-slate-500 font-mono">
            {description}
          </span>
        )}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
};
