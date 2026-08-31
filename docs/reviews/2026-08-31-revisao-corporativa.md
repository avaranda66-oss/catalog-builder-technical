**Catalog Builder — revisão de código e evolução para uso corporativo**

Data: 31/08/2026. Escopo: `catalog-builder`, a pedido do usuário. Revisão de código, configurações e migrations, com reproduções isoladas de fluxos; não é uma auditoria do ambiente implantado.

**Parecer**

O projeto possui uma base reaproveitável de editor técnico: blocos de página, formulário, planilha, preview A4, presets, tokens visuais e propostas de IA. A combinação Next.js, React, TypeScript, Zustand e PostgreSQL/Supabase pode continuar.

Minha avaliação é que o estágio atual é de protótipo funcional de editor, ainda inadequado para ser a fonte oficial de documentos técnicos de uma grande empresa. Os bloqueios mais relevantes são dados técnicos inventados em fallbacks, ambiguidade entre dados de produto e conteúdo de página, autenticação incompleta e sincronização capaz de perder alterações. Ampliar a interface antes de resolver esses pontos aumentaria a superfície de falhas.

A experiência pretendida deve reunir quatro partes: cadastro mestre de produtos; biblioteca de mídia; editor de documentos vinculados aos dados; revisão e publicação. O dashboard deve organizar o trabalho dessas partes, com indicadores reais de completude e pendências.

**Escopo e limites da verificação**

- Leitura do frontend, store, importadores, rotas de IA, schema SQL, auditoria e políticas de acesso.
- Reproduções locais em memória com TypeScript/Node e renderização estática React. Nenhuma chamada às APIs de IA ou ao banco de produção foi usada nas reproduções.
- Não abri arquivos de credenciais. O comando padrão de build carregou `.env.local` automaticamente, sem exibir seus valores.
- Não confirmei quais migrations estão aplicadas no Supabase implantado. Achados de autorização descrevem o código versionado.
- Não executei inspeção visual de um PDF exportado, teste ponta a ponta no navegador, teste de carga ou auditoria de dependências. Não afirmo vulnerabilidades específicas de pacotes sem essa verificação.
- A constitution solicitada nas instruções, `.aios-core/constitution.md`, e o diretório de stories não existiam no workspace consultado. Foi criada uma story apenas para documentar esta revisão, sem inventar entregas de implementação.

**Achados prioritários**

P1: corrigir antes de uso corporativo com dados oficiais. P2: corrigir na estabilização e antes de ampliar o uso. A classificação considera o impacto nesta aplicação de documentação técnica.

**F01 — P1 — A importação e a assistência podem inventar características técnicas**

Evidências: [app/api/ai/import-pdf/route.ts](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/app/api/ai/import-pdf/route.ts:241>), [app/api/ai/import-pdf/route.ts](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/app/api/ai/import-pdf/route.ts:281>), [components/ai/pdf-importer-modal.tsx](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/components/ai/pdf-importer-modal.tsx:134>), [app/api/ai/chat/route.ts](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/app/api/ai/chat/route.ts:46>).

Quando a extração não encontra especificações, o servidor preenche pressão, exatidão, estabilidade e tempo de resposta com constantes de demonstração. Também acrescenta sinais elétricos, alimentação, acessórios e garantia sem comprovação na fonte. O cliente possui outro fallback que usa apenas o nome do arquivo. A resposta de auditoria sem provedor afirma conformidade metrológica e sugere rastreabilidade ISO/IEC 17025 sem validação.

Reprodução: base64 de `abc`, nome `disjuntor.pdf`, retornou HTTP 200 e `success:true`, com pressão até 210 bar, exatidão ±0,012% FS e RTD −200 a 850 °C. Esses valores vieram do código, não do arquivo. O chat também produziu declaração de conformidade para um produto de teste.

Recomendação: separar demonstração explicitamente de operação real. Falha de extração deve resultar em erro ou campos ausentes. Cada dado extraído deve guardar fonte/página, texto original e situação de revisão. Certificações e capacidades devem vir de evidências cadastradas e aprovação técnica.

**F02 — P1 — O parser pode alterar o sinal de grandezas**

Evidência: [app/api/ai/import-pdf/route.ts](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/app/api/ai/import-pdf/route.ts:218>) e linha 227.

