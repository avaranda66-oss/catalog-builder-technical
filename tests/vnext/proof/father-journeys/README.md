# Provas father-journeys

Jornadas do Catalog Builder no Chromium headless: cliques pela interface, capturas, textos, verificações do documento e erros do navegador. O harness monta componentes reais com persistência local e provedores controlados. Não usa serviços externos, Supabase, login ou chave de IA.

## Executar

Na raiz deste worktree, em PowerShell:

```powershell
# Todas, inclusive J-IA1, em série: um Chromium por vez.
node tests/vnext/proof/father-journeys/run-all.mjs

# Seleção por prefixo. J2/J3 compartilham j02.
node tests/vnext/proof/father-journeys/run-all.mjs j00 j02 jia1

# Uma jornada.
node tests/vnext/proof/father-journeys/j09-idiomas.mjs

# J2-lite (Onda 3 · 3B): tabela de especificações a partir do folder e do manual TA, no chat.
# A resposta da IA é controlada (window.__FATHER_DRAFT__, fatos reais de fixtures/spec-table-facts.mjs);
# sem ela o harness responde como hoje em produção: a leitura de PDFs ainda não está implantada.
node tests/vnext/proof/father-journeys/j02l-tabela-do-pdf.mjs

# J14 (Onda 4): páginas a partir de fotos de um rascunho em papel, no chat. A resposta da IA é a gravada pela fatia R
# com o Gemini real (docs/ai-catalog/rascunho-servidor/rodada-1/raw), servida pelo harness em window.__FATHER_DRAFT__.sketches.
node tests/vnext/proof/father-journeys/j14-rascunho.mjs

# Janela menor; remover a variável para voltar ao padrão.
$env:VP='1280'
node tests/vnext/proof/father-journeys/run-all.mjs
Remove-Item Env:VP

# J12 usa arquivo empresarial externo; é possível indicar outro caminho local.
$env:PCON_XLSX='C:/caminho/PCON-MASTER-ENGLISHV2.xlsx'
node tests/vnext/proof/father-journeys/run-all.mjs j12
Remove-Item Env:PCON_XLSX

# FR-37, medida separada e descritiva: 69 linhas × 7 colunas sem dividir.
# Usa o mesmo servidor próprio e escreve results/measure-fr37.json (ou @1280).
node tests/vnext/proof/father-journeys/measure-fr37.mjs
```

O padrão é 1366×768; VP=1280 usa 1280×720. A suíte sai com código 1 quando existe fail. Uma dependência pending não torna a jornada verde nem causa, sozinha, código 1. A saída não zero do processo sempre é fail no agregado.

Execute em série, com os arquivos estabilizados e espaço livre suficiente. Não editar o aplicativo durante as provas: HMR pode invalidar o estado observado. O arquivo real de J12 não acompanha o repositório; sua ausência é falha de execução, nunca uma importação concluída.

## Servidor e identidade

Cada comando inicia um Vite próprio na raiz resolvida deste worktree. Tenta 127.0.0.1:5190; se a porta estiver ocupada, escolhe a próxima livre. Não reutiliza nem encerra o servidor que já ocupava a porta. O servidor próprio fecha ao terminar; o caminho real de node_modules é permitido para suportar a junção do Windows.

O runner compartilha seu servidor com seus processos filhos por BASE_URL, identificador da execução e identificador do servidor. Antes de usar BASE_URL, a biblioteca consulta /__father-journeys/identity.json e confere o serviço, caminho absoluto do worktree, HEAD e, quando recebido do runner, identificador do servidor. Um Vite antigo sem essa identidade ou de outro checkout é recusado. Não apontar BASE_URL para um servidor de aplicação comum; remover a variável permite iniciar o servidor correto.

## Resultados e rastreabilidade

Cada comando recebe um runId único. As saídas ficam em scratch/father-journeys/runs/<runId>/, ignorado pelo Git:

| Caminho dentro da execução | Conteúdo |
|---|---|
| results/<jornada>.json | Passos, estado, pendências, achados, console e metadados. |
| results/<jornada>@1280.json | Resultado na janela menor. |
| shots/ | Capturas desta execução. |
| pdf/, photos/ | Artefatos produzidos pelas jornadas que os utilizam. |
| summary.json / summary@1280.json | Agregado do runner. |

O último resumo também é copiado para scratch/father-journeys/summary.json ou summary@1280.json, sem apagar execuções anteriores. Os caminhos de evidência no JSON são relativos à raiz do repositório e incluem a execução correspondente.

Cada resultado registra run.id, run.executionId, raiz absoluta, Git HEAD/branch/dirty, versões Node/Chromium e identidade do servidor. O runner só aceita JSON com a identidade exata do processo que acabou de executar; arquivo antigo ou de outro processo é falha. git.dirty=true significa que o HEAD sozinho não reproduz os arquivos locais: preserve também o diff/commit e os dados externos usados.

`measure-fr37.mjs` fica fora da descoberta de jornadas. Ele cola dados sintéticos de um cabeçalho e 68 sensores, sem dividir a tabela, faz cinco edições inline pela UI e verifica conteúdo, cinco Desfazer e cinco Refazer. Registra cada amostra de Enter até documento/DOM confirmado e duas passagens de `requestAnimationFrame` (aproximação de pintura), mediana, máximo e long tasks quando a API existe. Não inclui abertura da célula, digitação ou autosave no tempo de confirmação, não usa a planilha PCON real e não define limite de desempenho. É medida de desenvolvimento Vite/React StrictMode; não representa hardware do pai nem build de produção.

findingSummary normaliza findings, findingSteps, softFindings e achados anexados aos passos, deduplicando por ID ou nome. O agregado separa failedSteps funcionais, findingDetails e pendingSteps. Contar apenas o array histórico findings perde achados.

## Estados e novas jornadas

| Estado | Regra |
|---|---|
| fail | Falha funcional, achado P0/P1, processo não zero ou ausência de resultado válido desta execução. |
| pending | Existe dependência declarada e nenhuma falha que tenha prioridade. |
| pass | Critérios executados e sem falha ou dependência. Pode conter achados P2/P3, preservados no resultado. |

Uma dependência não pode esconder um passo funcional vermelho. Nunca declarar executado o que não rodou. Recursos já integrados devem ter verificações obrigatórias; reserve pending para dependências reais ainda ausentes.

Crie jNN-nome.mjs ou jiaNN-nome.mjs; o runner descobre ambos. Use journey, shot, state, waitSaved e createCatalog de lib.mjs, além de pendingStep, findingStep e finishJourneyGraded de fixtures/father-eyes.mjs. Prefira seletores por papel/nome, capture cada etapa importante e feche navegador e servidor em finally. waitSaved apenas observa: ao expirar, registra diagnóstico de salvamento e edições abertas, sem forçar aprovação.

## Harness e limites

fixtures/father-harness.tsx acompanha a montagem de src/vnext/app/bootstrap.tsx. Mudanças na montagem de produção exigem conferir essa réplica. Biblioteca, editor e revisão são reais; armazenamento e respostas externas são controlados.

- ?db= isola a recuperação IndexedDB; freshDb() cria um nome novo.
- ?user=A e ?user=B em abas do mesmo contexto compartilham localStorage, para conflito de dois funcionários.
- ?ia=limite e ?ia=off exercitam indisponibilidade controlada; propostas locais não demonstram qualidade ou disponibilidade do provedor real.
- window.__FATHER__ oferece state, holdSaves, releaseHeld, flushRecovery, recoveryRecords, open, library e dispose para inspecionar o resultado sem substituir os cliques.
- Supabase real, permissões, autenticação, sessão expirada e queda real de rede precisam de verificação além do harness. holdSaves simula apenas atraso.
- page.pdf verifica impressão automatizada; a janela nativa Salvar como PDF no PC do pai e a sessão observada continuam verificações humanas.

O navegador aceita o diálogo de saída com alterações não salvas e o registra no log. A evidência histórica da Equipe B está em docs/qa/2026-10-17-usabilidade-pai.md; só resultados com nova identidade comprovam a integração atual.
