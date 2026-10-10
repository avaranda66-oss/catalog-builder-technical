import React from 'react';
import { createRoot } from 'react-dom/client';
import { createDocumentSession } from '../../../../src/vnext/application';
import { EditorWorkspace } from '../../../../src/vnext/app/EditorWorkspace';
import type { NativeComposeFunctionsClient } from '../../../../src/vnext/ai-catalog/native-compose-client';
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
const client = { functions: { invoke: async (name, { body }) => {
  if (name !== 'vnext-catalog-composer' || body.task !== 'compose_scaffold' ||
      body.credential?.provider !== 'gemini' || !body.credential.apiKey) {
    return { data: null, error: { message: 'TEST_REJECTED' } };
  }
  return { data: { reply: {
    version: 1, status: 'proposal', summary: 'Plano editorial com uma capa e uma tabela nativa para revisão.',
    pages: [
      { type: 'cover', heading: 'Nova capa PRESYS', subtitle: 'Catálogo profissional em elaboração' },
      { type: 'comparison', heading: 'Matriz de especificações técnicas',
        table: { columns: ['Parâmetro','TA-25N','TA-35N','TA-50N'],
          rowLabels: ['Faixa','Exatidão','Dimensões'] } },
    ],
  } }, error: null };
} } } as NativeComposeFunctionsClient;
createRoot(element).render(<React.StrictMode><EditorWorkspace session={session} simpleByDefault composerClient={client} /></React.StrictMode>);