A expressão que separa rótulo e valor também divide o texto no caractere de menos. Reprodução: `Range: -25 to 150 C` tornou-se `25 to 150 C`. Trata-se de alteração do significado técnico.

Recomendação: preservar o valor original; separar apenas o delimitador entre rótulo e valor. Validar números negativos, intervalos, separador decimal, símbolos e unidades antes de aplicar a importação.

**F03 — P1 — A identificação na interface não é autenticação**

Evidências: [components/auth/user-gate-modal.tsx](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/components/auth/user-gate-modal.tsx:117>), [lib/types/auth-user.ts](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/lib/types/auth-user.ts:34>), [supabase/migrations/00003_rls_policies.sql](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/supabase/migrations/00003_rls_policies.sql:30>).

A senha é comparada com uma constante entregue ao navegador. O usuário é um objeto no localStorage, aceito como sessão sem verificação pelo servidor. Não foi encontrada integração com `supabase.auth`. A identidade pode ser falsificada localmente; em navegador novo, o cliente continua anônimo e as migrations negam gravação de catálogos a esse papel.

Recomendação: usuários individuais, sessão verificável, convites e autenticação da empresa quando necessária. Validar sessão nas operações do servidor e aplicar autorização no banco. Não corrigir o problema liberando escrita anônima. A documentação distingue os papéis `anon` e `authenticated` e orienta combinar autenticação, grants e RLS: [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).

**F04 — P1 — As políticas versionadas não isolam dados internos nem papéis de equipe**

Evidência: [supabase/migrations/00003_rls_policies.sql](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/supabase/migrations/00003_rls_policies.sql:26>) e linhas 44–50.

As políticas permitem leitura anônima de todos os catálogos/produtos, sem exigir publicação. Como `catalogs.brand` inclui produtos, páginas e histórico, isso pode expor rascunhos e nomes/áreas de colaboradores quando os grants do ambiente permitirem a leitura. As mutações por usuários autenticados não verificam `admin/editor/viewer` nem participação no projeto. A atualização do próprio perfil também não protege explicitamente a coluna de papel.

Recomendação: separar dados de trabalho da publicação pública; verificar papel e vínculo com projeto/catálogo; proteger atribuição de privilégios e transições de aprovação. Criar testes de acesso permitido e negado para visitantes, leitores, editores e administradores.

**F05 — P1 — Edição de tabelas pode apagar especificações e misturar produtos**

Evidências: [components/forms/product-form.tsx](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/components/forms/product-form.tsx:715>), [components/forms/product-form.tsx](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/components/forms/product-form.tsx:723>), [components/preview/sections/catalog-sections.tsx](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/components/preview/sections/catalog-sections.tsx:581>).

Formulário e preview usam precedências diferentes entre `section.content.rows` e `product.data.specs`. As páginas são globais. O formulário grava simultaneamente no bloco e no produto selecionado.

No estado inicial, o formulário encontra cinco linhas vazias do template, enquanto o produto possui sete especificações. Editar uma célula substitui a lista completa do produto pela lista do formulário. Depois de editar A e selecionar B, o bloco pode continuar contendo dados de A; uma nova edição transfere essas linhas para B. A precedência indevida foi confirmada por renderização estática.

Recomendação: cada bloco deve declarar se contém texto editorial livre ou referência a dados de um produto/variante/revisão. Formulário, preview e PDF precisam usar o mesmo resolvedor de dados. Não copiar automaticamente especificações do template para o cadastro mestre.

**F06 — P1 — O sistema informa salvamento mesmo quando houve falha**

Evidências: [lib/supabase/api.ts](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/lib/supabase/api.ts:31>), [lib/supabase/api.ts](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/lib/supabase/api.ts:325>), [lib/supabase/api.ts](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/lib/supabase/api.ts:365>), [app/page.tsx](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/app/page.tsx:147>).

`saveToLocalStorage` captura falhas sem propagá-las. `saveAll` declara sucesso local incondicionalmente e retorna `supabase:false` quando a gravação remota falha. Os chamadores ignoram o resultado e marcam o estado como salvo/sincronizado.

