// src/features/guided-help/help-registry.ts
// Registro Editorial e Educacional do Sistema de Ajuda Guiada (Guided Help Registry).
// Contém definições educativas para os 21 conceitos explicados pela ajuda e 8 tutoriais de tarefas práticas.
// Finalidade estritamente educacional/editorial; não substitui nem atua como autoridade canônica de domínio PIM.

import { HelpConcept, HelpConceptId, TaskTutorial, TaskTutorialId, TourStep } from './types';

export const HELP_CONCEPTS_REGISTRY: Record<HelpConceptId, HelpConcept> = {
  library: {
    id: 'library',
    title: 'Biblioteca de Produtos (Library)',
    category: 'hierarchy',
    shortExplanation: 'Catálogo mestre central onde todas as famílias, modelos e dados técnicos oficiais são governados.',
    simpleExplanation:
      'A Biblioteca é o ponto de partida onde você visualiza todas as linhas de produtos da empresa. Nela você organiza famílias e modelos, define suas especificações e acessa os cadernos técnicos de engenharia.',
    technicalExplanation:
      'Container raiz no repositório de produto que agrega instâncias de ProductFamily e Product, mapeando seus workspaces para ProductWorkbook com integridade relacional.',
    whyItMatters:
      'Garante que toda a organização consuma uma fonte única da verdade para dados técnicos, evitando discrepâncias entre materiais comerciais e manuais.',
    example:
      'A Biblioteca contém a família de Calibradores de Temperatura, que por sua vez engloba os modelos TA-25N, TA-35N e TA-50N.',
    whenToUse:
      'Utilize para navegar entre famílias de produtos, cadastrar novos modelos ou iniciar a edição do catálogo técnico.',
    warnings:
      'Excluir uma família na biblioteca remove o agrupamento de seus modelos. Use o modal de exclusão segura.',
    relatedTerms: ['family', 'product', 'product-workspace'],
    learnMoreTarget: 'overview'
  },

  family: {
    id: 'family',
    title: 'Família de Produtos',
    category: 'hierarchy',
    shortExplanation: 'Agrupamento de modelos que compartilham a mesma arquitetura, carcaça ou tecnologia base.',
    simpleExplanation:
      'Uma Família reúne produtos irmãos que possuem características em comum. Tudo o que é compartilhado por todos os modelos pode ser definido uma única vez na família, economizando tempo.',
    technicalExplanation:
      'Entidade de nível superior (ProductFamily) que provê um ProductWorkbook compartilhado. Modelos filhos herdam dados da família via resolução canônica de escopo.',
    whyItMatters:
      'Evita duplicidade de cadastro. Se a exatidão básica é a mesma para 10 instrumentos, você preenche na família e todos os 10 modelos recebem automaticamente.',
    example:
      'Família "Banhos Térmicos TA-N": todos compartilham o mesmo display LCD e peso aproximado, mas variam na faixa térmica.',
    whenToUse:
      'Ao cadastrar especificações que se aplicam a todos os modelos da mesma linha.',
    warnings:
      'Alterar um dado na família atualiza todos os modelos que não possuem uma exceção (override) explícita.',
    relatedTerms: ['product', 'inheritance', 'override', 'workbook'],
    learnMoreTarget: 'overview'
  },

  product: {
    id: 'product',
    title: 'Produto (Modelo Individual)',
    category: 'hierarchy',
    shortExplanation: 'Instância física e comercial específica pertencente a uma família (ex: código de pedido ou modelo final).',
    simpleExplanation:
      'É o modelo exato que o cliente compra. Ele herda a base da sua família, mas pode ter suas próprias características exclusivas, como tensão, faixa de medição ou conexões.',
    technicalExplanation:
      'Registro específico (Product) identificado por ID único e código de pedido. Possui workspace próprio e pode definir exceções (overrides) aos valores herdados da família.',
    whyItMatters:
      'Permite especificar com precisão de engenharia o comportamento de cada variante sem perder a rastreabilidade da família.',
    example:
      'TA-25N é um produto que opera de -25 °C a 155 °C, enquanto o TA-50N opera de -50 °C a 155 °C.',
    whenToUse:
      'Ao ajustar dados exclusivos de uma variante ou vincular um modelo a páginas de catálogo.',
    warnings:
      'Crie exceções apenas para o que for estritamente diferente. O restante deve permanecer herdado da família.',
    relatedTerms: ['family', 'product-workspace', 'override'],
    learnMoreTarget: 'technical-data'
  },

  'product-workspace': {
    id: 'product-workspace',
    title: 'Product Workspace (Ambiente de Trabalho)',
    category: 'hierarchy',
    shortExplanation: 'Área unificada de engenharia onde todos os fatos, tabelas, evidências e documentos de um produto são gerenciados.',
    simpleExplanation:
      'É a mesa de trabalho do produto. Aqui você enxerga tudo sobre ele em um só lugar: valores técnicos, de quais páginas de manuais eles vieram, tabelas comparativas e possíveis conflitos.',
    technicalExplanation:
      'Camada de aplicação e projeção (MegaWorkspace) que consolida ProductWorkbook, SourceDocuments e SemanticRegistry em um ViewModel reativo de alta performance.',
    whyItMatters:
      'Substitui dezenas de planilhas desconectadas por uma visão 360° auditável e vinculada diretamente a evidências documentais.',
    example:
      'Ao abrir o Workspace do TA-25N, você vê a faixa térmica de -25 a 155 °C e o botão para inspecionar a página 12 do manual oficial.',
    whenToUse:
      'Para auditar a completude técnica, validar evidências e revisar conflitos antes de publicar o catálogo.',
    warnings:
      'No modo de visualização segura, edições acidentais são prevenidas contra escrita não intencional.',
    relatedTerms: ['workbook', 'module', 'dataset', 'evidence'],
    learnMoreTarget: 'overview'
  },

  workbook: {
    id: 'workbook',
    title: 'Workbook (Caderno Técnico)',
    category: 'hierarchy',
    shortExplanation: 'Estrutura de dados canônica que armazena todas as especificações estruturadas de um produto ou família.',
    simpleExplanation:
      'É o caderno digital oficial de engenharia do produto. Ele guarda os fatos organizados por módulos temáticos (como Elétrica, Mecânica, Metrologia) e suas respectivas tabelas.',
    technicalExplanation:
      'Estrutura imutável (ProductWorkbook) contendo modules, data (TechnicalDatum[]), datasets e metadados de auditoria serializáveis.',
    whyItMatters:
      'Garante que os dados estejam prontos para serem renderizados em qualquer canal (web, PDF, catálogo impresso) sem reprocessamento manual.',
    example:
      'O Workbook da família TA reúne 3 módulos: Geral, Metrologia e Elétrica, com 24 fatos técnicos no total.',
    whenToUse:
      'Gerenciado automaticamente pela plataforma conforme você organiza informações e tabelas no Workspace.',
    relatedTerms: ['module', 'technical-datum', 'dataset'],
    learnMoreTarget: 'organization'
  },

  module: {
    id: 'module',
    title: 'Módulo de Informações',
    category: 'hierarchy',
    shortExplanation: 'Seção temática que agrupa dados técnicos relacionados (ex: Metrologia, Elétrica, Dimensões).',
    simpleExplanation:
      'Módulos funcionam como capítulos do caderno técnico. Em vez de uma lista enorme e confusa de especificações, os dados ficam divididos por assunto.',
    technicalExplanation:
      'Elemento de particionamento lógico no Workbook contendo id, semanticKey, rótulo de exibição e ordem sequencial de apresentação.',
    whyItMatters:
      'Facilita a leitura para a equipe e permite que o gerador de catálogos monte blocos visuais coerentes no layout.',
    example:
      'Módulo "Especificações Elétricas" agrupa Tensão de Alimentação, Potência Máxima e Grau de Proteção.',
    whenToUse:
      'Para categorizar novas especificações ou reordenar as seções no catálogo técnico.',
    warnings:
      'Evite criar módulos com apenas um dado. Agrupe especificações de forma lógica e concisa.',
    relatedTerms: ['workbook', 'technical-datum', 'library'],
    learnMoreTarget: 'organization'
  },

  'technical-datum': {
    id: 'technical-datum',
    title: 'Informação Técnica (Technical Datum)',
    category: 'data',
    shortExplanation: 'Um fato técnico atômico e auditável (ex: temperatura, exatidão, peso) com valor e fontes associadas.',
    simpleExplanation:
      'É cada especificação individual do produto. Mais do que um simples texto, ela possui um valor numérico ou faixa, unidade de medida e vínculo direto com o documento oficial.',
    technicalExplanation:
      'Entidade canônica atômica que possui semanticKey única, value tipado (quantity, range, text), status de verificação e array de EvidenceRefs.',
    whyItMatters:
      'Permite conversão automática de unidades (ex: °C para °F) e garante que o catálogo nunca exiba um valor sem procedência comprovada.',
    example:
      'Dado: "Faixa de Temperatura" | Valor: -25 a 155 °C | Unidade: °C | Status: Verificado.',
    whenToUse:
      'Sempre que precisar cadastrar ou consultar uma propriedade mensurável do produto.',
    warnings:
      'Ao alterar o rótulo de exibição (ex: "Temp" para "Temperatura"), a identidade técnica do dado é preservada.',
    relatedTerms: ['semantic-key', 'evidence', 'inheritance', 'override'],
    learnMoreTarget: 'technical-data'
  },

  dataset: {
    id: 'dataset',
    title: 'Dataset (Conjunto de Dados)',
    category: 'data',
    shortExplanation: 'Estrutura tabular bidimensional que relaciona múltiplos dados técnicos em matrizes comparativas.',
    simpleExplanation:
      'Uma tabela estruturada onde as células não são textos soltos: cada linha e coluna representa uma informação viva do produto, pronta para exibição técnica.',
    technicalExplanation:
      'Coleção tabular canônica (TechnicalDataset) com rows, columns e mapeamento relacional cells[rowId:columnId] -> datumId.',
    whyItMatters:
      'Se o valor de um fato técnico for corrigido no produto, todas as tabelas e catálogos que usam aquele dado são atualizados automaticamente.',
    example:
      'Tabela de inserts de calibração relacionando Diâmetro do Furo (mm) com Profundidade Útil (mm) por modelo.',
    whenToUse:
      'Quando dados técnicos precisam ser apresentados em grade, tabela de código de pedidos ou matriz comparativa.',
    warnings:
      'Não digite valores estáticos se o dado já existir no produto; conecte a célula ao fato técnico correspondente.',
    relatedTerms: ['technical-table', 'technical-datum', 'binding'],
    learnMoreTarget: 'technical-tables'
  },

  'technical-table': {
    id: 'technical-table',
    title: 'Tabela Técnica',
    category: 'data',
    shortExplanation: 'Componente visual e editorial que renderiza um Dataset com formatação profissional, alinhamento e paginação.',
    simpleExplanation:
      'É a representação visual da tabela para o leitor. Ela cuida de bordas, cores, cabeçalhos fixos, alinhamento de números e ajuste responsivo na página do catálogo.',
    technicalExplanation:
      'Componente de apresentação editorial vinculado ao Dataset, responsável por renderização determinística em tela e no motor de impressão PDF.',
    whyItMatters:
      'Garante padrão visual impecável de engenharia sem exigir que o operador redesenhe tabelas no Illustrator ou InDesign.',
    example:
      'Tabela zebrada com cabeçalho azul escuro exibindo as conexões de processo disponíveis para o modelo.',
    whenToUse:
      'Ao compor páginas de catálogos ou visualizar o dataset dentro do Workspace.',
    relatedTerms: ['dataset', 'binding', 'template'],
    learnMoreTarget: 'technical-tables'
  },

  evidence: {
    id: 'evidence',
    title: 'Evidência Documental',
    category: 'evidence',
    shortExplanation: 'Rastreabilidade auditável que comprova onde, quando e em qual documento um valor foi publicado.',
    simpleExplanation:
      'É o comprovante de onde veio a informação. Se uma especificação diz que a exatidão é 0,1 °C, a evidência aponta para o manual oficial, página 8, parágrafo 2.',
    technicalExplanation:
      'Referência imutável (EvidenceRef) associada a um TechnicalDatum, contendo sourceDocumentId, page, section e observedValue extraído.',
    whyItMatters:
      'Elimina o "ouvi dizer". Em caso de dúvida de clientes ou auditorias ISO, a prova documental está a um clique de distância.',
    example:
      'Evidência ligada ao Manual de Instruções TA-25N (doc_manual_v3.pdf), página 14, tabela "Especificações de Estabilidade".',
    whenToUse:
      'Sempre que cadastrar ou conferir uma informação técnica crítica.',
    warnings:
      'Dados sem nenhuma evidência vinculada são sinalizados com alerta de baixa confiabilidade.',
    relatedTerms: ['source-document', 'conflict', 'canonical-decision'],
    learnMoreTarget: 'sources-evidence'
  },

  'source-document': {
    id: 'source-document',
    title: 'Documento Fonte',
    category: 'evidence',
    shortExplanation: 'Arquivo oficial registrado (manual, catálogo, norma, folha de dados) do qual as evidências são extraídas.',
    simpleExplanation:
      'O documento original da fábrica. Ele é indexado pela plataforma para que suas páginas possam ser consultadas diretamente pela equipe de engenharia e marketing.',
    technicalExplanation:
      'Registro oficial de documento arquivado com hash criptográfico, metadados de versão, número de páginas e links seguros de pré-visualização.',
    whyItMatters:
      'Garante autenticidade e integridade histórica: mesmo que o manual em papel se perca, o PDF oficial fica preservado no sistema.',
    example:
      'Manual Técnico de Banhos Termostáticos versão 2.4 de Janeiro/2026 em formato PDF.',
    whenToUse:
      'Ao fazer upload de novas revisões de manuais ou fichas técnicas para alimentar os produtos.',
    relatedTerms: ['evidence', 'conflict', 'revision'],
    learnMoreTarget: 'documents'
  },

  inheritance: {
    id: 'inheritance',
    title: 'Herança da Família',
    category: 'architecture',
    shortExplanation: 'Mecanismo em que o produto filho adota automaticamente os valores e módulos definidos em sua família.',
    simpleExplanation:
      'Pense como uma característica de família: se todos os modelos possuem o mesmo peso e carcaça, você preenche na família e todos os modelos herdam o valor sem esforço.',
    technicalExplanation:
      'Resolução em tempo de leitura onde a camada de ViewModel busca o TechnicalDatum no escopo do produto; se ausente, faz fallback para o escopo da família.',
    whyItMatters:
      'Reduz em até 80% o esforço de cadastro e manutenção. Ao atualizar um manual de família, todos os produtos são atualizados em cascata.',
    example:
      'A garantia de 2 anos e o display gráfico foram cadastrados na Família TA-N e aparecem automaticamente no TA-25N, TA-35N e TA-50N.',
    whenToUse:
      'Sempre que uma característica for geral e válida para todas as variantes da linha.',
    warnings:
      'Se um modelo específico tiver um valor diferente, você não deve alterar a família; crie uma Exceção (Override) no modelo.',
    relatedTerms: ['family', 'product', 'override'],
    learnMoreTarget: 'technical-data'
  },

  override: {
    id: 'override',
    title: 'Exceção do Produto (Override)',
    category: 'architecture',
    shortExplanation: 'Valor específico configurado no modelo individual que substitui a regra geral herdada de sua família.',
    simpleExplanation:
      'É a exceção à regra. Quando um modelo específico da família possui uma característica diferente dos irmãos, você define um valor exclusivo apenas para ele.',
    technicalExplanation:
      'Instância de TechnicalDatum gravada com ownerKind="product" e ownerId igual ao produto, prevalecendo sobre o datum de mesma semanticKey da família.',
    whyItMatters:
      'Oferece total flexibilidade: você aproveita o que é comum via herança, sem ficar engessado quando uma variante tem uma potência ou faixa diferente.',
    example:
      'A família TA tem temperatura padrão até 155 °C, mas o modelo especial TA-25N-HT possui override para 200 °C.',
    whenToUse:
      'Quando um modelo físico possuir uma medição, dimensão ou tensão exclusiva que não se aplica aos outros modelos da mesma linha.',
    warnings:
      'Evite criar overrides desnecessários com o mesmo valor da família, pois isso quebra a sincronização automática.',
    relatedTerms: ['inheritance', 'product', 'family', 'technical-datum'],
    learnMoreTarget: 'technical-data'
  },

  conflict: {
    id: 'conflict',
    title: 'Conflito de Evidências',
    category: 'evidence',
    shortExplanation: 'Divergência detectada quando dois documentos oficiais informam valores diferentes para a mesma propriedade.',
    simpleExplanation:
      'Ocorre quando o manual diz uma coisa (ex: 5 kg) e o catálogo de marketing diz outra (ex: 5,5 kg). O sistema não adivinha: ele avisa a equipe para que a engenharia decida o valor correto.',
    technicalExplanation:
      'Estado analítico gerado quando um TechnicalDatum possui múltiplas evidências cujos observedValues divergem além da tolerância estabelecida.',
    whyItMatters:
      'Impede que catálogos sejam impressos com erros graves que poderiam gerar devoluções, retrabalho ou processos comerciais.',
    example:
      'Conflito na potência do TA-25N: Manual de 2024 indica 250 W, mas Folha de Dados de 2025 indica 300 W.',
    whenToUse:
      'Na aba Conflitos / Revisões, para auditar e resolver divergências pendentes de arbitragem.',
    warnings:
      'Nunca ignore um conflito ativo. Ele deve ser resolvido registrando uma Decisão Canônica.',
    relatedTerms: ['evidence', 'canonical-decision', 'source-document'],
    learnMoreTarget: 'conflicts'
  },

  'semantic-key': {
    id: 'semantic-key',
    title: 'Chave Semântica (Semantic Key)',
    category: 'architecture',
    shortExplanation: 'O identificador técnico padronizado e estável que funciona como o "CPF" da informação no sistema.',
    simpleExplanation:
      'É o código fixo que o computador usa para entender o que é o dado. O nome exibido na tela pode mudar de "Temp." para "Temperatura", mas o sistema sabe que continua sendo a mesma informação.',
    technicalExplanation:
      'String hierárquica imutável no padrão namespace.subnamespace.property (ex: metrology.temperature.range), garantindo interoperabilidade entre módulos.',
    whyItMatters:
      'Permite traduzir catálogos para inglês, espanhol ou alterar nomes comerciais sem quebrar vínculos de tabelas ou fórmulas de engenharia.',
    example:
      'Chave: "metrology.temperature.range" | Rótulo em Português: "Faixa de Temperatura" | Rótulo em Inglês: "Temperature Range".',
    whenToUse:
      'Utilizada internamente pelo sistema e visível no Modo Avançado para desenvolvedores e administradores de produto.',
    warnings:
      'A chave semântica não deve ser alterada levianamente após entrar em produção para não quebrar referências externas.',
    relatedTerms: ['alias', 'technical-datum', 'binding'],
    learnMoreTarget: 'advanced'
  },

  alias: {
    id: 'alias',
    title: 'Sinônimo / Rótulo Editorial (Alias)',
    category: 'editorial',
    shortExplanation: 'Nome alternativo de exibição para uma informação técnica, adaptado para catálogos ou idiomas diferentes.',
    simpleExplanation:
      'Como a informação é mostrada para o leitor. No manual de engenharia pode estar escrito "Exatidão Instrumental", mas no catálogo comercial você pode preferir exibir "Precisão".',
    technicalExplanation:
      'Mapeamento de apresentação que sobrepõe o label canônico do TechnicalDatum para contextos editoriais específicos sem alterar a semanticKey.',
    whyItMatters:
      'Permite adequar a linguagem técnica ao público-alvo (comercial, técnico ou acadêmico) sem perder a precisão do dado.',
    example:
      'O dado com chave "metrology.accuracy" tem o rótulo canônico "Incerteza de Medição", mas no catálogo resumido usa o alias "Exatidão".',
    whenToUse:
      'Ao customizar o cabeçalho de uma tabela técnica para caber melhor na diagramação.',
    relatedTerms: ['semantic-key', 'technical-table'],
    learnMoreTarget: 'technical-tables'
  },

  revision: {
    id: 'revision',
    title: 'Revisão Histórica',
    category: 'editorial',
    shortExplanation: 'Registro cronológico e imutável de todas as modificações realizadas no produto, com data e autor.',
    simpleExplanation:
      'A linha do tempo do produto. Você pode conferir quem alterou qualquer especificação, em qual dia e qual era o valor anterior, garantindo total transparência.',
    technicalExplanation:
      'Snapshot incremental com carimbo de data/hora, identificador do autor (userId) e hash de verificação de integridade gravado na trilha de auditoria.',
    whyItMatters:
      'Atende aos requisitos de conformidade e auditoria ISO 9001, permitindo reverter alterações equivocadas com segurança.',
    example:
      'Revisão #4 realizada por Maria em 04/09/2026: "Alterada potência de 250 W para 300 W conforme Manual v2.4".',
    whenToUse:
      'Para auditar o histórico de alterações ou investigar quando um dado foi modificado.',
    relatedTerms: ['canonical-decision', 'evidence'],
    learnMoreTarget: 'conflicts'
  },

  'canonical-decision': {
    id: 'canonical-decision',
    title: 'Decisão Canônica de Engenharia',
    category: 'evidence',
    shortExplanation: 'Resolução formal registrada por um engenheiro responsável para arbitrar um conflito entre documentos.',
    simpleExplanation:
      'Quando duas fontes oficiais divergem, a engenharia analisa o caso e bate o martelo sobre qual valor é o verdadeiro, justificando o motivo por escrito.',
    technicalExplanation:
      'Entidade de governança técnica que encerra o estado de conflito de um dado, vinculando a justificativa, responsável e data de expiração.',
    whyItMatters:
      'Evita que dúvidas fiquem sem solução ou que operadores escolham valores por conta própria sem embasamento técnico.',
    example:
      'Decisão do Eng. Carlos: "Adotado 300 W pois o manual v2.4 substitui o boletim anterior de 2024".',
    whenToUse:
      'Ao revisar a lista de conflitos e formalizar a verdade definitiva para o catálogo.',
    warnings:
      'Decisões canônicas exigem perfil com permissão técnica e ficam gravadas permanentemente na trilha de auditoria.',
    relatedTerms: ['conflict', 'evidence', 'revision'],
    learnMoreTarget: 'conflicts'
  },

  'saved-view': {
    id: 'saved-view',
    title: 'Visualização Salva (Saved View)',
    category: 'editorial',
    shortExplanation: 'Filtro e configuração de visualização personalizada salva pelo usuário para consulta rápida.',
    simpleExplanation:
      'Um atalho pré-configurado. Em vez de filtrar toda vez quais colunas ou módulos você quer ver, você salva uma visão rápida (ex: "Apenas Metrologia").',
    technicalExplanation:
      'Objeto de estado salvo que preserva filtros ativos, termos de busca, visibilidade de colunas e ordenação da interface.',
    whyItMatters:
      'Economiza tempo no dia a dia da equipe, permitindo focar diretamente nos dados relevantes para cada perfil de usuário.',
    example:
      'Visualização "Revisão de Marketing": exibe apenas código, imagem, descrição resumida e preço.',
    whenToUse:
      'Quando você executa com frequência as mesmas consultas ou filtros na Biblioteca.',
    relatedTerms: ['library', 'product-workspace'],
    learnMoreTarget: 'overview'
  },

  template: {
    id: 'template',
    title: 'Gabarito de Especificação (Template)',
    category: 'editorial',
    shortExplanation: 'Estrutura pré-definida de módulos e propriedades técnicas recomendada para novas famílias de produtos.',
    simpleExplanation:
      'O modelo em branco padrão. Ao cadastrar uma família nova de calibradores, você pode carregar um gabarito que já traz todas as perguntas técnicas que você deve responder.',
    technicalExplanation:
      'Esquema canônico que instancia um esqueleto de ProductWorkbook com módulos padrão e chaves semânticas recomendadas.',
    whyItMatters:
      'Padroniza a coleta de dados de engenharia, evitando que novos produtos sejam cadastrados com campos incompletos.',
    example:
      'Template "Instrumentação Industrial": já inclui módulos para Entrada, Saída, Alimentação e Características Físicas.',
    whenToUse:
      'Ao criar uma nova família de produtos do zero na Biblioteca.',
    relatedTerms: ['workbook', 'module', 'family'],
    learnMoreTarget: 'overview'
  },

  binding: {
    id: 'binding',
    title: 'Vínculo Dinâmico (Binding)',
    category: 'architecture',
    shortExplanation: 'Conexão viva entre uma célula de catálogo ou tabela técnica e o dado oficial do produto.',
    simpleExplanation:
      'A ponte inteligente. Se o dado do produto mudar no cadastro, qualquer texto ou tabela no catálogo impresso que tenha esse vínculo é atualizado na hora.',
    technicalExplanation:
      'Referência canônica (BindingRef) contendo targetSemanticKey, formatador e caminho do nodo, resolvida em tempo de montagem do documento.',
    whyItMatters:
      'Elimina o risco de catálogos desatualizados. Nada de alterar números manualmente em dez lugares diferentes: basta mudar na fonte.',
    example:
      'A célula de "Faixa" na página 2 do catálogo está vinculada a "metrology.temperature.range" do TA-25N.',
    whenToUse:
      'Ao montar tabelas no editor de catálogo ou vincular células a dados de produtos.',
    warnings:
      'Desconectar um vínculo transforma o valor em texto estático que não receberá atualizações futuras.',
    relatedTerms: ['technical-datum', 'dataset', 'semantic-key'],
    learnMoreTarget: 'technical-tables'
  }
};

