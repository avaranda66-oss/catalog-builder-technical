# Usabilidade do pai — consolidação histórica da Equipe B

Data da consolidação: 17/10/2026. Este documento reúne as provas e os checkpoints já existentes da Equipe B. A auditoria documental não executou testes, build, jornadas ou navegadores e não produziu um novo parecer de aprovação.

## Base e alcance da evidência

As observações abaixo pertencem à branch `equipe-b/usabilidade`, criada de `33cd5df5d2507d2b9905a503a919d0eefeff8e6a` e encontrada em `119eead`. Elas incluem as alterações próprias da Equipe B até esse HEAD e as jornadas C/D/E ainda não commitadas naquele worktree. **Não demonstram o comportamento da integração `codex/father-ready-continuacao` nem o resultado das fatias posteriores da Onda 2.**

Origem preservada: `C:/Users/Usuario/Desktop/CONFIGURATOR PCON/wt-equipe-b/main`, com checkpoints em `../_state/5-jornadas/` e resultados brutos em `scratch/father-journeys/results/`. Os JSON A–D foram inspecionados, copiados sem alteração e tiveram igualdade SHA-256 conferida:

- [A — entrada, biblioteca e persistência](equipe-b-checkpoints/A-entrada-biblioteca-persistencia.json).
- [B — editor e tabelas](equipe-b-checkpoints/B-editor-tabelas.json).
- [C — fotos, PDF e falhas](equipe-b-checkpoints/C-fotos-pdf-falhas.json).
- [D — assistente, arquivos, conversa e conflito](equipe-b-checkpoints/D-assistente-conflito.json).

Não existia checkpoint E. Há resultados brutos de J9 e J12, descritos explicitamente como incompletos abaixo. Os checkpoints originais continuam intactos. A inspeção dos quatro JSON não encontrou credenciais; menções a chave API e senha descrevem rótulos vistos na interface.

O harness usa componentes reais, Chromium headless, viewports 1366×768 e 1280×720, persistência em `localStorage`, recuperação em IndexedDB e provedores controlados de IA/tradução. Os autores dos checkpoints registram leitura das capturas e inspeção do estado. Esses registros não substituem uma sessão observada com o pai.

## O que já foi entregue

O histórico da Equipe B contém oito commits após a base:

| Commit | Entrega |
|---|---|
| `8586cf4` | Harness, biblioteca de provas, runner e smoke. |
| `2415cd7` | FR-85/FR-87: formato numérico por idioma, glossário PRESYS, grafia e sugestões na revisão. |
| `290ce28` | FR-54: tolerância de sangria no preflight. |
| `e398379` | [Kit da sessão observada com o pai](sessao-com-o-pai.md). |
| `e25591d` | Contrato W2-A4 documenta o aviso de sangria. |
| `3bb93d1` | Correções da revisão adversarial de idiomas e do guardião de valores técnicos. |
| `08761a0` | Correções FR-54: recorte da impressão, área segura por lado, mensagens e provas. |
| `119eead` | Jornadas J1/J4/J5/J7/J11 e evidências dos grupos A/B. |

As jornadas J2–J3, J6, J8, J9, J10, J12, J13 e J-IA1, três fixtures de fotos e vinte PNGs estavam sem commit na origem. Os arquivos `_state` estão fora do repositório; esta cópia dos checkpoints torna seus achados recuperáveis no histórico da continuação.

Os checkpoints da fundação relatam testes direcionados verdes, incluindo 656 testes de idiomas/contrato e conjuntos de 132 e 680 testes de FR-54 e vizinhança. São registros históricos de conjuntos parcialmente sobrepostos: não devem ser somados como uma suíte nova nem apresentados como gates da integração. Os quatro gates completos ainda precisam de evidência própria da continuação.

## Resultado histórico por jornada

Estados abaixo vêm dos JSON existentes, não de uma nova execução. `fail` significa falha funcional ou achado P0/P1; `pending` preserva dependência declarada; achados P2/P3 permanecem vermelhos em `findingSteps` sem, sozinhos, mudar o estado. Assim, `pass` pode ter achados de usabilidade.