Reprodução com falha de quota local e rejeição simulada de RLS: `saveAll` retornou `{supabase:false,localStorage:true}`, sem lançar erro, embora nenhum destino tivesse persistido a alteração.

Recomendação: resultado explícito por destino; estados “salvo neste dispositivo”, “pendente de sincronização”, “sincronizado” e “erro”. Somente confirmar a revisão realmente persistida. O usuário precisa conseguir reenviar ou recuperar a alteração.

**F07 — P1 — A sincronização não protege contra alterações concorrentes**

Evidências: [lib/supabase/api.ts](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/lib/supabase/api.ts:331>), [lib/supabase/api.ts](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/lib/supabase/api.ts:354>), [app/page.tsx](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/app/page.tsx:75>), [app/page.tsx](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/app/page.tsx:161>).

Cada salvamento substitui o pacote completo em `catalogs.brand`. O campo `version` é enviado, mas não é usado como condição de atualização. Duas pessoas que partem da mesma versão podem sobrescrever alterações independentes uma da outra.

Também existem corridas dentro de um navegador: o pull verifica `unsaved` antes de esperar a rede, sem revalidar depois; uma resposta antiga pode substituir uma edição iniciada durante a requisição. A conclusão de um save marca tudo como salvo mesmo se o usuário já tiver feito nova edição.

Recomendação: salvar por entidade, com revisão base e atualização condicional atômica no banco; detectar conflito; serializar a fila de saves; confirmar apenas a revisão enviada. Adicionar presença/Realtime somente depois dessa base. Atualizações concorrentes e isolamento precisam de tratamento transacional: [PostgreSQL — Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html).

**F08 — P1 — Alterações locais pendentes perdem essa condição após recarregar**

Evidências: [features/editor/editor-store.ts](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/features/editor/editor-store.ts:244>), [features/editor/editor-store.ts](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/features/editor/editor-store.ts:738>), [app/page.tsx](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/app/page.tsx:110>).

O persist do Zustand armazena os dados editados, mas exclui `saveStatus` e `dirtyProductIds`. Na reidratação, o estado volta a `saved`, permitindo o pull inicial sobrepor edições ainda não enviadas.

Reprodução em memória: o título local editado foi mantido no payload, mas a combinação com o estado inicial resultou em `saveStatus:'saved'` e nenhuma pendência. Além disso, aplicar tokens e contato de um pull sem diferenças marca o estado como `unsaved`, provocando gravações automáticas desnecessárias.

Recomendação: persistir revisão local, revisão confirmada e operações pendentes. Distinguir hidratação remota de ação de edição. Reconciliar o cache com a nuvem antes de substituir dados.

**F09 — P1 — Uma proposta da IA pode ser aplicada ao produto errado**

Evidência: [features/editor/editor-store.ts](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/features/editor/editor-store.ts:710>).

A proposta não contém produto-alvo nem revisão base. A aplicação usa o produto selecionado naquele instante. Reprodução: proposta para A, troca de seleção para B, aplicação; B recebe o texto de A e A permanece intacto.

Recomendação: proposta com `productId`, revisão base e alterações validadas; conferir valores anteriores e autorização no momento de aplicar. Conteúdo vindo de arquivos/modelos precisa ser tratado como entrada não confiável, inclusive quando a saída parece JSON válido. [OWASP — Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/).

**F10 — P1 — As rotas de IA não exigem autenticação ou limitam consumo**

Evidências: [app/api/ai/chat/route.ts](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/app/api/ai/chat/route.ts>), [app/api/ai/import-pdf/route.ts](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/app/api/ai/import-pdf/route.ts>), [app/api/ai/translate/route.ts](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/app/api/ai/translate/route.ts>).

Não foram encontrados checks de sessão, autorização por produto ou limites de chamadas nas três rotas. Quando uma chave válida estiver configurada, requisições podem consumir o serviço sem passar pela identificação da interface. Os retornos do modelo não recebem um schema técnico completo antes de entrar nos fluxos de aplicação.

Recomendação: sessão validada, autorização, limites por usuário/equipe, limites de tamanho, timeout, orçamento e logs sem exposição desnecessária de documentos. Importações grandes devem executar como jobs com progresso e cancelamento.

**F11 — P1 — A impressão não está isolada da interface**