export const TASK_TUTORIALS_REGISTRY: Record<TaskTutorialId, TaskTutorial> = {
  'task-add-datum': {
    id: 'task-add-datum',
    title: 'Como adicionar uma Informação Técnica?',
    description: 'Aprenda a cadastrar uma nova especificação (dado técnico) em uma família ou modelo específico.',
    estimatedMinutes: 3,
    relatedConceptIds: ['technical-datum', 'module', 'inheritance'],
    steps: [
      {
        stepNumber: 1,
        title: 'Selecione a Família ou Modelo',
        instruction: 'Na tela da Biblioteca, clique sobre a família onde a especificação deve residir.',
        tip: 'Se todos os modelos compartilham essa informação, adicione na Família para que todos herdem.'
      },
      {
        stepNumber: 2,
        title: 'Abra a seção Informações Técnicas',
        instruction: 'Clique na aba "Informações Técnicas" no menu lateral da Library V2.',
        tip: 'Você verá as especificações agrupadas por módulo temático.'
      },
      {
        stepNumber: 3,
        title: 'Clique em "+ Adicionar Informação"',
        instruction: 'Preencha o nome da especificação (ex: "Exatidão"), o valor e a unidade de medida.',
        tip: 'O sistema gerará automaticamente a Chave Semântica correspondente.'
      },
      {
        stepNumber: 4,
        title: 'Salve as alterações',
        instruction: 'Clique em Confirmar ou pressione Ctrl+S para sincronizar a alteração.',
        tip: 'A informação passará a ficar disponível para catálogos e tabelas.'
      }
    ]
  },

  'task-create-table': {
    id: 'task-create-table',
    title: 'Como criar uma Tabela Técnica?',
    description: 'Guia para montar uma matriz ou tabela estruturada ligando dados do produto a linhas e colunas.',
    estimatedMinutes: 4,
    relatedConceptIds: ['dataset', 'technical-table', 'binding'],
    steps: [
      {
        stepNumber: 1,
        title: 'Acesse a aba Tabelas Técnicas',
        instruction: 'No menu lateral da Library V2, clique em "Tabelas Técnicas".',
        tip: 'Aqui você visualiza todas as tabelas já existentes da família.'
      },
      {
        stepNumber: 2,
        title: 'Inicie uma Nova Tabela',
        instruction: 'Clique no botão "+ Nova Tabela Técnica" no topo da área de trabalho.',
        tip: 'Defina um título claro (ex: "Tabela de Dimensões e Pesos").'
      },
      {
        stepNumber: 3,
        title: 'Defina as Linhas e Colunas',
        instruction: 'Adicione as colunas necessárias e vincule cada coluna à especificação técnica correspondente.',
        tip: 'Ao vincular à informação do produto, os valores das células são preenchidos automaticamente.'
      },
      {
        stepNumber: 4,
        title: 'Revise a Pré-Visualização',
        instruction: 'Verifique se os dados aparecem corretamente alinhados e clique em Salvar Tabela.',
        tip: 'A tabela já estará disponível no Editor de Catálogos para inserção no layout A4.'
      }
    ]
  },

  'task-trace-source': {
    id: 'task-trace-source',
    title: 'Como saber de onde veio um valor?',
    description: 'Aprenda a rastrear qual manual oficial, página e trecho comprovam uma determinada especificação.',
    estimatedMinutes: 2,
    relatedConceptIds: ['evidence', 'source-document', 'technical-datum'],
    steps: [
      {
        stepNumber: 1,
        title: 'Localize a Informação Técnica',
        instruction: 'Na aba Informações Técnicas ou no Workspace, encontre a especificação que deseja auditar.',
        tip: 'Observe se ela possui o ícone de documento ou o selo "Verificado".'
      },
      {
        stepNumber: 2,
        title: 'Clique no botão "Fonte / Evidência"',
        instruction: 'Ao lado do valor, clique no chip indicativo da fonte ou no botão de lupa.',
        tip: 'Um painel lateral deslizante se abrirá com os detalhes da evidência.'
      },
      {
        stepNumber: 3,
        title: 'Inspecione a Evidência Documental',
        instruction: 'Veja o nome do manual em PDF, o número exato da página e o trecho extraído.',
        tip: 'Se disponível, clique em "Abrir Documento" para visualizar a página original do PDF.'
      }
    ]
  },

  'task-resolve-conflict': {
    id: 'task-resolve-conflict',
    title: 'Como entender e resolver uma divergência?',
    description: 'Procedimento para auditar informações conflitantes entre manuais e registrar uma decisão.',
    estimatedMinutes: 5,
    relatedConceptIds: ['conflict', 'canonical-decision', 'evidence'],
    steps: [
      {
        stepNumber: 1,
        title: 'Acesse a aba Conflitos / Revisões',
        instruction: 'Clique na aba "Conflitos" para listar todos os pontos divergentes da família.',
        tip: 'Um alerta colorido indicará quantos conflitos ativos precisam de atenção.'
      },
      {
        stepNumber: 2,
        title: 'Compare as Evidências Concorrentes',
        instruction: 'Abra o conflito para visualizar os dois valores informados e as respectivas fontes.',
        tip: 'Exemplo: Manual 2024 diz 250 W, mas Catálogo 2025 diz 300 W.'
      },
      {
        stepNumber: 3,
        title: 'Registre a Decisão Canônica',
        instruction: 'Clique em "Resolver Conflito", selecione o valor correto e digite a justificativa técnica.',
        tip: 'A justificativa fica gravada na trilha de auditoria com seu usuário e data.'
      }
    ]
  },

  'task-create-override': {
    id: 'task-create-override',
    title: 'Como criar uma exceção somente para este modelo?',
    description: 'Configure um valor exclusivo em um produto sem alterar o padrão dos demais modelos da família.',
    estimatedMinutes: 3,
    relatedConceptIds: ['override', 'inheritance', 'product'],
    steps: [
      {
        stepNumber: 1,
        title: 'Abra o Produto Específico',
        instruction: 'Na lista de produtos da família, clique no modelo que precisa do valor exclusivo.',
        tip: 'Certifique-se de que o contexto superior indique o modelo (ex: TA-25N) e não a Família Geral.'
      },
      {
        stepNumber: 2,
        title: 'Identifique o Campo Herdado',
        instruction: 'Localize a especificação desejada. Ela terá o badge "Herdado da Família".',
        tip: 'Isso significa que até o momento o produto adota a regra comum.'
      },
      {
        stepNumber: 3,
        title: 'Clique em "Criar Exceção (Override)"',
        instruction: 'Insira o novo valor específico deste modelo e confirme.',
        tip: 'O badge mudará para "Exceção do Modelo (Override)" e os outros modelos continuarão intocados.'
      }
    ]
  },

  'task-organize-modules': {
    id: 'task-organize-modules',
    title: 'Como organizar os Módulos do Workspace?',
    description: 'Agrupe especificações em capítulos lógicos para melhorar a clareza do catálogo.',
    estimatedMinutes: 3,
    relatedConceptIds: ['module', 'workbook'],
    steps: [
      {
        stepNumber: 1,
        title: 'Acesse a aba Organização',
        instruction: 'No menu lateral da Library V2, selecione a aba "Organização".',
        tip: 'Você verá a estrutura de capítulos técnicos (Módulos) cadastrados.'
      },
      {
        stepNumber: 2,
        title: 'Crie ou Reordene Módulos',
        instruction: 'Clique em "+ Novo Módulo" para criar uma seção (ex: "Certificações") ou arraste para ordenar.',
        tip: 'A ordem definida aqui é a mesma ordem em que os blocos aparecerão na geração do catálogo.'
      },
      {
        stepNumber: 3,
        title: 'Distribua os Fatos Técnicos',
        instruction: 'Mova as especificações para dentro de seus respectivos módulos.',
        tip: 'Isso mantém o cadastro limpo e intuitivo para toda a equipe.'
      }
    ]
  },

  'task-rename-display-label': {
    id: 'task-rename-display-label',
    title: 'Como alterar somente o nome exibido no catálogo?',
    description: 'Mude o texto visual de uma propriedade sem quebrar sua identidade técnica no sistema.',
    estimatedMinutes: 2,
    relatedConceptIds: ['alias', 'semantic-key', 'technical-datum'],
    steps: [
      {
        stepNumber: 1,
        title: 'Abra a Especificação Técnica',
        instruction: 'Clique no botão de edição ao lado do rótulo da especificação.',
        tip: 'O sistema exibirá o campo de "Rótulo de Exibição" e a "Chave Semântica".'
      },
      {
        stepNumber: 2,
        title: 'Edite o Rótulo de Exibição',
        instruction: 'Digite o novo texto comercial que deseja mostrar na página.',
        tip: 'A Chave Semântica continuará estável, garantindo que tabelas e vínculos continuem funcionando.'
      },
      {
        stepNumber: 3,
        title: 'Confirme a Alteração',
        instruction: 'Clique em Salvar. O novo nome passa a valer imediatamente para os catálogos.',
        tip: 'Você pode reverter para o nome padrão de fábrica a qualquer momento.'
      }
    ]
  },

  'task-search-data': {
    id: 'task-search-data',
    title: 'Como pesquisar um dado na biblioteca?',
    description: 'Use a busca inteligente para localizar produtos, códigos ou especificações instantaneamente.',
    estimatedMinutes: 1,
    relatedConceptIds: ['library', 'technical-datum', 'product'],
    steps: [
      {
        stepNumber: 1,
        title: 'Ative o campo de busca',
        instruction: 'Clique no campo de busca na barra superior ou use o atalho Ctrl+K.',
        tip: 'A busca é em tempo real e não diferencia maiúsculas de minúsculas.'
      },
      {
        stepNumber: 2,
        title: 'Digite o termo desejado',
        instruction: 'Você pode digitar parte do modelo (ex: "25N"), nome da especificação (ex: "temperatura") ou código.',
        tip: 'Os resultados são filtrados dinamicamente na tela.'
      }
    ]
  }
};

