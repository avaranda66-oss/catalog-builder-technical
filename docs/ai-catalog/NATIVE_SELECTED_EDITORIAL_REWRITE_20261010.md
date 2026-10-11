# Catalog Builder VNext — edição editorial selecionada via chat

Data: 2026-10-10 · branch `codex/agent-native-edit-20261010` · componente da evolução da PR #82.

## O que funciona
- O usuário abre o assistente dentro de `/v2`, clica num **objeto de texto editorial simples** na página A4, e pode escolher «Reescrever este texto com Gemini».
- A interface informa que o texto selecionado será enviado ao provedor apenas quando o operador enviar explicitamente esse pedido.
- O gateway `vnext-catalog-composer` recebe o contrato estrito `revise_selected_text` em vez de `compose_scaffold`. Seu backend exige autorização JWT, papel editor/admin, allowlist de origem, conta com reserva atômica do orçamento e retorna JSON validado.
- A proposta é mostrada como **Antes** / **Depois**. Apenas a confirmação do usuário executa `text.setContent` no objeto nativo selecionado. O editor oferece Undo; o fluxo verifica a revisão CAS, bloqueando respostas concorrentes e seleção alterada.
- A conversa de criação e revisão permanece no mesmo histórico local do catálogo. Uma sequência de quatro rodadas de criação incremental foi incluída nas provas de contrato; a prova Chromium também executa criação + reescrita no mesmo painel.

## Limites de segurança
- Apenas 1 parágrafo com 1 trecho de texto sem marcas, desbloqueado. Reescrita de rich text complexo, tabelas, imagens, valores, unidades, modelos ou outros textos que contenham dígitos numéricos é recusada; isso **não** significa que todo risco semântico em prosa está eliminado.
- Nenhum PDF industrial passa automaticamente a ser autoritativo por esta função; associação célula-valor continua fora do escopo.
- Gemini em produção **ainda não pode executar estas mudanças** sem implantação, feature flag, quota, BYOK válido e acceptance real do endpoint. Testes locais são com fake provider, sem cobrança de Google.
- Histórico local no navegador, não uma memória persistente em nuvem entre dispositivos. Estilos complexos e imagens não são gerados por este modo.

## Evidência e regressões
- `tests/vnext/ai-catalog/native-text-edit.test.ts`: contrato, bloqueio de números e códigos, revisão CAS, texto em múltiplos spans, desfazer e privacidade do payload.
- `tests/vnext/ai-catalog/catalog-native-selected-rewrite.test.tsx`: pedido, transporte fake, proposta visível, confirmação e bloqueio de concorrência.
- `tests/vnext/proof/inline-assistant-browser-proof.mjs`: operação completa no Chromium, screenshot antes/depois da proposta e recibo de revisões/páginas.
- `tests/vnext/ai-catalog/native-compose.test.ts`: quatro rodadas acrescentando páginas, preservando páginas anteriores.
- Prova de Edge TS de sintaxe e build local; CI e Vercel ainda precisam validar a PR no HEAD exato.

## Próxima etapa necessária
O requisito final segue mais amplo: Gemini real com ferramentas para edição de conteúdo existente, tabelas densas/mesclas, fontes PDF verificadas, imagens, capas, publicação/reabertura na Library e piloto humano não orientado de Marc. Não considerar esta PR autorização de publicação.