| Jornada | Último estado disponível | Evidência e limite principal |
|---|---|---|
| J00 — smoke | `pass`, ambas janelas | Biblioteca → criar → editor salvo → biblioteca, 12 passos. |
| J1 — entrada | `pending`, ambas | Criação e retorno funcionam; redirecionamento após login depende de ambiente autenticado. |
| J2 — arquivos | `pending`, ambas | Sem entrada visível para PDF/planilha; dependência 2E/2F, FR-64/FR-66 e 4A. |
| J3 — conversa | `pending`, ambas | Ferramentas compactam tabelas; ajuste de foto/estrutura por conversa depende de 4B. Proposta Gemini é falsa no harness. |
| J4 — editar à mão | **`fail`, ambas** | B-01/P1: primeira palavra em tabela nova gera erro de altura; edição na célula e estilos dependem de 2A/2B. |
| J5 — tabela longa | `pending`, ambas | 41×4 cola, bloqueia PDF e oferece ajuste que ultrapassa A4; continuação de tabela depende de 2I/FR-35. |
| J6 — foto do celular | `pass`, ambas | EXIF orienta a foto corretamente; HEIC recebe mensagem. Há achados C-01/C-02/C-03. |
| J7 — salvar/reabrir | `pending`, ambas | Recuperação preserva conteúdo, inclusive texto em edição; horário de salvamento e escala dependem de 2G/2C. |
| J8 — publicar PDF | `pending`, ambas | Espera salvamento, corrige marcador e gera A4 pesquisável; texto novo que não cabe depende de 2B/FR-14/FR-15. |
| J9 — idiomas | **`fail`, só 1366** | Timeout de salvamento antes de abrir o Centro de Tradução. Não há resultado 1280 nem prova concluída do fluxo. |
| J10 — dois funcionários | `pending`, ambas | Cópia e confirmação de descarte preservam as versões; modal, URL e presença dependem de 2G/4D. |
| J11 — biblioteca | `pending`, ambas | Busca, duplicação, renomeação e arquivamento funcionam; restauração direta depende de 4D/FR-04. |
| J12 — planilha da empresa | `pending`, ambas | Módulo lê arquivo real e preserva dados; escolha pela tela e paginação dependem de 2E/2I. Sem checkpoint E. |
| J13 — falhas | `pending`, ambas | Foto grande e avisos de IA exercitados; queda real de rede e sessão expirada não são simuladas pelo harness. |
| J-IA1 — assistente | `pending`, ambas | Proposta controlada é inserida e um Ctrl+Z desfaz; painel e escala dependem de 2C. Há achados de chave própria e perda de rascunho. |

Os nomes dos JSON são os dos arquivos em `tests/vnext/proof/father-journeys/`, com sufixo `@1280` para a janela menor. J2 e J3 compartilham `j02-j03-ia-arquivos-conversa.mjs`. O resumo agregado existente na origem contém apenas o smoke e não representa a execução de todas as jornadas.

## Achados deduplicados a revalidar

Cada linha mantém os IDs originais para rastreabilidade. A severidade é a maior registrada para o grupo. As propostas indicam pontos de implementação; não atestam que continuem necessários depois da Onda 2.

