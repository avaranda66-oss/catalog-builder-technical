# Checklist de Evidências — Recuperação Segura antes da Liberação

- **Documento:** `RECOVERY-EVIDENCE-001`
- **Status:** procedimento manual; nenhuma etapa foi executada por este documento
- **Data de emissão:** 2026-09-01
- **Operador autorizado:** Administrador do projeto Supabase e do provedor Google AI
- **Escopo:** Gates G1 (congelamento/backup), G2 (reconciliação) e G3 (credencial de IA)

> Este checklist corrige uma lacuna do `docs/runbook-backup-reconciliation.md`: um procedimento escrito não é prova de que backup, reconciliação ou rotação ocorreram. Os estados abaixo prevalecem para a decisão de liberação até que cada evidência seja produzida, revisada e registrada. Este documento não autoriza migrations, SQL de mutação, exclusões, deploys, testes contra ambiente remoto ou alteração de políticas/buckets.

## 1. Regras de segurança e condição de parada

1. O operador nunca deve colar chaves, tokens, senhas, cookies, dumps ou URLs assinadas em chat, issues, commits, documentos versionados ou capturas de tela compartilhadas.
2. Todos os arquivos de backup e os manifests devem ficar fora do repositório Git, em local com acesso restrito e, quando possível, criptografado. Não usar `.local-backups/` se ela não estiver confirmadamente ignorada pelo Git; preferir uma pasta externa ao clone.
3. Enquanto este procedimento estiver em andamento, **não abrir o app de produção para editar, sincronizar, importar ou exportar**. A versão atual pode fazer pull/push direto e sobrescrever dados. Não clicar nos controles “Nuvem”, “Enviar”, “Baixar” ou “Importar” do app.
4. Não executar `npm test`, scripts de E2E/PDF, seeds, scripts Supabase, migrations ou comandos SQL de escrita. Nenhuma alteração corretiva deve ocorrer no mesmo momento em que o inventário e os backups são criados.
5. Se qualquer passo falhar, produzir resultado incompleto, requerer uma permissão não prevista ou revelar um segredo: **pare**, registre o passo/horário/erro sem dados sensíveis, preserve os artefatos já obtidos e marque o gate como `BLOCKED`. Não tente compensar com `DELETE`, `UPDATE`, reexecução cega, migration ou deploy.

## 2. Registro da sessão de recuperação

Antes de acessar consoles, criar uma pasta externa, por exemplo `RECOVERY-YYYYMMDD-HHMM-BRT`, e dentro dela um arquivo de texto local chamado `registro-da-sessao.md`. O arquivo não deve conter segredos. Preencher:

| Campo | Valor a registrar |
|---|---|
| Data/hora de início e fuso | data/hora real e `America/Sao_Paulo` |
| Operador | nome ou identificador interno, sem e-mail pessoal se não necessário |
| Projeto Supabase | nome e referência do projeto, sem token |
| Ambiente | produção, confirmado visualmente no Dashboard |
| Navegadores/dispositivos que podem ter rascunhos | identificação do dispositivo e perfil, sem cookies |
| Motivo | recuperação preventiva após possível escrita de testes e exposição de credencial |
| Estado inicial | G1/G2/G3 `NOT VERIFIED` |

Faça cópia desse registro ao fim da sessão, com data/hora de término e lista de arquivos gerados. O manifest e os hashes abaixo devem apontar a esse registro.

## 3. G1 — Congelamento de escrita e preservação

### 3.1 Pré-condições verificáveis

- O Administrador está autenticado no Dashboard do Supabase e no console Google AI Studio/Cloud por uma sessão própria.
- Há espaço suficiente em destino externo seguro para uma cópia de banco, todos os objetos do Storage e cópias locais de rascunho.
- Uma pessoa responsável está disponível para decidir somente após enxergar o inventário; nenhum colaborador está trabalhando nos catálogos durante a janela.
- O repositório e o Dashboard podem ser consultados, mas não há autorização para mudar schema, RLS, buckets, dados, Vercel, GitHub ou configuração de IA nesta fase.

