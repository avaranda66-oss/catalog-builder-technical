# Editor /v2 — UX do assistente no mesmo catálogo

Data: 2026-10-10. Projeto PRESYS Catalog Builder VNext. Esta é uma **melhoria parcial**, não prova de IA autônoma ou liberação de produção.

## Problema
No editor /v2 não havia acesso visível ao assistente; era necessário sair do fluxo para o protótipo `/ai-catalog-prototype.html`, que tinha intake e múltiplas etapas e utilizava dados de demonstração.

## Mudança proposta na branch isolada
1. Em `EditorWorkspace`, botão persistente «Assistente IA» na barra superior durante o modo simples (utilizado na composição /v2). Um clique abre o dock à direita e mantém A4 à vista; o botão ou o cabeçalho fecha.
2. Painel com conversa e três sugestões prontas. O usuário pode enviar com Enter ou usar o botão; Shift+Enter inclui quebra de linha.
3. Comandos limitados ligados à mesma `DocumentSession` já editada: compactar tabelas, desfazer, refazer, abrir editor ou revisão de publicação quando disponível. As operações reversíveis mantêm a prévia em sincronia com o documento. A barreira de contexto do editor impede executar mutações durante edição pendente.
4. Persistência **síncrona** do histórico antes de desmontar o chat, corrigindo perda de mensagem ao fechar painel. Histórico localStorage separado por auth authority scope e documentId; limite 500 mensagens sem truncamento. O histórico permanece local e em texto claro no navegador: não é nuvem, não é criptografado e não deve ser usado como segredo.
5. Tela simples não mostra anexo de foto não processado pela IA, evitando prometer imagem editada. O protótipo antigo conserva seu upload visual.
6. Desktop com quatro colunas responsivas e painel de 370px. Janelas inferiores a 1420px exibem drawer de até 400px com fechamento claro.

## Provas
- `tests/vnext/app/inline-assistant-ux.test.tsx`: botão acessível, painel lado a lado, prévia A4 mantida, mutação e undo/redo na sessão real, recusa de edições de engenharia sem contrato, histórico após fechar/reabrir e modo avançado preservado.
- `tests/vnext/ai-catalog/workbench-dialogue.test.ts`: isolamento entre contas no mesmo dispositivo e histórico de até 500 mensagens.
- `tests/vnext/proof/inline-assistant-browser-proof.mjs`: Chromium local 1700×920 e 1180×800, screenshots e recibo, Enter, mutação na sessão, reabertura, zero tráfego externo. CI salva artefatos por HEAD exato.
- Exige ainda full CI, Vercel Preview e QA com operador autenticado no /v2.

## Limites honestos
- **Não é conversa Gemini real**. O módulo atual responde apenas a comandos determinísticos (aplicação de alterações reversíveis). Arquivos PDF reais e fotos não são interpretados por ele. Não faz perguntas complexas nem produz capas.
- Comando não suportado não modifica o documento. Nunca anunciar edição livre por IA.
- A edição no editor precisa ser salva pelo operador. Atualizar visualmente a página não equivale a persistir no servidor.
- Sem pilotos humanos com Marc e sem comprovação de acessibilidade por pessoa leiga. Prioridade posterior: acoplar Gemini com ferramentas tipadas à sessão autorizada, persistência versionada e ações com diff/review.