| IDs / severidade | Reprodução e comportamento observado | Encaminhamento / evidência |
|---|---|---|
| **B-01 / P1** | Inserir tabela nova e digitar a primeira palavra numa célula: surge “Bloqueia publicação · Conteúdo excede a altura da tabela”. Reproduzido nas duas janelas. O clique em Publicar nesse estado específico foi inferido pelo diagnóstico, não executado na J4. | Revalidar crescimento de linha e altura inicial em `EditorWorkspace.tsx`/`editor-defaults.ts` após 2A. [Captura](evidence/2026-10-17-usabilidade-pai/j04-editar-a-mao-1366-03-celula-erro-bloqueia-publicacao.png). |
| A-04 / P2 | Biblioteca → Mais → Arquivar → confirmar: a linha some sem confirmação posterior nem Desfazer. | Integrar aviso em `CatalogLibrary.tsx`; restauração depende de 4D/FR-04. [Captura](evidence/2026-10-17-usabilidade-pai/j11-biblioteca-1366-05-arquivados.png). |
| B-02 + C-03 / P2 | Colar tabela ou enviar HEIC: instruções de 21 palavras/como converter somem após cerca de quatro segundos. HEIC está classificado como informação e desaparece sozinho. | Revisar política em `editor-notices.ts` e tom do aviso de imagem. [HEIC](evidence/2026-10-17-usabilidade-pai/j06-foto-celular-1366-03-heic-mensagem.png). O tempo necessário de leitura é uma estimativa; os quatro segundos foram medidos. |
| D-03 / P2 | Assistente → escrever pedido → Esc dentro do textarea → reabrir: o pedido desapareceu. | Guardar rascunho ou tratar Escape em campo com conteúdo; conferir `EditorWorkspace.tsx`/`CatalogNativeComposer.tsx`. Prova e passos no checkpoint D e em `jia1-assistente`. |
| D-06 + D-01 + C-08 / P2 | `?ia=limite`: Avançado oferece chave API e senha sem `byok:true`. Na abertura normal o botão também aparece durante a consulta e some ao chegar “IA pronta”. | Rever `ownKeyOffered` em `CatalogNativeComposer.tsx`. D-01 registrou presença de 1–2 ms no DOM; pintura visível em produção é hipótese. [Limite](evidence/2026-10-17-usabilidade-pai/jia1-assistente-1366-05-limite-diario.png). |
| D-04 + C-06 / P2 | `?ia=off`: a mensagem manda usar Avançado, mas o servidor informa `byok:false` e o botão está ausente. | Mensagem em `composer-messages.ts` deve acompanhar a capacidade disponível. [Captura](evidence/2026-10-17-usabilidade-pai/jia1-assistente-1280-06-sem-ia.png). |
| B-04 / P3 | Colar tabela longa: aviso verde cobre por quatro segundos o contador de problemas, enquanto a tabela mostra erro. | Posicionar aviso sem ocultar contador e comunicar que a tabela não cabe; revisar junto de 2I/FR-35. [Captura](evidence/2026-10-17-usabilidade-pai/j05-tabela-longa-1366-01-colada-40-linhas.png). |
| C-01 / P3 | Inserir retrato de celular: quadro inicial quadrado de 58×58 mm deixa cerca de 33% sem foto e seleção maior que o conteúdo. | Considerar proporção intrínseca na inserção, preservando o enquadramento escolhido. [Captura](evidence/2026-10-17-usabilidade-pai/j06-foto-celular-1366-01-foto-inserida.png). |
| C-02 / P3 | HEIC: instrução cita “Mais compatível” sem explicar onde fica no iPhone. | Indicar Ajustes › Câmera › Formatos e alternativa de pedir JPEG; validar linguagem em sessão humana. [Captura](evidence/2026-10-17-usabilidade-pai/j06-foto-celular-1366-03-heic-mensagem.png). |
| C-04 / P3 | Publicação bloqueada manda clicar em Verificar novamente; Corrigir este item fecha a revisão, e depois de corrigir só existe Publicar / PDF. | Alinhar instrução ao retorno efetivo em `PublicationReview.tsx`. [Captura](evidence/2026-10-17-usabilidade-pai/j08-publicar-pdf-1366-03-bloqueado.png). |
| C-05 / P3 | Abrir assistente com orçamento esgotado: Enviar continua ativo; a pessoa escreve e recebe novamente o limite já conhecido. O pedido é preservado como não enviado. | Rever disponibilidade/explicação do envio no estado bloqueado. [Captura](evidence/2026-10-17-usabilidade-pai/j13-falhas-1366-03-ia-limite-diario.png). |
| D-07 / P3 | Proposta chega e histórico rola ao fim: título e Página 1 ficam acima da área visível; em 1280 aparece só a última página e os botões. | Rolar até o começo da proposta em `CatalogNativeComposer.tsx`; revalidar após 2C. [Captura](evidence/2026-10-17-usabilidade-pai/jia1-assistente-1366-02-proposta.png). O passo B7 foi acrescentado depois da execução e ainda precisava rodar. |
| D-05 / P3 | Conflito informa “salvo em outro lugar”, sem esclarecer que outra pessoa salvou. | Rever texto junto do modal 2G/FR-43; identificação de autor depende de 4D/FR-05. [Captura](evidence/2026-10-17-usabilidade-pai/j10-dois-funcionarios-1366-01-aviso-de-conflito.png). |
| D-08 / P3 | Abrir versão mais recente → confirmação: o primário azul é Sim, descartar; Não, voltar fica secundário. | Revalidar foco e hierarquia da confirmação após 2G/FR-43. [Captura](evidence/2026-10-17-usabilidade-pai/j10-dois-funcionarios-1280-03-confirmar-descartar.png). O passo 18b foi acrescentado depois da execução e ainda precisava rodar. |

