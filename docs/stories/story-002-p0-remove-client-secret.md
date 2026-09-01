# STORY-002-P0: Remoção Segura da Chave Gemini do Cliente & IA Determinística Local

- **Épico:** `EPIC-001`
- **Status:** Concluída e Validada por QA (@qa Quinn)
- **Data de Conclusão:** 2026-09-01
- **Prioridade:** P0 (Bloqueante)
- **Gate de Qualidade:** Gate G3 (Credencial Exposta) & Gate G6 (Testes Seguros) — APROVADO
- **Responsável:** @dev (Dex)
- **Revisor:** @qa (Quinn)

---

## 1. Descrição e Racional

A chave da API Google Gemini estava hardcoded no arquivo `src/services/ai.service.ts:22-23`, sendo compilada no bundle público da SPA Vite. Isso constitui uma vulnerabilidade crítica de vazamento de credenciais e viola o princípio de Model Governance da Constituição AIOX e o Gate G3 do PRD.

Nesta história:
1. A chave hardcoded é totalmente removida do código-fonte.
2. As chamadas externas diretas do navegador para a Google API são desabilitadas no cliente, retornando resposta controlada e segura.
3. As funcionalidades factuais locais em memória (`generateComplianceReport`, `searchFactualData`, `askAssistant` determinístico) são preservadas e blindadas.
4. A integração externa com IA é isolada para a Fase P2 através de Supabase Edge Function autenticada no servidor.

---

## 2. Critérios de Aceite (Given / When / Then)

### Cenário 1: Ausência de Segredos no Bundle
- **Given** o código-fonte da aplicação e o bundle gerado pelo Vite
- **When** o build de produção é executado (`npm run build`)
- **Then** nenhuma chave de API do Gemini ou segredo de provedor está presente no código-fonte ou nos arquivos JavaScript gerados em `dist/`.

### Cenário 2: Assistente Factual Determinístico Local
- **Given** um catálogo com divergências de produtos em relação à Biblioteca
- **When** o usuário solicita o relatório de conformidade (`generateComplianceReport`)
- **Then** o sistema gera o relatório com precisão matemática em memória, sem disparar requisições de rede externas.

### Cenário 3: Solicitação de Tradução sem Backend Ativo
- **Given** o acionamento do botão de tradução no cliente
- **When** `translateCatalog` é invocado
- **Then** o serviço informa com clareza que a funcionalidade requer backend autenticado, sem falhar silenciosamente ou tentar chamadas diretas com credenciais embutidas.

---

## 3. Checklist de Implementação

- [x] Remover a constante `GEMINI_API_KEY` e a string hardcoded de `src/services/ai.service.ts`.
- [x] Refatorar `translateCatalog` para retornar aviso estruturado de backend pendente (P2) sem chamadas de rede externas.
- [x] Blindar os métodos factuais locais `generateComplianceReport`, `searchFactualData` e `askAssistant`.
- [x] Atualizar a suíte de testes `tests/services/ai.service.test.ts`.
- [x] Executar `npm test` e `npm run build` para garantir ausência de erros e segredos.
- [x] Atualizar File List e registrar evidências de QA.

---

## 4. Evidência de QA (@qa Quinn)

- **Grep de Segredos em `src/`**: `0 resultados encontrados`
- **Grep de Segredos em `dist/`**: `0 resultados encontrados`
- **Validação de Testes Unitários**: 4/4 testes de `ai.service.test.ts` aprovados
- **Validação de Build**: `tsc && vite build` completado em 14.73s com 0 erros de tipagem
- **Status do Gate G3**: ✅ APROVADO — Chave completamente eliminada do código e do bundle.

---

## 5. File List

- `src/services/ai.service.ts`
- `tests/services/ai.service.test.ts`
