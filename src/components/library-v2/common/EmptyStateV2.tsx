// src/components/library-v2/common/EmptyStateV2.tsx
// Estado vazio didático que responde:
// 1. O que é esta área?
// 2. Por que está vazia?
// 3. O que posso fazer agora?

import React from 'react';
import { HelpConceptId, useLearnMode } from '../../../features/guided-help';
import { TermHelp } from '../../guided-help/TermHelp';
import { LucideIcon, Plus, BookOpen, ArrowRight } from 'lucide-react';


export interface EmptyStateV2Props {
  icon: LucideIcon;
  title: string;
  whatIsIt: string;
  whyIsEmpty: string;
  conceptId?: HelpConceptId;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  className?: string;
}

export const EmptyStateV2: React.FC<EmptyStateV2Props> = ({
  icon: Icon,
  title,
  whatIsIt,
  whyIsEmpty,
  conceptId,
  primaryActionLabel,
  onPrimaryAction,
  secondaryActionLabel,
  onSecondaryAction,
  className = ''
}) => {
  const { openConceptDetail } = useLearnMode();

  return (
    <div
      className={`p-8 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/70 text-center max-w-xl mx-auto my-8 ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center mx-auto mb-4 shadow-xs">
        <Icon size={24} />
      </div>

      <h3 className="text-base font-bold text-slate-900 mb-2">{title}</h3>

      {/* 1. O que é esta área? */}
      <p className="text-xs text-slate-600 leading-relaxed mb-3">
        {whatIsIt}{' '}
        {conceptId && (
          <span className="inline-block ml-1">
            <TermHelp helpId={conceptId} label="Saiba mais" showIcon />
          </span>
        )}
      </p>

      {/* 2. Por que está vazia? */}
      <div className="bg-white/80 p-3 rounded-xl border border-slate-200/80 text-xs text-slate-500 mb-6 text-left">
        <span className="font-semibold text-slate-700 block mb-1">Por que está vazio?</span>
        <span>{whyIsEmpty}</span>
      </div>

      {/* 3. O que posso fazer agora? */}
      <div className="flex items-center justify-center gap-3 flex-wrap">
        {primaryActionLabel && onPrimaryAction && (
          <button
            type="button"
            onClick={onPrimaryAction}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-colors"
          >
            <Plus size={14} />
            <span>{primaryActionLabel}</span>
          </button>
        )}

        {secondaryActionLabel && onSecondaryAction && (
          <button
            type="button"
            onClick={onSecondaryAction}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors"
          >
            <span>{secondaryActionLabel}</span>
            <ArrowRight size={13} />
          </button>
        )}

        {conceptId && !secondaryActionLabel && (
          <button
            type="button"
            onClick={() => openConceptDetail(conceptId)}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors"
          >
            <BookOpen size={13} className="text-indigo-600" />
            <span>Entender o Conceito</span>
          </button>
        )}
      </div>
    </div>
  );
};
