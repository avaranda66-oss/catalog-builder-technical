# Catalog Builder — PRD de Recuperação e Liberação do MVP

> **Status:** proposta para validação do Product Owner e do administrador.  
> **Data:** 2026-09-01  
> **Escopo:** recuperação segura e primeira liberação interna do MVP existente; não é uma declaração de que o ambiente atual esteja pronto.  
> **Base de evidências:** `docs/brownfield-architecture.md`, `C:\Users\Usuario\Desktop\CONFIGURATOR PCON\meu-projeto\AUDITORIA_COMPLETA_SESSAO.md` e o código do clone canônico.

## 1. Decisão de produto e problema

O Catalog Builder deve permitir que o pai do solicitante — usuário experiente em planilhas, não necessariamente técnico — mantenha informações de produtos e componha catálogos PDF técnicos com confiança. Versões anteriores falharam por integrações frágeis entre Biblioteca, Studio e PDF, bugs não resolvidos, ausência de uma fonte de verdade dos dados e edição visual insuficiente.

O estado real do produto ainda não satisfaz uma liberação colaborativa segura. A análise brownfield mostra uma SPA Vite/React que sincroniza diretamente com Supabase, sem autenticação/papéis efetivos no cliente, e cujo PDF é rasterizado. Há também uma exposição histórica de segredo de IA, risco de testes escrevendo no ambiente de produção e persistência concorrente sem controle de conflitos. Ver `docs/brownfield-architecture.md`, seções 1, 4–7.

**Decisão de release:** a primeira liberação deverá atender o pai como **Administrador** e permitir que outros funcionários atuem como **Colaboradores com acesso limitado**, somente depois dos gates de recuperação, segurança e validação definidos neste PRD. A Biblioteca é a fonte oficial de dados; apenas o Administrador pode modificar dados oficiais.

## 2. Objetivo, resultado e métricas de sucesso

### Objetivo de liberação

Entregar um piloto interno confiável para criar, revisar e exportar um catálogo técnico real, preservando dados oficiais, tornando divergências locais explícitas e impedindo que colaboradores ou automações corrompam a Biblioteca ou uma publicação oficial.

### Resultados esperados

1. Um Administrador consegue cadastrar/corrigir informação oficial verificável e usá-la na composição de catálogo.
2. Um Colaborador consegue trabalhar em rascunho e fazer customizações locais sem alterar a informação oficial.
3. O usuário identifica cada valor que diverge da Biblioteca e consegue comparar a referência antes de decidir.
4. O PDF final contém apenas conteúdo de publicação, é legível e não exibe comandos, seletores, guias, marcas d’água de edição ou controles do Studio.
5. A equipe pode testar o fluxo sem que testes automatizados escrevam no ambiente de produção.

### Indicadores de aceite do piloto

| Indicador | Meta para o piloto | Evidência exigida |
|---|---|---|
| Fluxo do Administrador | 1 catálogo real concluído de Biblioteca até PDF | roteiro executado e artefato PDF revisado visualmente |
| Integridade oficial | 0 alterações oficiais realizadas por Colaborador durante roteiro | teste de autorização e trilha de auditoria/registro de tentativa |
| Integridade de override | 100% das divergências criadas no roteiro continuam locais e comparáveis | teste manual e automatizado do caso |
| Qualidade de PDF | 0 controles de edição, cortes de conteúdo ou tabelas ilegíveis no conjunto de fixtures | PDF renderizado para imagem e checklist visual aprovado |
| Segurança de testes | 0 chamadas de escrita para o projeto de produção em testes | configuração de ambiente, mocks e logs/verificação revisados |

As métricas são critérios de validação do MVP, não garantias já medidas.

## 3. Pessoas e jornadas prioritárias

| Persona | Necessidade principal | Jornada de maior valor |
|---|---|---|
| Pai / Administrador | Atualizar dados técnicos oficiais com segurança e produzir PDFs precisos | corrigir produto verificado → criar/editar catálogo → revisar divergências → publicar/exportar PDF |
| Funcionário / Colaborador limitado | Montar ou adaptar um catálogo para um cliente sem danificar a base comum | consultar Biblioteca → criar rascunho permitido → aplicar override local justificado → submeter para revisão, quando aplicável |
| Revisor interno (papel futuro ou responsabilidade do Administrador) | Aprovar informação e publicação antes do uso externo | comparar versão/override → aprovar ou devolver → registrar publicação |

