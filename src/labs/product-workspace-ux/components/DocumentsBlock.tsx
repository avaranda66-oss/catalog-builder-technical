// src/labs/product-workspace-ux/components/DocumentsBlock.tsx
import React from 'react';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { DocumentCardItem } from '../types';

interface DocumentsBlockProps {
  documents: DocumentCardItem[];
  onOpenDocument?: (doc: DocumentCardItem) => void;
}

export const DocumentsBlock: React.FC<DocumentsBlockProps> = ({
  documents,
  onOpenDocument
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
      {documents.map((doc) => (
        <div
          key={doc.id}
          className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono font-bold px-2 py-0.5 bg-blue-50 text-[#003366] border border-blue-200/60 rounded">
                {doc.code}
              </span>
              <span className="text-xs font-medium text-slate-500">
                {doc.revision} · {doc.date}
              </span>
            </div>

            <h4 className="text-sm font-bold text-slate-900 line-clamp-2 mt-1">
              {doc.title}
            </h4>

            <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
              <span>{doc.totalPages} páginas</span>
              <span>•</span>
              <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                <ShieldCheck className="w-3.5 h-3.5" />
                {doc.referencedFactsCount} dados verificados
              </span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-400">{doc.fileSize}</span>
            <button
              onClick={() => onOpenDocument && onOpenDocument(doc)}
              className="inline-flex items-center gap-1 text-[#003366] hover:text-[#002244] font-semibold"
            >
              <span>Abrir documento</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
