# Validação Formal de Produto — PRD & ADR-001

- **Papel:** @po (Morgan — Product Owner)
- **Data:** 2026-09-01
- **Documentos Auditados:**
  - `docs/prd-release-recovery.md`
  - `docs/adr-001-brownfield-architecture.md`
  - `docs/brownfield-architecture.md`
- **Veredito:** **APROVADO COM DIRETRIZES DE EXECUÇÃO**

---

## 1. Parecer do Product Owner

O PRD e a ADR-001 refletem com fidelidade os objetivos do negócio e a realidade fática do codebase:
1. **Público e Usabilidade**: A interface é projetada para o pai (Administrador), com densidade técnica, linhas finas de 1px e usabilidade estilo planilha Google Sheets, sem decorações supérfluas.
2. **Fonte da Verdade**: A Biblioteca é a fonte oficial exclusiva; apenas o Administrador possui autoridade para alterar especificações oficiais. Colaboradores trabalham em rascunhos com `localOverrides` explícitos.
3. **Segurança e Confiabilidade**: Bloqueio total de mutações anônimas diretas, isolamento de testes (zero writes em produção), remoção do segredo de IA do bundle e persistência transacional com CAS.
4. **Qualidade Gráfica de PDF**: Primazia da exportação vetorial nativa A4 (`@media print` 210x297mm) com supressão de botões/ferramentas e renderizador direto Ultra-HD Lossless PNG (350+ DPI).

---

## 2. Parâmetros de Produto Confirmados para a Fase de Stories

Com base na matriz conservadora da ADR-001:
- **Visibilidade de Rascunhos**: Colaboradores podem visualizar rascunhos de colegas em modo de leitura; a edição é restrita ao autor do rascunho ou ao Administrador.
- **Exportação por Colaborador**: Permitida com marca d'água automática `"RASCUNHO - USO INTERNO"`.
- **Fila de Upload**: Colaboradores podem fazer upload de imagens ficando com status `is_verified: false` até revisão do Administrador.
- **Dados Demo**: Produtos e fotos de demonstração existentes permanecem com tag `"DEMO / EXEMPLO"` e são bloqueados de publicações oficiais até confirmação do pai.

---

## 3. Autorização para Quebra em Stories

Fica autorizada a equipe de engenharia (@sm / @dev) a decompor os requisitos nas histórias P0 e P1, com implementação estrita de **uma story por vez**, acompanhada de validação de QA com testes locais e mocados.