### Princípios de experiência

- A jornada prioritária deve manter o encadeamento **Biblioteca → A4 Studio → revisão/publicação → PDF**, sem transferências manuais de dados entre módulos.
- A Biblioteca deve ter comportamento de planilha: grade clara, busca, filtros, navegação por teclado, edição explícita, confirmação de salvamento e recuperação de erro compreensível.
- A interface técnica é minimalista: bordas retas de 1 px, linhas finas, alinhamento rigoroso, tipografia legível e cor apenas com significado. Emojis e cantos arredondados decorativos não fazem parte de tabelas técnicas.
- Ações destrutivas, alterações oficiais e publicação devem ser claramente separadas das ações de rascunho e exigir confirmação apropriada.

## 4. Escopo da recuperação e da primeira liberação

### Incluído antes de liberar o piloto (Must)

1. Recuperar e proteger o ambiente antes de modificar dados, políticas, buckets ou identidades.
2. Implementar identidade/autorização efetiva para Administrador e Colaborador, de modo que a regra não dependa de flag no navegador.
3. Tornar a Biblioteca uma fonte oficial compartilhada, com versão/proveniência e edição oficial exclusiva do Administrador.
4. Preservar customizações de um catálogo como overrides locais, comparáveis à referência oficial e sem sincronização silenciosa de volta à Biblioteca.
5. Assegurar salvamento explícito, conflitos visíveis e recuperação de erro; não aceitar estratégia cliente “last writer wins” sem revisão.
6. Viabilizar páginas ilustrativas e páginas técnicas, tabelas técnicas padronizadas e presets distintos e reutilizáveis.
7. Produzir PDF de publicação limpo e validado visualmente, a partir de um snapshot/versão revisável.
8. Isolar testes e credenciais; remover o segredo exposto do cliente e rotacioná-lo no provedor antes de novo deploy.
9. Fazer piloto guiado com o pai usando conteúdo real verificado, incluindo interrupção e retomada do trabalho.

### Condicional à decisão do Administrador (Should)

- Colaboradores poderem criar catálogos compartilhados, além de rascunhos próprios.
- Submissão formal de catálogo para revisão/publicação pelo Administrador.
- Migração de mídia existente para armazenamento privado após inventário, backup e validação de permissão.
- Histórico navegável de versões e auditoria por campo, além do mínimo necessário para comparar dados e recuperar alterações.

### Fora da primeira liberação (futuro, não bloqueia o piloto)

- Autonomia de IA para escrever diretamente em Biblioteca, catálogo ou publicação.
- Geração de imagens de produto sem foto real autorizada e verificada na Biblioteca.
- Publicação externa, portal de clientes, integrações comerciais ou acesso público aos dados técnicos.
- Biblioteca completa de todos os produtos antes de validar o fluxo com um conjunto piloto de produtos reais.
- Editor gráfico genérico sem limites para qualquer composição. A primeira versão deve priorizar blocos e layouts necessários para os catálogos reais.

## 5. Fonte da verdade, dados e conflitos

### Regras de negócio

- Um produto oficial deve possuir identidade estável, versão, estado de verificação e proveniência por campo ou conjunto de campos. Dados de demonstração e mídia genérica não podem parecer dados oficiais.
- A Biblioteca oficial é a referência usada por todas as pessoas, pelo verificador de IA e pelos novos catálogos. Somente Administrador pode criar, alterar, aprovar, arquivar ou restaurar essa referência.
- Ao inserir produto no catálogo, o item deve conservar `produto de origem`, `versão de origem` e os valores efetivamente usados naquele catálogo.
- Uma alteração no catálogo é um **override local**, não uma alteração no produto oficial nem nos outros catálogos. Ela deve registrar valor local, referência oficial no momento da criação, motivo opcional/obrigatório conforme decisão futura, autor e data.
- Se a Biblioteca mudar depois, o catálogo não pode ser regravado automaticamente. A tela deve exibir indicador discreto, tooltip e comparação/diff entre valor no catálogo, versão usada e valor oficial atual; conciliar, manter override ou atualizar deve ser uma ação explícita.
- Uma publicação deve apontar para um snapshot/versão imutável do catálogo. Alterações posteriores criam uma nova revisão, não mudam silenciosamente um PDF já liberado.