Se alguma pré-condição não puder ser confirmada, marque G1 como `BLOCKED` e pare.

### 3.2 Congelamento operacional de escrita

1. Informe pai, colaboradores e qualquer pessoa com acesso ao URL de produção que o catálogo está em manutenção e que ninguém deve abrir o app para editar/sincronizar até comunicação formal de liberação.
2. Registre no `registro-da-sessao.md` a hora, os destinatários e a confirmação recebida. Não é necessário guardar mensagens pessoais; uma lista de funções/nomes internos basta.
3. No Dashboard do Supabase, apenas consulte a área de logs/atividade disponível para confirmar se há operações recentes. Registre a hora da última atividade observada e a limitação da observação. Não altere políticas para “congelar” sem backup e decisão de implementação.
4. Confirme que não há automação, script local, terminal, CI ou aba do app em uso que possa gravar dados. Feche as abas do app e desative execuções manuais pendentes; não apague seus históricos.

**Evidência mínima:** registro datado da janela, confirmação operacional de interrupção de uso e observação read-only da atividade. Se não for possível garantir a interrupção humana, G1 não pode ser aprovado.

### 3.3 Preservar rascunhos locais antes de acessar o app

A aplicação atual guarda dados em IndexedDB (`catalog_builder_db`, stores `products`, `catalogs`, `settings`) e em chaves `localStorage` que começam com `cb_`. Como abrir o app conectado pode disparar sincronização, preserve primeiro uma cópia do perfil do navegador:

1. Em cada computador/perfil que possa conter trabalho do pai ou da equipe, feche completamente Chrome/Edge e confirme no Gerenciador de Tarefas que não há processo do navegador em execução.
2. Copie o perfil de navegador correspondente para a pasta externa de recuperação, preservando data/hora e origem. A cópia pode conter sessão/cookies: mantenha-a criptografada e não a abra nem a versiona.
3. Registre o dispositivo, perfil, caminho de destino e tamanho da cópia. Não registre tokens/cookies.
4. Só depois de preservar a cópia, se for indispensável usar a exportação local do app, faça-o em cópia isolada do perfil e com rede desconectada. Use somente a aba de arquivo local para exportar JSON; **não** use os controles de nuvem. Salve o JSON no destino seguro e registre que a exportação foi feita offline.

**Evidência mínima:** cópia protegida de cada perfil potencialmente relevante; quando houver exportação JSON offline, seu hash e data. Uma cópia de perfil é preservação, não prova de conteúdo válido.

### 3.4 Inventário read-only do Supabase

No Dashboard do projeto de produção, sem editar registros, registrar em um `inventario-read-only.csv` ou planilha local:

| Grupo | Campos mínimos |
|---|---|
| Banco | schema/tabela, contagem exibida, colunas relevantes, horário observado |
| Produtos | `id`, SKU/código, nome, `created_at`, `updated_at`, marcador de origem se existir |
| Catálogos | `id`, título, `created_at`, `updated_at`, estado/publicação se existir |
| Mídia | registro de mídia, caminho do Storage, produto vinculado, tamanho/tipo/data quando disponível |
| Storage | bucket, caminho, tamanho, tipo, `created_at`/`updated_at` quando disponível |
| Auth/perfis | apenas contagem e papéis existentes; não exportar senhas, tokens ou dados pessoais desnecessários |
| Configuração | buckets existentes e visibilidade observada; migrations mostradas no repositório versus estado remoto somente como observação |

Inclua explicitamente itens conhecidos como potencialmente afetados, sem classificá-los como erro antes de revisão: uploads com nome parecido com `sensor_presys_pcon_jpg.jpg`, produtos/catálogos atualizados no período do incidente e qualquer dado DEMO. Registre “não localizado” em vez de inferir exclusão.