As referências cruzadas de C-06/C-07 no checkpoint C usam números antigos do grupo D. A deduplicação acima usa o conteúdo: C-06 corresponde a D-04; C-08 corresponde ao caso D-06. C-07 trata de tipografia, não do problema de chave própria identificado por D-06. D-02 foi reservado para uma hipótese de Ctrl+Z que não se reproduziu e não deve virar achado.

## Dependências conhecidas do plano

| FR / fatia | Observação histórica e relação com os achados |
|---|---|
| FR-22, FR-30/FR-34 / 2A | Abrir célula já deixa sujo; painel de conteúdo fora da janela; digitação não entra diretamente na célula. Revalidar B-01 no novo caminho. |
| FR-14/FR-15 / 2B | Sem controles Título/Subtítulo/Corpo/Nota; texto inicial grande pode bloquear publicação. J8 separa esse limite do fluxo de salvamento/PDF que passou. |
| FR-16b/FR-17 / 2C | A-01/A-03/C-07: textos de 10–12 px na biblioteca/assistente; alças de 12 px; assistente fixo cobre Propriedades e parte da página. B-03: zoom ajustado a 90% em 1280 reduz célula para 12,1 px. |
| FR-64/FR-66 / 2E/2F | J2/J12: intake não alcançável pela tela; fluxo antigo de PDF exige manifesto JSON; escolha de colunas não disponível. |
| FR-43/FR-44/FR-45 / 2G | Conflito ainda em faixa; cópia mantém URL do original e F5 reabre original; falta Salvo às HH:MM; retentativa, modo offline e sessão expirada precisam ambiente apropriado. |
| FR-35 / 2I | J5/J12: falta continuar tabela em outra página com cabeçalho repetido. Ajustar altura pode apenas trocar o erro por objeto fora da página. |
| FR-04/FR-05 / 4D | Restaurar arquivado, autoria/presença e biblioteca em cartões. A-02: `<select>` de ordenação mede 19 px embora a moldura tenha 42 px; clicar na borda não abre. |
| FR-60 / assistente | Oferta de chave própria e mensagens precisam acompanhar `byok`; ver D-06/D-04 acima. |
| 4A/4B | Pendências de fontes e ajustes por conversa não são provados pelas propostas controladas do harness. |

A revisão FR-54 também deixou proposta específica: recortar a sangria na **prévia de publicação em tela**, mantendo a área externa visível no editor. O recorte em impressão foi implementado e tem prova própria; a proposta da prévia está em `_state/PROPOSTAS.md` (P-05). O prompt do provedor real de tradução ainda não recebe o glossário do cliente (P-01). Nenhuma dessas propostas foi executada nesta consolidação.