### Requisitos funcionais de dados

- **FR-01 — Biblioteca oficial:** o Administrador deve conseguir visualizar, buscar, filtrar, criar e editar produtos oficiais em grade tabular, com validação de campos técnicos e estado de verificação visível.
- **FR-02 — Proveniência:** cada dado usado como oficial deve exibir origem ou estado verificável; a ausência de evidência deve impedir seu uso como “verificado” e ser claramente sinalizada.
- **FR-03 — Vínculo catálogo–produto:** o Studio deve inserir dados da Biblioteca como referência versionada, não por cópia anônima sem origem.
- **FR-04 — Override local:** usuários autorizados devem editar somente o catálogo em que trabalham; cada divergência deve apresentar valor oficial e ação explícita de conciliação, sem sobrescrita silenciosa.
- **FR-05 — Conflito e salvamento:** o sistema deve informar “salvo”, “salvando”, “alterações pendentes”, “conflito” e “erro”, com ação segura para resolver sem perda de conteúdo.
- **FR-06 — Conteúdo confiável:** produtos, especificações e fotos de demonstração devem ser marcados como demonstração ou excluídos do fluxo de publicação até que o Administrador confirme sua veracidade/autorização.

## 6. Colaboração e permissões da primeira versão

Esta matriz define o padrão conservador. Campos marcados **Pendente de decisão** precisam de confirmação do Administrador antes de implementação; não são permissões concedidas por este PRD.

| Ação | Administrador | Colaborador limitado | Estado/observação |
|---|---|---|---|
| Entrar no aplicativo | permitido | permitido por convite/autorização | obrigatório para primeira versão |
| Consultar Biblioteca oficial | permitido | permitido somente para leitura | obrigatório |
| Criar/editar/aprovar/arquivar produto oficial | permitido | negado | obrigatório; autorização deve ser aplicada no servidor/banco |
| Consultar mídia oficial autorizada | permitido | permitido em leitura conforme vínculo ao produto | obrigatório; não expor mídia não autorizada |
| Enviar/alterar/remover mídia oficial | permitido | negado por padrão | pode ser reconsiderado após fluxo de aprovação |
| Criar rascunho de catálogo | permitido | permitido | obrigatório; propriedade/visibilidade devem ser registradas |
| Editar catálogo próprio em rascunho | permitido | permitido | obrigatório |
| Aplicar override local em catálogo permitido | permitido | permitido | obrigatório; não altera Biblioteca |
| Editar catálogo de outro colaborador | permitido | Pendente de decisão | padrão até decisão: negado |
| Submeter catálogo para revisão | permitido | Pendente de decisão | recomendado: permitido, sem publicar |
| Aprovar/publicar/exportar versão oficial | permitido | negado por padrão | exportação de rascunho para uso interno é Pendente de decisão |
| Gerenciar convites, papéis e acesso | permitido | negado | obrigatório |
| Usar IA factual em modo consulta/proposta | permitido | permitido, sem escrita direta | obrigatório se IA entrar no piloto |

**Decisões que o Product Owner deve confirmar antes das stories:** quem pode ver catálogos de outras pessoas; se colaborador pode baixar PDF de rascunho; se submissão para revisão é obrigatória; quem pode enviar fotos para aprovação; e a política de desativação/remoção de contas.

## 7. Studio, tabelas e presets

### Requisitos de composição

