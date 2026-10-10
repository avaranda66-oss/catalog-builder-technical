import React from 'react';
import ReactDOM from 'react-dom/client';
import { AiCatalogPrototypeApp } from './PrototypeApp';
const root = document.getElementById('root');
if (!root) throw new Error('Missing prototype root');
ReactDOM.createRoot(root).render(<React.StrictMode><AiCatalogPrototypeApp /></React.StrictMode>);