## Grupo E: evidência parcial e falha aberta

`j09-idiomas.json`, único resultado de J9, registra `fail`: `waitSaved(page, 20000)` expira em `j09-idiomas.mjs:146`, depois de montar seis textos e antes de abrir o Centro de Tradução. A captura `scratch/father-journeys/shots/j09-99-erro.png` mostra “Alterações não salvas”; console e pageerror estão vazios. A causa ainda não foi estabelecida. Isso não comprova falha do tradutor nem valida o fluxo completo. Não existe resultado de J9 em 1280.

J12 tem dois JSON `pending` e nenhuma falha funcional registrada. O arquivo real padrão é `C:/Users/Usuario/Desktop/CONFIGURATOR PCON/PCON-MASTER-ENGLISHV2.xlsx`, substituível por `PCON_XLSX`. A prova do módulo registrou:

- exclusão padrão de abas ocultas/internas e colunas de preço;
- escolha de `DB_SENSORS`, cabeçalho na linha 4 e **68 sensores**, enquanto o plano menciona 69;
- 10 colunas úteis; 686 células comparadas, 67 numéricas, nenhuma divergência;
- representação decimal em português com valor bruto preservado;
- 150 linhas × 10 colunas como limites do módulo naquela base.

A seleção/importação pela interface e a tabela paginada continuam pendentes; chamar o módulo pelo navegador não prova esses passos da pessoa. O arquivo empresarial fica externo à suíte, logo a execução depende de sua presença ou de `PCON_XLSX`. Não foi copiado para o repositório.

## Como revalidar sem serviços externos

Após integrar e estabilizar o código, executar em série e guardar resultados separados dos históricos. Os comandos abaixo são orientações, **não execuções realizadas nesta auditoria**. O harness sobe/reutiliza Vite em `127.0.0.1:5190`; não usa Supabase, login ou chave de IA.

```powershell
node tests/vnext/proof/father-journeys/run-all.mjs
node tests/vnext/proof/father-journeys/jia1-assistente.mjs
$env:VP='1280'
node tests/vnext/proof/father-journeys/run-all.mjs
node tests/vnext/proof/father-journeys/jia1-assistente.mjs
Remove-Item Env:VP
```

O runner encontrado usa `/^j\d+[^/\\]*\.mjs$/` e **omite `jia1-assistente.mjs`**. Até corrigir a descoberta, a execução explícita acima é necessária. Seu resumo conta apenas `result.findings`, embora a maioria dos achados esteja em `findingSteps`, e lista todos os passos vermelhos juntos. Não usar essa contagem para concluir que não existem achados ou tratar todo P2/P3 como falha funcional.

Os checkpoints C/D pararam novas execuções por espaço livre abaixo de 5 GB. Na auditoria de retomada o disco já tinha mais de 24 GB livres; isso permite uma nova avaliação do ambiente, sem alterar o motivo histórico da parada. Evitar provas simultâneas com edição/HMR e manter um processo pesado por vez.

## Registro a produzir na integração

- [ ] Resolver/investigar J9 e concluir o checkpoint E sem transformar a falha histórica em aprovação retroativa.
- [ ] Reexecutar os passos novos B7/D-07 e 18b/D-08.
- [ ] Registrar SHA integrado, data, comando, viewport e caminho de resultado de cada execução nova.
- [ ] Revalidar B-01 e as dependências contra as fatias efetivamente integradas da Onda 2.
- [ ] Completar os quatro gates: `npm run lint`, `npm run typecheck`, `npm test` com trabalhadores limitados e `npm run build`.
- [ ] Atualizar story/checklist/file list e handoff com resultados reais e limitações restantes.
- [ ] Realizar a sessão observada e conferir impressão nativa em Chrome/Edge no PC do pai.

Nada nesta seção está marcado como executado. O estado da continuação deve ser registrado no [handoff da retomada](2026-10-17-retomada-dois-chats.md) e nos seus próprios resultados.