- **FR-07 — Páginas:** o Studio deve permitir páginas ilustrativas e páginas técnicas no mesmo catálogo, com ordem explícita, preview A4 e persistência confiável.
- **FR-08 — Blocos:** o usuário deve poder adicionar, editar, reorganizar e remover blocos necessários para texto, imagem autorizada, caixas, tabelas e notas, sem expor controles de edição na publicação.
- **FR-09 — Tabela técnica comum:** tabelas técnicas devem usar contrato único para linhas/colunas, grupos, unidades, alinhamento, bordas, notas e regra de quebra de página. Implementações específicas devem ser presets desse contrato, não tabelas isoladas incompatíveis.
- **FR-10 — Marcadores técnicos:** uma célula deve suportar marcador estruturado (quadrado cheio/vazio, círculo cheio/vazio, asterisco ou nenhum), cor funcional e legenda/nota. O significado não pode depender apenas de caractere de apresentação.
- **FR-11 — Precisão visual:** tabelas devem ser retangulares, sem decoração infantil; permitir seleção de itens/marcadores, cores e notas mantendo linhas finas, alinhamento numérico e enquadramento preciso.
- **FR-12 — Presets distintos:** presets devem separar **receita de layout**, **tema/tokens visuais** e **conteúdo/dados**. Cada preset precisa declarar objetivo (ex.: capa editorial, visão geral de produto, ficha técnica densa, matriz de comparação), blocos esperados e dados necessários. Não criar várias variações cosméticas do mesmo layout.

### Critérios de usabilidade

- Fluxo central utilizável sem treinamento técnico: abrir Biblioteca, localizar produto, iniciar catálogo com preset, revisar dados/overrides e exportar PDF.
- Navegação por teclado em grades e foco visível em controles críticos.
- Células técnicas de alta densidade mantêm legibilidade e unidades; o estilo não pode ocultar precisão por falta de espaço.

## 8. Publicação e PDF

### Requisitos

- **FR-13 — Pré-publicação:** o usuário deve conseguir revisar o catálogo e problemas bloqueantes (dados não verificados, mídia ausente/não autorizada, divergências não compreendidas, overflow/corte conhecido) antes de gerar uma versão final.
- **FR-14 — Snapshot:** o PDF final deve ser gerado de uma versão/snapshot identificável, preservando o que foi aprovado naquele momento.
- **FR-15 — Saída limpa:** a exportação deve excluir botões, seletores, alças, guias, barras de edição, indicadores internos e qualquer marca d’água não aprovada.
- **FR-16 — Legibilidade:** a exportação deve respeitar formato A4, ordem de páginas, imagens de origem adequada, fontes/texto legíveis, e impedir que linhas de tabela sejam cortadas de maneira inválida. Cabeçalhos devem repetir em tabelas longas quando a receita do bloco assim determinar.
- **FR-17 — Evidência de qualidade:** cada alteração no motor de PDF deve ser validada por fixtures representativas (capa, página ilustrativa, tabela técnica densa, tabela longa, imagem real autorizada e overrides) e inspeção visual do PDF renderizado.

### Critério mensurável de aceite do PDF

Para as fixtures aprovadas, a revisão visual em tamanho de impressão deve registrar: (a) zero controles de edição; (b) zero conteúdo fora da área da página; (c) zero corte de linha técnica; (d) 100% dos textos técnicos críticos legíveis; e (e) correspondência de ordem e conteúdo entre snapshot e PDF. A exigência de saída vetorial ou DPI específico permanece uma **decisão técnica pendente**: a arquitetura deverá escolher solução que prove qualidade de impressão, em vez de prometer “vetorial/300 DPI” sem evidência. A implementação atual é PNG por página, portanto não atende essa prova (`docs/brownfield-architecture.md`, seção 4.5).

## 9. IA factual e imagens

- **FR-18 — Consulta factual:** a IA só pode responder usando dados oficiais verificados que estejam no escopo autorizado da Biblioteca, identificando produto/campo/fonte usada na resposta.
- **FR-19 — Propostas revisáveis:** qualquer alteração sugerida por IA deve aparecer como proposta/diff revisável. Ações de aplicar exigem usuário autorizado e nunca gravam automaticamente na Biblioteca, catálogo ou publicação.
- **FR-20 — Limites de incerteza:** quando um dado não estiver verificado/disponível, a IA deve responder que não possui base suficiente; não pode inventar especificações, normas, códigos, unidades, tabelas ou fotos.
- **FR-21 — Imagem de produto:** a IA pode auxiliar na composição usando somente foto real autorizada vinculada ao produto. Não pode gerar, alterar de forma enganosa ou apresentar imagem sintética como se fosse foto verdadeira do produto. Imagens ilustrativas não-produto exigem rotulagem e decisão futura de política.
- **FR-22 — Segurança da IA:** segredos e chamadas a provedores não podem estar no bundle do navegador. A integração deve usar um limite de operações, registro de proposta e controle de autorização no servidor/serviço apropriado.

