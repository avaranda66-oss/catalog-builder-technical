import type { DocumentSession } from '../application';
import { applyRefinement } from './composition';
import { interpretWorkbenchRequest, type WorkbenchAction } from './workbench-dialogue';

/**
 * The assistant's quick actions (formerly the "Ferramentas" tab): bounded, reversible changes of the open catalog that
 * never use the AI. They run from the ⚙ menu, or when a short request clearly asks for one of them ("Desfaça").
 */

export type QuickTool = Exclude<WorkbenchAction, 'help'>;

export interface QuickToolContext {
  readonly session: DocumentSession;
  /** Finishes any open text or cell edit first; false leaves everything as it is. */
  readonly onBeforeMutation?: () => boolean;
  /** The saved version can go to the PDF review. */
  readonly canPublish?: boolean;
  readonly onPublication?: () => void;
  /** Closes the assistant and goes back to editing by hand. */
  readonly onEditor?: () => void;
}

const QUICK_TOOL_LABEL: Readonly<Record<QuickTool, string>> = {
  compact: 'Deixar as tabelas mais compactas',
  undo: 'Desfazer a última alteração',
  redo: 'Refazer a alteração desfeita',
  publication: 'Abrir a revisão do PDF',
  editor: 'Voltar à edição manual',
};

/** What the person sees (in the menu, and as their own message in the conversation). */
export const quickToolLabel = (tool: QuickTool): string => QUICK_TOOL_LABEL[tool];

/** Whether the quick action can be offered on this screen. */
export function quickToolAvailable(tool: QuickTool, context: Pick<QuickToolContext, 'onPublication' | 'onEditor'>): boolean {
  if (tool === 'publication') return Boolean(context.onPublication);
  if (tool === 'editor') return Boolean(context.onEditor);
  return true;
}

/**
 * A short request that clearly asks for a quick action ("Desfaça", "Deixe as tabelas mais compactas") runs here, without
 * the AI. Longer requests always go to the AI, even when they start with the same words.
 */
export function quickToolForRequest(request: string, context: Pick<QuickToolContext, 'onPublication' | 'onEditor'>): QuickTool | null {
  const text = request.trim();
  if (!text || text.length > 60) return null;
  const action = interpretWorkbenchRequest(text);
  if (action === 'help' || !quickToolAvailable(action, context)) return null;
  return action;
}

/** Runs the quick action on the open catalog and says, in plain Portuguese, what happened. */
export function runQuickTool(tool: QuickTool, context: QuickToolContext): string {
  const { session, onBeforeMutation } = context;
  try {
    if ((tool === 'compact' || tool === 'undo' || tool === 'redo') && onBeforeMutation && !onBeforeMutation()) {
      return 'Conclua ou cancele a edição em andamento antes de pedir outra alteração. O catálogo não foi modificado.';
    }
    switch (tool) {
      case 'compact':
        if (!session.getSnapshot().document.pages.some((page) => page.objects.some((object) => object.type === 'table'))) {
          return 'Ainda não há tabelas neste catálogo para compactar. Adicione uma tabela ou peça outra alteração.';
        }
        applyRefinement(session, 'compact');
        return 'Compactei as tabelas no catálogo aberto. Veja a mudança na página, confira e use Salvar quando estiver satisfeito.';
      case 'undo':
        if (!session.getSnapshot().canUndo) return 'Não há alteração para desfazer agora. O catálogo não foi modificado.';
        session.undo();
        return 'Executei Desfazer. Confira a prévia; alterações não salvas exigem nova aprovação.';
      case 'redo':
        if (!session.getSnapshot().canRedo) return 'Não há alteração desfeita para refazer agora. O catálogo não foi modificado.';
        session.redo();
        return 'Executei Refazer. Confira a prévia antes de publicar.';
      case 'publication':
        if (context.canPublish && context.onPublication) {
          context.onPublication();
          return 'Abri a revisão física das páginas para impressão e PDF.';
        }
        return 'Primeiro confira e salve a versão atual. O PDF não será liberado com alterações pendentes.';
      case 'editor':
        context.onEditor?.();
        return 'Abri a edição manual com as ferramentas avançadas do Catalog Builder.';
    }
  } catch {
    return 'Essa operação não pôde ser concluída com segurança. O documento anterior foi preservado. Abra o editor para verificar os detalhes.';
  }
}
