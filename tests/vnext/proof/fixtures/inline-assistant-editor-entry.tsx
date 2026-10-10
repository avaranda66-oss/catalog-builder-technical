import React from 'react';
import { createRoot } from 'react-dom/client';
import { createDocumentSession } from '../../../../src/vnext/application';
import { EditorWorkspace } from '../../../../src/vnext/app/EditorWorkspace';
import { compileCatalog } from '../../../../src/vnext/ai-catalog/composition';
import { createSyntheticSpecifications } from '../../../../src/vnext/ai-catalog/fixture';
import '../../../../src/vnext/app/styles.css';

declare global {
  interface Window {
    __INLINE_ASSISTANT_PROOF__?: { snapshot: () => { pages: number; revision: number; tables: number } };
  }
}
const element = document.getElementById('root');
if (!element) throw new Error('NO_ROOT');
const input = await createSyntheticSpecifications();
const generated = await compileCatalog(input);
const session = createDocumentSession(generated.document, { createId: () => crypto.randomUUID() });
window.__INLINE_ASSISTANT_PROOF__ = {
  snapshot: () => ({
    pages: session.getSnapshot().document.pages.length,
    revision: session.getSnapshot().localSequence,
    tables: session.getSnapshot().document.pages.flatMap(page => page.objects)
      .filter(obj => obj.type === 'table').length,
  }),
};
createRoot(element).render(<React.StrictMode><EditorWorkspace session={session} simpleByDefault /></React.StrictMode>);
