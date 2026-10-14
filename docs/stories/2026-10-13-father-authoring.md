# FATHER-AUTHORING — Editar e exportar com clareza

Status: Ready for Dev
Fonte: pedido humano de 13/10/2026 para edição tranquila de PDFs técnicos complexos, incluindo referências como Additel.

## Story
Como usuário, quero editar textos e tabelas e exportar um PDF fiel com instruções simples, para concluir catálogos sem suporte técnico.

## Acceptance criteria
1. Tabelas têm edição real de conteúdo com desfazer/refazer e validação estrutural.
2. Exportação no VNext preserva o A4 e o conteúdo; fontes, imagens, cortes e transbordamentos são verificados e falhas explicadas.
3. Ações principais são legíveis e acessíveis por teclado, com foco e feedback claros.
4. Painel de criação por fontes integra-se ao editor sem somar funcionalidades de laboratórios como se estivessem disponíveis.

## Tasks
- [ ] Implementar edição de tabelas e histórico.
- [ ] Conectar exportação e preflight ao editor.
- [ ] Integrar painel guiado e melhorar feedback/acessibilidade.
- [ ] Verificar no navegador e executar gates completos.

## Dev notes
Usar os contratos de `src/vnext/application`, renderização e diagnósticos existentes. Preservar design baseline. Testar mecanismos em CLI antes da experiência UI.

## CodeRabbit integration
Revisão focada em perda/alteração de conteúdo, atomicidade, layout físico e acessibilidade. Revisores: @dev e @qa.

## File list
- docs/stories/2026-10-13-father-authoring.md

## Validation
Pendente de implementação e gates.
