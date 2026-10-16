# FATHER-PERSISTENCE — Salvamento e imagens confiáveis

Status: Superseded (2026-10-16) — substituída pelo plano docs/plans/2026-10-15-plano-father-ready.md e pela story docs/stories/2026-10-15-father-ready-onda-1.md.
Fonte: pedido humano de 13/10/2026 para tornar o catálogo utilizável pelo pai, sem dificuldades, com PDF, planilhas e fotos combinados.

## Story
Como usuário, quero trabalhar com salvamento automático, fotos reais e recuperação clara, para não perder meu catálogo nem sobrescrever outra versão sem perceber.

## Acceptance criteria
1. Alterações confirmadas no documento acionam salvamento automático com estado visível e tentativas limitadas; rascunho local e edição em andamento são preservados.
2. Imagens enviadas pelo usuário substituem fixtures e continuam disponíveis ao reabrir; falhas têm mensagem e ação de recuperação.
3. Conflitos de versão não sobrescrevem dados silenciosamente; usuário pode preservar sua cópia.
4. Fluxos usam contratos de persistência existentes, sessão autenticada e isolamento de usuário.

## Tasks
- [ ] Implementar autosave e estados de salvamento/recuperação.
- [ ] Integrar upload, persistência e resolução de assets reais.
- [ ] Tratar conflitos e testar reabertura/falhas.
- [ ] Executar lint, typecheck, testes e build.

## Dev notes
Usar `src/vnext/persistence`, `src/vnext/recovery` e `src/vnext/app`; preservar baseline visual. Serviços devem ser testáveis sem UI. Não publicar/deployar sem autorização.

## CodeRabbit integration
Revisão focada em perda de dados, isolamento de identidade, concorrência e URLs de assets. Revisores: @dev, @qa; infraestrutura @devops.

## File list
- docs/stories/2026-10-13-father-persistence.md

## Validation
Pendente de implementação e gates.