## 10. Segurança, recuperação e qualidade — gates obrigatórios

Nenhuma migração, limpeza, reconciliação, mudança de policy/bucket, deploy ou liberação colaborativa poderá ocorrer antes dos gates a seguir. Eles existem porque a auditoria identifica escrita direta, dados potencialmente alterados por testes e divergência entre schema/migrations e cliente atual (`docs/brownfield-architecture.md`, seções 5, 6 e 8).

| Gate | Condição de aprovação | Evidência mínima |
|---|---|---|
| G1 — Congelamento e backup | Escritas de risco pausadas; cópia verificável de banco, Storage e, quando aplicável, rascunhos locais antes de qualquer recuperação/migração | inventário datado, local protegido, restauração de amostra/checagem de integridade e plano de reversão |
| G2 — Reconciliação | Inventário diferencia dados oficiais, demos, mídia, rascunhos e alterações potencialmente afetadas; nenhuma exclusão por suposição | decisão explícita do Administrador por conjunto de dados e registro de antes/depois |
| G3 — Credencial exposta | Segredo de IA removido do cliente, revogado/rotacionado no provedor e configurado somente no ambiente autorizado; histórico/exposição tratado como incidente | revisão de código/build sem segredo e confirmação operacional sem revelar valor |
| G4 — Identidade e autorização | Login, papéis e regras de acesso são realmente aplicados no caminho de leitura/escrita; não existe flag local que conceda administração | testes de matriz Admin/Colaborador e revisão de políticas/RPC/API efetivamente usadas |
| G5 — Persistência/conflito | Escrita não usa sincronização anônima “fire-and-forget” nem last-writer-wins silencioso | testes de concorrência/erro, aviso visível e comportamento de recuperação documentado |
| G6 — Testes seguros | A suíte usa mocks ou ambiente isolado; executar testes não cria, altera, faz upload nem apaga dados de produção | configuração separada, bloqueio de credenciais de produção e prova de tráfego/execução |
| G7 — Conteúdo e XSS | Conteúdo editorial é tratado com política segura; fotos/dados não verificados não entram em publicação como oficiais | testes de sanitização e checklist de conteúdo |
| G8 — PDF | Fixtures aprovadas passam no teste visual e no checklist de saída limpa | PDFs, imagens renderizadas e relatório de QA rastreável |
| G9 — Piloto | Pai executa o roteiro completo com assistência e sem perda/corrupção de dados | feedback registrado, defeitos priorizados e decisão go/no-go do Administrador |

Os comandos de qualidade (`lint`, typecheck, teste e build) só poderão ser considerados gates depois que o projeto tiver scripts válidos e testes isolados. Hoje não há script `lint` e o teste de serviço possui risco de rede/escrita, conforme `docs/brownfield-architecture.md`, seção 7.

## 11. Requisitos não funcionais

- **NFR-01 — Segurança:** autorização deve ser verificada fora do navegador para todas as ações oficiais e de publicação. Nenhuma credencial secreta deve ser distribuída ao cliente.
- **NFR-02 — Integridade:** toda mudança oficial e toda publicação deve ser rastreável a usuário, momento e versão; conflitos não podem produzir perda silenciosa.
- **NFR-03 — Confiabilidade:** falha de rede, sessão expirada ou conflito deve resultar em estado claro e ação de recuperação, não em mensagem de sucesso antecipada.
- **NFR-04 — Usabilidade:** o fluxo essencial deve ser compreensível para pessoa habituada a Google Sheets, com rótulos em português consistentes e sem depender de conhecimento técnico.
- **NFR-05 — Acessibilidade/legibilidade:** foco visível, contraste suficiente, navegação por teclado em tabelas e fonte adequada para dados densos.
- **NFR-06 — Privacidade/mídia:** acesso a fotos e catálogos deve obedecer ao papel e à visibilidade definida; URLs públicas não devem ser adotadas sem política e aprovação explícita.
- **NFR-07 — Observabilidade:** erros de salvamento, exportação e propostas de IA devem gerar evidência diagnóstica sem registrar segredos ou conteúdo indevido.
- **NFR-08 — Compatibilidade brownfield:** a transição deve preservar conteúdo validado por backup e migração controlada; não aplicar migrations existentes às cegas, pois o cliente atual não usa as RPCs nelas definidas.