Evidências: [app/page.tsx](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/app/page.tsx:236>), [components/preview/catalog-document.tsx](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/components/preview/catalog-document.tsx:205>), [app/globals.css](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/app/globals.css:84>), [app/globals.css](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/app/globals.css:120>).

A exportação chama `window.print()` na aplicação com painéis responsivos, alturas de viewport, overflow e transform de zoom. As classes de ocultação para impressão existem no CSS, mas não são aplicadas aos componentes. A margem de 15 mm do papel ainda recebe uma folha interna de 210 × 297 mm, maior que a área imprimível de 180 × 267 mm.

Essas incompatibilidades foram identificadas no código; não foi gerado PDF para afirmar o aspecto exato em cada navegador.

Recomendação: rota/documento exclusivo de impressão, sem controles nem zoom; um único sistema de margens; paginação de tabelas e verificação de overflow. Para publicação reproduzível, gerar PDF em worker com versão fixa do renderizador e dados aprovados. [Playwright — page.pdf](https://playwright.dev/docs/api/class-page#page-pdf) documenta geração com mídia de impressão e opções de papel; isso não garante por si só PDF/A, PDF/X ou conformidade gráfica.

**F12 — P2 — Desfazer/refazer não representa corretamente o histórico**

Evidências: [features/editor/editor-store.ts](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/features/editor/editor-store.ts:216>), [features/editor/editor-store.ts](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/features/editor/editor-store.ts:644>).

Os snapshots são capturados antes da alteração e o índice é tratado como se representasse o estado atual. Em uma inicialização sem histórico, a primeira alteração não pode ser desfeita. Após inicializar o histórico e editar um título, desfazer e refazer não recuperou o título editado.

Recomendação: modelo explícito de passado/presente/futuro ou patches reversíveis. Agrupar alterações do mesmo gesto, inclusive atualizações simultâneas de bloco/produto. Testar edição simples, exclusão, importação, troca de preset e ramificação após undo.

**F13 — P2 — Há duas fontes incompatíveis para o cadastro de produtos**

Evidências: [lib/supabase/api.ts](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/lib/supabase/api.ts:341>), [lib/supabase/api.ts](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/lib/supabase/api.ts:409>), [lib/supabase/api.ts](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/lib/supabase/api.ts:471>).

O schema possui tabela `products`, mas o fluxo principal salva/lê a lista dentro de `catalogs.brand`. Outro loader consulta a tabela relacional. Dados do seed ou atualizados por SQL podem não aparecer no fluxo principal. Índices, unicidade, versões e auditoria de `products` não protegem a lista embutida no JSON.

O carregamento ainda escolhe o primeiro catálogo, e o frontend não aplica ao store todos os campos retornados, como identidade do catálogo, definições e presets. Coleções vazias podem cair no fallback de demonstração.

Recomendação: fonte única para produtos; seleção explícita do documento/catálogo; tratar vazio como estado legítimo. Usar JSONB para conteúdo flexível com schema, não como substituto de todos os relacionamentos e regras do domínio.

**F14 — P2 — Importação Excel pode ignorar dados e gerar campos incompatíveis**

Evidências: [features/import/excel-parser.ts](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/features/import/excel-parser.ts:61>), [features/import/excel-parser.ts](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/features/import/excel-parser.ts:84>), [features/import/excel-parser.ts](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/features/import/excel-parser.ts:130>).

A detecção de cabeçalhos normaliza capitalização, mas a leitura dos valores usa nomes específicos. Reprodução: `MODELO,NOME,FAIXA,EXATIDÃO` gerou SKU automático e valores técnicos padrão em vez dos informados, sem apontar esses erros. Campos extras prometidos não são preservados. O parser também usa `function_name`/`value` onde o renderer espera `signal`/`desc`.

Recomendação: normalização única; mapeamento revisável das colunas; validação por família; preview por linha; deduplicação por SKU; contrato compartilhado com formulário/renderizador; nenhuma grandeza preenchida por suposição.

**F15 — P2 — Tabelas personalizadas podem trocar colunas e esconder zero**

Evidência: [components/preview/sections/catalog-sections.tsx](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/components/preview/sections/catalog-sections.tsx:973>).

`Object.values(row)` usa a ordem do objeto em vez da ordem dos cabeçalhos. `cell || ''` elimina zero. Ambos confirmados por renderização estática: cabeçalhos A/B com objeto B/A exibiram valores trocados; zero virou célula vazia.

Recomendação: resolver valores pela chave de cada coluna e usar tratamento de ausência que preserve zero e false. Testar objetos fora de ordem, colunas faltantes e grandezas numéricas.

**F16 — P2 — A aprovação e a tradução exibem sucesso de forma inconsistente**

Evidências: [features/editor/editor-store.ts](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/features/editor/editor-store.ts:706>), [components/ai/staged-changes.tsx](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/components/ai/staged-changes.tsx:68>), [app/api/ai/translate/route.ts](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/app/api/ai/translate/route.ts:152>), [components/ai/translation-modal.tsx](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/components/ai/translation-modal.tsx:81>).

O checkbox considera `undefined` como aceito, mas o primeiro clique o transforma em `true`; a alteração continua aceita. O fallback de tradução só substitui algumas expressões para inglês e pode retornar sucesso sem mudar outros idiomas. Reproduzido para espanhol. Na tradução em lote, falhas HTTP também podem terminar em indicação geral de sucesso.

Recomendação: estado de aceite explícito; status por item; distinguir parcial, concluído e falha. Traduções devem ser revisões por idioma, preservando valores, unidades, códigos e texto original.

**F17 — P2 — Alguns controles não cumprem o contrato do editor**

Evidências: [components/preview/dynamic-renderer.tsx](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/components/preview/dynamic-renderer.tsx:106>), [features/editor/editor-store.ts](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/features/editor/editor-store.ts:564>), [lib/validators/catalog-schemas.ts](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/lib/validators/catalog-schemas.ts:30>), [components/forms/product-form.tsx](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/components/forms/product-form.tsx:1225>).

Reordenar usa índice da lista visível no array completo: com blocos ocultos pode mover outro bloco. `single_image` existe no catálogo de tipos, mas falta no enum de validação. O controle de colunas da galeria não persiste mudança. Há opções visuais que não chegam ao renderer e tipos disponíveis sem formulário específico.

Outras reproduções: array vazio padrão em `ordering_codes` oculta segmentos preenchidos no conteúdo ([components/preview/sections/catalog-sections.tsx](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/components/preview/sections/catalog-sections.tsx:1166>)); remover imagem individual pode mostrar automaticamente a primeira foto comercial ([components/preview/sections/catalog-sections.tsx](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/components/preview/sections/catalog-sections.tsx:1099>)), o que é especialmente inadequado para um diagrama técnico.

Recomendação: registro único por tipo de bloco contendo schema, defaults, formulário, renderer e migrações. Reordenar por IDs. Diferenciar “sem imagem”, “herdar foto” e “referência removida”.

**F18 — P2 — Imagens e auditoria ainda não formam bibliotecas corporativas**

Evidências: [lib/supabase/api.ts](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/lib/supabase/api.ts:245>), [components/ui/image-uploader.tsx](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/components/ui/image-uploader.tsx:48>), [lib/supabase/api.ts](<C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder/lib/supabase/api.ts:304>).

O uploader depende do bucket `catalog-images`, sem migration de provisionamento/políticas no repositório. Em falha, a imagem vira base64 dentro do estado. Isso aumenta payload, cache e snapshots. O histórico mostrado é montado no navegador e limitado a cerca de 50 eventos. Existem triggers SQL, mas versões de produto e execuções de IA não estão integradas ao fluxo exibido.

Recomendação: Storage provisionado por configuração versionada, upload com status/limites, assets classificados e referenciados por ID. Auditoria deve partir do servidor com usuário autenticado, ação, antes/depois e versão; separar essa trilha durável do feed resumido da interface.

**Arquitetura recomendada**

Manter um monólito modular inicialmente, com operações críticas no servidor e módulos claros: produtos, mídia, documentos, colaboração, importação/IA e publicação. Não há evidência de que trocar todo o framework ou introduzir microsserviços agora resolva os problemas centrais.

| Camada | Responsabilidade | Estruturas sugeridas |
| --- | --- | --- |
| Equipe e acesso | Usuários, projetos, permissões e responsáveis | Usuários, equipes/projetos, membros, papéis |
| Cadastro mestre | Uma identidade para cada produto, independente dos PDFs | Produtos, famílias, variantes, atributos, valores, revisões |
| Mídia e fontes | Fotos, diagramas, desenhos, certificados e origem dos dados | Assets, vínculos produto–asset, documentos-fonte |
| Documento | Composição, layout e dados vinculados | Documentos, versões, páginas/blocos, vínculos com revisões de produto |
| Revisão | Comentários, comparação e decisão técnica | Revisões solicitadas, aprovações, trilha de auditoria |
| Publicação | Arquivo final reproduzível e recuperável | Jobs de exportação, snapshots aprovados, arquivos e checksums |

Produtos devem ser independentes do catálogo. O mesmo cadastro pode alimentar um datasheet, um catálogo de família e uma apresentação institucional sem duplicação silenciosa. O schema atual, que liga `products.catalog_id` a um único catálogo, precisa evoluir para associação entre documentos e produtos.

Usar campos estruturados para identidade, relacionamentos, unidades, faixas, tolerâncias e condições. Definições de atributos devem variar por família, evitando uma tabela gigante de campos vazios. JSONB continua útil para layout e atributos extensíveis, desde que validado e versionado. Exemplos de campos de engenharia elétrica devem ser definidos com a equipe técnica; não presumir que todos os produtos possuem tensão, corrente, grau de proteção ou certificação específicos.

Cada documento em edição pode apontar para uma revisão selecionada do produto e avisar quando existir uma revisão aprovada mais nova. A publicação deve congelar as revisões de produto, assets, textos traduzidos e template utilizados. Alterar o cadastro não deve modificar silenciosamente um PDF já aprovado.

**Experiência proposta para o dashboard e o editor**

| Área | Experiência proposta | Benefício esperado |
| --- | --- | --- |
| Início da equipe | Minhas pendências, revisões aguardando decisão, documentos recentes e publicações desatualizadas | Organiza trabalho e responsabilidades |
| Produtos | Pesquisa, filtros por família/status, views salvas, edição em lote e indicador de completude | Facilita manter cada cadastro utilizável |
| Biblioteca de mídia | Fotos/diagramas com classificação, prévias, idioma e vínculo com produto/variante | Reduz escolhas erradas e arquivos duplicados |
| Documentos | Datasheet individual, catálogo de família, comparativo e documento institucional a partir de templates | Amplia criação sem duplicar dados |
| Editor | Blocos arrastáveis, grids reais, estilos de tabela, componentes reutilizáveis e preview de páginas | Personalização consistente |
| Revisão | Comentários por bloco/campo, comparação entre revisões e aprovação técnica | Evita publicar alterações sem revisão |
| Qualidade | Campos obrigatórios ausentes, unidade inválida, imagem inadequada, overflow e vínculo desatualizado | Detecta problemas antes da exportação |
| Assistência | Busca fundamentada no cadastro, sugestão de estrutura e importação rastreável | Reduz trabalho repetitivo com supervisão |

Permitir personalização em dois níveis: preferências do usuário (painéis, filtros, colunas) e padrões oficiais da marca (fontes, cores, cabeçalhos, rodapés, estilos). Alguns elementos institucionais podem ficar protegidos por template, mantendo áreas livres para o conteúdo. Isso atende equipes grandes sem tornar cada documento visualmente independente.

Para o editor, priorizar grids e fluxo de conteúdo antes de posicionamento livre irrestrito. Tabelas longas precisam de cabeçalho repetido, paginação previsível e alertas de quebra. Fotos, diagramas e certificados devem ter tipos e regras diferentes.

**Uso de IA recomendado**

- Extrair propostas de dados com origem e texto original, sem preencher lacunas com exemplos.
- Sugerir composição de páginas usando os produtos e assets realmente cadastrados.
- Apontar diferenças entre versões e campos incompletos; validações determinísticas devem sustentar verificações de números/unidades.
- Gerar texto comercial e traduções separados dos atributos técnicos, sujeitos a revisão.
- Permitir busca em documentos/fontes autorizados. Registrar qual fonte sustentou uma resposta.
- Nunca transformar texto de um documento em instrução autorizada ao sistema. Aplicar permissões e validação também após a resposta do modelo.

**Ordem sugerida de execução**

As etapas abaixo são propostas de evolução, não funcionalidades implementadas nem requisitos adicionais já aprovados.

| Etapa | Entrega | Critério de aceite |
| --- | --- | --- |
| 1. Integridade e segurança | Remover fallbacks fictícios; corrigir sinais/contratos; autenticação/RLS; status de save; isolamento de produtos e patch IA | Arquivo inválido não gera dado técnico; leitor não grava; falha não aparece como sincronizada; A não altera B |
| 2. Persistência para equipe | Fonte única de produtos/documentos; controle de revisão; fila de save; cache com pendências; histórico correto | Duas sessões não apagam mudanças silenciosamente; recarga mantém pendências; undo/redo recupera o estado esperado |
| 3. Publicação confiável | Documento de impressão isolado; margens/paginação; versão congelada e validação antes de exportar | PDF aprovado é reproduzível e não inclui controles; tabelas preservam valores; erros bloqueiam publicação |
| 4. Cadastro e mídia | Produtos/variantes por família, assets, origem, importação com mapeamento e revisão | Produto reutilizado em mais de um documento sem duplicação; mídia acessível à equipe |
| 5. Dashboard e personalização | Pendências reais, filtros/views, biblioteca de templates/blocos, estilos oficiais | Personalização persiste; cada controle altera o resultado previsto; documentos podem ser revisados por responsáveis |
| 6. Inteligência assistida | Busca fundamentada, sugestões de composição, traduções e jobs auditáveis | Toda alteração proposta tem alvo, versão, origem quando aplicável e aprovação rastreável |

Não estimei prazos: tamanho da equipe, volume de produtos, simultaneidade, requisitos de publicação e integração ainda precisam ser medidos. Também não há base para exigir CRDT ou edição simultânea de texto desde o início; controle de versão e detecção de conflito podem atender a primeira implantação.

**Qualidade e manutenção**

- Dividir o store e usar seletores por domínio; hoje componentes assinam o estado completo. Snapshots integrais e persistência síncrona a cada ação tendem a crescer mal com muitos produtos e fotos. É risco arquitetural, não resultado de benchmark.
- Criar schemas únicos de produto, atributos, blocos e patches. Reduzir `any` principalmente nas fronteiras de importação, banco e IA.
- Reconciliar nomes de campos entre tipos, seed, parser, formulário e renderer.
- Aproveitar ou remover dependências sem uso confirmado; `exceljs` e `xlsx` coexistem, com uso encontrado apenas de `xlsx` no parser. Não executar migração de biblioteca sem comparar o comportamento necessário.
- Integrar testes de permissões, concorrência, importação, vinculação produto/documento, histórico e renderização. Testes devem exercitar o contrato, não copiar o código.
- Automatizar lint, tipos, testes e build em CI. Preparar ambiente de homologação com dados sintéticos e validar restauração de backup.
- Atualizar o README: ele descreve impressão com margem zero, mas o CSS usa 15 mm; a referência a `supabase/schema.sql` também não corresponde à organização em migrations.

**Resultados da verificação**

| Comando/checagem | Resultado |
| --- | --- |
| `npm run lint` | Falhou: 98 erros e 85 avisos |
| `npm run typecheck` | Script não existe |
| `npm test` | Script não existe; não foi encontrada suíte de testes da aplicação |
| `npx --no-install tsc --noEmit --incremental false` | Passou |
| `npm run build` | Passou após repetir com permissão para criação de subprocessos; a primeira tentativa parou com `spawn EPERM` |
| Reproduções locais | Confirmaram dados fictícios, sinal removido, patch no produto errado, falhas de aceite/tradução/importação, precedência entre produto/bloco, tabelas incorretas, undo/redo e resultados de persistência enganosos |
| Produção e PDF visual | Não verificados nesta revisão |

Distribuição do lint: 91 erros de `no-explicit-any`, cinco de `set-state-in-effect`, dois de entidades não escapadas; 74 avisos de variáveis não usadas e 11 de imagens. Isso não significa 98 defeitos funcionais distintos, mas o gate de qualidade está reprovado.

Nenhum código de aplicação, schema ou dependência foi alterado. Foram adicionados somente este relatório e a story da revisão.


