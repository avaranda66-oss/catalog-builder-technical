import React from 'react';
import ReactDOM from 'react-dom/client';
import { getSupabase } from '../services/supabase.service';
import { AiCatalogPrototypeApp } from '../vnext/ai-catalog/PrototypeApp';
import { catalogGatewayFromFunctionsClient } from '../vnext/ai-catalog/gemini-client';

const root = document.getElementById('root');
if (!root) throw new Error('Missing prototype root');
// Composition root only: VNext itself has no Legacy Supabase dependency.
const client = import.meta.env.VITE_VNEXT_CATALOG_AGENT_ENABLED === 'true' ? getSupabase() : null;
// Server-owned credentials are deliberately opt-in. By default this page
// requires the actual operator to unlock their own encrypted BYOK vault.
const gateway = client && import.meta.env.VITE_VNEXT_CATALOG_AGENT_SERVER_KEY_MODE === 'true'
  ? catalogGatewayFromFunctionsClient(client) : undefined;
ReactDOM.createRoot(root).render(<React.StrictMode><AiCatalogPrototypeApp gateway={gateway} client={client ?? undefined} /></React.StrictMode>);
