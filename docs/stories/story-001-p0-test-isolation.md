# STORY-001-P0: Isolamento Completo de Testes & Mocking do Supabase

- **Épico:** `EPIC-001`
- **Status:** Concluída e Validada por QA (@qa Quinn)
- **Data de Conclusão:** 2026-09-01
- **Prioridade:** P0 (Bloqueante)
- **Gate de Qualidade:** Gate G6 (Testes Seguros & Zero Writes em Produção) — APROVADO
- **Responsável:** @dev (Dex)
- **Revisor:** @qa (Quinn)

---

## 1. Descrição e Racional

Atualmente, o arquivo `tests/services/supabase.service.test.ts` e outros testes executavam chamadas reais ao Supabase de produção quando as variáveis de ambiente `VITE_SUPABASE_URL` estavam presentes. Isso gerou incidentes de alteração indevida de dados reais durante a execução de testes.

Esta história estabelece uma blindagem total no ambiente de testes:
1. Toda a suíte de testes (Vitest) executará com **mocking estrito do cliente Supabase**.
2. É criada uma barreira de segurança global no `tests/setup.ts` que intercepta e bloqueia qualquer tentativa de chamada de rede real para o Supabase durante testes unitários.
3. `tests/services/supabase.service.test.ts` é refatorado para validar o comportamento do serviço exclusivamente através de mocks e fixtures locais, garantindo zero chamadas e zero writes para qualquer ambiente externo.

---

## 2. Critérios de Aceite (Given / When / Then)

### Cenário 1: Execução de Testes com Chaves de Ambiente Presentes
- **Given** que o desenvolvedor ou pipeline de CI executa `npm test`
- **When** o Vitest inicializa com o `tests/setup.ts`
- **Then** o cliente Supabase é substituído automaticamente por um mock em memória que responde previsivelmente a operações de consulta e simula mutações sem tocar a rede.

### Cenário 2: Tentativa de Chamada de Rede Não Autorizada em Teste
- **Given** um teste que tenta executar um `fetch` ou conexão de rede real com a URL do Supabase
- **When** a requisição é disparada durante a suíte de testes
- **Then** o ambiente de testes aborta imediatamente com um erro explícito: `"Live network call prohibited in unit test suite"`.

### Cenário 3: Validação de Serviços e Stores
- **Given** os testes de `supabase.service`, `useLibraryStore`, `useCatalogStore` e schemas
- **When** a suíte completa de testes roda localmente
- **Then** todos os testes passam com 100% de isolamento, em menos de 10 segundos, sem gerar registros ou arquivos no Supabase remoto.

---

## 3. Checklist de Implementação

- [x] Criar/atualizar `tests/setup.ts` com o mock global do `@supabase/supabase-js` e guardrail de rede.
- [x] Configurar `vitest.config.ts` para carregar `tests/setup.ts` antes de cada arquivo de teste.
- [x] Refatorar `tests/services/supabase.service.test.ts` para testar cenários de sucesso, erro e fallback usando mocks controlados sem chamadas reais.
- [x] Criar fixture estática de teste em `tests/fixtures/mockData.ts` para produtos e catálogos.
- [x] Executar a suíte de testes localmente e comprovar isolamento (38 testes aprovados em 11 arquivos).
- [x] Atualizar File List e checklist da story antes de submeter ao QA.

---

## 4. Evidência de QA (@qa Quinn)

- **Comando**: `npm test`
- **Resultado**: 11/11 arquivos de teste aprovados (38/38 testes)
- **Tempo de execução dos testes**: 120ms
- **Validação de Isolamento de Rede**: Teste dedicado `bloqueia e impede chamadas de rede externas de produção durante testes` passou com rejeição explícita de fetch para `supabase.co`.
- **Status do Gate G6**: ✅ APROVADO — Zero chamadas a ambientes remotos de produção.

---

## 5. File List

- `tests/setup.ts`
- `tests/fixtures/mockData.ts`
- `tests/services/supabase.service.test.ts`
- `vitest.config.ts`
