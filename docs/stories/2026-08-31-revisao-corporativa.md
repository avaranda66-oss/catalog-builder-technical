**Story — revisão corporativa do Catalog Builder**

Status: revisão concluída; implementação fora do escopo desta story.
Data: 31/08/2026.
Origem: solicitação do usuário para revisar o código e sugerir melhorias para uma plataforma de equipe que constrói PDFs institucionais e técnicos de produtos de engenharia elétrica.

**Escopo**

Inspecionar o projeto existente, identificar defeitos com evidências, executar os gates disponíveis e propor evolução priorizada. Não alterar funcionalidades, banco, dependências nem produção.

**Checklist**

- [x] Mapear arquitetura, documentação e funcionalidades existentes.
- [x] Revisar dados, identidade, autorização e auditoria.
- [x] Revisar edição, templates, tabelas, imagens e impressão.
- [x] Revisar IA, importação e tradução.
- [x] Reproduzir isoladamente defeitos relevantes sem APIs externas.
- [x] Executar `npm run lint`: reprovado, 98 erros e 85 avisos registrados.
- [x] Tentar `npm run typecheck`: script ausente; checagem direta com TypeScript passou.
- [x] Tentar `npm test`: script ausente; não há suíte configurada.
- [x] Executar build de produção: aprovado após liberação de subprocessos.
- [x] Separar defeitos confirmados, inferências estáticas e propostas de evolução.
- [x] Atualizar lista de arquivos e registrar limitações.

**File list**

- `docs/reviews/2026-08-31-revisao-corporativa.md`: relatório técnico e roadmap proposto.
- `docs/stories/2026-08-31-revisao-corporativa.md`: escopo, checklist e file list desta revisão.

Os gates ausentes/reprovados continuam pendentes para uma futura story de implementação; não foram marcados como aprovados.

