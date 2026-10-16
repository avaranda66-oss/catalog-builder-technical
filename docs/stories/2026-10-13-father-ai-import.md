# FATHER-AI-IMPORT — Criação guiada por fontes e IA

Status: Superseded (2026-10-16) — substituída pelo plano docs/plans/2026-10-15-plano-father-ready.md e pela story docs/stories/2026-10-15-father-ready-onda-1.md.
Fonte: pedido humano de 13/10/2026; entradas PDF, planilha e fotos, separadas ou combinadas; gerar catálogos complexos com IA e facilidade.

## Story
Como usuário, quero reunir PDF, CSV/XLSX e fotos, pedir a organização do catálogo em português e revisar antes de aplicar, para criar documentos com rastreabilidade sem inventar especificações.

## Acceptance criteria
1. Importação real de texto de PDF e células CSV/XLSX conserva os valores de origem e localizadores; fotos podem acompanhar o conjunto.
2. PDF sem texto informa necessidade de leitura visual/revisão, sem inventar extração. Limites de arquivos e conteúdo são visíveis.
3. Gerador IA chama somente servidor autenticado, com credenciais fora do bundle, teto de consumo configurado e resposta validada contra fontes.
4. Prévia exibe exatamente o conteúdo a inserir e referências; aplicação é transacional e desfazível, sem sobrescrever o documento.
5. Falta de serviço, credencial ou orçamento é informada claramente; esboço sem IA é opção explícita, nunca simulação de IA.
6. Módulos são testáveis via CLI; testes cobrem números, fontes inválidas, entrada malformada e aplicação/undo.

## Tasks
- [ ] Implementar importadores e contratos de fontes.
- [ ] Implementar planejamento determinístico explicitamente sem IA e validação de propostas.
- [ ] Implementar gateway autenticado com orçamento e integração de prévia.
- [ ] Implementar painel acessível, aplicação e undo.
- [ ] Executar testes direcionados e gates completos; registrar limites de deploy/configuração.

## Dev notes
Escopo `src/vnext/assistance`, `tests/vnext/assistance`, nova Edge Function. Root integra EditorWorkspace e dependências. Nunca fazer chamadas pagas sem configuração/teto. Reutilizar PDF.js seguro existente e persistência de assets. Plano de IA pode selecionar/ordenar dados literais, não reescrever números técnicos.

## CodeRabbit integration
Revisão focada em injeção via fontes, autenticação, vazamento de credencial, limites de consumo e preservação de valores. Revisores: @dev, @qa; gateway @devops.

## File list
- docs/stories/2026-10-13-father-ai-import.md

## Validation
Pendente de implementação e gates; sem chamada paga ou deploy autorizado nesta etapa.