## 12. Prioridade de release e sequência de trabalho

| Prioridade | Entrega | Valor | Dependência |
|---|---|---|---|
| P0 | G1–G3: backup/reconciliação, incidente de segredo e bloqueio de escrita insegura | evita perda/exposição antes de mexer no MVP | aprovação do Administrador para recuperação e rotação |
| P0 | G4–G6: identidade, autorização, persistência segura e testes isolados | permite colaboração limitada sem corromper a fonte da verdade | decisão de arquitetura e modelo de dados |
| P0 | Fonte oficial, versões, overrides/diff e estados de salvamento | resolve a causa central das versões anteriores | G4/G5 |
| P1 | Motor único de tabelas, presets distintos e refinamento de Studio | torna o produto realmente útil para catálogo técnico | contrato de dados/blocos |
| P1 | Publicação/snapshot e PDF validado visualmente | permite usar o catálogo produzido | estabilidade do Studio e G8 |
| P1 | Piloto com pai e correções priorizadas | valida usabilidade real antes de ampliar equipe | todos os P0/P1 anteriores |
| P2 | IA factual por proposta e composição com mídia real | aumenta produtividade sem alterar dados automaticamente | G3/G4, biblioteca verificada |

O Product Owner e o Scrum Master devem converter essa sequência em épico e stories independentes. Nenhum código deve começar sem story com critérios de aceite e file list, conforme a Constituição AIOX.

## 13. Riscos, dependências e decisões pendentes

| Item | Tipo | Impacto | Tratamento exigido |
|---|---|---|---|
| Dados existentes podem ter sido afetados por teste ou por sincronização | risco | alto | backup e reconciliação antes de qualquer mutação |
| Schema/migrations e cliente atual divergem | risco | alto | decisão arquitetural antes de migrar/deployar |
| Credencial de IA já exposta no cliente/histórico | risco | alto | revogação/rotação operacional e remoção do cliente |
| Conteúdo HTML salvo pode executar no navegador | risco | alto | política de sanitização e testes antes de colaboração |
| Fotos e especificações de demonstração podem ser confundidas com oficiais | risco | alto | classificação/verificação e revisão humana |
| Qualidade do PDF ainda não é provada | risco | alto | fixtures e validação visual antes do piloto |
| Definição de papel Colaborador ainda parcial | decisão pendente | médio | confirmar itens marcados na matriz antes de implementar |
| Política de mídia e aprovação de upload | decisão pendente | médio | definir proprietário, visibilidade e fluxo de aprovação |
| Decisão técnica de renderização PDF e prova de impressão | dependência | alto | arquiteto avalia alternativas a partir de requisitos mensuráveis |
| Acesso administrativo ao provedor de IA e ambiente | dependência | alto | Administrador/operador executa rotação sem compartilhar segredos |

## 14. Não-escopo e prevenção de trabalho sem ganho real

Não é aceitável gastar a primeira liberação em variações cosméticas de presets, automação autônoma de IA ou reconstrução genérica do editor antes de garantir fonte de verdade, autorização, persistência, PDF e fluxo com o pai. Também não é aceitável alterar produção para “testar se funciona” sem backup/reversão e autorização específica.

Qualquer expansão deve demonstrar ganho concreto em uma das jornadas prioritárias, ter dados reais/verificados quando aplicável e ser aprovada como story após os gates de segurança.

## 15. Aceite e handoff

Este PRD está **pronto para validação**, não pronto para implementação automática. A aprovação deve confirmar:

1. a matriz conservadora de permissões e as decisões pendentes;
2. a ordem de prioridade P0/P1/P2;
3. que backup/reconciliação e rotação de segredo são pré-requisitos de qualquer deploy/liberação;
4. que o piloto será avaliado por uma tarefa real do pai antes da abertura mais ampla para funcionários.

Após validação, o próximo passo é uma decisão de arquitetura para definir o caminho seguro de persistência/autorização/PDF e, em seguida, validação do Product Owner e criação de épico/stories pelo Scrum Master. Esta separação evita que a equipe implemente melhorias visuais sobre uma base ainda insegura.