**Evidência mínima:** inventário datado, com origem/horário, números de linhas/objetos e anomalias sinalizadas como “a revisar”. Não baixar nem editar uma linha durante esta etapa.

### 3.5 Backup verificável de banco e Storage

1. No Dashboard do Supabase, consulte o mecanismo de backup disponível para o plano (backup/PITR) e registre a janela de retenção e o último ponto disponível. Isso é complementar, não substitui a cópia exportada.
2. Usando apenas uma sessão autenticada do Administrador, gere uma exportação lógica ou dump consistente do banco de produção em um arquivo fora do repositório. Se o Dashboard não permitir essa exportação completa, use a CLI oficial já autenticada ou a ferramenta de banco indicada pelo próprio Supabase, mas **não cole credenciais no terminal, script ou arquivo de projeto**.
3. Baixe uma cópia de todos os objetos de cada bucket que possa conter dados do catálogo. Preserve a árvore de caminhos original. Para objetos que não puderem ser baixados, registre o caminho, tamanho, data e motivo; G1 continua incompleto até a cobertura ser decidida.
4. Gere um manifest local (`manifest-backup.csv`) com nome relativo, tamanho em bytes, data de criação e origem de cada arquivo/exportação. Gere hashes SHA-256 dos arquivos de dump, inventário e cópias compactadas. Em Windows, o Administrador pode usar `Get-FileHash -Algorithm SHA256` apontando somente para arquivos de backup locais; o resultado deve ser salvo no manifest, nunca em um commit.
5. Verifique os hashes após copiar o conjunto para um segundo destino protegido. Abra o dump/arquivo somente para conferir legibilidade e, quando suportado, faça uma validação de restauração em ambiente descartável **após autorização específica**; jamais restaure sobre produção.

**Evidência mínima para G1:** backup de banco e Storage com cobertura declarada, manifests datados, hashes conferidos no segundo destino e uma nota de restauração/validação (ou `NOT YET TESTED`, que bloqueia aprovação). Um “backup automático disponível” sem cópia verificável não fecha G1.

## 4. G2 — Reconciliação sem perda de dados

G2 só começa depois de G1 ter evidência suficiente. O objetivo é classificar e decidir, não alterar registros.

1. Use como entradas somente as cópias preservadas: inventário remoto, backup, rascunhos locais e a fonte técnica aprovada pelo pai (manuais/planilha mestre). Nomeie cada fonte e data; não trate presets ou dados DEMO como fonte oficial.
2. Crie uma planilha local `matriz-de-reconciliacao.xlsx`/CSV com: `tipo`, `id/caminho`, `campo`, `valor backup`, `valor fonte oficial`, `origem`, `situação`, `decisão proposta`, `decisão do administrador`, `responsável`, `data` e `evidência vinculada`.
3. Classifique cada item como um de: `OFICIAL CONFIRMADO`, `RASCUNHO LOCAL`, `DEMO/EXEMPLO`, `POSSÍVEL ALTERAÇÃO DE TESTE`, `DIVERGÊNCIA A INVESTIGAR` ou `SEM EVIDÊNCIA SUFICIENTE`.
4. Para cada divergência, registre a decisão humana explícita: manter como está, manter como override local, corrigir em mudança futura, arquivar logicamente ou investigar. **Nenhuma linha pode ter decisão “apagar por suposição”.**
5. O Administrador revisa e assina/aprova a matriz por data (assinatura eletrônica, comentário de aprovação ou registro interno). A matriz aprovada se torna a única entrada para uma futura story/migration transacional, com rollback e revisão.

**Evidência mínima para G2:** matriz completa para todo item sinalizado, decisão explícita do Administrador, sem execução de mudança remota. Se algum item não puder ser atribuído a uma fonte/decisão, G2 fica `BLOCKED` ou `NOT VERIFIED`, não “aceito por padrão”.

## 5. G3 — Incidente da credencial Gemini

Esta etapa trata a chave exposta como comprometida mesmo que não existam sinais de uso indevido. A prova deve demonstrar ação, nunca revelar o valor da chave.