export const LIBRARY_V2_TOUR_STEPS: readonly TourStep[] = [
  {
    targetSelector: '[data-tour="v2-header"]',
    title: '1. Cabeçalho e Contexto',
    content: 'Aqui você acompanha o caminho de onde está (Breadcrumb), pesquisa dados rapidamente e alterna o Modo Aprender 🎓.',
    conceptId: 'library',
    position: 'bottom'
  },
  {
    targetSelector: '[data-tour="v2-family-selector"]',
    title: '2. Famílias e Modelos',
    content: 'Selecione a família de produtos para navegar entre suas variantes ou adicionar um novo modelo.',
    conceptId: 'family',
    position: 'bottom'
  },
  {
    targetSelector: '[data-tour="v2-nav-technical-data"]',
    title: '3. Informações Técnicas',
    content: 'Visualize e gerencie todos os fatos técnicos atômicos. O sistema indica claramente o que é herdado da família e o que é exclusivo do modelo.',
    conceptId: 'technical-datum',
    position: 'right'
  },
  {
    targetSelector: '[data-tour="v2-nav-technical-tables"]',
    title: '4. Tabelas Técnicas',
    content: 'Consulte matrizes de dados e tabelas dinâmicas. As células permanecem conectadas aos dados reais do produto.',
    conceptId: 'dataset',
    position: 'right'
  },
  {
    targetSelector: '[data-tour="v2-nav-sources"]',
    title: '5. Fontes e Evidências',
    content: 'Audite a procedência de cada valor: veja o manual oficial em PDF, a página e o parágrafo exato que comprovam a especificação.',
    conceptId: 'evidence',
    position: 'right'
  },
  {
    targetSelector: '[data-tour="v2-nav-conflicts"]',
    title: '6. Conflitos e Decisões',
    content: 'Quando dois documentos oficiais informam valores diferentes, a engenharia pode comparar as evidências e registrar uma decisão canônica.',
    conceptId: 'conflict',
    position: 'right'
  },
  {
    targetSelector: '[data-tour="v2-help-button"]',
    title: '7. Glossário e Ajuda Sempre à Mão',
    content: 'Tem dúvida sobre qualquer termo? Clique no botão de Ajuda ou ative o Modo Aprender 🎓 a qualquer momento.',
    conceptId: 'semantic-key',
    position: 'left'
  }
];
