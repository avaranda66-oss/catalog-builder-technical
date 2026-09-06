import React from 'react';
import { ContentBlock } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';

interface BoxBlockProps {
  block: ContentBlock;
  pageId: string;
  isSelected: boolean;
}

const EMPTY_PLACEHOLDER = 'Digite notas técnicas ou advertências metrológicas...';

const renderInlineMarkup = (text: string): React.ReactNode[] => {
  const nodes: React.ReactNode[] = [];
  const markupPattern = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = markupPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[1] !== undefined) {
      nodes.push(<strong key={`strong-${key++}`}>{match[1]}</strong>);
    } else {
      nodes.push(<em key={`em-${key++}`}>{match[2]}</em>);
    }

    lastIndex = markupPattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
};

export const BoxBlock: React.FC<BoxBlockProps> = ({ block, pageId, isSelected }) => {
  const { updateBlock, setSelectedBlockId } = useCatalogStore();
  const sourceText = block.textContent ?? '';
  const displayText = sourceText || EMPTY_PLACEHOLDER;
  const [isEditing, setIsEditing] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const sourceAtEditStartRef = React.useRef('');
  const editorRef = React.useRef<HTMLTextAreaElement>(null);

  React.useLayoutEffect(() => {
    if (!isEditing || !editorRef.current) {
      return;
    }

    editorRef.current.focus();
    editorRef.current.setSelectionRange(editorRef.current.value.length, editorRef.current.value.length);
  }, [isEditing]);

  React.useLayoutEffect(() => {
    if (!isEditing || !editorRef.current) {
      return;
    }

    editorRef.current.style.height = 'auto';
    editorRef.current.style.height = `${editorRef.current.scrollHeight}px`;
  }, [draft, isEditing]);

  const beginEditing = () => {
    sourceAtEditStartRef.current = sourceText;
    setDraft(sourceText);
    setIsEditing(true);
  };

  const handleBlur = () => {
    setIsEditing(false);

    if (draft !== sourceAtEditStartRef.current) {
      updateBlock(pageId, block.id, { textContent: draft });
    }
  };

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        setSelectedBlockId(block.id);
      }}
      className={`relative rounded-none transition-all ${
        isSelected ? 'ring-2 ring-blue-600' : 'hover:border-slate-400'
      }`}
      style={{
        backgroundColor: block.style?.backgroundColor || '#f8fafc',
        borderColor: block.style?.borderColor || '#cbd5e1',
        borderWidth: block.style?.borderWidth || '1px',
        padding: block.style?.padding || '12px',
        borderStyle: 'solid'
      }}
    >
      {isEditing ? (
        <textarea
          ref={editorRef}
          data-printable-field="textContent"
          data-editor-mode="editing"
          aria-label="Conteúdo da caixa"
          value={draft}
          placeholder={EMPTY_PLACEHOLDER}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onBlur={handleBlur}
          rows={1}
          className="block w-full min-h-[1.25rem] resize-none overflow-hidden border-0 bg-transparent p-0 outline-none text-xs font-sans text-slate-800 leading-relaxed whitespace-pre-wrap cursor-text"
        />
      ) : (
        <div
          data-printable-field="textContent"
          data-editor-mode="display"
          role="textbox"
          aria-label="Conteúdo da caixa"
          tabIndex={0}
          onFocus={beginEditing}
          className="outline-none text-xs font-sans text-slate-800 leading-relaxed whitespace-pre-wrap cursor-text"
        >
          {renderInlineMarkup(displayText)}
        </div>
      )}
    </div>
  );
};