1. No Google AI Studio ou Google Cloud Console autenticado, identifique a chave legada por rótulo, data de criação, projeto e/ou últimos caracteres vistos apenas no console. Não copie a chave para este checklist ou registro.
2. Registre em `registro-da-sessao.md` o identificador não sensível da credencial, a hora e o status anterior. Se não for possível identificar com certeza, marque G3 como `BLOCKED` e envolva o responsável do provedor; não revogue chaves por adivinhação.
3. Revogue/desative a chave legada no console do provedor e confirme que seu estado ficou revogado/inativo. Preserve captura de tela local redigida, se exigida pela política interna, ocultando valor, e registre o ID/rótulo, horário e operador.
4. Crie uma nova chave somente se houver um backend/Edge Function autorizado e com local de segredo seguro já preparado. A chave nova nunca deve ir para `VITE_*`, código cliente, `.env` versionado, documentação, log, browser ou chat. Se o backend seguro ainda não existe, deixe a funcionalidade de IA desabilitada; isso é mais seguro que reinstalar um segredo no frontend.
5. Se uma nova chave tiver sido criada, armazene-a apenas no cofre/configuração de segredos do ambiente de servidor aprovado, usando console/CLI autenticado sem imprimir seu valor. Registre apenas que o segredo foi configurado e o local lógico autorizado (por exemplo, “cofre do ambiente de servidor”), não o conteúdo.
6. Verifique localmente o código e o bundle apenas por busca de identificadores/valores conhecidos **sem imprimir segredos**; a aprovação de G3 exige também revisão da configuração de deploy para garantir que não existe variável pública de IA. A execução da IA deve permanecer desabilitada até autenticação e endpoint server-side serem implementados e revisados.

**Evidência mínima para G3:** registro de revogação da credencial legada, confirmação de que não há segredo em configuração pública e decisão documentada sobre IA (desabilitada ou segredo só em backend autorizado). A criação de uma chave nova não é requisito para aprovar G3; reexpor uma chave nova invalida o gate.

## 6. Tabela de evidências e decisão de gate

Preencha esta tabela no registro da sessão. O estado inicial de todos os gates é deliberadamente `NOT VERIFIED`.

| Gate | Estado inicial | Evidência mínima exigida | Estado permitido ao final desta sessão |
|---|---|---|---|
| G1 — Congelamento e backup | `NOT VERIFIED` | janela de freeze, inventário read-only, backup de banco+Storage, manifest, hashes e validação/cobertura declarada | `VERIFIED`, `BLOCKED` ou `NOT VERIFIED` |
| G2 — Reconciliação | `NOT VERIFIED` | matriz de divergências, fontes, decisão explícita do Administrador; nenhuma mutação executada | `VERIFIED`, `BLOCKED` ou `NOT VERIFIED` |
| G3 — Credencial exposta | `NOT VERIFIED` | revogação comprovada sem segredo, revisão de exposição pública e IA desabilitada/servidor seguro | `VERIFIED`, `BLOCKED` ou `NOT VERIFIED` |

`VERIFIED` significa “evidência revisada por humano e localizada fora do Git”; não significa que o produto está pronto para o pai. A liberação continua bloqueada por autenticação, RLS/RPC, fonte oficial versionada, PDF e QA definidos no PRD.

## 7. Handoff após a sessão

Ao terminar, o Administrador deve fornecer à equipe apenas este resumo não sensível:

- data/hora da janela e operador;
- estados G1/G2/G3 da tabela;
- nomes e hashes dos artefatos guardados (sem anexar dumps ou segredos);
- itens da matriz que aguardam decisão;
- qualquer falha ou limitação;
- autorização explícita — ou ausência dela — para a próxima story de recuperação.

Sem esse handoff, a próxima etapa deve ser somente documentação/planejamento. Não há autorização implícita para limpar produção, aplicar migrations ou voltar a sincronizar.
